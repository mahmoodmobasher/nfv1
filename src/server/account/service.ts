import type { Pool, PoolClient } from "pg";
import { writeAudit } from "../security/audit";
import { hashPassword, verifyPassword } from "../security/password";
import { revokeAllSessions } from "../security/session";
import { lockPasswordOperation } from "../security/password-operation";
import { PasswordPolicyError, assertPasswordPolicy } from "../../shared/password-policy";

export class AccountError extends Error {
  constructor(public code: "authentication_required" | "recent_auth_required" | "validation_failed" | "stale_version" | "password_credential_required" | "invalid_credentials" | "password_policy", public status: number) {
    super(code);
  }
}

type AccountSession = { userId: string; sessionId: string };
export type AccountPreferences = { appearance: "system" | "light" | "dark"; locale: string | null; timeZone: string | null; version: number };

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
  } finally {
    client.release();
  }
}

export async function accountProfile(pool: Pool, session: AccountSession, recentMinutes: number) {
  const result = await pool.query<{
    display_name: string;
    primary_email_display: string | null;
    email_verified_at: Date | null;
    has_password: boolean;
    authenticated_at: Date;
    auth_method: string;
  }>(
    `select u.display_name, u.primary_email_display, u.email_verified_at,
      exists(select 1 from identity_credentials c where c.user_id = u.id and c.provider = 'password') as has_password,
      s.authenticated_at, s.auth_method
     from users u join sessions s on s.user_id = u.id
     where u.id = $1 and s.id = $2 and s.revoked_at is null`,
    [session.userId, session.sessionId],
  );
  const row = result.rows[0];
  if (!row) throw new AccountError("authentication_required", 401);
  return {
    displayName: row.display_name,
    email: row.primary_email_display,
    emailVerified: Boolean(row.email_verified_at),
    hasPassword: row.has_password,
    recentAuthentication: row.auth_method !== "legacy" && row.authenticated_at.getTime() >= Date.now() - recentMinutes * 60_000,
  };
}

export async function updateDisplayName(pool: Pool, session: AccountSession, displayName: string) {
  const normalized = displayName.trim().replace(/\s+/g, " ");
  if (normalized.length < 1 || normalized.length > 120) throw new AccountError("validation_failed", 400);
  return transaction(pool, async (client) => {
    const changed = await client.query<{ display_name: string }>(
      `update users set display_name = $3, updated_at = now()
       where id = $1 and exists(select 1 from sessions where id = $2 and user_id = $1 and revoked_at is null)
       returning display_name`,
      [session.userId, session.sessionId, normalized],
    );
    if (!changed.rows[0]) throw new AccountError("authentication_required", 401);
    await writeAudit(client, {
      actorUserId: session.userId,
      sessionId: session.sessionId,
      action: "identity.profile_updated",
      targetType: "user",
      targetId: session.userId,
      outcome: "success",
      metadata: { change_fields: ["display_name"] },
    });
    return { displayName: changed.rows[0].display_name };
  });
}

function validLocale(value: string | null): boolean {
  if (value === null) return true;
  try { return Intl.getCanonicalLocales(value).length === 1; } catch { return false; }
}

function validTimeZone(value: string | null): boolean {
  if (value === null) return true;
  try { Intl.DateTimeFormat(undefined, { timeZone: value }); return true; } catch { return false; }
}

export async function accountPreferences(pool: Pool, session: AccountSession): Promise<AccountPreferences> {
  const result = await pool.query<AccountPreferences>(
    `select p.appearance, p.locale, p.time_zone "timeZone", p.version
     from user_preferences p join sessions s on s.user_id = p.user_id
     where p.user_id = $1 and s.id = $2 and s.revoked_at is null`,
    [session.userId, session.sessionId],
  );
  if (result.rows[0]) return result.rows[0];
  const authenticated = await pool.query("select 1 from sessions where id=$1 and user_id=$2 and revoked_at is null", [session.sessionId, session.userId]);
  if (!authenticated.rows[0]) throw new AccountError("authentication_required", 401);
  return { appearance: "system", locale: null, timeZone: null, version: 0 };
}

