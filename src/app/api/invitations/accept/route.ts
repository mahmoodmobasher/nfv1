import {z} from "zod";
import {getServerEnv} from "@/server/env";
import {localDatabase} from "@/server/http";
import {acceptInvitation,invitationDestinationByToken} from "@/server/tenant-admin/invitations";
import {auditedFailure,auditedMutationGuard,enforceTenantRate,failure,idempotencyKey,identity,success} from "@/server/tenant-admin/http";
import {TenantAdminError} from "@/server/tenant-admin/permissions";
import {privateWorkspaceResponse} from "@/server/workspaces/http";
import {clearInvitationIntentCookie,clearInvitationReturnCookie,invitationIntentFromRequest} from "@/server/invitations/intent";

export async function POST(request:Request){
  const blocked=await auditedMutationGuard(request,{action:"workspace.invitation_accept_denied",targetType:"invitation"});if(blocked)return privateWorkspaceResponse(blocked);
  const{pool}=localDatabase(),env=getServerEnv();let serviceOwnsDenial=false;
  try{
    const body=await request.json().catch(()=>null),intentToken=invitationIntentFromRequest(request,env.SESSION_SECRET);
    // The encrypted HttpOnly intent is the browser path. Body tokens remain only for
    // existing direct API clients and contract tests during the bounded migration.
    const parsed=z.object({token:z.string().min(32).max(128)}).safeParse({token:intentToken??(body as{token?:unknown}|null)?.token});
    if(!parsed.success)throw new TenantAdminError("invitation_invalid",410);
    const actor=await identity(pool,request);
    await enforceTenantRate(pool,request,"invite_accept",actor,await invitationDestinationByToken(pool,parsed.data.token,env.SESSION_SECRET));
    const key=idempotencyKey(request);serviceOwnsDenial=true;
    const response=privateWorkspaceResponse(success(await acceptInvitation(pool,{...actor,token:parsed.data.token,idempotencyKey:key,secret:env.SESSION_SECRET})));
    response.headers.set("Set-Cookie",clearInvitationIntentCookie(env.APP_ORIGIN.startsWith("https://")));
    response.headers.append("Set-Cookie",clearInvitationReturnCookie(env.APP_ORIGIN.startsWith("https://")));
    return response;
  }catch(error){const response=privateWorkspaceResponse(serviceOwnsDenial?failure(error):await auditedFailure(pool,request,error,{action:"workspace.invitation_accept_denied",targetType:"invitation"}));if(error instanceof TenantAdminError&&["invitation_invalid","invitation_consumed"].includes(error.code)){response.headers.set("Set-Cookie",clearInvitationIntentCookie(env.APP_ORIGIN.startsWith("https://")));response.headers.append("Set-Cookie",clearInvitationReturnCookie(env.APP_ORIGIN.startsWith("https://")))}return response}
  finally{await pool.end()}
}
