import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { changeMembership } from "../src/server/tenant-admin/administration";
import type { TenantContext } from "../src/server/tenant-admin/permissions";
import { provisionWorkspace, savePlanSelection } from "../src/server/workspaces/provision";
import { resolveSelectedCommercialPlan } from "../src/server/commercial/catalog";
import { keyedHash } from "../src/server/security/crypto";
import { POST as savePlanRoute } from "../src/app/api/onboarding/plan/route";
import { POST as registerRoute } from "../src/app/api/auth/register/route";
import { seedCanonicalCommercialCatalog } from "./helpers/commercial-catalog";

const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });
const catalogVersion = "2026-08-commercial-v1";
const sessionSecret = "local-only-session-secret-change-me-32chars";
const catalog = [
  { code: "essentials", seats: 1, monthly: 6999, annualEquivalent: 2400 },
  { code: "growth", seats: 5, monthly: 8999, annualEquivalent: 5700 },
  { code: "scale", seats: 15, monthly: 11999, annualEquivalent: 10700 },
] as const;

async function provision(code: (typeof catalog)[number]["code"]) {
  const user = (await pool.query<{id:string}>(`insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at) values($1,$1,$2,'active',now()) returning id`, [`${code}-${crypto.randomUUID()}@catalog.test`, `${code} Owner`])).rows[0];
  const session = (await pool.query<{id:string}>(`insert into sessions(user_id,session_hash,security_version,idle_expires_at,absolute_expires_at,authenticated_at,auth_method) values($1,$2,1,now()+interval '1 hour',now()+interval '1 day',now(),'password') returning id`, [user.id, crypto.randomUUID()])).rows[0];
  await pool.query(`insert into onboarding_progress(user_id,selected_plan_code,billing_cadence,current_step) values($1,$2,'monthly','workspace')`, [user.id, code]);
  return { user, session, ...(await provisionWorkspace(pool, { userId: user.id, sessionId: session.id, name: `${code}-${crypto.randomUUID()}`, idempotencyKey: crypto.randomUUID() })) };
}

function mutationRequest(path:string,body:unknown,sessionToken?:string){const csrf=crypto.randomUUID();return new Request(`http://127.0.0.1:3000${path}`,{method:"POST",headers:{origin:"http://127.0.0.1:3000","content-type":"application/json","x-csrf-token":csrf,cookie:`nexaflow_csrf=${csrf}${sessionToken?`; nexaflow_session=${sessionToken}`:""}`},body:JSON.stringify(body)})}
async function authorityState(userId:string,sessionId:string){return (await pool.query(`select o.selected_plan_code,o.billing_cadence,o.version,o.updated_at,o.workspace_id,to_jsonb(s) session_state,
  (select count(*)::int from workspaces) workspaces,(select count(*)::int from workspace_memberships) memberships,(select count(*)::int from workspace_entitlement_snapshots) entitlements,
  (select count(*)::int from pipeline_stages) pipeline,(select count(*)::int from audit_events) audits,(select count(*)::int from outbox_messages) outbox,(select count(*)::int from idempotency_records) idempotency
  from onboarding_progress o join sessions s on s.user_id=o.user_id where o.user_id=$1 and s.id=$2`,[userId,sessionId])).rows[0]}

