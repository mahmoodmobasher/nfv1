import { z } from "zod";
import { identityConfig, localDatabase, mutationGuard, requestRiskContext } from "@/server/http";
import { registerPasswordUser } from "@/server/identity/service";
import { meetsPasswordPolicy } from "@/shared/password-policy";
import { privateIdentityJson, privateIdentityResponse } from "@/server/identity/http";
import { resolveSelectedCommercialPlan } from "@/server/commercial/catalog";

const input = z.object({ email: z.string().email(), displayName: z.string().trim().min(1).max(120), password: z.string().refine(meetsPasswordPolicy),
  planCode: z.enum(["essentials", "growth", "scale"]).optional(), cadence: z.enum(["monthly", "annual"]).optional(), continuation:z.literal("/workspace/invitations/accept").optional() }).superRefine((value,context)=>{
  const hasPlan=value.planCode!==undefined||value.cadence!==undefined;
  if(value.continuation){if(hasPlan)context.addIssue({code:"custom",message:"invitation registration is planless"});}
  else if(!value.planCode||!value.cadence)context.addIssue({code:"custom",message:"a plan and cadence are required"});
});
export async function POST(request: Request) {
  const rejected = mutationGuard(request); if (rejected) return privateIdentityResponse(rejected);
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateIdentityJson({ ok: false, code: "invalid_request", message: "Check the submitted account details." }, { status: 400 });
  const { pool } = localDatabase();
  try {
    if(!parsed.data.continuation){
      try{await resolveSelectedCommercialPlan(pool,parsed.data.planCode,parsed.data.cadence)}
      catch{return privateIdentityJson({ok:false,code:"invalid_request",message:"Choose a currently available plan."},{status:400})}
    }
    return privateIdentityJson(await registerPasswordUser(pool, { ...parsed.data, riskKey: requestRiskContext(request), requestId: crypto.randomUUID() }, identityConfig()), { status: 202 });
  }
  finally { await pool.end(); }
}
