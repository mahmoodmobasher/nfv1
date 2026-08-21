import type { Pool, PoolClient } from "pg";
import { writeAudit } from "../security/audit";
import { TenantAdminError, type TenantContext } from "../tenant-admin/permissions";

export type LeadStatus = "open" | "won" | "lost";
export type LeadSource = "website" | "referral" | "event" | "partner" | "other";
export type LeadVisibility = "workspace" | "teams";
export type LeadInput = {
  firstName: string; lastName: string; email: string; company: string; phone?: string;
  source: LeadSource; stageId: string; status?: LeadStatus; ownerMembershipId?: string;
  visibility: LeadVisibility; teamIds: string[]; note?: string;
};

export class CrmError extends TenantAdminError {}

async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try { await client.query("begin"); const result = await work(client); await client.query("commit"); return result; }
  catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}

const clean = (value: string, maximum: number) => value.trim().slice(0, maximum);
function normalized(input: LeadInput) {
  const firstName=clean(input.firstName,100),lastName=clean(input.lastName,100),email=input.email.trim().toLowerCase(),company=clean(input.company,160),phone=clean(input.phone??"",50),teamIds=[...new Set(input.teamIds)].sort();
  if(!firstName||!lastName||!company||!/^\S+@\S+\.\S+$/.test(email))throw new CrmError("validation_failed",400);
  if(input.visibility==="teams"&&!teamIds.length)throw new CrmError("validation_failed",400);
  return{...input,firstName,lastName,email,company,phone:phone||undefined,teamIds,status:input.status??"open"};
}

async function assertReferences(client: PoolClient, context: TenantContext, input: ReturnType<typeof normalized>) {
  const stage=(await client.query(`select id from pipeline_stages where id=$1 and workspace_id=$2 and status='active'`,[input.stageId,context.workspaceId])).rows[0];
  if(!stage)throw new CrmError("resource_not_found",404);
  const ownerId=input.ownerMembershipId??context.membershipId,owner=(await client.query(`select id from workspace_memberships where id=$1 and workspace_id=$2 and status='active'`,[ownerId,context.workspaceId])).rows[0];
  if(!owner)throw new CrmError("resource_not_found",404);
  if(input.teamIds.length&&(await client.query(`select id from teams where workspace_id=$1 and status='active' and id=any($2::uuid[])`,[context.workspaceId,input.teamIds])).rowCount!==input.teamIds.length)throw new CrmError("resource_not_found",404);
  return ownerId as string;
}

const visibilitySql=`(l.visibility='workspace' or l.owner_membership_id=$2 or $3 in ('owner','admin') or exists(select 1 from lead_visible_teams lvt join team_memberships tm on tm.workspace_id=lvt.workspace_id and tm.team_id=lvt.team_id and tm.workspace_membership_id=$2 where lvt.workspace_id=l.workspace_id and lvt.lead_id=l.id))`;
const selectLead=`select l.*,ps.name stage_name,u.display_name owner_name,coalesce(json_agg(distinct jsonb_build_object('id',t.id,'name',t.name)) filter(where t.id is not null),'[]') teams from leads l join pipeline_stages ps on ps.id=l.stage_id and ps.workspace_id=l.workspace_id join workspace_memberships om on om.id=l.owner_membership_id and om.workspace_id=l.workspace_id join users u on u.id=om.user_id left join lead_visible_teams lvt on lvt.workspace_id=l.workspace_id and lvt.lead_id=l.id left join teams t on t.id=lvt.team_id and t.workspace_id=l.workspace_id`;
const groupLead=`group by l.id,ps.name,u.display_name`;

export async function pipelineStages(database: Pool|PoolClient, context: TenantContext) {
  return (await database.query(`select id,name,position,status from pipeline_stages where workspace_id=$1 and status='active' order by position,id`,[context.workspaceId])).rows;
}

export async function leadOwners(database: Pool|PoolClient, context: TenantContext) {
  return (await database.query(`select m.id,u.display_name,r.code role from workspace_memberships m join users u on u.id=m.user_id join roles r on r.id=m.role_id and r.workspace_id=m.workspace_id where m.workspace_id=$1 and m.status='active' order by u.display_name,m.id`,[context.workspaceId])).rows;
}

