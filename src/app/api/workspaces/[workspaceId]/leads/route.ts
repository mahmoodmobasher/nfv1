import { localDatabase, mutationGuard } from "@/server/http";
import { leadInputSchema } from "@/server/crm/http";
import { tenant } from "@/server/tenant-admin/http";
import { TenantAdminError } from "@/server/tenant-admin/permissions";
import { leadIntakeFailure, leadIntakeJson, submitLeadInquiryV1, submitLegacyManualLeadV1,
  listLeadSummariesV1, parseLeadSummaryFiltersV1, type LeadInquiryIntakeCommandV1 } from "@/backend/modules/leads";
import { enforceManualIntakeRate } from "@/backend/platform/authorization";
import { createLeadScreenV2, LEAD_SCREEN_CREATE_V2, leadScreenCreateCommandV2Schema } from "@/backend/modules/screen-forms";
import { parseScreenCommand, screenFormsRoute } from "@/backend/modules/screen-forms/presentation/screen-forms.route";

export async function GET(request:Request,{params}:{params:Promise<{workspaceId:string}>}){
  const requestId=crypto.randomUUID(),{workspaceId}=await params,{pool}=localDatabase();
  try{return leadIntakeJson(await listLeadSummariesV1(pool,await tenant(pool,request,workspaceId),parseLeadSummaryFiltersV1(new URL(request.url)),requestId))}
  catch(error){return leadIntakeFailure(error,requestId)}finally{await pool.end()}
}
export async function POST(request:Request,{params}:{params:Promise<{workspaceId:string}>}){
  const clone=request.clone(),candidate=await clone.json().catch(()=>null);
  if(candidate&&typeof candidate==="object"&&(candidate as {contractVersion?:unknown}).contractVersion===LEAD_SCREEN_CREATE_V2){
    const{workspaceId}=await params;
    return screenFormsRoute(request,workspaceId,({pool,actor,requestId,key,body})=>createLeadScreenV2(pool,{actor,requestId,key,command:parseScreenCommand(leadScreenCreateCommandV2Schema,body,LEAD_SCREEN_CREATE_V2)}),201,true);
  }
  const requestId=crypto.randomUUID(),blocked=mutationGuard(request);
  if(blocked)return leadIntakeFailure({code:"permission_required",status:403},requestId);
  const{workspaceId}=await params,{pool}=localDatabase();
  try{
    const context=await tenant(pool,request,workspaceId);
    await enforceManualIntakeRate(pool,request,context);
    const key=request.headers.get("idempotency-key");
    if(!key||key.length<16||key.length>128||[...key].some(character=>character<" "||character>"~"))throw new TenantAdminError("validation_failed",400);
    const body=await request.json().catch(()=>null);
    if(body&&typeof body==="object"&&"contractVersion" in body)
      return leadIntakeJson(await submitLeadInquiryV1(pool,{actor:context,command:body as LeadInquiryIntakeCommandV1,idempotencyKey:key,requestId}),201);
    const legacy=leadInputSchema.safeParse(body);
    if(!legacy.success)throw new TenantAdminError("validation_failed",400);
    const result=await submitLegacyManualLeadV1(pool,{actor:context,legacy:legacy.data,idempotencyKey:key,requestId});
    return leadIntakeJson({...result,id:result.leadId,version:result.leadVersion},201);
  }catch(error){return leadIntakeFailure(error,requestId)}finally{await pool.end()}
}
