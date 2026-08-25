import { listLeadPipelineStagesV1, leadIntakeFailure, leadIntakeJson } from "@/backend/modules/leads";
import { localDatabase } from "@/server/http";
import { tenant } from "@/server/tenant-admin/http";

export async function GET(request:Request,{params}:{params:Promise<{workspaceId:string}>}){
  const requestId=crypto.randomUUID(),{workspaceId}=await params,{pool}=localDatabase();
  try{return leadIntakeJson(await listLeadPipelineStagesV1(pool,await tenant(pool,request,workspaceId),requestId))}
  catch(error){return leadIntakeFailure(error,requestId)}finally{await pool.end()}
}
