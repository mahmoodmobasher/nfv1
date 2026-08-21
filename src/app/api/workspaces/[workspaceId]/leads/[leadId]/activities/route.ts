import { z } from "zod";
import { localDatabase, mutationGuard } from "@/server/http";
import { addLeadNote } from "@/server/crm/leads";
import { failure, success, tenant } from "@/server/tenant-admin/http";
import { TenantAdminError } from "@/server/tenant-admin/permissions";

export async function POST(request:Request,{params}:{params:Promise<{workspaceId:string;leadId:string}>}){const blocked=mutationGuard(request);if(blocked)return blocked;const{workspaceId,leadId}=await params,{pool}=localDatabase();try{const parsed=z.object({body:z.string().trim().min(1).max(4000)}).safeParse(await request.json().catch(()=>null));if(!parsed.success)throw new TenantAdminError("validation_failed",400);return success(await addLeadNote(pool,await tenant(pool,request,workspaceId),leadId,parsed.data.body),201)}catch(error){return failure(error)}finally{await pool.end()}}
