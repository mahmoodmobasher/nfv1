import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { writeAudit } from "../security/audit";

export class ProvisioningError extends Error { constructor(public code:"invalid_plan"|"not_eligible"|"idempotency_conflict"){super(code)} }
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const slug=(name:string)=>`${name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40)||"workspace"}-${crypto.randomUUID().slice(0,8)}`;
const policies={owner:["workspace.settings.read","workspace.settings.write","members.read","members.invite_member","members.invite_admin","members.manage_member","members.manage_admin","members.transfer_owner","roles.policy.write","teams.read","teams.write"],admin:["workspace.settings.read","members.read","members.invite_member","members.manage_member","teams.read","teams.write"],member:[]} as const;
async function transaction<T>(pool:Pool,work:(client:PoolClient)=>Promise<T>){const client=await pool.connect();try{await client.query("begin");const result=await work(client);await client.query("commit");return result}catch(error){await client.query("rollback");throw error}finally{client.release()}}

export async function savePlanSelection(pool:Pool,userId:string,planCode:string,cadence:string){return transaction(pool,async client=>{if(!(await client.query(`select 1 from plan_catalog_entries where code=$1 and status='active' and effective_from<=now() and(effective_to is null or effective_to>now())and allowed_cadences?$2`,[planCode,cadence])).rows[0])throw new ProvisioningError("invalid_plan");const updated=await client.query("update onboarding_progress set selected_plan_code=$2,billing_cadence=$3,version=version+1,updated_at=now() where user_id=$1 and workspace_id is null",[userId,planCode,cadence]);if(updated.rowCount!==1)throw new ProvisioningError("not_eligible");return{planCode,cadence}})}

export async function provisionWorkspace(pool:Pool,input:{userId:string;sessionId:string;name:string;idempotencyKey:string}){
  const hash=digest({name:input.name.trim()});
  return transaction(pool,async client=>{
    await client.query("select pg_advisory_xact_lock(hashtext($1))",[`${input.userId}:workspace.provision:${input.idempotencyKey}`]);
    const old=(await client.query(`select request_hash,outcome from idempotency_records where principal_key=$1 and operation='workspace.provision' and idempotency_key=$2`,[input.userId,input.idempotencyKey])).rows[0];
    if(old){if(old.request_hash!==hash)throw new ProvisioningError("idempotency_conflict");return old.outcome}
    const onboarding=(await client.query(`select o.*,u.status,u.email_verified_at from onboarding_progress o join users u on u.id=o.user_id where o.user_id=$1 for update`,[input.userId])).rows[0];
    if(!onboarding||onboarding.status!=="active"||!onboarding.email_verified_at||onboarding.workspace_id)throw new ProvisioningError("not_eligible");
    const plan=(await client.query(`select * from plan_catalog_entries where code=$1 and status='active' and effective_from<=now()and(effective_to is null or effective_to>now())and allowed_cadences?$2 order by effective_from desc,created_at desc,id desc limit 1`,[onboarding.selected_plan_code,onboarding.billing_cadence])).rows[0];
    if(!plan)throw new ProvisioningError("invalid_plan");
    const start=new Date(),end=new Date(start.getTime()+plan.trial_days*86_400_000);
    const workspace=(await client.query(`insert into workspaces(name,slug,status,plan_code,billing_cadence,trial_started_at,trial_ends_at,created_by_user_id)values($1,$2,'provisioning',$3,$4,$5,$6,$7)returning id,slug`,[input.name.trim(),slug(input.name),onboarding.selected_plan_code,onboarding.billing_cadence,start,end,input.userId])).rows[0];
    let ownerRoleId="";
    for(const code of ["owner","admin","member"] as const){const role=(await client.query(`insert into roles(workspace_id,code,permissions,is_system,policy_version)values($1,$2,$3,true,'tenant-admin-v1')returning id`,[workspace.id,code,JSON.stringify({version:"tenant-admin-v1",permissions:policies[code]})])).rows[0];if(code==="owner")ownerRoleId=role.id}
    const membership=(await client.query(`insert into workspace_memberships(workspace_id,user_id,role_id,status)values($1,$2,$3,'active')returning id`,[workspace.id,input.userId,ownerRoleId])).rows[0];
    await client.query(`insert into pipeline_stages(workspace_id,name,position)values($1,'New',0),($1,'Contacted',1),($1,'Qualified',2),($1,'Proposal',3)` ,[workspace.id]);
    await client.query(`insert into workspace_entitlement_snapshots(workspace_id,plan_code,catalog_version,effective_feature_flags,effective_limits)values($1,$2,$3,$4,$5)`,[workspace.id,onboarding.selected_plan_code,plan.catalog_version,plan.feature_flags,JSON.stringify({activeSeats:plan.included_active_seats})]);
    await client.query("update workspaces set status='active',updated_at=now() where id=$1",[workspace.id]);
    await client.query("update onboarding_progress set workspace_id=$2,current_step='complete',completed_at=now(),version=version+1,updated_at=now() where user_id=$1",[input.userId,workspace.id]);
    await client.query("update sessions set active_workspace_id=$2,updated_at=now() where id=$1 and user_id=$3 and revoked_at is null",[input.sessionId,workspace.id,input.userId]);
    for(const event of [{action:"workspace.created",type:"workspace",id:workspace.id,operation:"workspace_provision"},{action:"workspace.initial_owner_assigned",type:"membership",id:membership.id,operation:"owner_assign"}])await writeAudit(client,{workspaceId:workspace.id,actorUserId:input.userId,actorMembershipId:membership.id,sessionId:input.sessionId,action:event.action,targetType:event.type,targetId:event.id,outcome:"success",metadata:{operation:event.operation}});
    await client.query(`insert into outbox_messages(workspace_id,topic,aggregate_type,aggregate_id,payload)values($1,'workspace.provisioned','workspace',$1,$2)`,[workspace.id,JSON.stringify({version:1})]);
    const outcome={workspaceId:workspace.id,slug:workspace.slug};
    await client.query(`insert into idempotency_records(principal_key,operation,idempotency_key,request_hash,outcome,expires_at)values($1,'workspace.provision',$2,$3,$4,now()+interval '24 hours')`,[input.userId,input.idempotencyKey,hash,JSON.stringify(outcome)]);
    return outcome;
  });
}
export async function workspaceSummary(pool:Pool,userId:string,workspaceId?:string|null){if(!workspaceId)return null;return(await pool.query(`select w.id,w.name,w.slug,w.plan_code,w.billing_cadence,w.trial_ends_at,m.id membership_id,r.code role from workspaces w join workspace_memberships m on m.workspace_id=w.id and m.user_id=$1 and m.status='active' join roles r on r.id=m.role_id and r.workspace_id=w.id where w.status='active' and w.id=$2`,[userId,workspaceId])).rows[0]??null}
export async function requireWorkspaceAuthorization(pool:Pool,userId:string,workspaceId:string){const row=(await pool.query(`select m.id membership_id,r.code role from workspace_memberships m join roles r on r.id=m.role_id and r.workspace_id=m.workspace_id join workspaces w on w.id=m.workspace_id where m.user_id=$1 and m.workspace_id=$2 and m.status='active'and w.status='active'`,[userId,workspaceId])).rows[0];return row?{userId,workspaceId,membershipId:row.membership_id,role:row.role}:null}
export { changeOwnerMembership, transferOwnership } from "./ownership";
