import { localDatabase, mutationGuard } from "@/server/http";
import { tenant } from "@/server/tenant-admin/http";
import { getIdentityReviewCandidatesV1, identityReviewDecisionCommandV1Schema } from "@/backend/modules/identity-review";
import { decideLeadIdentityReviewV1, leadIntakeFailure, leadIntakeJson } from "@/backend/modules/leads";
import { enforceManualIntakeRate } from "@/backend/platform/authorization";

type Context={params:Promise<{workspaceId:string;leadId:string}>};

export async function GET(request:Request,{params}:Context){
  const{workspaceId,leadId}=await params,{pool}=localDatabase(),requestId=crypto.randomUUID();
  try{return leadIntakeJson(await getIdentityReviewCandidatesV1(pool,await tenant(pool,request,workspaceId),leadId))}
  catch(error){return leadIntakeFailure(error,requestId)}finally{await pool.end()}
}

export async function POST(request:Request,{params}:Context){
  const blocked=mutationGuard(request);if(blocked)return blocked;
  const{workspaceId,leadId}=await params,{pool}=localDatabase(),requestId=crypto.randomUUID();
  try{
    const context=await tenant(pool,request,workspaceId);await enforceManualIntakeRate(pool,request,context);
    const key=request.headers.get("idempotency-key");if(!key||key.length<16||key.length>128||!/^\x20-\x7e+$/.test(key))throw Object.assign(new Error("validation_failed"),{code:"validation_failed",status:400});
    const body=await request.json().catch(()=>null);
    if(body&&typeof body==="object"&&"contractVersion" in body&&body.contractVersion!=="lead-identity-review-decision.v1")
      throw Object.assign(new Error("unsupported_contract_version"),{code:"unsupported_contract_version",status:400});
    const parsed=identityReviewDecisionCommandV1Schema.safeParse(body);
    if(!parsed.success)throw Object.assign(new Error("validation_failed"),{code:"validation_failed",status:400});
    return leadIntakeJson(await decideLeadIdentityReviewV1(pool,{actor:context,leadId,command:parsed.data,idempotencyKey:key,requestId}));
  }catch(error){return leadIntakeFailure(error,requestId)}finally{await pool.end()}
}
