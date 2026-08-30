import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import {Pool} from "pg";
import {getServerEnv} from "../src/server/env";
import {createSession} from "../src/server/security/session";
import type {TenantContext} from "../src/server/tenant-admin/permissions";
import {GET as invitationsGet,POST as invitationsPost} from "../src/app/api/workspaces/[workspaceId]/invitations/route";
import {POST as invitationResend} from "../src/app/api/workspaces/[workspaceId]/invitations/[invitationId]/resend/route";
import {POST as invitationRevoke} from "../src/app/api/workspaces/[workspaceId]/invitations/[invitationId]/revoke/route";
import {PUT as membershipTeams} from "../src/app/api/workspaces/[workspaceId]/memberships/[membershipId]/teams/route";
import {POST as ownershipTransfer} from "../src/app/api/workspaces/[workspaceId]/ownership/transfer/route";
import {PATCH as rolePolicy} from "../src/app/api/workspaces/[workspaceId]/roles/[roleId]/policy/route";
import {GET as settingsGet} from "../src/app/api/workspaces/[workspaceId]/settings/route";
import {PATCH as teamPatch} from "../src/app/api/workspaces/[workspaceId]/teams/[teamId]/route";
import {GET as teamsGet} from "../src/app/api/workspaces/[workspaceId]/teams/route";

const suite=process.env.RUN_DB_INTEGRATION==="1"?describe:describe.skip;
const connectionString=process.env.DATABASE_URL||"postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow";
const database=new Pool({connectionString});
const env=getServerEnv();
const uuid=()=>crypto.randomUUID();
const csrf="gap-013-csrf";
const params=<T extends Record<string,string>>(value:T)=>({params:Promise.resolve(value)});
const trustedHeaders=(extra:Record<string,string>={})=>({origin:env.APP_ORIGIN,cookie:`nexaflow_csrf=${csrf}`,'x-csrf-token':csrf,'content-type':'application/json','idempotency-key':uuid(),...extra});
const request=(path:string,method="GET",body?:unknown,headers:Record<string,string>={})=>new Request(`${env.APP_ORIGIN}${path}`,{method,headers:method==="GET"?headers:trustedHeaders(headers),...(body===undefined?{}:{body:JSON.stringify(body)})});

type RouteCase={name:string;action:string;invoke:(workspaceId:string)=>Promise<Response>};
const affected:RouteCase[]=[
  {name:"invitations GET",action:"workspace.invitation_admin_denied",invoke:id=>invitationsGet(request(`/api/workspaces/${id}/invitations`),params({workspaceId:id}))},
  {name:"invitations POST",action:"workspace.invitation_admin_denied",invoke:id=>invitationsPost(request(`/api/workspaces/${id}/invitations`,"POST",{email:"nobody@example.test",roleCode:"member",teamIds:[]}),params({workspaceId:id}))},
  {name:"invitation resend",action:"workspace.invitation_admin_denied",invoke:id=>{const invitationId=uuid();return invitationResend(request(`/api/workspaces/${id}/invitations/${invitationId}/resend`,"POST",{expectedVersion:1}),params({workspaceId:id,invitationId}))}},
  {name:"invitation revoke",action:"workspace.invitation_admin_denied",invoke:id=>{const invitationId=uuid();return invitationRevoke(request(`/api/workspaces/${id}/invitations/${invitationId}/revoke`,"POST",{expectedVersion:1}),params({workspaceId:id,invitationId}))}},
  {name:"membership Team assignment",action:"workspace.membership_change_denied",invoke:id=>{const membershipId=uuid();return membershipTeams(request(`/api/workspaces/${id}/memberships/${membershipId}/teams`,"PUT",{teamIds:[],expectedMembershipVersion:1}),params({workspaceId:id,membershipId}))}},
  {name:"ownership transfer",action:"workspace.ownership_transfer_denied",invoke:id=>ownershipTransfer(request(`/api/workspaces/${id}/ownership/transfer`,"POST",{successorMembershipId:uuid(),actorExpectedVersion:1,successorExpectedVersion:1}),params({workspaceId:id}))},
  {name:"Role-policy update",action:"workspace.role_policy_change_denied",invoke:id=>{const roleId=uuid();return rolePolicy(request(`/api/workspaces/${id}/roles/${roleId}/policy`,"PATCH",{policyVersion:"tenant-admin-v1",expectedVersion:1}),params({workspaceId:id,roleId}))}},
  {name:"Workspace settings GET",action:"workspace.settings_change_denied",invoke:id=>settingsGet(request(`/api/workspaces/${id}/settings`),params({workspaceId:id}))},
  {name:"Team update",action:"workspace.team_change_denied",invoke:id=>{const teamId=uuid();return teamPatch(request(`/api/workspaces/${id}/teams/${teamId}`,"PATCH",{name:"Bounded",expectedVersion:1}),params({workspaceId:id,teamId}))}},
  {name:"Teams GET",action:"workspace.team_change_denied",invoke:id=>teamsGet(request(`/api/workspaces/${id}/teams`),params({workspaceId:id}))},
];

