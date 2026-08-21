import type { Pool, PoolClient } from "pg";

export type TenantRole = "owner" | "admin" | "member";
export type TenantPermission = "workspace.settings.read"|"workspace.settings.write"|"members.read"|"members.invite_member"|"members.invite_admin"|"members.manage_member"|"members.manage_admin"|"members.transfer_owner"|"roles.policy.write"|"teams.read"|"teams.write";
export type TenantContext = { userId:string; sessionId:string; workspaceId:string; membershipId:string; role:TenantRole; membershipVersion:number; authenticatedAt:Date; authMethod:string };

export const policyRegistry:Record<TenantRole,ReadonlySet<TenantPermission>>={
  owner:new Set(["workspace.settings.read","workspace.settings.write","members.read","members.invite_member","members.invite_admin","members.manage_member","members.manage_admin","members.transfer_owner","roles.policy.write","teams.read","teams.write"]),
  admin:new Set(["workspace.settings.read","members.read","members.invite_member","members.manage_member","teams.read","teams.write"]),
  member:new Set(),
};

export async function resolveTenantContext(database:Pool|PoolClient,input:{userId:string;sessionId:string;workspaceId:string},lock=false):Promise<TenantContext|null>{
  const result=await database.query<TenantContext & {membershipid:string;membershipversion:number;authenticatedat:Date;authmethod:string}>(`select m.id "membershipId",m.version "membershipVersion",m.workspace_id "workspaceId",m.user_id "userId",r.code role,s.id "sessionId",s.authenticated_at "authenticatedAt",s.auth_method "authMethod" from workspace_memberships m join roles r on r.id=m.role_id and r.workspace_id=m.workspace_id join workspaces w on w.id=m.workspace_id and w.status='active' join sessions s on s.id=$2 and s.user_id=m.user_id and s.revoked_at is null where m.user_id=$1 and m.workspace_id=$3 and m.status='active' ${lock?"for update of m":""}`,[input.userId,input.sessionId,input.workspaceId]);
  return result.rows[0]??null;
}
export function hasPermission(context:TenantContext,permission:TenantPermission){return policyRegistry[context.role].has(permission)}
export function requirePermission(context:TenantContext|null,permission:TenantPermission){if(!context||!hasPermission(context,permission))throw new TenantAdminError("resource_not_found",404);return context}
export function requireRecent(context:TenantContext,minutes:number,now=new Date()){if(context.authMethod==="legacy"||context.authenticatedAt.getTime()<now.getTime()-minutes*60_000)throw new TenantAdminError("recent_auth_required",401)}
export class TenantAdminError extends Error{constructor(public code:string,public status=400,public safe?:unknown){super(code)}}
