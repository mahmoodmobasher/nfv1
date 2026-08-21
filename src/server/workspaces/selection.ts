import{createHash}from"node:crypto";
import type{Pool,PoolClient}from"pg";
import{decryptEnvelope,encryptEnvelope,keyedHash,randomOpaqueToken}from"../security/crypto";
import{auditCorrelation,writeAudit}from"../security/audit";
import{TenantAdminError}from"../tenant-admin/permissions";
import{safeDenialAudit}from"../tenant-admin/denial";

export type SelectableWorkspace={id:string;name:string;slug:string;role:"owner"|"admin"|"member";membershipId:string;current:boolean};
type Stored={workspace:SelectableWorkspace;tokenEnvelope:string;sessionId:string;userId:string};
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function tx<T>(pool:Pool,work:(client:PoolClient)=>Promise<T>){const client=await pool.connect();try{await client.query("begin");const result=await work(client);await client.query("commit");return result}catch(error){await client.query("rollback");throw error}finally{client.release()}}

export async function selectableWorkspaces(pool:Pool,input:{userId:string;sessionId:string;activeWorkspaceId:string|null}){
 return tx(pool,async client=>{
  const session=(await client.query<{active_workspace_id:string|null}>(`select s.active_workspace_id from sessions s join users u on u.id=s.user_id where s.id=$1 and s.user_id=$2 and s.revoked_at is null and s.idle_expires_at>now() and s.absolute_expires_at>now() and s.security_version=u.security_version and u.status='active' for update of s,u`,[input.sessionId,input.userId])).rows[0];
  if(!session)throw new TenantAdminError("authentication_required",401);
  const rows=(await client.query<Omit<SelectableWorkspace,"current">>(`select w.id,w.name,w.slug,r.code role,m.id "membershipId" from workspace_memberships m join workspaces w on w.id=m.workspace_id and w.status='active' join roles r on r.id=m.role_id and r.workspace_id=m.workspace_id where m.user_id=$1 and m.status='active' order by lower(w.name),w.id`,[input.userId])).rows;
  let current=session.active_workspace_id&&rows.some(row=>row.id===session.active_workspace_id)?session.active_workspace_id:null;
  if(!current&&rows.length===1){
   current=rows[0].id;
   await client.query("update sessions set active_workspace_id=$2,updated_at=now() where id=$1",[input.sessionId,current]);
   await writeAudit(client,{workspaceId:current,actorUserId:input.userId,actorMembershipId:rows[0].membershipId,sessionId:input.sessionId,action:"workspace.selection_bootstrapped",targetType:"workspace",targetId:current,outcome:"success",metadata:{selection_version:1}});
  }else if(session.active_workspace_id&&!current){
   await client.query("update sessions set active_workspace_id=null,updated_at=now() where id=$1",[input.sessionId]);
   await writeAudit(client,{actorUserId:input.userId,sessionId:input.sessionId,action:"workspace.selection_invalidated",targetType:"workspace",outcome:"denied",reasonCode:"invalid_target",metadata:{selection_version:1}});
  }
  return rows.map(row=>({...row,current:row.id===current}));
 });
}

export async function auditWorkspaceSwitchDenial(pool:Pool,input:{token:string;secret:string;workspaceId?:string;correlationId?:string;error:unknown}){
 const row=(await pool.query<{user_id:string;session_id:string;workspace_id:string|null;membership_id:string|null;role:"owner"|"admin"|"member"|null;version:number|null;authenticated_at:Date;auth_method:string}>(`select s.user_id,s.id session_id,s.active_workspace_id workspace_id,m.id membership_id,r.code role,m.version,s.authenticated_at,s.auth_method from sessions s left join workspace_memberships m on m.workspace_id=s.active_workspace_id and m.user_id=s.user_id and m.status='active' left join roles r on r.id=m.role_id and r.workspace_id=m.workspace_id where s.session_hash=$1`,[keyedHash(input.token,input.secret)])).rows[0];
 await safeDenialAudit(pool,{...(row?.workspace_id&&row.membership_id&&row.role?{context:{userId:row.user_id,sessionId:row.session_id,workspaceId:row.workspace_id,membershipId:row.membership_id,role:row.role,membershipVersion:row.version??1,authenticatedAt:row.authenticated_at,authMethod:row.auth_method}}:{userId:row?.user_id,sessionId:row?.session_id}),action:"workspace.selection_denied",targetType:"workspace",targetId:input.workspaceId,correlationId:input.correlationId?auditCorrelation("workspace_switch",input.correlationId):undefined,error:input.error});
}

