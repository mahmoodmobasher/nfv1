import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/server/db/client";
import { accountPreferences, accountProfile, changePassword, updateAccountPreferences, updateDisplayName } from "../src/server/account/service";
import { completePasswordReset, loginPassword, registerPasswordUser, requestPasswordReset, verifyEmailToken } from "../src/server/identity/service";
import { decryptEnvelope } from "../src/server/security/crypto";
import { resolveIdentityContext } from "../src/server/security/session";

const integration = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const connectionString = process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow";
const config = { secret: "account-integration-secret-at-least-32-characters", appOrigin: "http://127.0.0.1:3000", idleMinutes: 30, absoluteHours: 24, touchIntervalSeconds: 60 };
let pool: Pool;

async function activePasswordUser(email = "account@example.test") {
  await registerPasswordUser(pool, { email, displayName: "Initial Name", password: "Initial-password-123!", riskKey: `account-register:${email}` }, config);
  const message = (await pool.query<{ payload: { envelope: string } }>("select payload from outbox_messages where topic='identity.email_verification'")).rows[0];
  const token = decodeURIComponent(decryptEnvelope<{ text: string }>(message.payload.envelope, config.secret).text.split("token=")[1]);
  await verifyEmailToken(pool, token, config);
  const login = await loginPassword(pool, { email, password: "Initial-password-123!", riskKey: `account-login:${email}` }, config);
  if (!login.ok) throw new Error("login failed");
  const session = await resolveIdentityContext(pool, login.sessionToken, config.secret);
  if (!session) throw new Error("missing session");
  return { login, session };
}

async function passwordResetToken(email = "account@example.test") {
  await requestPasswordReset(pool, email, `account-reset:${email}`, config);
  const message = (await pool.query<{ payload: { envelope: string } }>("select payload from outbox_messages where topic='identity.password_reset' order by created_at desc limit 1")).rows[0];
  return decodeURIComponent(decryptEnvelope<{ text: string }>(message.payload.envelope, config.secret).text.split("token=")[1]);
}

