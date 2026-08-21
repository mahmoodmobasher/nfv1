import {z} from "zod";
import {getServerEnv} from "@/server/env";
import {localDatabase} from "@/server/http";
import {invitationDestinationById,resendInvitation} from "@/server/tenant-admin/invitations";
import {auditedFailure,auditedMutationGuard,enforceTenantRate,failure,idempotencyKey,success,tenant} from "@/server/tenant-admin/http";
import {TenantAdminError} from "@/server/tenant-admin/permissions";

export async function POST(request:Request,{params}:{params:Promise<{workspaceId:string;invitationId:string}>}){
  const blocked=await auditedMutationGuard(request,{action:"workspace.invitation_admin_denied",targetType:"invitation"});if(blocked)return blocked;
  const{workspaceId,invitationId}=await params,{pool}=localDatabase(),env=getServerEnv();let serviceOwnsDenial=false;
  try{
    const parsed=z.object({expectedVersion:z.number().int().positive()}).safeParse(await request.json().catch(()=>null));
    if(!parsed.success)throw new TenantAdminError("validation_failed",400);
    const context=await tenant(pool,request,workspaceId);
    await enforceTenantRate(pool,request,"invite_resend",context,await invitationDestinationById(pool,workspaceId,invitationId));
    const key=idempotencyKey(request);serviceOwnsDenial=true;
    return success(await resendInvitation(pool,{context,invitationId,...parsed.data,idempotencyKey:key,secret:env.SESSION_SECRET,appOrigin:env.APP_ORIGIN,ttlHours:env.INVITATION_TTL_HOURS}),202);
  }catch(error){return serviceOwnsDenial?failure(error):auditedFailure(pool,request,error,{action:"workspace.invitation_admin_denied",targetType:"invitation",targetId:invitationId})}
  finally{await pool.end()}
}