export async function switchWorkspace(pool:Pool,input:{token:string;secret:string;workspaceId:string;idempotencyKey:string}){
 const oldHash=keyedHash(input.token,input.secret),principal=`session-switch:${oldHash}`,requestHash=digest({workspaceId:input.workspaceId});
 return tx(pool,async client=>{
  await client.query("select pg_advisory_xact_lock(hashtext($1))",[`${principal}:workspace_switch:${input.idempotencyKey}`]);
  const prior=(await client.query<{request_hash:string;outcome:Stored}>(`select request_hash,outcome from idempotency_records where principal_key=$1 and operation='workspace_switch' and idempotency_key=$2 and expires_at>now()`,[principal,input.idempotencyKey])).rows[0];
  if(prior){if(prior.request_hash!==requestHash)throw new TenantAdminError("idempotency_conflict",409);return{workspace:prior.outcome.workspace,token:decryptEnvelope<{token:string}>(prior.outcome.tokenEnvelope,input.secret).token,replayed:true}}
  const session=(await client.query<{id:string;user_id:string;security_version:number;active_workspace_id:string|null}>(`select s.id,s.user_id,s.security_version,s.active_workspace_id from sessions s join users u on u.id=s.user_id where s.session_hash=$1 and s.revoked_at is null and s.idle_expires_at>now() and s.absolute_expires_at>now() and s.security_version=u.security_version and u.status='active' for update of s,u`,[oldHash])).rows[0];
  if(!session)throw new TenantAdminError("authentication_required",401);
  const target=(await client.query<Omit<SelectableWorkspace,"current">>(`select w.id,w.name,w.slug,r.code role,m.id "membershipId" from workspace_memberships m join workspaces w on w.id=m.workspace_id and w.status='active' join roles r on r.id=m.role_id and r.workspace_id=m.workspace_id where m.user_id=$1 and m.workspace_id=$2 and m.status='active' for update of m,w,r`,[session.user_id,input.workspaceId])).rows[0];
  if(!target)throw new TenantAdminError("resource_not_found",404);
  const token=randomOpaqueToken();
  if((await client.query("update sessions set active_workspace_id=$2,session_hash=$3,updated_at=now() where id=$1 and session_hash=$4 and revoked_at is null",[session.id,target.id,keyedHash(token,input.secret),oldHash])).rowCount!==1)throw new TenantAdminError("authentication_required",401);
  const workspace={...target,current:true};
  await writeAudit(client,{workspaceId:target.id,actorUserId:session.user_id,actorMembershipId:target.membershipId,sessionId:session.id,action:"workspace.selection_changed",targetType:"workspace",targetId:target.id,outcome:"success",correlationId:auditCorrelation("workspace_switch",input.idempotencyKey),before:{workspaceId:session.active_workspace_id},after:{workspaceId:target.id},metadata:{operation:"workspace_switch",selection_version:1}});
  const stored:Stored={workspace,tokenEnvelope:encryptEnvelope({token},input.secret),sessionId:session.id,userId:session.user_id};
  await client.query(`insert into idempotency_records(principal_key,operation,idempotency_key,request_hash,outcome,expires_at)values($1,'workspace_switch',$2,$3,$4,now()+interval '24 hours')`,[principal,input.idempotencyKey,requestHash,JSON.stringify(stored)]);
  return{workspace,token,replayed:false};
 });
}
