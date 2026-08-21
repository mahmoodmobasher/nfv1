import {afterAll,beforeAll,beforeEach,describe,expect,it} from "vitest";
import {Pool} from "pg";
import {createSession} from "../src/server/security/session";
import {changeMembership,transferOwner} from "../src/server/tenant-admin/administration";
import {createInvitation,revokeInvitation} from "../src/server/tenant-admin/invitations";
import {changeMembershipRole} from "../src/server/tenant-admin/role-authority";
import {switchWorkspace} from "../src/server/workspaces/selection";
import {POST as revokeRoute} from "../src/app/api/workspaces/[workspaceId]/invitations/[invitationId]/revoke/route";
import {getServerEnv} from "../src/server/env";
import type {TenantContext} from "../src/server/tenant-admin/permissions";

const suite=process.env.RUN_DB_INTEGRATION==="1"?describe:describe.skip;
const pool=new Pool({connectionString:process.env.DATABASE_URL||"postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow"});
const env=getServerEnv(),secret=env.SESSION_SECRET;

async function fixture(){
  const users=(await pool.query(`insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at) values
    ('audit-owner@test.local','audit-owner@test.local','Audit Owner','active',now()),
    ('audit-member@test.local','audit-member@test.local','Audit Member','active',now()) returning id`)).rows;
  const workspaces=[] as Array<{id:string;membershipId:string;roles:Record<string,string>}>;
  for(const index of ["a","b"]){
    const workspace=(await pool.query(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id) values($1,$2,'active','growth','monthly',$3) returning id`,[`Audit ${index}`,`audit-${index}-${crypto.randomUUID()}`,users[0].id])).rows[0];
    const roleRows=(await pool.query(`insert into roles(workspace_id,code,permissions,is_system,policy_version) values
      ($1,'owner','{}',true,'tenant-admin-v1'),($1,'admin','{}',true,'tenant-admin-v1'),($1,'member','{}',true,'tenant-admin-v1') returning id,code`,[workspace.id])).rows;
    const roles=Object.fromEntries(roleRows.map(row=>[row.code,row.id]));
    const membership=(await pool.query(`insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active') returning id`,[workspace.id,users[0].id,roles.owner])).rows[0];
    await pool.query(`insert into workspace_entitlement_snapshots(workspace_id,plan_code,catalog_version,effective_feature_flags,effective_limits) values($1,'growth','audit','{}','{"activeSeats":5}')`,[workspace.id]);
    workspaces.push({id:workspace.id,membershipId:membership.id,roles});
  }
  const member=(await pool.query(`insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active') returning id,version`,[workspaces[0].id,users[1].id,workspaces[0].roles.member])).rows[0];
  const session=await createSession(pool,{userId:users[0].id,securityVersion:1,secret,idleMinutes:30,absoluteHours:24});
  await pool.query("update sessions set active_workspace_id=$2,authenticated_at=now(),auth_method='password' where id=$1",[session.id,workspaces[0].id]);
  const context:TenantContext={userId:users[0].id,sessionId:session.id,workspaceId:workspaces[0].id,membershipId:workspaces[0].membershipId,role:"member",membershipVersion:99,authenticatedAt:new Date(),authMethod:"password"};
  return{users,workspaces,member,session,context};
}

async function audits(){return(await pool.query(`select occurred_at,workspace_id,actor_user_id,actor_membership_id,session_id,action,target_type,target_id,outcome,reason_code,request_id,correlation_id,before,after,metadata from audit_events order by occurred_at,id`)).rows}

suite("Feature 2 Work Item 5 audit completion",()=>{
  beforeAll(async()=>pool.query("select 1"));afterAll(async()=>pool.end());
  beforeEach(async()=>pool.query("truncate workspace_invitation_teams,team_memberships,teams,workspace_invitations,audit_events,outbox_messages,idempotency_records,workspace_entitlement_snapshots,workspace_memberships,roles,sessions,identity_credentials,identity_tokens,onboarding_progress,workspaces,users restart identity cascade"));

  it("records one canonical role success, one replay result, and one bounded stale denial",async()=>{
    const f=await fixture(),key=crypto.randomUUID();
    await changeMembershipRole(pool,{context:f.context,targetId:f.member.id,roleCode:"admin",expectedVersion:1,key});
    await changeMembershipRole(pool,{context:f.context,targetId:f.member.id,roleCode:"admin",expectedVersion:1,key});
    await expect(changeMembershipRole(pool,{context:f.context,targetId:f.member.id,roleCode:"member",expectedVersion:1,key:crypto.randomUUID()})).rejects.toMatchObject({code:"stale_version"});
    const rows=await audits(),success=rows.find(row=>row.outcome==="success"),denial=rows.find(row=>row.outcome==="denied");
    expect(rows).toHaveLength(2);
    expect(success).toMatchObject({workspace_id:f.workspaces[0].id,actor_user_id:f.users[0].id,actor_membership_id:f.context.membershipId,session_id:f.session.id,action:"workspace.membership_changed",target_id:f.member.id,outcome:"success",before:{version:1},after:{version:2,role:"admin"}});
    expect(success.correlation_id).toMatch(/^membership_role_change:[a-f0-9]{64}$/);
    expect(denial).toMatchObject({action:"workspace.membership_change_denied",reason_code:"stale_version",target_id:f.member.id});
  });

  it("couples membership lifecycle evidence and leaves no false success after rollback",async()=>{
    const f=await fixture(),changed=await changeMembership(pool,{context:f.context,targetId:f.member.id,status:"suspended",expectedVersion:1,key:crypto.randomUUID()});
    await expect(changeMembership(pool,{context:f.context,targetId:f.member.id,status:"removed",expectedVersion:1,key:crypto.randomUUID()})).rejects.toMatchObject({code:"stale_version"});
    expect(changed.version).toBe(2);
    const rows=await audits();
    expect(rows.filter(row=>row.outcome==="success")).toHaveLength(1);
    expect(rows.filter(row=>row.outcome==="denied")).toHaveLength(1);
    expect(rows[0]).toMatchObject({action:"workspace.membership_changed",target_id:f.member.id,before:{version:1},after:{version:2,role:"member"}});
  });

  it("keeps invitation, outbox, idempotency, audit, and denial evidence bounded",async()=>{
    const f=await fixture(),key=crypto.randomUUID(),created=await createInvitation(pool,{context:f.context,email:"new-person@test.local",roleCode:"member",teamIds:[],idempotencyKey:key,secret,appOrigin:env.APP_ORIGIN,ttlHours:168});
    await createInvitation(pool,{context:f.context,email:"new-person@test.local",roleCode:"member",teamIds:[],idempotencyKey:key,secret,appOrigin:env.APP_ORIGIN,ttlHours:168});
    await revokeInvitation(pool,{context:f.context,invitationId:created.id,expectedVersion:1,idempotencyKey:crypto.randomUUID()});
    await expect(revokeInvitation(pool,{context:f.context,invitationId:created.id,expectedVersion:1,idempotencyKey:crypto.randomUUID()})).rejects.toBeTruthy();
    const rows=await audits(),serialized=JSON.stringify(rows);
    expect(rows.map(row=>[row.action,row.outcome])).toEqual([["workspace.invitation_created","success"],["workspace.invitation_revoked","success"],["workspace.invitation_admin_denied","denied"]]);
    expect((await pool.query("select count(*)::int count from outbox_messages where aggregate_id=$1",[created.id])).rows[0].count).toBe(1);
    expect((await pool.query("select count(*)::int count from idempotency_records where operation='invite_create'")).rows[0].count).toBe(1);
    expect(serialized).not.toContain("new-person@test.local");
    expect(serialized).not.toContain(key);
  });

  it("records only the committed owner-transfer winner and a bounded loser",async()=>{
    const f=await fixture(),results=await Promise.allSettled([
      transferOwner(pool,{context:f.context,successorId:f.member.id,actorExpectedVersion:1,successorExpectedVersion:1,key:crypto.randomUUID(),recentMinutes:10}),
      transferOwner(pool,{context:f.context,successorId:f.member.id,actorExpectedVersion:1,successorExpectedVersion:1,key:crypto.randomUUID(),recentMinutes:10}),
    ]);
    expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);
    const rows=await audits();
    expect(rows.filter(row=>row.action==="workspace.ownership_transferred"&&row.outcome==="success")).toHaveLength(1);
    expect(rows.filter(row=>row.action==="workspace.ownership_transfer_denied"&&row.outcome==="denied")).toHaveLength(1);
    expect((await pool.query(`select count(*)::int count from workspace_memberships m join roles r on r.id=m.role_id and r.workspace_id=m.workspace_id where m.workspace_id=$1 and m.status='active' and r.code='owner'`,[f.workspaces[0].id])).rows[0].count).toBe(1);
  });

  it("records a hashed workspace transition and exactly one route-owned invitation denial",async()=>{
    const f=await fixture();
    const rejected=await revokeRoute(new Request(`${env.APP_ORIGIN}/api/workspaces/${f.workspaces[0].id}/invitations/${crypto.randomUUID()}/revoke`,{method:"POST",headers:{origin:"https://untrusted.invalid",cookie:`${env.SESSION_COOKIE_NAME}=${f.session.token}`}}),{params:Promise.resolve({workspaceId:f.workspaces[0].id,invitationId:crypto.randomUUID()})});
    expect(rejected.status).toBe(403);
    expect((await pool.query(`select count(*)::int count from audit_events where action='workspace.invitation_admin_denied' and actor_user_id=$1 and reason_code='permission_required'`,[f.users[0].id])).rows[0].count).toBe(1);
    const created=await createInvitation(pool,{context:{...f.context,sessionId:f.session.id},email:"route-denial@test.local",roleCode:"member",teamIds:[],idempotencyKey:crypto.randomUUID(),secret,appOrigin:env.APP_ORIGIN,ttlHours:168});
    const csrf="audit-csrf",request=new Request(`${env.APP_ORIGIN}/api/workspaces/${f.workspaces[0].id}/invitations/${created.id}/revoke`,{method:"POST",headers:{origin:env.APP_ORIGIN,cookie:`${env.SESSION_COOKIE_NAME}=${f.session.token}; nexaflow_csrf=${csrf}`,"x-csrf-token":csrf,"content-type":"application/json","idempotency-key":crypto.randomUUID()},body:JSON.stringify({expectedVersion:999})});
    const response=await revokeRoute(request,{params:Promise.resolve({workspaceId:f.workspaces[0].id,invitationId:created.id})});
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await pool.query(`select count(*)::int count from audit_events where action='workspace.invitation_admin_denied' and target_id=$1`,[created.id])).rows[0].count).toBe(1);

    const switchKey=crypto.randomUUID(),switched=await switchWorkspace(pool,{token:f.session.token,secret,workspaceId:f.workspaces[1].id,idempotencyKey:switchKey});
    const switchAudit=(await audits()).find(row=>row.action==="workspace.selection_changed");
    expect(switchAudit).toMatchObject({before:{workspaceId:f.workspaces[0].id},after:{workspaceId:f.workspaces[1].id},workspace_id:f.workspaces[1].id,target_id:f.workspaces[1].id});
    expect(switchAudit.correlation_id).not.toContain(switchKey);
    expect(switched.workspace.id).toBe(f.workspaces[1].id);
  });
});
