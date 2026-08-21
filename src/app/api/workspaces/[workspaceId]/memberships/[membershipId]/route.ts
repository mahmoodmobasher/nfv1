import {z} from "zod";
import {localDatabase} from "@/server/http";
import {changeMembership} from "@/server/tenant-admin/administration";
import {changeMembershipRole} from "@/server/tenant-admin/role-authority";
import {auditedFailure,auditedMutationGuard,enforceTenantRate,failure,idempotencyKey,success,tenant} from "@/server/tenant-admin/http";
import {TenantAdminError} from "@/server/tenant-admin/permissions";
export async function PATCH(request:Request,{params}:{params:Promise<{workspaceId:string;membershipId:string}>}){
  const blocked=await auditedMutationGuard(request,{action:"workspace.membership_change_denied",targetType:"membership"});if(blocked)return blocked;
  const{workspaceId,membershipId}=await params,{pool}=localDatabase();let serviceOwnsDenial=false;
  try{
    const parsed=z.object({roleCode:z.enum(["admin","member"]).optional(),status:z.enum(["active","suspended","removed"]).optional(),expectedVersion:z.number().int().positive()}).refine(v=>v.roleCode||v.status).safeParse(await request.json().catch(()=>null));
    if(!parsed.success)throw new TenantAdminError("validation_failed",400);
    const context=await tenant(pool,request,workspaceId);await enforceTenantRate(pool,request,"member_change",context,membershipId);const key=idempotencyKey(request);
    if(parsed.data.roleCode){serviceOwnsDenial=true;return success(await changeMembershipRole(pool,{context,targetId:membershipId,roleCode:parsed.data.roleCode,expectedVersion:parsed.data.expectedVersion,key}))}
    serviceOwnsDenial=true;return success(await changeMembership(pool,{context,targetId:membershipId,...parsed.data,key}));
  }catch(error){return serviceOwnsDenial?failure(error):await auditedFailure(pool,request,error,{action:"workspace.membership_change_denied",targetType:"membership"})}finally{await pool.end()}
}