export async function leadTeams(database: Pool|PoolClient, context: TenantContext) {
  return (await database.query(`select id,name from teams where workspace_id=$1 and status='active' order by name_normalized,id`,[context.workspaceId])).rows;
}

export type LeadListFilters={status?:LeadStatus;stageId?:string;ownerMembershipId?:string;teamId?:string;createdSince?:Date};
export async function listLeads(database: Pool|PoolClient, context: TenantContext, search="", filters:LeadListFilters={}) {
  const query=search.trim().toLowerCase().slice(0,160);
  return (await database.query(`${selectLead} where l.workspace_id=$1 and ${visibilitySql} and($4='' or lower(l.first_name||' '||l.last_name||' '||l.email_display||' '||l.company) like '%'||$4||'%') and($5::text is null or l.status=$5) and($6::uuid is null or l.stage_id=$6) and($7::uuid is null or l.owner_membership_id=$7) and($8::uuid is null or exists(select 1 from lead_visible_teams selected_team where selected_team.workspace_id=l.workspace_id and selected_team.lead_id=l.id and selected_team.team_id=$8)) and($9::timestamptz is null or l.created_at>=$9) ${groupLead} order by l.updated_at desc,l.id desc limit 100`,[context.workspaceId,context.membershipId,context.role,query,filters.status??null,filters.stageId??null,filters.ownerMembershipId??null,filters.teamId??null,filters.createdSince??null])).rows;
}

export async function getLead(database: Pool|PoolClient, context: TenantContext, leadId: string) {
  const lead=(await database.query(`${selectLead} where l.workspace_id=$1 and l.id=$4 and ${visibilitySql} ${groupLead}`,[context.workspaceId,context.membershipId,context.role,leadId])).rows[0];
  if(!lead)throw new CrmError("resource_not_found",404);
  const activities=(await database.query(`select a.id,a.kind,a.body,a.created_at,u.display_name author from lead_activities a join workspace_memberships m on m.id=a.created_by_membership_id and m.workspace_id=a.workspace_id join users u on u.id=m.user_id where a.workspace_id=$1 and a.lead_id=$2 order by a.created_at desc,a.id desc limit 100`,[context.workspaceId,leadId])).rows;
  return{...lead,activities};
}

export async function createLead(pool: Pool, context: TenantContext, raw: LeadInput) {
  const input=normalized(raw);
  return transaction(pool,async client=>{
    const ownerId=await assertReferences(client,context,input);
    const lead=(await client.query(`insert into leads(workspace_id,first_name,last_name,email_normalized,email_display,company,phone,source,status,stage_id,owner_membership_id,visibility)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)returning *`,[context.workspaceId,input.firstName,input.lastName,input.email,input.email.trim(),input.company,input.phone??null,input.source,input.status,input.stageId,ownerId,input.visibility])).rows[0];
    for(const teamId of input.teamIds)await client.query(`insert into lead_visible_teams(workspace_id,lead_id,team_id)values($1,$2,$3)`,[context.workspaceId,lead.id,teamId]);
    await client.query(`insert into lead_activities(workspace_id,lead_id,kind,body,created_by_membership_id)values($1,$2,'created','Lead created.',$3)`,[context.workspaceId,lead.id,context.membershipId]);
    if(input.note?.trim())await client.query(`insert into lead_activities(workspace_id,lead_id,kind,body,created_by_membership_id)values($1,$2,'note',$3,$4)`,[context.workspaceId,lead.id,clean(input.note,4000),context.membershipId]);
    await writeAudit(client,{workspaceId:context.workspaceId,actorUserId:context.userId,actorMembershipId:context.membershipId,sessionId:context.sessionId,action:"crm.lead_created",targetType:"lead",targetId:lead.id,outcome:"success",metadata:{operation:"lead_create"}});
    await client.query(`insert into outbox_messages(workspace_id,topic,aggregate_type,aggregate_id,payload)values($1,'crm.lead_changed','lead',$2,'{"version":1}')`,[context.workspaceId,lead.id]);
    return lead;
  });
}

