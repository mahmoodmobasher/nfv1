import type { Pool, PoolClient } from "pg";
import { writeAudit } from "../security/audit";
import { encryptEnvelope, keyedHash, randomOpaqueToken } from "../security/crypto";
import { hashPassword, passwordNeedsRehash, verifyPassword } from "../security/password";
import { consumeRateLimitDimensions } from "../security/rate-limit";
import { createSession, revokeAllSessions, revokeCurrentSession } from "../security/session";
import { assertPasswordPolicy } from "../../shared/password-policy";
import type { RequestRiskContext } from "../http";
import { lockPasswordOperation } from "../security/password-operation";

export type IdentityConfig = {
  secret: string;
  appOrigin: string;
  idleMinutes: number;
  absoluteHours: number;
  touchIntervalSeconds: number;
};

export const acceptedResponse = { ok: true, message: "If the request can be completed, local instructions will be sent." } as const;
export const invalidCredentialsResponse = { ok: false, code: "invalid_credentials", message: "The email or password is incorrect." } as const;
const dummyPasswordHash = hashPassword("non-user-timing-equalizer-123!");

function normalizeEmail(email: string): string { return email.trim().toLowerCase(); }
function networkKey(risk: string | RequestRiskContext): string { return typeof risk === "string" ? risk : risk.networkKey; }
async function allowDimensions(pool: Pool, action: string, risk: string | RequestRiskContext, subject: string, limit: number, windowSeconds: number, secret: string) {
  return consumeRateLimitDimensions(pool, [
    { action, riskKey: `network:${networkKey(risk)}`, limit, windowSeconds, secret },
    { action, riskKey: `subject:${subject}`, limit, windowSeconds, secret },
  ]);
}

async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally { client.release(); }
}

function tokenEmail(purpose: "email_verification" | "password_reset", email: string, token: string, appOrigin: string) {
  const path = purpose === "email_verification" ? "/verify-email?token=" : "/reset-password?token=";
  const action = purpose === "email_verification" ? "Verify your NexaFlow account" : "Reset your NexaFlow password";
  return {
    to: email,
    subject: action,
    text: `${action}: ${appOrigin}${path}${encodeURIComponent(token)}`,
  };
}

async function issueIdentityToken(
  client: PoolClient,
  input: { userId: string; email: string; purpose: "email_verification" | "password_reset"; lifetimeMs: number; config: IdentityConfig },
): Promise<string> {
  const token = randomOpaqueToken();
  await client.query(
    "update identity_tokens set replaced_at = now(), updated_at = now() where user_id = $1 and purpose = $2 and consumed_at is null and replaced_at is null",
    [input.userId, input.purpose],
  );
  await client.query(
    `insert into identity_tokens (user_id, purpose, token_hash, expires_at)
     values ($1, $2, $3, $4)`,
    [input.userId, input.purpose, keyedHash(token, input.config.secret), new Date(Date.now() + input.lifetimeMs)],
  );
  const email = tokenEmail(input.purpose, input.email, token, input.config.appOrigin);
  await client.query(
    `insert into outbox_messages (topic, aggregate_type, aggregate_id, payload)
     values ($1, 'user', $2, $3)`,
    [`identity.${input.purpose}`, input.userId, JSON.stringify({ envelope: encryptEnvelope(email, input.config.secret) })],
  );
  return token;
}

