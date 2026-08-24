import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { beginOidc, completeOidc, fixtureToken } from "../src/server/identity/oidc";
import { loginPassword, registerPasswordUser, verifyEmailToken } from "../src/server/identity/service";
import { crmHome } from "../src/server/crm/home";
import { keyedHash } from "../src/server/security/crypto";
import { provisionWorkspace, requireWorkspaceAuthorization, savePlanSelection } from "../src/server/workspaces/provision";
import { POST as loginRoute } from "../src/app/api/auth/login/route";
import { INVITATION_RETURN_COOKIE, sealInvitationReturn } from "../src/server/invitations/intent";
import { seedCanonicalCommercialCatalog } from "./helpers/commercial-catalog";

const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });
const secret = "local-only-session-secret-change-me-32chars";
const redirectUri = "http://127.0.0.1:3000/api/auth/oidc/callback";
const allowedRedirectUris = [redirectUri];
const config = { secret, appOrigin: "http://127.0.0.1:3000", idleMinutes: 30, absoluteHours: 24, touchIntervalSeconds: 60 };

async function passwordUser(email: string, planCode = "growth", cadence = "monthly") {
  await registerPasswordUser(pool, { email, displayName: "Boundary User", password: "Local-password-123!", planCode, cadence, riskKey: email }, config);
  const user = (await pool.query<{ id: string }>("select id from users where primary_email_normalized=$1", [email])).rows[0];
  const token = `verify-${email}`;
  await pool.query("update identity_tokens set token_hash=$1 where user_id=$2 and purpose='email_verification'", [keyedHash(token, secret), user.id]);
  await verifyEmailToken(pool, token, config);
  const login = await loginPassword(pool, { email, password: "Local-password-123!", riskKey: `login-${email}` }, config);
  if (!login.ok) throw new Error("fixture login failed");
  return { userId: user.id, sessionId: (await pool.query<{ id: string }>("select id from sessions where user_id=$1 and revoked_at is null", [user.id])).rows[0].id };
}