export async function updateLead(pool: Pool, context: TenantContext, leadId: string, expectedVersion: number, raw: LeadInput) {
  const input=normalized(raw);
  return transaction(pool,async client=>{
    const current=(await client.query(`select l.* from leads l join workspace_memberships actor on actor.id=$3 and actor.user_id=$4 and actor.workspace_id=l.workspace_id and actor.status='active' join roles actor_role on actor_role.id=actor.role_id and actor_role.workspace_id=actor.workspace_id where l.id=$1 and l.workspace_id=$2 and(actor_role.code in ('owner','admin') or l.visibility='workspace' or l.owner_membership_id=actor.id or exists(select 1 from lead_visible_teams visible join teams team on team.id=visible.team_id and team.workspace_id=visible.workspace_id and team.status='active' join team_memberships current_team on current_team.workspace_id=visible.workspace_id and current_team.team_id=visible.team_id and current_team.workspace_membership_id=actor.id where visible.workspace_id=l.workspace_id and visible.lead_id=l.id)) for update of l,actor`,[leadId,context.workspaceId,context.membershipId,context.userId])).rows[0];
    if(!current)throw new CrmError("resource_not_found",404);
    if(current.version!==expectedVersion)throw new CrmError("stale_version",409);
    const ownerId=await assertReferences(client,context,input);
    const updated=(await client.query(`update leads set first_name=$3,last_name=$4,email_normalized=$5,email_display=$6,company=$7,phone=$8,source=$9,status=$10,stage_id=$11,owner_membership_id=$12,visibility=$13,version=version+1,updated_at=now() where id=$1 and workspace_id=$2 and version=$14 returning *`,[leadId,context.workspaceId,input.firstName,input.lastName,input.email,input.email.trim(),input.company,input.phone??null,input.source,input.status,input.stageId,ownerId,input.visibility,expectedVersion])).rows[0];
    if(!updated)throw new CrmError("stale_version",409);
    await client.query(`delete from lead_visible_teams where workspace_id=$1 and lead_id=$2`,[context.workspaceId,leadId]);
    for(const teamId of input.teamIds)await client.query(`insert into lead_visible_teams(workspace_id,lead_id,team_id)values($1,$2,$3)`,[context.workspaceId,leadId,teamId]);
    const changes=[];if(current.stage_id!==input.stageId)changes.push("stage_changed");if(current.status!==input.status)changes.push("status_changed");
    await client.query(`insert into lead_activities(workspace_id,lead_id,kind,body,created_by_membership_id)values($1,$2,$3,$4,$5)`,[context.workspaceId,leadId,changes[0]??"updated",changes.length?"Pipeline or status updated.":"Lead details updated.",context.membershipId]);
    await writeAudit(client,{workspaceId:context.workspaceId,actorUserId:context.userId,actorMembershipId:context.membershipId,sessionId:context.sessionId,action:"crm.lead_updated",targetType:"lead",targetId:leadId,outcome:"success",metadata:{operation:"lead_update",expected_version:expectedVersion,result_version:updated.version}});
    await client.query(`insert into outbox_messages(workspace_id,topic,aggregate_type,aggregate_id,payload)values($1,'crm.lead_changed','lead',$2,$3)`,[context.workspaceId,leadId,JSON.stringify({version:updated.version})]);
    return updated;
  });
}

export async function addLeadNote(pool: Pool, context: TenantContext, leadId: string, body: string) {
  const note=clean(body,4000);if(!note)throw new CrmError("validation_failed",400);
  return transaction(pool,async client=>{
    if(!(await client.query(`select l.id from leads l where l.id=$1 and l.workspace_id=$2 and(l.visibility='workspace' or l.owner_membership_id=$3 or $4 in ('owner','admin') or exists(select 1 from lead_visible_teams lvt join team_memberships tm on tm.workspace_id=lvt.workspace_id and tm.team_id=lvt.team_id and tm.workspace_membership_id=$3 where lvt.workspace_id=l.workspace_id and lvt.lead_id=l.id))`,[leadId,context.workspaceId,context.membershipId,context.role])).rows[0])throw new CrmError("resource_not_found",404);
    const row=(await client.query(`insert into lead_activities(workspace_id,lead_id,kind,body,created_by_membership_id)values($1,$2,'note',$3,$4)returning id,kind,body,created_at`,[context.workspaceId,leadId,note,context.membershipId])).rows[0];
    await writeAudit(client,{workspaceId:context.workspaceId,actorUserId:context.userId,actorMembershipId:context.membershipId,sessionId:context.sessionId,action:"crm.lead_note_added",targetType:"lead",targetId:leadId,outcome:"success",metadata:{operation:"lead_note"}});
    return row;
  });
}
