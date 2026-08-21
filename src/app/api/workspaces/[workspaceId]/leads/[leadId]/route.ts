import { z } from "zod";
import { localDatabase, mutationGuard } from "@/server/http";
import { getLead, updateLead } from "@/server/crm/leads";
import { leadInputSchema } from "@/server/crm/http";
import { failure, success, tenant } from "@/server/tenant-admin/http";
import { TenantAdminError } from "@/server/tenant-admin/permissions";

export async function GET(request:Request,{params}:{params:Promise<{workspaceId:string;leadId:string}>}){const{workspaceId,leadId}=await params,{pool}=localDatabase();try{return success(await getLead(pool,await tenant(pool,request,workspaceId),leadId))}catch(error){return failure(error)}finally{await pool.end()}}
export async function PATCH(request:Request,{params}:{params:Promise<{workspaceId:string;leadId:string}>}){const blocked=mutationGuard(request);if(blocked)return blocked;const{workspaceId,leadId}=await params,{pool}=localDatabase();try{const parsed=leadInputSchema.extend({expectedVersion:z.number().int().positive()}).safeParse(await request.json().catch(()=>null));if(!parsed.success)throw new TenantAdminError("validation_failed",400);const{expectedVersion,...input}=parsed.data;return success(await updateLead(pool,await tenant(pool,request,workspaceId),leadId,expectedVersion,input))}catch(error){return failure(error)}finally{await pool.end()}}
