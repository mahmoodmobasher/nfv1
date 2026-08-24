import {z} from "zod";
import {getServerEnv} from "@/server/env";
import {localDatabase} from "@/server/http";
import {acceptInvitation,invitationDestinationByToken} from "@/server/tenant-admin/invitations";
import {auditedFailure,auditedMutationGuard,enforceTenantRate,failure,idempotencyKey,identity,success} from "@/server/tenant-admin/http";
import {TenantAdminError} from "@/server/tenant-admin/permissions";
import {privateWorkspaceResponse} from "@/server/workspaces/http";

export async function POST(request:Request){
  const blocked=await auditedMutationGuard(request,{action:"workspace.invitation_accept_denied",targetType:"invitation"});if(blocked)return privateWorkspaceResponse(blocked);
  const{pool}=localDatabase(),env=getServerEnv();let serviceOwnsDenial=false;
  try{
    const parsed=z.object({token:z.string().min(32).max(128)}).safeParse(await request.json().catch(()=>null));
    if(!parsed.success)throw new TenantAdminError("invitation_invalid",410);
    const actor=await identity(pool,request);
    await enforceTenantRate(pool,request,"invite_accept",actor,await invitationDestinationByToken(pool,parsed.data.token,env.SESSION_SECRET));
    const key=idempotencyKey(request);serviceOwnsDenial=true;
    return privateWorkspaceResponse(success(await acceptInvitation(pool,{...actor,token:parsed.data.token,idempotencyKey:key,secret:env.SESSION_SECRET})));
  }catch(error){return privateWorkspaceResponse(serviceOwnsDenial?failure(error):await auditedFailure(pool,request,error,{action:"workspace.invitation_accept_denied",targetType:"invitation"}))}
  finally{await pool.end()}
}
