import { localDatabase, mutationGuard } from "@/server/http";
import { createLead, listLeads } from "@/server/crm/leads";
import { leadInputSchema } from "@/server/crm/http";
import { failure, success, tenant } from "@/server/tenant-admin/http";
import { TenantAdminError } from "@/server/tenant-admin/permissions";

export async function GET(request:Request,{params}:{params:Promise<{workspaceId:string}>}){const{workspaceId}=await params,{pool}=localDatabase();try{return success(await listLeads(pool,await tenant(pool,request,workspaceId),new URL(request.url).searchParams.get("q")??""))}catch(error){return failure(error)}finally{await pool.end()}}
export async function POST(request:Request,{params}:{params:Promise<{workspaceId:string}>}){const blocked=mutationGuard(request);if(blocked)return blocked;const{workspaceId}=await params,{pool}=localDatabase();try{const parsed=leadInputSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)throw new TenantAdminError("validation_failed",400);return success(await createLead(pool,await tenant(pool,request,workspaceId),parsed.data),201)}catch(error){return failure(error)}finally{await pool.end()}}