export async function registerPasswordUser(
  pool: Pool,
  input: { email: string; displayName: string; password: string; planCode?: string; cadence?: string; riskKey: string | RequestRiskContext; requestId?: string },
  config: IdentityConfig,
) {
  const email = normalizeEmail(input.email);
  assertPasswordPolicy(input.password);
  if (!await allowDimensions(pool, "register", input.riskKey, email, 5, 3600, config.secret)) return acceptedResponse;
  const passwordHash = await hashPassword(input.password);
  try {
    await transaction(pool, async (client) => {
      const user = await client.query<{ id: string }>(
        `insert into users (primary_email_normalized, primary_email_display, display_name)
         values ($1, $2, $3) returning id`,
        [email, input.email.trim(), input.displayName.trim()],
      );
      const userId = user.rows[0].id;
      await client.query(
        `insert into identity_credentials (user_id, provider, provider_subject, password_hash)
         values ($1, 'password', $2, $3)`, [userId, userId, passwordHash],
      );
      await client.query(
        `insert into onboarding_progress (user_id, selected_plan_code, billing_cadence, current_step)
         values ($1, $2, $3, 'identity_verification')`,
        [userId, input.planCode ?? null, input.cadence ?? null],
      );
      await issueIdentityToken(client, { userId, email, purpose: "email_verification", lifetimeMs: 86_400_000, config });
      await writeAudit(client, { actorUserId: userId, action: "identity.registered", targetType: "user", targetId: userId,
        outcome: "success", requestId: input.requestId, metadata: { auth_method: "password", operation: "register" } });
    });
  } catch (error) {
    if ((error as { code?: string }).code !== "23505") throw error;
  }
  return acceptedResponse;
}

export async function verifyEmailToken(pool: Pool, token: string, config: IdentityConfig, risk: string | RequestRiskContext = "direct-local") {
  if (!await allowDimensions(pool, "verify", risk, token.slice(0, 16), 10, 3600, config.secret)) return { ok: false, code: "invalid_or_expired" } as const;
  return transaction(pool, async (client) => {
    const found = await client.query<{ id: string; user_id: string }>(
      `select id, user_id from identity_tokens where token_hash = $1 and purpose = 'email_verification'
       and consumed_at is null and replaced_at is null and expires_at > now() for update`,
      [keyedHash(token, config.secret)],
    );
    if (!found.rows[0]) return { ok: false, code: "invalid_or_expired" } as const;
    const row = found.rows[0];
    await client.query("update identity_tokens set consumed_at = now(), updated_at = now() where id = $1", [row.id]);
    await client.query("update users set status = 'active', email_verified_at = coalesce(email_verified_at, now()), updated_at = now() where id = $1", [row.user_id]);
    await client.query("update onboarding_progress set current_step = 'workspace', updated_at = now() where user_id = $1", [row.user_id]);
    await writeAudit(client, { actorUserId: row.user_id, action: "identity.email_verified", targetType: "user", targetId: row.user_id,
      outcome: "success", metadata: { operation: "email_verification" } });
    return { ok: true } as const;
  });
}

export async function resendVerification(pool: Pool, emailInput: string, riskKey: string | RequestRiskContext, config: IdentityConfig) {
  const email = normalizeEmail(emailInput);
  if (!await allowDimensions(pool, "verification_resend", riskKey, email, 3, 3600, config.secret)) return acceptedResponse;
  await transaction(pool, async (client) => {
    const user = await client.query<{ id: string; primary_email_display: string }>(
      "select id, primary_email_display from users where primary_email_normalized = $1 and status = 'pending_verification' for update", [email],
    );
    if (!user.rows[0]) return;
    await issueIdentityToken(client, { userId: user.rows[0].id, email: user.rows[0].primary_email_display,
      purpose: "email_verification", lifetimeMs: 86_400_000, config });
    await writeAudit(client, { actorUserId: user.rows[0].id, action: "identity.verification_resent", targetType: "user",
      targetId: user.rows[0].id, outcome: "success", metadata: { operation: "verification_resend" } });
  });
  return acceptedResponse;
}

export async function requestPasswordReset(pool: Pool, emailInput: string, riskKey: string | RequestRiskContext, config: IdentityConfig) {
  const email = normalizeEmail(emailInput);
  if (!await allowDimensions(pool, "reset_request", riskKey, email, 3, 3600, config.secret)) return acceptedResponse;
  await transaction(pool, async (client) => {
    const user = await client.query<{ id: string; primary_email_display: string }>(
      "select id, primary_email_display from users where primary_email_normalized = $1 and status = 'active'", [email],
    );
    if (!user.rows[0]) return;
    await issueIdentityToken(client, { userId: user.rows[0].id, email: user.rows[0].primary_email_display,
      purpose: "password_reset", lifetimeMs: 3_600_000, config });
    await writeAudit(client, { actorUserId: user.rows[0].id, action: "identity.password_reset_requested", targetType: "user",
      targetId: user.rows[0].id, outcome: "success", metadata: { operation: "reset_request" } });
  });
  return acceptedResponse;
}

