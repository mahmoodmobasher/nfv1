import {z} from "zod";
import {getServerEnv} from "@/server/env";
import {localDatabase} from "@/server/http";
import {createInvitation,normalizeInvitationDestination} from "@/server/tenant-admin/invitations";
import {invitationsPage,pageOptions} from "@/server/tenant-admin/pagination";
import {auditedFailure,auditedMutationGuard,enforceTenantRate,failure,idempotencyKey,success,tenant} from "@/server/tenant-admin/http";
import {TenantAdminError} from "@/server/tenant-admin/permissions";

export async function GET(request:Request,{params}:{params:Promise<{workspaceId:string}>}){
  const{workspaceId}=await params,{pool}=localDatabase(),env=getServerEnv();
  try{return success(await invitationsPage(pool,await tenant(pool,request,workspaceId),pageOptions(request,env.SESSION_SECRET)))}
  catch(error){return await auditedFailure(pool,request,error,{action:"workspace.invitation_admin_denied",targetType:"invitation"})}
  finally{await pool.end()}
}

export async function POST(request:Request,{params}:{params:Promise<{workspaceId:string}>}){
  const blocked=await auditedMutationGuard(request,{action:"workspace.invitation_admin_denied",targetType:"invitation"});if(blocked)return blocked;
  const{workspaceId}=await params,{pool}=localDatabase(),env=getServerEnv();let serviceOwnsDenial=false;
  try{
    const parsed=z.object({email:z.string().email().max(320),roleCode:z.enum(["admin","member"]),teamIds:z.array(z.string().uuid()).max(50).default([])}).safeParse(await request.json().catch(()=>null));
    if(!parsed.success)throw new TenantAdminError("validation_failed",400);
    const context=await tenant(pool,request,workspaceId);
    await enforceTenantRate(pool,request,"invite_create",context,normalizeInvitationDestination(parsed.data.email));
    const key=idempotencyKey(request);serviceOwnsDenial=true;
    return success(await createInvitation(pool,{context,...parsed.data,idempotencyKey:key,secret:env.SESSION_SECRET,appOrigin:env.APP_ORIGIN,ttlHours:env.INVITATION_TTL_HOURS}),202);
  }catch(error){return serviceOwnsDenial?failure(error):await auditedFailure(pool,request,error,{action:"workspace.invitation_admin_denied",targetType:"invitation"})}
  finally{await pool.end()}
}
