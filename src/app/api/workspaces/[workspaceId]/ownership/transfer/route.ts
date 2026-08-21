import {z} from "zod";
import {getServerEnv} from "@/server/env";
import {localDatabase,sessionToken as presentedToken} from "@/server/http";
import {cookie} from "@/server/security/request";
import {recoverOwnerTransfer,transferOwner} from "@/server/tenant-admin/administration";
import {auditedFailure,auditedMutationGuard,enforceTenantRate,failure,idempotencyKey,success,tenant} from "@/server/tenant-admin/http";
import {TenantAdminError,type TenantContext} from "@/server/tenant-admin/permissions";

export async function POST(request:Request,{params}:{params:Promise<{workspaceId:string}>}){
  const blocked=await auditedMutationGuard(request,{action:"workspace.ownership_transfer_denied",targetType:"membership"});if(blocked)return blocked;
  const{workspaceId}=await params,{pool}=localDatabase(),env=getServerEnv();let context:TenantContext|undefined,serviceOwnsDenial=false;
  try{
    const parsed=z.object({successorMembershipId:z.string().uuid(),actorExpectedVersion:z.number().int().positive(),successorExpectedVersion:z.number().int().positive()}).safeParse(await request.json().catch(()=>null));
    if(!parsed.success)throw new TenantAdminError("validation_failed",400);
    const key=idempotencyKey(request),oldSessionToken=presentedToken(request)??"";
    const recovered=await recoverOwnerTransfer(pool,{workspaceId,successorId:parsed.data.successorMembershipId,actorExpectedVersion:parsed.data.actorExpectedVersion,successorExpectedVersion:parsed.data.successorExpectedVersion,key,presentedSessionToken:oldSessionToken,sessionSecret:env.SESSION_SECRET});
    if(recovered){const response=success({priorOwner:recovered.priorOwner,owner:recovered.owner});response.headers.set("Set-Cookie",cookie(env.SESSION_COOKIE_NAME,recovered.sessionToken,{secure:env.APP_ORIGIN.startsWith("https://"),maxAge:env.SESSION_ABSOLUTE_HOURS*3600}));return response}
    context=await tenant(pool,request,workspaceId);
    await enforceTenantRate(pool,request,"member_change",context,parsed.data.successorMembershipId);
    serviceOwnsDenial=true;
    const result=await transferOwner(pool,{context,successorId:parsed.data.successorMembershipId,actorExpectedVersion:parsed.data.actorExpectedVersion,successorExpectedVersion:parsed.data.successorExpectedVersion,key,recentMinutes:env.RECENT_AUTH_MINUTES,sessionSecret:env.SESSION_SECRET,oldSessionToken});
    const response=success({priorOwner:result.priorOwner,owner:result.owner});response.headers.set("Set-Cookie",cookie(env.SESSION_COOKIE_NAME,result.sessionToken,{secure:env.APP_ORIGIN.startsWith("https://"),maxAge:env.SESSION_ABSOLUTE_HOURS*3600}));return response;
  }catch(error){return serviceOwnsDenial?failure(error):auditedFailure(pool,request,error,{action:"workspace.ownership_transfer_denied",targetType:"membership",context})}
  finally{await pool.end()}
}