export async function updateAccountPreferences(
  pool: Pool,
  session: AccountSession,
  input: Partial<Omit<AccountPreferences, "version">> & { expectedVersion: number },
): Promise<AccountPreferences> {
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0 ||
    (input.appearance !== undefined && !["system", "light", "dark"].includes(input.appearance)) ||
    (input.locale !== undefined && (!validLocale(input.locale) || (input.locale !== null && input.locale.length > 35))) ||
    (input.timeZone !== undefined && (!validTimeZone(input.timeZone) || (input.timeZone !== null && input.timeZone.length > 64)))) {
    throw new AccountError("validation_failed", 400);
  }
  return transaction(pool, async (client) => {
    const authenticated = await client.query("select 1 from sessions where id=$1 and user_id=$2 and revoked_at is null for update", [session.sessionId, session.userId]);
    if (!authenticated.rows[0]) throw new AccountError("authentication_required", 401);
    const existing = await client.query<AccountPreferences>(
      `select appearance, locale, time_zone "timeZone", version from user_preferences where user_id=$1 for update`,
      [session.userId],
    );
    const prior = existing.rows[0];
    if (prior && prior.version !== input.expectedVersion) throw new AccountError("stale_version", 409);
    if (!prior && input.expectedVersion !== 0) throw new AccountError("stale_version", 409);
    const next = {
      appearance: input.appearance ?? prior?.appearance ?? "system",
      locale: input.locale === undefined ? prior?.locale ?? null : input.locale,
      timeZone: input.timeZone === undefined ? prior?.timeZone ?? null : input.timeZone,
    } as const;
    const changedFields = ([
      input.appearance !== undefined && input.appearance !== prior?.appearance ? "appearance" : null,
      input.locale !== undefined && input.locale !== prior?.locale ? "locale" : null,
      input.timeZone !== undefined && input.timeZone !== prior?.timeZone ? "time_zone" : null,
    ].filter(Boolean) as string[]);
    const result = prior
      ? await client.query<AccountPreferences>(
          `update user_preferences set appearance=$2, locale=$3, time_zone=$4, version=version+1, updated_at=now()
           where user_id=$1 and version=$5 returning appearance, locale, time_zone "timeZone", version`,
          [session.userId, next.appearance, next.locale, next.timeZone, input.expectedVersion],
        )
      : await client.query<AccountPreferences>(
          `insert into user_preferences(user_id,appearance,locale,time_zone) values($1,$2,$3,$4)
           returning appearance, locale, time_zone "timeZone", version`,
          [session.userId, next.appearance, next.locale, next.timeZone],
        );
    const changed = result.rows[0];
    if (!changed) throw new AccountError("stale_version", 409);
    await writeAudit(client, {
      actorUserId: session.userId,
      sessionId: session.sessionId,
      action: "identity.preferences_updated",
      targetType: "user_preference",
      targetId: session.userId,
      outcome: "success",
      metadata: { change_fields: changedFields, expected_version: input.expectedVersion, result_version: changed.version },
    });
    return changed;
  });
}

export async function changePassword(
  pool: Pool,
  input: AccountSession & { currentPassword: string; newPassword: string; recentMinutes: number },
) {
  try {
    assertPasswordPolicy(input.newPassword);
  } catch (error) {
    if (error instanceof PasswordPolicyError) throw new AccountError("password_policy", 400);
    throw error;
  }
  const passwordHash = await hashPassword(input.newPassword);
  return transaction(pool, async (client) => {
    await lockPasswordOperation(client, input.userId);
    const found = await client.query<{ password_hash: string | null; authenticated_at: Date; auth_method: string }>(
      `select c.password_hash, s.authenticated_at, s.auth_method
       from sessions s left join identity_credentials c on c.user_id = s.user_id and c.provider = 'password'
       join users u on u.id = s.user_id and u.status = 'active'
       where s.id = $1 and s.user_id = $2 and s.revoked_at is null
       for update of s`,
      [input.sessionId, input.userId],
    );
    const row = found.rows[0];
    if (!row) throw new AccountError("authentication_required", 401);
    if (row.auth_method === "legacy" || row.authenticated_at.getTime() < Date.now() - input.recentMinutes * 60_000) {
      throw new AccountError("recent_auth_required", 401);
    }
    if (!row.password_hash) throw new AccountError("password_credential_required", 409);
    if (!await verifyPassword(row.password_hash, input.currentPassword)) throw new AccountError("invalid_credentials", 401);
    await client.query(
      `update identity_tokens set replaced_at = now(), updated_at = now()
       where user_id = $1 and purpose = 'password_reset' and consumed_at is null and replaced_at is null`,
      [input.userId],
    );
    await client.query(
      "update identity_credentials set password_hash = $2, updated_at = now() where user_id = $1 and provider = 'password'",
      [input.userId, passwordHash],
    );
    await revokeAllSessions(client, input.userId);
    await writeAudit(client, {
      actorUserId: input.userId,
      sessionId: input.sessionId,
      action: "identity.password_changed",
      targetType: "user",
      targetId: input.userId,
      outcome: "success",
      metadata: { auth_age_bucket: "recent", change_fields: ["password"] },
    });
    return { ok: true } as const;
  });
}
