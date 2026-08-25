import { z } from "zod";
import { localDatabase, mutationGuard } from "@/server/http";
import { updateLead } from "@/server/crm/leads";
import { leadInputSchema } from "@/server/crm/http";
import { success, tenant } from "@/server/tenant-admin/http";
import { TenantAdminError } from "@/server/tenant-admin/permissions";
import { assertLegacyLeadPatchAllowedV1, getLeadDetailV1, leadIntakeFailure, leadIntakeJson } from "@/backend/modules/leads";

export async function GET(request:Request,{params}:{params:Promise<{workspaceId:string;leadId:string}>}){
  const requestId=crypto.randomUUID(),{workspaceId,leadId}=await params,{pool}=localDatabase();
  try{return leadIntakeJson(await getLeadDetailV1(pool,await tenant(pool,request,workspaceId),leadId,requestId))}
  catch(error){return leadIntakeFailure(error,requestId)}finally{await pool.end()}
}
export async function PATCH(request:Request,{params}:{params:Promise<{workspaceId:string;leadId:string}>}){const requestId=crypto.randomUUID(),blocked=mutationGuard(request);if(blocked)return blocked;const{workspaceId,leadId}=await params,{pool}=localDatabase();try{const actor=await tenant(pool,request,workspaceId);await assertLegacyLeadPatchAllowedV1(pool,actor,leadId);const parsed=leadInputSchema.extend({expectedVersion:z.number().int().positive()}).safeParse(await request.json().catch(()=>null));if(!parsed.success)throw new TenantAdminError("validation_failed",400);const{expectedVersion,...input}=parsed.data;return success(await updateLead(pool,actor,leadId,expectedVersion,input))}catch(error){return leadIntakeFailure(error,requestId)}finally{await pool.end()}}
