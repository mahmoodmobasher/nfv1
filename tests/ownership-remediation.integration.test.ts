import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { changeOwnerMembership, transferOwnership, type OwnerActor } from "../src/server/workspaces/ownership";

const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function fixture() {
  const users = (await pool.query(`insert into users(primary_email_normalized,display_name,status,email_verified_at) values
    ('owner-a@test','Owner A','active',now()),('owner-b@test','Owner B','active',now()),('member@test','Member','active',now()),('other-owner@test','Other','active',now()) returning id`)).rows;
  const workspaceA = (await pool.query(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id) values('A','owner-a','active','growth','monthly',$1) returning id`, [users[0].id])).rows[0];
  const workspaceB = (await pool.query(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id) values('B','owner-b','active','growth','monthly',$1) returning id`, [users[3].id])).rows[0];
  async function roles(workspaceId: string) { const rows=(await pool.query(`insert into roles(workspace_id,code,permissions,is_system) values($1,'owner','{}',true),($1,'member','{}',true) returning id,code`,[workspaceId])).rows;return {owner:rows.find(r=>r.code==="owner").id,member:rows.find(r=>r.code==="member").id}; }
  const ra=await roles(workspaceA.id),rb=await roles(workspaceB.id);
  const memberships=(await pool.query(`insert into workspace_memberships(workspace_id,user_id,role_id,status) values
    ($1,$3,$6,'active'),($1,$4,$6,'active'),($1,$5,$7,'active'),($2,$8,$9,'active') returning id,user_id,workspace_id`,[workspaceA.id,workspaceB.id,users[0].id,users[1].id,users[2].id,ra.owner,ra.member,users[3].id,rb.owner])).rows;
  const membership=(userId:string)=>memberships.find(row=>row.user_id===userId);
  const actor=(index:number,overrides:Partial<OwnerActor>={}):OwnerActor=>({userId:users[index].id,membershipId:membership(users[index].id).id,workspaceId:workspaceA.id,role:"forged-untrusted",...overrides});
  return {users,workspaceA,workspaceB,ra,rb,memberships,membership,actor};
}
async function ownerCount(workspaceId:string){return (await pool.query(`select count(*)::int count from workspace_memberships m join roles r on r.id=m.role_id and r.workspace_id=m.workspace_id where m.workspace_id=$1 and m.status='active' and r.code='owner'`,[workspaceId])).rows[0].count as number;}
async function unchanged(f:Fixture){expect(await ownerCount(f.workspaceA.id)).toBeGreaterThanOrEqual(1);expect(await ownerCount(f.workspaceB.id)).toBe(1);}