async function waitForAdvisoryWaiters(expected: number) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await pool.query<{ count: number }>(
      `select count(*)::int count from pg_stat_activity
       where datname = current_database() and pid <> pg_backend_pid()
       and wait_event_type = 'Lock' and wait_event = 'advisory'`,
    );
    if (result.rows[0].count >= expected) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Expected ${expected} password-operation advisory lock waiters`);
}

integration("Feature 3 account service", () => {
  beforeAll(() => { ({ pool } = createDb({ connectionString })); });
  beforeEach(async () => { await pool.query("truncate lead_activities,lead_visible_teams,leads,pipeline_stages,team_memberships,teams,workspace_invitations,audit_events,outbox_messages,idempotency_records,workspace_entitlement_snapshots,workspace_memberships,roles,oidc_transactions,identity_tokens,sessions,identity_credentials,onboarding_progress,workspaces,users,rate_limit_windows restart identity cascade"); });
  afterAll(async () => { await pool?.end(); });

  it("reads and updates only the authenticated user's display name with safe audit evidence", async () => {
    const { session } = await activePasswordUser();
    expect(await accountProfile(pool, session, 10)).toMatchObject({ displayName: "Initial Name", email: "account@example.test", emailVerified: true, hasPassword: true, recentAuthentication: true });
    await expect(updateDisplayName(pool, session, "  Updated   Name ")).resolves.toEqual({ displayName: "Updated Name" });
    expect((await pool.query("select display_name from users")).rows[0]).toEqual({ display_name: "Updated Name" });
    expect((await pool.query("select action,outcome,metadata from audit_events where action='identity.profile_updated'")).rows[0]).toEqual({ action: "identity.profile_updated", outcome: "success", metadata: { operation: "identity.profile_updated", change_fields: ["display_name"] } });
  });

  it("requires recent authentication and current password, then revokes every session and outstanding reset token", async () => {
    const { login, session } = await activePasswordUser();
    const resetToken = await passwordResetToken();
    const second = await loginPassword(pool, { email: "account@example.test", password: "Initial-password-123!", riskKey: "account-login-second" }, config);
    if (!second.ok) throw new Error("second login failed");
    await expect(changePassword(pool, { ...session, currentPassword: "wrong-password", newPassword: "Changed-password-123!", recentMinutes: 10 })).rejects.toMatchObject({ code: "invalid_credentials" });
    await expect(changePassword(pool, { ...session, currentPassword: "Initial-password-123!", newPassword: "Changed-password-123!", recentMinutes: 10 })).resolves.toEqual({ ok: true });
    expect(await resolveIdentityContext(pool, login.sessionToken, config.secret)).toBeNull();
    expect(await resolveIdentityContext(pool, second.sessionToken, config.secret)).toBeNull();
    expect(await completePasswordReset(pool, resetToken, "Recovery-password-123!", config)).toEqual({ ok: false, code: "invalid_or_expired" });
    expect((await loginPassword(pool, { email: "account@example.test", password: "Changed-password-123!", riskKey: "account-login-changed" }, config)).ok).toBe(true);
    expect((await pool.query("select action,outcome from audit_events where action='identity.password_changed'")).rows).toEqual([{ action: "identity.password_changed", outcome: "success" }]);
  });

  it.each(["change", "reset"] as const)("serializes password change against reset completion when %s wins", async (first) => {
      const email = `concurrent-${first}@example.test`;
      const { session } = await activePasswordUser(email);
      const resetToken = await passwordResetToken(email);
      const blocker = await pool.connect();
      await blocker.query("begin");
      await blocker.query(
        "select pg_advisory_xact_lock(hashtext('identity.password_operation'), hashtext($1))",
        [session.userId],
      );
      const change = () => changePassword(pool, { ...session, currentPassword: "Initial-password-123!", newPassword: "Changed-password-123!", recentMinutes: 10 });
      const reset = () => completePasswordReset(pool, resetToken, "Recovery-password-123!", config);
      const firstOperation = first === "change" ? change() : reset();
      await waitForAdvisoryWaiters(1);
      const secondOperation = first === "change" ? reset() : change();
      await waitForAdvisoryWaiters(2);
      await blocker.query("commit");
      blocker.release();
      const [firstResult, secondResult] = await Promise.allSettled([firstOperation, secondOperation]);
      const changeResult = first === "change" ? firstResult : secondResult;
      const resetResult = first === "reset" ? firstResult : secondResult;

      if (first === "change") {
        expect(changeResult).toMatchObject({ status: "fulfilled", value: { ok: true } });
        expect(resetResult).toMatchObject({ status: "fulfilled", value: { ok: false, code: "invalid_or_expired" } });
      } else {
        expect(resetResult).toMatchObject({ status: "fulfilled", value: { ok: true } });
        expect(changeResult).toMatchObject({ status: "rejected", reason: { code: "authentication_required", status: 401 } });
      }

      expect((await pool.query("select security_version from users where id=$1", [session.userId])).rows[0].security_version).toBe(2);
      expect((await pool.query("select count(*)::int count from sessions where user_id=$1 and revoked_at is null", [session.userId])).rows[0].count).toBe(0);
      const tokenState = (await pool.query("select consumed_at,replaced_at from identity_tokens where user_id=$1 and purpose='password_reset'", [session.userId])).rows[0];
      expect(Boolean(tokenState.consumed_at)).toBe(first === "reset");
      expect(Boolean(tokenState.replaced_at)).toBe(first === "change");
      expect((await pool.query("select action from audit_events where actor_user_id=$1 and action in ('identity.password_changed','identity.password_reset_completed')", [session.userId])).rows).toEqual([
        { action: first === "change" ? "identity.password_changed" : "identity.password_reset_completed" },
      ]);

      await expect(completePasswordReset(pool, resetToken, "Retry-password-123!", config)).resolves.toEqual({ ok: false, code: "invalid_or_expired" });
      await expect(change()).rejects.toMatchObject({ code: "authentication_required", status: 401 });
      expect((await pool.query("select security_version from users where id=$1", [session.userId])).rows[0].security_version).toBe(2);
      expect((await pool.query("select count(*)::int count from audit_events where actor_user_id=$1 and action in ('identity.password_changed','identity.password_reset_completed')", [session.userId])).rows[0].count).toBe(1);
      const winnerPassword = first === "change" ? "Changed-password-123!" : "Recovery-password-123!";
      expect((await loginPassword(pool, { email, password: winnerPassword, riskKey: `winner-login:${email}` }, config)).ok).toBe(true);
  });

  it("rolls back password, reset-token, Session, and success Audit changes after a late transaction failure", async () => {
    const { login, session } = await activePasswordUser();
    await passwordResetToken();
    await pool.query("alter table audit_events add constraint account_password_change_rollback_test check (action <> 'identity.password_changed')");
    try {
      await expect(changePassword(pool, { ...session, currentPassword: "Initial-password-123!", newPassword: "Changed-password-123!", recentMinutes: 10 })).rejects.toMatchObject({ code: "23514" });
    } finally {
      await pool.query("alter table audit_events drop constraint account_password_change_rollback_test");
    }
    expect((await pool.query("select consumed_at,replaced_at from identity_tokens where purpose='password_reset'")).rows).toEqual([{ consumed_at: null, replaced_at: null }]);
    expect(await resolveIdentityContext(pool, login.sessionToken, config.secret)).not.toBeNull();
    expect((await loginPassword(pool, { email: "account@example.test", password: "Initial-password-123!", riskKey: "account-rollback-login" }, config)).ok).toBe(true);
    expect((await pool.query("select count(*)::int count from audit_events where action='identity.password_changed'")).rows[0].count).toBe(0);
  });

  it("creates, reads, and version-controls only the current user's typed preferences", async () => {
    const { session } = await activePasswordUser();
    await expect(accountPreferences(pool, session)).resolves.toEqual({ appearance: "system", locale: null, timeZone: null, version: 0 });
    await expect(updateAccountPreferences(pool, session, { expectedVersion: 0, appearance: "dark", locale: "en-CA", timeZone: "America/Toronto" })).resolves.toEqual({ appearance: "dark", locale: "en-CA", timeZone: "America/Toronto", version: 1 });
    await expect(updateAccountPreferences(pool, session, { expectedVersion: 0, appearance: "light" })).rejects.toMatchObject({ status: 409 });
    expect((await pool.query("select action,metadata from audit_events where action='identity.preferences_updated'")).rows[0]).toEqual({ action: "identity.preferences_updated", metadata: { operation: "identity.preferences_updated", change_fields: ["appearance", "locale", "time_zone"], expected_version: 0, result_version: 1 } });
  });

  it("rejects stale recent authentication and weak replacement passwords without changing credentials", async () => {
    const { session } = await activePasswordUser();
    await pool.query("update sessions set authenticated_at=now()-interval '11 minutes' where id=$1", [session.sessionId]);
    await expect(changePassword(pool, { ...session, currentPassword: "Initial-password-123!", newPassword: "Changed-password-123!", recentMinutes: 10 })).rejects.toMatchObject({ code: "recent_auth_required" });
    await pool.query("update sessions set authenticated_at=now() where id=$1", [session.sessionId]);
    await expect(changePassword(pool, { ...session, currentPassword: "Initial-password-123!", newPassword: "abcdefghijkl", recentMinutes: 10 })).rejects.toMatchObject({ code: "password_policy" });
    expect((await loginPassword(pool, { email: "account@example.test", password: "Initial-password-123!", riskKey: "account-password-unchanged" }, config)).ok).toBe(true);
  });
});