suite("versioned commercial catalog authority", () => {
  beforeAll(async () => pool.query("select 1"));
  afterAll(async () => pool.end());
  beforeEach(async () => {await pool.query("truncate workspace_invitation_teams,team_memberships,teams,workspace_invitations,audit_events,outbox_messages,idempotency_records,workspace_entitlement_snapshots,workspace_memberships,roles,sessions,identity_credentials,identity_tokens,onboarding_progress,workspaces,users restart identity cascade");await seedCanonicalCommercialCatalog(pool);});
  afterEach(async () => pool.query("delete from plan_catalog_entries where catalog_version like 'test-commercial-untyped-%'"));

  it("selects exactly one effective typed USD Workspace-subscription row per plan", async () => {
    const rows = (await pool.query(`select code,included_active_seats seats,currency_code currency,billing_unit,monthly_price_cents monthly,annual_monthly_equivalent_price_cents annual_equivalent from plan_catalog_entries where status='active' and effective_from<=now() and(effective_to is null or effective_to>now()) and code in('essentials','growth','scale') order by code,effective_from desc,created_at desc,id desc`)).rows;
    expect(rows).toEqual(catalog.map(item => ({ code: item.code, seats: item.seats, currency: "USD", billing_unit: "workspace_subscription", monthly: item.monthly, annual_equivalent: item.annualEquivalent })));
    expect(new Set(rows.map(row => row.code)).size).toBe(3);
    expect((await pool.query(`select count(*)::int count from plan_catalog_entries where catalog_version='2026-08-commercial-v1'`)).rows[0].count).toBe(3);
    expect((await pool.query(`select count(*)::int count from workspace_entitlement_snapshots`)).rows[0].count).toBe(0);
  });

  it("provisions 1/5/15 Owner-inclusive snapshots using the deterministic catalog version", async () => {
    for (const expected of catalog) {
      const workspace = await provision(expected.code);
      expect((await pool.query(`select catalog_version,(effective_limits->>'activeSeats')::int active_seats from workspace_entitlement_snapshots where workspace_id=$1`, [workspace.workspaceId])).rows[0]).toEqual({ catalog_version: catalogVersion, active_seats: expected.seats });
      expect((await pool.query(`select count(*)::int count from workspace_memberships where workspace_id=$1 and status='active'`, [workspace.workspaceId])).rows[0].count).toBe(1);
      expect((await pool.query(`select count(*)::int count from workspace_memberships m join roles r on r.id=m.role_id and r.workspace_id=m.workspace_id where m.workspace_id=$1 and m.status='active' and r.code='owner'`, [workspace.workspaceId])).rows[0].count).toBe(1);
    }
  });

  it("counts the Growth Owner as seat one and rejects the sixth active Membership", async () => {
    const workspace = await provision("growth");
    const owner = (await pool.query<{id:string;version:number}>(`select id,version from workspace_memberships where workspace_id=$1 and user_id=$2`, [workspace.workspaceId, workspace.user.id])).rows[0];
    const memberRole = (await pool.query<{id:string}>(`select id from roles where workspace_id=$1 and code='member'`, [workspace.workspaceId])).rows[0];
    const members: Array<{id:string;version:number}> = [];
    for (let index=0; index<5; index+=1) {
      const user = (await pool.query<{id:string}>(`insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at) values($1,$1,$2,'active',now()) returning id`, [`member-${index}-${crypto.randomUUID()}@catalog.test`, `Member ${index}`])).rows[0];
      members.push((await pool.query<{id:string;version:number}>(`insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,$4) returning id,version`, [workspace.workspaceId,user.id,memberRole.id,index<4?"active":"suspended"])).rows[0]);
    }
    const context:TenantContext={userId:workspace.user.id,sessionId:workspace.session.id,workspaceId:workspace.workspaceId,membershipId:owner.id,role:"owner",membershipVersion:owner.version,authenticatedAt:new Date(),authMethod:"password"};
    await expect(changeMembership(pool,{context,targetId:members[4].id,status:"active",expectedVersion:members[4].version,key:crypto.randomUUID()})).rejects.toMatchObject({code:"seat_limit_reached"});
    expect((await pool.query(`select count(*)::int count from workspace_memberships where workspace_id=$1 and status='active'`,[workspace.workspaceId])).rows[0].count).toBe(5);
    expect((await pool.query(`select status from workspace_memberships where id=$1`,[members[4].id])).rows[0].status).toBe("suspended");
  });

  it("rejects partial or invalid typed pricing tuples", async () => {
    await expect(pool.query(`insert into plan_catalog_entries(code,catalog_version,name,status,allowed_cadences,included_active_seats,currency_code,feature_flags,trial_days,effective_from) values('invalid-price','1','Invalid','draft','["monthly"]',1,'USD','{}',0,now())`)).rejects.toMatchObject({code:"23514"});
    await expect(pool.query(`insert into plan_catalog_entries(code,catalog_version,name,status,allowed_cadences,included_active_seats,currency_code,billing_unit,monthly_price_cents,annual_monthly_equivalent_price_cents,feature_flags,trial_days,effective_from) values('invalid-unit','1','Invalid','draft','["monthly"]',1,'usd','per_user',1,1,'{}',0,now())`)).rejects.toMatchObject({code:"23514"});
  });

  it("rejects a newer untyped active row without any provisioning side effect", async () => {
    const user=(await pool.query<{id:string}>(`insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at) values($1,$1,'Untyped Candidate','active',now()) returning id`,[`untyped-${crypto.randomUUID()}@catalog.test`])).rows[0];
    const session=(await pool.query<{id:string}>(`insert into sessions(user_id,session_hash,security_version,idle_expires_at,absolute_expires_at,authenticated_at,auth_method) values($1,$2,1,now()+interval '1 hour',now()+interval '1 day',now(),'password') returning id`,[user.id,crypto.randomUUID()])).rows[0];
    await pool.query(`insert into onboarding_progress(user_id,selected_plan_code,billing_cadence,current_step) values($1,'growth','monthly','workspace')`,[user.id]);
    const sessionToken=crypto.randomUUID();
    await pool.query(`update sessions set session_hash=$2 where id=$1`,[session.id,keyedHash(sessionToken,sessionSecret)]);
    await pool.query(`insert into plan_catalog_entries(code,catalog_version,name,status,allowed_cadences,included_active_seats,feature_flags,trial_days,effective_from) values('growth',$1,'Untyped Growth','active','["monthly","annual"]',5,'{}',14,now()-interval '1 second')`,[`test-commercial-untyped-${crypto.randomUUID()}`]);

    const before=await authorityState(user.id,session.id);
    await expect(resolveSelectedCommercialPlan(pool,"growth","monthly")).rejects.toThrow("commercial_catalog_unavailable");
    await expect(savePlanSelection(pool,user.id,"scale","annual")).rejects.toMatchObject({code:"invalid_plan"});
    const route=await savePlanRoute(mutationRequest("/api/onboarding/plan",{planCode:"scale",cadence:"annual"},sessionToken));
    expect(route.status).toBe(400);expect(route.headers.get("cache-control")).toBe("private, no-store");expect(await route.json()).toEqual({code:"invalid_plan"});
    const registrationEmail=`catalog-route-${crypto.randomUUID()}@example.test`;
    const registration=await registerRoute(mutationRequest("/api/auth/register",{email:registrationEmail,displayName:"Catalog Route",password:"Catalog-route-password-123!",planCode:"growth",cadence:"monthly"}));
    expect(registration.status).toBe(400);expect(registration.headers.get("cache-control")).toBe("private, no-store");expect(await registration.json()).toMatchObject({code:"invalid_request"});
    expect((await pool.query(`select count(*)::int count from users where primary_email_normalized=$1`,[registrationEmail])).rows[0].count).toBe(0);
    await expect(provisionWorkspace(pool,{userId:user.id,sessionId:session.id,name:"Must Not Exist",idempotencyKey:crypto.randomUUID()})).rejects.toMatchObject({code:"invalid_plan"});
    expect(await authorityState(user.id,session.id)).toEqual(before);
    expect((await pool.query(`select selected_plan_code,billing_cadence,current_step,workspace_id from onboarding_progress where user_id=$1`,[user.id])).rows[0]).toEqual({selected_plan_code:"growth",billing_cadence:"monthly",current_step:"workspace",workspace_id:null});
    expect((await pool.query(`select active_workspace_id from sessions where id=$1`,[session.id])).rows[0].active_workspace_id).toBeNull();
    for(const table of ["workspaces","workspace_memberships","workspace_entitlement_snapshots","pipeline_stages","audit_events","outbox_messages","idempotency_records"]){
      expect((await pool.query(`select count(*)::int count from ${table}`)).rows[0].count,table).toBe(0);
    }
  });

  it("rejects an in-place malformed accepted-version row for creation and provisioning without side effects", async () => {
    const user=(await pool.query<{id:string}>(`insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at) values($1,$1,'Malformed Candidate','active',now()) returning id`,[`malformed-${crypto.randomUUID()}@catalog.test`])).rows[0];
    const session=(await pool.query<{id:string}>(`insert into sessions(user_id,session_hash,security_version,idle_expires_at,absolute_expires_at,authenticated_at,auth_method) values($1,$2,1,now()+interval '1 hour',now()+interval '1 day',now(),'password') returning id`,[user.id,crypto.randomUUID()])).rows[0];
    await pool.query(`insert into onboarding_progress(user_id,selected_plan_code,billing_cadence,current_step) values($1,'growth','monthly','workspace')`,[user.id]);
    const sessionToken=crypto.randomUUID();
    await pool.query(`update sessions set session_hash=$2 where id=$1`,[session.id,keyedHash(sessionToken,sessionSecret)]);
    await pool.query(`update plan_catalog_entries set name='Malformed Growth' where code='growth' and catalog_version=$1`,[catalogVersion]);
    try {
      const before=await authorityState(user.id,session.id);
      await expect(resolveSelectedCommercialPlan(pool,"growth","monthly")).rejects.toThrow("commercial_catalog_unavailable");
      await expect(savePlanSelection(pool,user.id,"scale","annual")).rejects.toMatchObject({code:"invalid_plan"});
      const route=await savePlanRoute(mutationRequest("/api/onboarding/plan",{planCode:"scale",cadence:"annual"},sessionToken));
      expect(route.status).toBe(400);expect(route.headers.get("cache-control")).toBe("private, no-store");expect(await route.json()).toEqual({code:"invalid_plan"});
      const registrationEmail=`catalog-route-${crypto.randomUUID()}@example.test`;
      const registration=await registerRoute(mutationRequest("/api/auth/register",{email:registrationEmail,displayName:"Catalog Route",password:"Catalog-route-password-123!",planCode:"growth",cadence:"monthly"}));
      expect(registration.status).toBe(400);expect(registration.headers.get("cache-control")).toBe("private, no-store");expect(await registration.json()).toMatchObject({code:"invalid_request"});
      expect((await pool.query(`select count(*)::int count from users where primary_email_normalized=$1`,[registrationEmail])).rows[0].count).toBe(0);
      await expect(provisionWorkspace(pool,{userId:user.id,sessionId:session.id,name:"Must Not Exist",idempotencyKey:crypto.randomUUID()})).rejects.toMatchObject({code:"invalid_plan"});
      expect(await authorityState(user.id,session.id)).toEqual(before);
      expect((await pool.query(`select selected_plan_code,billing_cadence,current_step,workspace_id from onboarding_progress where user_id=$1`,[user.id])).rows[0]).toEqual({selected_plan_code:"growth",billing_cadence:"monthly",current_step:"workspace",workspace_id:null});
      expect((await pool.query(`select active_workspace_id from sessions where id=$1`,[session.id])).rows[0].active_workspace_id).toBeNull();
      for(const table of ["workspaces","workspace_memberships","workspace_entitlement_snapshots","pipeline_stages","audit_events","outbox_messages","idempotency_records"]){
        expect((await pool.query(`select count(*)::int count from ${table}`)).rows[0].count,table).toBe(0);
      }
    } finally {
      await pool.query(`update plan_catalog_entries set name='Growth' where code='growth' and catalog_version=$1`,[catalogVersion]);
    }
  });
});
