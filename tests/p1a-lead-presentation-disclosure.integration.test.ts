import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { getLeadDetailV1, listLeadSummariesV1 } from "../src/backend/modules/leads";
import type { TrustedActor } from "../src/backend/platform/authorization";

const suite=process.env.RUN_DB_INTEGRATION==="1"?describe:describe.skip;
const pool=new Pool({connectionString:process.env.DATABASE_URL??"postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow"});

async function fixture(){const users=(await pool.query<{id:string}>(`insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)
    values($1,$1,'Owner','active',now()),($2,$2,'Sparse Member','active',now()) returning id`,
    [`owner-${randomUUID()}@test.local`,`member-${randomUUID()}@test.local`])).rows;
  const workspace=(await pool.query<{id:string}>(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
    values('Lead presentation',$1,'active','growth','monthly',$2) returning id`,[`presentation-${randomUUID()}`,users[0].id])).rows[0];
  const roles=(await pool.query<{id:string;code:string}>(`insert into roles(workspace_id,code,permissions,is_system)
    values($1,'owner','{}',true),($1,'member','{}',true) returning id,code`,[workspace.id])).rows;
  const role=Object.fromEntries(roles.map(row=>[row.code,row.id]));
  const memberships=(await pool.query<{id:string;user_id:string}>(`insert into workspace_memberships(workspace_id,user_id,role_id,status)
    values($1,$2,$4,'active'),($1,$3,$5,'active') returning id,user_id`,[workspace.id,users[0].id,users[1].id,role.owner,role.member])).rows;
  const sessions=[] as Array<{id:string;user_id:string}>;for(const user of users)sessions.push((await pool.query<{id:string;user_id:string}>(
    `insert into sessions(user_id,session_hash,idle_expires_at,absolute_expires_at,auth_method)
     values($1,$2,now()+interval '1 hour',now()+interval '1 day','password') returning id,user_id`,[user.id,randomUUID()])).rows[0]);
  const stage=(await pool.query<{id:string}>(`insert into pipeline_stages(workspace_id,name,position,status)
    values($1,'New',0,'active') returning id`,[workspace.id])).rows[0];
  const team=(await pool.query<{id:string}>(`insert into teams(workspace_id,name,name_normalized,status,created_by_membership_id)
    values($1,'Sparse Team','sparse team','active',$2) returning id`,[workspace.id,memberships[0].id])).rows[0];
  await pool.query(`insert into team_memberships(workspace_id,team_id,workspace_membership_id,created_by_membership_id)
    values($1,$2,$3,$4)`,[workspace.id,team.id,memberships[1].id,memberships[0].id]);
  const actor=(index:number,role:"owner"|"member"):TrustedActor=>({userId:users[index].id,sessionId:sessions[index].id,
    workspaceId:workspace.id,membershipId:memberships[index].id,role});
  return{workspace,stage,team,owner:actor(0,"owner"),member:actor(1,"member")}}

async function leads(f:Awaited<ReturnType<typeof fixture>>,count:number,visibility:"workspace"|"teams"="teams"){
  return(await pool.query<{id:string}>(`insert into leads(workspace_id,display_name,person_name_normalized,email_display,email_normalized,
      source,original_source_category,original_source_medium,original_source_detail,original_campaign_context,
      attribution_contract_version,intake_channel,lifecycle_definition_id,stage_id,status,visibility,updated_at)
    select $1,'Presentation Lead '||g,'presentation lead '||g,'presentation-'||g||'-'||$3||'@example.test',
      'presentation-'||g||'-'||$3||'@example.test','manual','manual','unknown','{}','{}','p1a-attribution-v1','manual',
      '00000000-0000-4000-8000-000000000001',$2,'open',$4,now()-(g||' seconds')::interval
    from generate_series(1,$5) g returning id`,[f.workspace.id,f.stage.id,randomUUID(),visibility,count])).rows}

function mutateBeforeRevalidation(base:Pool,mutation:()=>Promise<void>):Pool{let connections=0;return new Proxy(base,{get(target,key,receiver){
  if(key!=="connect")return Reflect.get(target,key,receiver);return async()=>{connections++;if(connections===2)await mutation();return target.connect()};
}}) as Pool}

const protectedTables=["leads","lead_intakes","lead_activities","lead_identity_reviews","lead_identity_candidates",
  "lead_identity_decisions","lead_identity_decision_heads","contacts","companies","audit_events","outbox_messages"] as const;
async function protectedStateDigest(){return Object.fromEntries(await Promise.all(protectedTables.map(async table=>[table,(await pool.query(
  `select count(*)::int count,md5(coalesce(jsonb_agg(to_jsonb(snapshot) order by to_jsonb(snapshot)::text)::text,'[]')) digest
     from ${table} snapshot`)).rows[0]])))}

suite("P1A canonical Lead presentation disclosure",()=>{beforeAll(async()=>{await pool.query("select 1")});
  beforeEach(async()=>{await pool.query("truncate users cascade")});afterAll(async()=>{await pool.end()});

  it("scans beyond 201 invisible rows and returns the later team-visible row without a false terminal cursor",async()=>{const f=await fixture();
    await leads(f,225);const visible=(await leads(f,1)).at(0)!;await pool.query(
      `insert into lead_visible_teams(workspace_id,lead_id,team_id) values($1,$2,$3)`,[f.workspace.id,visible.id,f.team.id]);
    await pool.query("update leads set updated_at=now()-interval '1000 seconds' where id=$1",[visible.id]);
    const page=await listLeadSummariesV1(pool,f.member,{q:"",limit:1});expect(page.items.map(row=>row.leadId)).toEqual([visible.id]);
    expect(page.nextCursor).toBeNull();
  });

  it("paginates identical-microsecond rows across multiple bounded pages without duplicate or skip",async()=>{const f=await fixture();await leads(f,7,"workspace");
    await pool.query("update leads set updated_at='2026-08-25 12:34:56.123456+00' where workspace_id=$1",[f.workspace.id]);
    let cursor:string|undefined;const ids:string[]=[];do{const page=await listLeadSummariesV1(pool,f.member,{q:"",limit:2,...(cursor?{cursor}:{})});
      ids.push(...page.items.map(row=>row.leadId));cursor=page.nextCursor??undefined}while(cursor);
    expect(ids).toHaveLength(7);expect(new Set(ids).size).toBe(7);
  });

  it("keeps filtered keyset pages deterministic when a returned Lead moves concurrently",async()=>{const f=await fixture(),created=await leads(f,7,"workspace");
    const secondStage=(await pool.query<{id:string}>(`insert into pipeline_stages(workspace_id,name,position,status)
      values($1,'Qualified',1,'active') returning id`,[f.workspace.id])).rows[0];
    await pool.query("update leads set stage_id=$1 where id=any($2::uuid[])",[secondStage.id,created.slice(0,5).map(row=>row.id)]);
    const first=await listLeadSummariesV1(pool,f.member,{q:"presentation lead",stageId:secondStage.id,limit:2});
    expect(first.nextCursor).not.toBeNull();await pool.query("update leads set updated_at=now()+interval '1 hour',version=version+1 where id=$1",
      [first.items[0].leadId]);
    const ids=[...first.items.map(row=>row.leadId)];let cursor=first.nextCursor!;while(cursor){const page=await listLeadSummariesV1(pool,f.member,
      {q:"presentation lead",stageId:secondStage.id,limit:2,cursor});ids.push(...page.items.map(row=>row.leadId));cursor=page.nextCursor??""}
    expect(new Set(ids).size).toBe(ids.length);expect(ids).toHaveLength(5);
  });

  it("fails closed when team visibility is removed after the presentation snapshot",async()=>{const f=await fixture(),lead=(await leads(f,1)).at(0)!;
    await pool.query(`insert into lead_visible_teams(workspace_id,lead_id,team_id) values($1,$2,$3)`,[f.workspace.id,lead.id,f.team.id]);
    const controlled=mutateBeforeRevalidation(pool,async()=>{await pool.query(
      `delete from team_memberships where workspace_id=$1 and team_id=$2 and workspace_membership_id=$3`,
      [f.workspace.id,f.team.id,f.member.membershipId])});
    await expect(getLeadDetailV1(controlled,f.member,lead.id)).rejects.toMatchObject({code:"resource_not_found"});
  });

  it("fails list disclosure closed when team visibility is removed after its presentation snapshot",async()=>{const f=await fixture(),lead=(await leads(f,1)).at(0)!;
    await pool.query(`insert into lead_visible_teams(workspace_id,lead_id,team_id) values($1,$2,$3)`,[f.workspace.id,lead.id,f.team.id]);
    const controlled=mutateBeforeRevalidation(pool,async()=>{await pool.query(
      `delete from team_memberships where workspace_id=$1 and team_id=$2 and workspace_membership_id=$3`,
      [f.workspace.id,f.team.id,f.member.membershipId])});
    await expect(listLeadSummariesV1(controlled,f.member,{q:"",limit:50})).rejects.toMatchObject({code:"resource_not_found"});
  });

  it("derives review capability from the freshly revalidated role",async()=>{const f=await fixture(),lead=(await leads(f,1,"workspace")).at(0)!;
    await pool.query("update leads set identity_review_status='pending' where id=$1",[lead.id]);
    const controlled=mutateBeforeRevalidation(pool,async()=>{await pool.query(`update workspace_memberships set role_id=(
      select id from roles where workspace_id=$1 and code='owner') where id=$2`,[f.workspace.id,f.member.membershipId])});
    const page=await listLeadSummariesV1(controlled,f.member,{q:"",limit:50});
    expect(page.items[0].capabilities).toEqual({canView:true,canEdit:false,canEditLead:true,canMoveStage:true,canReview:true});
    expect(page.items[0].nextView.kind).toBe("identity_review_detail");
  });

  it("removes stale assignment and Company labels at the final presentation boundary",async()=>{const f=await fixture(),lead=(await leads(f,1,"workspace")).at(0)!;
    const company=(await pool.query<{id:string}>(`insert into companies(workspace_id,display_name,name_normalized)
      values($1,'Current Company','current company') returning id`,[f.workspace.id])).rows[0];
    await pool.query("update leads set owner_membership_id=$1,company_id=$2 where id=$3",[f.owner.membershipId,company.id,lead.id]);
    const controlled=mutateBeforeRevalidation(pool,async()=>{await pool.query("update companies set status='archived' where id=$1",[company.id]);
      await pool.query("update workspace_memberships set status='suspended' where id=$1",[f.owner.membershipId])});
    const detail=await getLeadDetailV1(controlled,f.member,lead.id);
    expect(detail.lead.assignment).toMatchObject({responsibleMembershipId:f.owner.membershipId,responsibleMembershipLabel:null});
    expect(detail.lead.company).toEqual({companyId:company.id,displayName:null});
  });

  it("fails closed on concurrent Lead version drift and leaves every protected table unchanged on stable GETs",async()=>{const f=await fixture(),lead=(await leads(f,1,"workspace")).at(0)!;
    const controlled=mutateBeforeRevalidation(pool,async()=>{await pool.query("update leads set version=version+1 where id=$1",[lead.id])});
    await expect(getLeadDetailV1(controlled,f.member,lead.id)).rejects.toMatchObject({code:"resource_not_found"});
    const before=await protectedStateDigest();
    await getLeadDetailV1(pool,f.member,lead.id);await listLeadSummariesV1(pool,f.member,{q:"",limit:2});
    await expect(getLeadDetailV1(pool,{...f.member,workspaceId:randomUUID()},lead.id)).rejects.toMatchObject({code:"resource_not_found"});
    await expect(listLeadSummariesV1(pool,{...f.member,workspaceId:randomUUID()},{q:"",limit:2})).rejects.toMatchObject({code:"resource_not_found"});
    expect(await protectedStateDigest()).toEqual(before);
  });
});