async function truncate(){
  await database.query("truncate workspace_invitation_teams,team_memberships,teams,workspace_invitations,audit_events,outbox_messages,idempotency_records,rate_limit_windows,workspace_entitlement_snapshots,workspace_memberships,roles,sessions,identity_credentials,identity_tokens,onboarding_progress,workspaces,users restart identity cascade");
}

async function actor(role:"owner"|"admin"|"member"="owner"){
  const user=(await database.query(`insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at) values($1,$1,'GAP 013 actor','active',now()) returning id`,[`${role}-${uuid()}@gap013.test`])).rows[0];
  const workspaces=[] as Array<{id:string;roles:Record<string,string>;membershipId:string}>;
  for(const suffix of ["a","b"]){
    const workspace=(await database.query(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id) values($1,$2,'active','growth','monthly',$3) returning id`,[`GAP 013 ${suffix}`,`gap-013-${suffix}-${uuid()}`,user.id])).rows[0];
    const rows=(await database.query(`insert into roles(workspace_id,code,permissions,is_system,policy_version) values($1,'owner','{}',true,'tenant-admin-v1'),($1,'admin','{}',true,'tenant-admin-v1'),($1,'member','{}',true,'tenant-admin-v1') returning id,code`,[workspace.id])).rows;
    const roles=Object.fromEntries(rows.map(row=>[row.code,row.id]));
    const membership=(await database.query(`insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active') returning id`,[workspace.id,user.id,roles[role]])).rows[0];
    await database.query(`insert into workspace_entitlement_snapshots(workspace_id,plan_code,catalog_version,effective_feature_flags,effective_limits) values($1,'growth','gap-013','{}','{"activeSeats":5}')`,[workspace.id]);
    workspaces.push({id:workspace.id,roles,membershipId:membership.id});
  }
  const session=await createSession(database,{userId:user.id,securityVersion:1,secret:env.SESSION_SECRET,idleMinutes:30,absoluteHours:24});
  await database.query("update sessions set active_workspace_id=$2,authenticated_at=now(),auth_method='password' where id=$1",[session.id,workspaces[0].id]);
  const context:TenantContext={userId:user.id,sessionId:session.id,workspaceId:workspaces[0].id,membershipId:workspaces[0].membershipId,role,membershipVersion:1,authenticatedAt:new Date(),authMethod:"password"};
  return{user,workspaces,session,context,headers:{cookie:`${env.SESSION_COOKIE_NAME}=${session.token}; nexaflow_csrf=${csrf}`}};
}

async function bounded(response:Response,status:number,code:string){
  expect(response.status).toBe(status);
  const body=await response.json();
  expect(body).toMatchObject({error:{code},requestId:expect.stringMatching(/^[0-9a-f-]{36}$/)});
  expect(JSON.stringify(body)).not.toMatch(/pool|postgres|sql|stack|workspaceId|targetId/i);
  return body.requestId as string;
}

suite("UAT-GAP-013 route-owned pool lifecycle",()=>{
  beforeAll(async()=>database.query("select 1"));
  afterAll(async()=>database.end());
  beforeEach(truncate);

  it.each(affected)("returns bounded no-Session denial and completes exactly one system Audit: $name",async({action,invoke})=>{
    const workspaceId=uuid(),response=await invoke(workspaceId),requestId=await bounded(response,401,"authentication_required");
    const audits=(await database.query(`select workspace_id,actor_user_id,actor_membership_id,session_id,action,target_id,outcome,reason_code,request_id,metadata from audit_events`)).rows;
    expect(audits).toEqual([{workspace_id:null,actor_user_id:null,actor_membership_id:null,session_id:null,action,target_id:null,outcome:"denied",reason_code:"authentication_required",request_id:requestId,metadata:{operation:"tenant_admin_denial"}}]);
    for(const table of ["workspaces","workspace_memberships","workspace_invitations","teams","team_memberships","outbox_messages","idempotency_records","rate_limit_windows"]){
      expect((await database.query(`select count(*)::int count from ${table}`)).rows[0].count,table).toBe(0);
    }
  });

  it("preserves tenant-safe wrong-Workspace and insufficient-permission attribution",async()=>{
    const owner=await actor("owner");
    const wrong=await settingsGet(request(`/api/workspaces/${owner.workspaces[1].id}/settings`,"GET",undefined,owner.headers),params({workspaceId:owner.workspaces[1].id}));
    await bounded(wrong,404,"resource_not_found");
    expect((await database.query(`select workspace_id,target_id,actor_user_id,action,reason_code from audit_events`)).rows).toEqual([{workspace_id:null,target_id:null,actor_user_id:owner.user.id,action:"workspace.settings_change_denied",reason_code:"invalid_target"}]);

    await truncate();
    const member=await actor("member");
    const denied=await settingsGet(request(`/api/workspaces/${member.workspaces[0].id}/settings`,"GET",undefined,member.headers),params({workspaceId:member.workspaces[0].id}));
    await bounded(denied,404,"resource_not_found");
    const audit=(await database.query(`select workspace_id,target_id,actor_user_id,actor_membership_id,action,reason_code from audit_events`)).rows[0];
    expect(audit).toMatchObject({workspace_id:null,target_id:null,actor_user_id:member.user.id,actor_membership_id:null,action:"workspace.settings_change_denied",reason_code:"invalid_target"});
  });

  it("keeps a service-owned invitation denial singular",async()=>{
    const f=await actor("admin");
    const response=await invitationsPost(request(`/api/workspaces/${f.workspaces[0].id}/invitations`,"POST",{email:"forbidden-admin@gap013.test",roleCode:"admin",teamIds:[]},{...f.headers}),params({workspaceId:f.workspaces[0].id}));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await database.query(`select count(*)::int count from audit_events where action='workspace.invitation_admin_denied' and outcome='denied'`)).rows[0].count).toBe(1);
    expect((await database.query("select count(*)::int count from workspace_invitations")).rows[0].count).toBe(0);
    expect((await database.query("select count(*)::int count from outbox_messages")).rows[0].count).toBe(0);
  });

  it("rolls back an injected late Audit failure and preserves the original denial without an unhandled rejection",async()=>{
    await database.query(`create function gap013_fail_audit() returns trigger language plpgsql as $$ begin perform pg_sleep(0.05); raise exception 'gap013 injected audit failure'; end $$`);
    await database.query(`create trigger gap013_fail_audit before insert on audit_events for each row execute function gap013_fail_audit()`);
    const unhandled:unknown[]=[];const listener=(reason:unknown)=>unhandled.push(reason);process.on("unhandledRejection",listener);
    const original=Pool.prototype.end;let endCount=0;
    const spy=vi.spyOn(Pool.prototype,"end").mockImplementation(async function(this:Pool){endCount++;return (original as unknown as (this:Pool)=>Promise<void>).call(this)});
    try{
      const response=await settingsGet(request(`/api/workspaces/${uuid()}/settings`),params({workspaceId:uuid()}));
      await bounded(response,401,"authentication_required");
      await new Promise(resolve=>setImmediate(resolve));
      expect(unhandled).toEqual([]);
      expect(endCount).toBe(1);
      expect((await database.query("select count(*)::int count from audit_events")).rows[0].count).toBe(0);
    }finally{
      spy.mockRestore();
      process.off("unhandledRejection",listener);
      await database.query("drop trigger if exists gap013_fail_audit on audit_events");
      await database.query("drop function if exists gap013_fail_audit()");
    }
    expect((await database.query("select 1 as healthy")).rows[0].healthy).toBe(1);
  });

  it("waits for delayed Audit completion before closing the route-owned pool",async()=>{
    await database.query(`create function gap013_delay_audit() returns trigger language plpgsql as $$ begin perform pg_sleep(0.08); return new; end $$`);
    await database.query(`create trigger gap013_delay_audit before insert on audit_events for each row execute function gap013_delay_audit()`);
    const original=Pool.prototype.end,endTimes:number[]=[];
    const spy=vi.spyOn(Pool.prototype,"end").mockImplementation(async function(this:Pool){endTimes.push(performance.now());return (original as unknown as (this:Pool)=>Promise<void>).call(this)});
    const started=performance.now();
    try{
      const workspaceId=uuid();
      await bounded(await settingsGet(request(`/api/workspaces/${workspaceId}/settings`),params({workspaceId})),401,"authentication_required");
      expect(endTimes).toHaveLength(1);
      expect(endTimes[0]-started).toBeGreaterThanOrEqual(65);
      expect((await database.query("select count(*)::int count from audit_events")).rows[0].count).toBe(1);
    }finally{
      spy.mockRestore();
      await database.query("drop trigger if exists gap013_delay_audit on audit_events");
      await database.query("drop function if exists gap013_delay_audit()");
    }
  });

  // Fires 12 concurrent requests and waits on real Postgres round trips for each; under
  // full-suite load (RUN_DB_INTEGRATION=1 npx vitest run --no-file-parallelism) this
  // legitimately took 5.21s against vitest's 5000ms default, timing out once across
  // several full runs while passing in ~300-430ms every time it ran alone. Confirmed not
  // a regression: reproduced the intermittent full-suite timeout at both 81a088b and its
  // parent d864abf, so it predates and is independent of any change on this branch. A
  // bound that fires intermittently trains everyone to treat red as normal -- the mistake
  // that let five earlier blockers reach UAT under a green suite -- so raise it instead of
  // re-running until it happens to pass.
  it("isolates simultaneous affected-route denials without pool-ended, duplicate, or cross-request failure",async()=>{
    const unhandled:unknown[]=[];const listener=(reason:unknown)=>unhandled.push(reason);process.on("unhandledRejection",listener);
    const original=Pool.prototype.end;let endCount=0;
    const spy=vi.spyOn(Pool.prototype,"end").mockImplementation(async function(this:Pool){endCount++;return (original as unknown as (this:Pool)=>Promise<void>).call(this)});
    try{
      const results=await Promise.all(Array.from({length:12},(_,index)=>affected[index%affected.length].invoke(uuid())));
      const ids=[] as string[];
      for(const response of results)ids.push(await bounded(response,401,"authentication_required"));
      const rows=(await database.query(`select request_id,action from audit_events order by request_id`)).rows;
      expect(rows).toHaveLength(results.length);
      expect(new Set(rows.map(row=>row.request_id)).size).toBe(results.length);
      expect(new Set(ids).size).toBe(results.length);
      expect(endCount).toBe(results.length);
      await new Promise(resolve=>setImmediate(resolve));
      expect(unhandled).toEqual([]);
    }finally{spy.mockRestore();process.off("unhandledRejection",listener)}
    expect((await database.query("select 1 as healthy")).rows[0].healthy).toBe(1);
  },15000);
});
