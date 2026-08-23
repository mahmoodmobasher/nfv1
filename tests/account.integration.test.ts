import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/server/db/client";
import { accountPreferences, accountProfile, changePassword, updateAccountPreferences, updateDisplayName } from "../src/server/account/service";
import { loginPassword, registerPasswordUser, verifyEmailToken } from "../src/server/identity/service";
import { decryptEnvelope } from "../src/server/security/crypto";
import { resolveIdentityContext } from "../src/server/security/session";

const integration = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const connectionString = process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow";
const config = { secret: "account-integration-secret-at-least-32-characters", appOrigin: "http://127.0.0.1:3000", idleMinutes: 30, absoluteHours: 24, touchIntervalSeconds: 60 };
let pool: Pool;

async function activePasswordUser() {
  await registerPasswordUser(pool, { email: "account@example.test", displayName: "Initial Name", password: "Initial-password-123!", riskKey: "account-register" }, config);
  const message = (await pool.query<{ payload: { envelope: string } }>("select payload from outbox_messages where topic='identity.email_verification'")).rows[0];
  const token = decodeURIComponent(decryptEnvelope<{ text: string }>(message.payload.envelope, config.secret).text.split("token=")[1]);
  await verifyEmailToken(pool, token, config);
  const login = await loginPassword(pool, { email: "account@example.test", password: "Initial-password-123!", riskKey: "account-login" }, config);
  if (!login.ok) throw new Error("login failed");
  const session = await resolveIdentityContext(pool, login.sessionToken, config.secret);
  if (!session) throw new Error("missing session");
  return { login, session };
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

  it("requires recent authentication and current password, then revokes every session", async () => {
    const { login, session } = await activePasswordUser();
    const second = await loginPassword(pool, { email: "account@example.test", password: "Initial-password-123!", riskKey: "account-login-second" }, config);
    if (!second.ok) throw new Error("second login failed");
    await expect(changePassword(pool, { ...session, currentPassword: "wrong-password", newPassword: "Changed-password-123!", recentMinutes: 10 })).rejects.toMatchObject({ code: "invalid_credentials" });
    await expect(changePassword(pool, { ...session, currentPassword: "Initial-password-123!", newPassword: "Changed-password-123!", recentMinutes: 10 })).resolves.toEqual({ ok: true });
    expect(await resolveIdentityContext(pool, login.sessionToken, config.secret)).toBeNull();
    expect(await resolveIdentityContext(pool, second.sessionToken, config.secret)).toBeNull();
    expect((await loginPassword(pool, { email: "account@example.test", password: "Changed-password-123!", riskKey: "account-login-changed" }, config)).ok).toBe(true);
    expect((await pool.query("select action,outcome from audit_events where action='identity.password_changed'")).rows).toEqual([{ action: "identity.password_changed", outcome: "success" }]);
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