suite("onboarding/workspace boundary validation", () => {
  beforeAll(async () => pool.query("select 1"));
  afterAll(async () => pool.end());
  beforeEach(async () => {
    await pool.query("drop trigger if exists nexaflow_test_boundary_fail_outbox on outbox_messages");
    await pool.query("drop function if exists nexaflow_test_boundary_fail_outbox()");
    await pool.query("truncate lead_activities,lead_visible_teams,leads,pipeline_stages,team_memberships,teams,workspace_invitations,audit_events,outbox_messages,idempotency_records,workspace_entitlement_snapshots,workspace_memberships,roles,oidc_transactions,identity_tokens,sessions,identity_credentials,onboarding_progress,workspaces,users,rate_limit_windows restart identity cascade");
    await seedCanonicalCommercialCatalog(pool);
  });

  it("persists selection before provisioning and snapshots exact workspace entitlement values only on provisioning", async () => {
    await registerPasswordUser(pool, { email: "values@test.example", displayName: "Values", password: "Local-password-123!", planCode: "growth", cadence: "monthly", riskKey: "values" }, config);
    const user = (await pool.query<{ id: string }>("select id from users where primary_email_normalized='values@test.example'" )).rows[0];
    expect((await pool.query("select selected_plan_code,billing_cadence,current_step,workspace_id from onboarding_progress where user_id=$1", [user.id])).rows[0]).toMatchObject({ selected_plan_code: "growth", billing_cadence: "monthly", current_step: "identity_verification", workspace_id: null });
    expect((await pool.query("select (select count(*) from workspaces) workspaces,(select count(*) from roles) roles,(select count(*) from workspace_memberships) memberships,(select count(*) from workspace_entitlement_snapshots) entitlements")).rows[0]).toEqual({ workspaces: "0", roles: "0", memberships: "0", entitlements: "0" });
    const token = "values-verification";
    await pool.query("update identity_tokens set token_hash=$1 where user_id=$2", [keyedHash(token, secret), user.id]);
    await verifyEmailToken(pool, token, config);
    const login = await loginPassword(pool, { email: "values@test.example", password: "Local-password-123!", riskKey: "values-login" }, config);
    if (!login.ok) throw new Error("login failed");
    await savePlanSelection(pool, user.id, "scale", "annual");
    expect((await pool.query("select count(*) from workspaces")).rows[0].count).toBe("0");
    const session = (await pool.query<{ id: string }>("select id from sessions where user_id=$1", [user.id])).rows[0];
    const provisioned = await provisionWorkspace(pool, { userId: user.id, sessionId: session.id, name: "Boundary Workspace", idempotencyKey: crypto.randomUUID() });
    expect((await pool.query("select status,plan_code,billing_cadence,trial_ends_at-trial_started_at trial from workspaces where id=$1", [provisioned.workspaceId])).rows[0]).toMatchObject({ status: "active", plan_code: "scale", billing_cadence: "annual", trial: { days: 14 } });
    expect((await pool.query("select plan_code,catalog_version,effective_limits from workspace_entitlement_snapshots where workspace_id=$1", [provisioned.workspaceId])).rows[0]).toMatchObject({ plan_code: "scale", catalog_version: "2026-08-commercial-v1", effective_limits: { activeSeats: 15 } });
    expect((await pool.query("select (select count(*)::int from roles where workspace_id=$1) roles,(select count(*)::int from workspace_memberships where workspace_id=$1 and status='active') memberships,(select count(*)::int from workspace_memberships m join roles r on r.id=m.role_id and r.workspace_id=m.workspace_id where m.workspace_id=$1 and m.status='active' and r.code='owner') owners", [provisioned.workspaceId])).rows[0]).toEqual({ roles: 3, memberships: 1, owners: 1 });
  });

  it("enforces one membership per workspace/user and same-workspace role scope in database and services", async () => {
    const actor = await passwordUser("constraints@test.example");
    const first = await provisionWorkspace(pool, { ...actor, name: "First", idempotencyKey: crypto.randomUUID() });
    const secondUser = await passwordUser("constraints-other@test.example");
    const second = await provisionWorkspace(pool, { ...secondUser, name: "Second", idempotencyKey: crypto.randomUUID() });
    const firstRole = (await pool.query<{ id: string }>("select id from roles where workspace_id=$1 and code='member'", [first.workspaceId])).rows[0];
    const secondRole = (await pool.query<{ id: string }>("select id from roles where workspace_id=$1 and code='member'", [second.workspaceId])).rows[0];
    await expect(pool.query("insert into workspace_memberships(workspace_id,user_id,role_id) values($1,$2,$3)", [first.workspaceId, actor.userId, firstRole.id])).rejects.toMatchObject({ code: "23505" });
    await expect(pool.query("insert into workspace_memberships(workspace_id,user_id,role_id) values($1,$2,$3)", [first.workspaceId, secondUser.userId, secondRole.id])).rejects.toMatchObject({ code: "23503" });
    expect(await requireWorkspaceAuthorization(pool, secondUser.userId, first.workspaceId)).toBeNull();
    await pool.query("insert into workspace_memberships(workspace_id,user_id,role_id) values($1,$2,$3)", [first.workspaceId, secondUser.userId, firstRole.id]);
    expect((await pool.query("select count(*)::int count from workspace_memberships where user_id=$1 and status='active'", [secondUser.userId])).rows[0].count).toBe(2);
    expect((await requireWorkspaceAuthorization(pool, actor.userId, first.workspaceId))?.role).toBe("owner");
    expect((await requireWorkspaceAuthorization(pool, secondUser.userId, first.workspaceId))?.role).toBe("member");
  });

  it("keeps verified signup retryable after a provisioning rollback and succeeds on retry", async () => {
    const actor = await passwordUser("retry@test.example");
    const input = { ...actor, name: "Retry Workspace", idempotencyKey: crypto.randomUUID() };
    await pool.query("drop trigger if exists nexaflow_test_boundary_fail_outbox on outbox_messages");
    await pool.query("drop function if exists nexaflow_test_boundary_fail_outbox()");
    try {
      await pool.query(`create function nexaflow_test_boundary_fail_outbox() returns trigger language plpgsql as $$ begin if new.topic='workspace.provisioned' then raise exception 'injected boundary failure'; end if; return new; end $$`);
      await pool.query("create trigger nexaflow_test_boundary_fail_outbox before insert on outbox_messages for each row execute function nexaflow_test_boundary_fail_outbox()");
      await expect(provisionWorkspace(pool, input)).rejects.toThrow("injected boundary failure");
      expect((await pool.query("select current_step,workspace_id from onboarding_progress where user_id=$1", [actor.userId])).rows[0]).toEqual({ current_step: "workspace", workspace_id: null });
      expect((await pool.query("select (select count(*)::int from workspaces) workspaces,(select count(*)::int from roles) roles,(select count(*)::int from workspace_memberships) memberships,(select count(*)::int from workspace_entitlement_snapshots) entitlements,(select count(*)::int from audit_events where workspace_id is not null) workspace_audits,(select count(*)::int from outbox_messages where topic='workspace.provisioned') provision_outbox,(select count(*)::int from idempotency_records where operation='workspace.provision') idempotency")).rows[0]).toEqual({ workspaces: 0, roles: 0, memberships: 0, entitlements: 0, workspace_audits: 0, provision_outbox: 0, idempotency: 0 });
    } finally {
      await pool.query("drop trigger if exists nexaflow_test_boundary_fail_outbox on outbox_messages");
      await pool.query("drop function if exists nexaflow_test_boundary_fail_outbox()");
    }
    await expect(provisionWorkspace(pool, input)).resolves.toMatchObject({ workspaceId: expect.any(String) });
    expect((await pool.query("select current_step,workspace_id is not null complete from onboarding_progress where user_id=$1", [actor.userId])).rows[0]).toEqual({ current_step: "complete", complete: true });
  });

  it("allows package changes before provisioning and rejects onboarding package changes afterward", async () => {
    const actor = await passwordUser("plan-change@test.example");
    await expect(savePlanSelection(pool, actor.userId, "scale", "annual")).resolves.toEqual({ planCode: "scale", cadence: "annual" });
    const workspace = await provisionWorkspace(pool, { ...actor, name: "Plan Locked", idempotencyKey: crypto.randomUUID() });
    await expect(provisionWorkspace(pool, { ...actor, name: "Second Self-Service Workspace", idempotencyKey: crypto.randomUUID() })).rejects.toMatchObject({ code: "not_eligible" });
    expect((await pool.query("select count(*)::int count from workspaces where created_by_user_id=$1", [actor.userId])).rows[0].count).toBe(1);
    await expect(savePlanSelection(pool, actor.userId, "growth", "monthly")).rejects.toMatchObject({ code: "not_eligible" });
    expect((await pool.query("select plan_code,billing_cadence from workspaces where id=$1", [workspace.workspaceId])).rows[0]).toEqual({ plan_code: "scale", billing_cadence: "annual" });
    expect((await pool.query("select selected_plan_code,billing_cadence from onboarding_progress where user_id=$1", [actor.userId])).rows[0]).toEqual({ selected_plan_code: "scale", billing_cadence: "annual" });
  });

  it("handles fixture OIDC new/existing/link flows and rejects provider-sub collision without switching", async () => {
    const first = await beginOidc(pool, { secret, redirectUri, allowedRedirectUris });
    const created = await completeOidc(pool, { ...first, token: await fixtureToken(secret, { sub: "new-sub", email: "oidc-new@test.example", nonce: first.nonce }), redirectUri, allowedRedirectUris, secret, config });
    expect((await pool.query("select selected_plan_code,billing_cadence,current_step,workspace_id from onboarding_progress where user_id=$1", [created.userId])).rows[0]).toEqual({ selected_plan_code: "growth", billing_cadence: "monthly", current_step: "workspace", workspace_id: null });
    const existing = await beginOidc(pool, { secret, redirectUri, allowedRedirectUris });
    expect((await completeOidc(pool, { ...existing, token: await fixtureToken(secret, { sub: "new-sub", email: "oidc-new@test.example", nonce: existing.nonce }), redirectUri, allowedRedirectUris, secret, config })).userId).toBe(created.userId);
    const password = await passwordUser("oidc-link@test.example");
    const linking = await beginOidc(pool, { secret, redirectUri, allowedRedirectUris, linkingUserId: password.userId });
    expect((await completeOidc(pool, { ...linking, token: await fixtureToken(secret, { sub: "linked-sub", email: "oidc-link@test.example", nonce: linking.nonce }), redirectUri, allowedRedirectUris, secret, config })).userId).toBe(password.userId);
    const collision = await beginOidc(pool, { secret, redirectUri, allowedRedirectUris, linkingUserId: password.userId });
    await expect(completeOidc(pool, { ...collision, token: await fixtureToken(secret, { sub: "new-sub", email: "oidc-new@test.example", nonce: collision.nonce }), redirectUri, allowedRedirectUris, secret, config })).rejects.toMatchObject({ code: "link_conflict" });
    expect((await pool.query("select user_id from identity_credentials where provider='google' and provider_subject='new-sub'")).rows[0].user_id).toBe(created.userId);
    expect((await pool.query("select action,count(*)::int count from audit_events where action like 'identity.oidc_%' group by action order by action")).rows).toEqual([
      { action: "identity.oidc_account_created", count: 1 },
      { action: "identity.oidc_linked", count: 1 },
      { action: "identity.oidc_login", count: 1 },
    ]);
  });

  it("records exact registration, verification, denied/successful login, and provisioning audits", async () => {
    await registerPasswordUser(pool, { email: "audit@test.example", displayName: "Audit", password: "Local-password-123!", planCode: "growth", cadence: "monthly", riskKey: "audit-register" }, config);
    const user = (await pool.query<{ id: string }>("select id from users where primary_email_normalized='audit@test.example'" )).rows[0];
    const token = "audit-token";
    await pool.query("update identity_tokens set token_hash=$1 where user_id=$2", [keyedHash(token, secret), user.id]);
    await verifyEmailToken(pool, token, config);
    await loginPassword(pool, { email: "audit@test.example", password: "wrong-password", riskKey: "audit-wrong" }, config);
    const login = await loginPassword(pool, { email: "audit@test.example", password: "Local-password-123!", riskKey: "audit-correct" }, config);
    if (!login.ok) throw new Error("login failed");
    const session = (await pool.query<{ id: string }>("select id from sessions where user_id=$1", [user.id])).rows[0];
    await provisionWorkspace(pool, { userId: user.id, sessionId: session.id, name: "Audit Workspace", idempotencyKey: crypto.randomUUID() });
    const events = (await pool.query("select action,outcome,count(*)::int count from audit_events group by action,outcome order by action,outcome")).rows;
    expect(events).toEqual([
      { action: "identity.email_verified", outcome: "success", count: 1 },
      { action: "identity.login", outcome: "denied", count: 1 },
      { action: "identity.login", outcome: "success", count: 1 },
      { action: "identity.registered", outcome: "success", count: 1 },
      { action: "workspace.created", outcome: "success", count: 1 },
      { action: "workspace.initial_owner_assigned", outcome: "success", count: 1 },
    ]);
  });

  it("resumes only an exact invitation path backed by a valid server-owned return marker", async () => {
    await passwordUser("invitation-return@test.example");
    const mutationHeaders={origin:config.appOrigin,cookie:`nexaflow_csrf=csrf; ${INVITATION_RETURN_COOKIE}=${encodeURIComponent(sealInvitationReturn(secret))}`,"x-csrf-token":"csrf","content-type":"application/json"};
    const accepted=await loginRoute(new Request(`${config.appOrigin}/api/auth/login`,{method:"POST",headers:mutationHeaders,body:JSON.stringify({email:"invitation-return@test.example",password:"Local-password-123!",next:"/workspace/invitations/accept"})}));
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({next:"/workspace/invitations/accept"});
    expect(accepted.headers.get("set-cookie")).toContain(`${INVITATION_RETURN_COOKIE}=`);
    const rejected=await loginRoute(new Request(`${config.appOrigin}/api/auth/login`,{method:"POST",headers:{...mutationHeaders,cookie:"nexaflow_csrf=csrf"},body:JSON.stringify({email:"invitation-return@test.example",password:"Local-password-123!",next:"https://attacker.invalid"})}));
    expect(rejected.status).toBe(200);
    expect(await rejected.json()).toMatchObject({next:"/workspace/create"});
  });

  it("denies CRM home for missing, suspended, and cross-tenant memberships", async () => {
    const owner = await passwordUser("crm-owner@test.example");
    const workspace = await provisionWorkspace(pool, { ...owner, name: "CRM One", idempotencyKey: crypto.randomUUID() });
    const outsider = await passwordUser("crm-outsider@test.example");
    await expect(crmHome(pool, outsider, workspace.workspaceId, {})).rejects.toMatchObject({ code: "access_denied" });
    expect(await requireWorkspaceAuthorization(pool, outsider.userId, workspace.workspaceId)).toBeNull();
    await pool.query("update workspace_memberships set status='suspended' where user_id=$1 and workspace_id=$2", [owner.userId, workspace.workspaceId]);
    await expect(crmHome(pool, owner, workspace.workspaceId, {})).rejects.toMatchObject({ code: "access_denied" });
    expect(await requireWorkspaceAuthorization(pool, owner.userId, workspace.workspaceId)).toBeNull();
  });
});