suite("bounded Owner transfer and denial audit correction",()=>{
  beforeAll(async()=>pool.query("select 1"));
  afterAll(async()=>pool.end());
  beforeEach(async()=>pool.query("truncate audit_events,outbox_messages,idempotency_records,workspace_entitlement_snapshots,workspace_memberships,roles,onboarding_progress,oidc_transactions,identity_tokens,sessions,identity_credentials,workspaces,users restart identity cascade"));

  it("rejects forged role, stale actor, cross-workspace actor, and mismatched actor User with safe denial audits",async()=>{
    const f=await fixture(),member=f.actor(2,{role:"owner"});
    await expect(transferOwnership(pool,member,f.membership(f.users[1].id).id)).rejects.toThrow("owner_permission_required");
    await pool.query("update workspace_memberships set status='removed' where id=$1",[f.membership(f.users[0].id).id]);
    await expect(transferOwnership(pool,f.actor(0),f.membership(f.users[2].id).id)).rejects.toThrow("owner_permission_required");
    const other=f.actor(3,{workspaceId:f.workspaceA.id,role:"owner"});
    await expect(transferOwnership(pool,other,f.membership(f.users[2].id).id)).rejects.toThrow("owner_permission_required");
    await expect(changeOwnerMembership(pool,f.actor(1,{userId:f.users[2].id}),f.membership(f.users[0].id).id,"removed")).rejects.toThrow("owner_permission_required");
    expect((await pool.query("select count(*)::int count from audit_events where outcome='denied' and action in ('workspace.ownership_transfer_denied','workspace.owner_change_denied')")).rows[0].count).toBe(4);
    await unchanged(f);
  });

  it("rejects cross-tenant successor and self-transfer without cross-tenant mutation",async()=>{
    const f=await fixture(),actor=f.actor(0),cross=f.membership(f.users[3].id).id;
    await expect(transferOwnership(pool,actor,cross)).rejects.toThrow("invalid_successor");
    await expect(transferOwnership(pool,actor,actor.membershipId)).rejects.toThrow("self_transfer");
    expect((await pool.query("select count(*)::int count from audit_events where action='workspace.ownership_transfer_denied'")).rows[0].count).toBe(2);
    await unchanged(f);
  });

  it("rolls back successor promotion when the scoped actor removal changes zero rows",async()=>{
    const f=await fixture(),actor=f.actor(0),successor=f.membership(f.users[2].id);
    await pool.query(`create function test_skip_owner_removal() returns trigger language plpgsql as $$ begin if old.id='${actor.membershipId}'::uuid and new.status='removed' then return null; end if; return new; end $$`);
    await pool.query("create trigger test_skip_owner_removal before update on workspace_memberships for each row execute function test_skip_owner_removal()");
    try { await expect(transferOwnership(pool,actor,successor.id)).rejects.toThrow("actor_row_count_mismatch"); }
    finally { await pool.query("drop trigger test_skip_owner_removal on workspace_memberships");await pool.query("drop function test_skip_owner_removal()") }
    expect((await pool.query("select role_id,status from workspace_memberships where id=$1",[successor.id])).rows[0]).toMatchObject({role_id:f.ra.member,status:"active"});
    expect((await pool.query("select count(*)::int count from audit_events where action='workspace.ownership_transfer_denied' and reason_code='actor_row_count_mismatch'")).rows[0].count).toBe(1);
    await unchanged(f);
  });

  it("writes scoped success audits for Owner change and valid transfer",async()=>{
    const f=await fixture();
    await changeOwnerMembership(pool,f.actor(0),f.membership(f.users[1].id).id,"removed");
    const replacement=f.membership(f.users[2].id);
    await transferOwnership(pool,f.actor(0),replacement.id);
    const audits=(await pool.query("select action,outcome,workspace_id,actor_user_id,actor_membership_id,target_id from audit_events where action in ('workspace.owner_membership_changed','workspace.ownership_transferred') order by occurred_at")).rows;
    expect(audits).toHaveLength(2);expect(audits.every(row=>row.outcome==='success'&&row.workspace_id===f.workspaceA.id&&row.actor_user_id===f.users[0].id)).toBe(true);
    const transferAudit=audits.find(row=>row.action==='workspace.ownership_transferred');
    expect(transferAudit).toMatchObject({actor_membership_id:f.membership(f.users[0].id).id,target_id:replacement.id});
    expect(await ownerCount(f.workspaceA.id)).toBe(1);
  });

  it("serializes concurrent transfer and removal and always preserves an active Owner",async()=>{
    const f=await fixture(),a=f.actor(0),b=f.actor(1),successor=f.membership(f.users[2].id).id;
    const settled=await Promise.allSettled([transferOwnership(pool,a,successor),changeOwnerMembership(pool,b,a.membershipId,"removed")]);
    expect(settled.some(result=>result.status==='fulfilled')).toBe(true);
    expect(await ownerCount(f.workspaceA.id)).toBeGreaterThanOrEqual(1);
    expect(await ownerCount(f.workspaceB.id)).toBe(1);
    expect((await pool.query("select status from workspace_memberships where id=$1",[f.membership(f.users[3].id).id])).rows[0].status).toBe("active");
  });
});