export async function completePasswordReset(pool: Pool, token: string, password: string, config: IdentityConfig) {
  assertPasswordPolicy(password);
  const passwordHash = await hashPassword(password);
  const tokenHash = keyedHash(token, config.secret);
  return transaction(pool, async (client) => {
    const candidate = await client.query<{ user_id: string }>(
      `select user_id from identity_tokens where token_hash = $1 and purpose = 'password_reset'
       and consumed_at is null and replaced_at is null and expires_at > now()`,
      [tokenHash],
    );
    if (!candidate.rows[0]) return { ok: false, code: "invalid_or_expired" } as const;
    await lockPasswordOperation(client, candidate.rows[0].user_id);
    const found = await client.query<{ id: string; user_id: string }>(
      `select id, user_id from identity_tokens where token_hash = $1 and purpose = 'password_reset'
       and user_id = $2 and consumed_at is null and replaced_at is null and expires_at > now() for update`,
      [tokenHash, candidate.rows[0].user_id],
    );
    if (!found.rows[0]) return { ok: false, code: "invalid_or_expired" } as const;
    const row = found.rows[0];
    await client.query("update identity_tokens set consumed_at = now(), updated_at = now() where id = $1", [row.id]);
    await client.query("update identity_credentials set password_hash = $2, updated_at = now() where user_id = $1 and provider = 'password'", [row.user_id, passwordHash]);
    await revokeAllSessions(client, row.user_id);
    await writeAudit(client, { actorUserId: row.user_id, action: "identity.password_reset_completed", targetType: "user", targetId: row.user_id,
      outcome: "success", metadata: { operation: "reset_complete" } });
    return { ok: true } as const;
  });
}

export async function loginPassword(
  pool: Pool,
  input: { email: string; password: string; riskKey: string | RequestRiskContext; existingSession?: string },
  config: IdentityConfig,
) {
  const email = normalizeEmail(input.email);
  if (!await allowDimensions(pool, "login", input.riskKey, email, 10, 900, config.secret)) return invalidCredentialsResponse;
  const result = await pool.query<{ id: string; status: string; security_version: number; password_hash: string }>(
    `select u.id, u.status, u.security_version, c.password_hash from users u join identity_credentials c on c.user_id = u.id
      where u.primary_email_normalized = $1 and c.provider = 'password'`, [email],
  );
  const row = result.rows[0];
  const valid = await verifyPassword(row?.password_hash ?? await dummyPasswordHash, input.password);
  if (!row || !valid || row.status !== "active") {
    await transaction(pool, async (client) => writeAudit(client, { actorUserId: row?.id, action: "identity.login", targetType: "session",
      outcome: "denied", reasonCode: "invalid_credentials", metadata: { auth_method: "password", operation: "login" } }));
    return invalidCredentialsResponse;
  }
  return transaction(pool, async (client) => {
    if (passwordNeedsRehash(row.password_hash)) {
      await client.query("update identity_credentials set password_hash = $2, last_used_at = now(), updated_at = now() where user_id = $1 and provider = 'password'", [row.id, await hashPassword(input.password)]);
    } else await client.query("update identity_credentials set last_used_at = now(), updated_at = now() where user_id = $1 and provider = 'password'", [row.id]);
    await revokeCurrentSession(client, input.existingSession, config.secret);
    const session = await createSession(client, { userId: row.id, securityVersion: row.security_version, secret: config.secret,
      idleMinutes: config.idleMinutes, absoluteHours: config.absoluteHours });
    await writeAudit(client, { actorUserId: row.id, sessionId: session.id, action: "identity.login", targetType: "session", targetId: session.id,
      outcome: "success", metadata: { auth_method: "password", operation: "login" } });
    return { ok: true, sessionToken: session.token, userId: row.id } as const;
  });
}
