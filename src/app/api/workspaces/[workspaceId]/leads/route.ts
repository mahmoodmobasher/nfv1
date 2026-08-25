import { localDatabase, mutationGuard } from "@/server/http";
import { listLeads } from "@/server/crm/leads";
import { leadInputSchema } from "@/server/crm/http";
import { failure, success, tenant } from "@/server/tenant-admin/http";
import { TenantAdminError } from "@/server/tenant-admin/permissions";
import { leadIntakeFailure, leadIntakeJson, submitLeadInquiryV1, submitLegacyManualLeadV1,
  type LeadInquiryIntakeCommandV1 } from "@/backend/modules/leads";
import { enforceManualIntakeRate } from "@/backend/platform/authorization";

export async function GET(request:Request,{params}:{params:Promise<{workspaceId:string}>}){const{workspaceId}=await params,{pool}=localDatabase();try{return success(await listLeads(pool,await tenant(pool,request,workspaceId),new URL(request.url).searchParams.get("q")??""))}catch(error){return failure(error)}finally{await pool.end()}}
export async function POST(request:Request,{params}:{params:Promise<{workspaceId:string}>}){
  const blocked=mutationGuard(request);if(blocked)return blocked;
  const{workspaceId}=await params,{pool}=localDatabase(),requestId=crypto.randomUUID();
  try{
    const context=await tenant(pool,request,workspaceId);
    await enforceManualIntakeRate(pool,request,context);
    const key=request.headers.get("idempotency-key");
    if(!key||key.length<16||key.length>128||!/^\x20-\x7e+$/.test(key))throw new TenantAdminError("validation_failed",400);
    const body=await request.json().catch(()=>null);
    if(body&&typeof body==="object"&&"contractVersion" in body)
      return leadIntakeJson(await submitLeadInquiryV1(pool,{actor:context,command:body as LeadInquiryIntakeCommandV1,idempotencyKey:key,requestId}),201);
    const legacy=leadInputSchema.safeParse(body);
    if(!legacy.success)throw new TenantAdminError("validation_failed",400);
    const result=await submitLegacyManualLeadV1(pool,{actor:context,legacy:legacy.data,idempotencyKey:key,requestId});
    return leadIntakeJson({...result,id:result.leadId,version:result.leadVersion},201);
  }catch(error){return leadIntakeFailure(error,requestId)}finally{await pool.end()}
}
