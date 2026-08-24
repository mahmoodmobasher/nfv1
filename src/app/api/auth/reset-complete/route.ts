import { z } from "zod";
import { getServerEnv } from "@/server/env";
import { identityConfig, localDatabase, mutationGuard, requestRiskContext } from "@/server/http";
import { privateIdentityJson, privateIdentityResponse } from "@/server/identity/http";
import { completePasswordReset } from "@/server/identity/service";
import { clearIdentityTokenIntentCookie, identityTokenIntentFromRequest } from "@/server/identity/token-intent";
import { consumeRateLimitDimensions } from "@/server/security/rate-limit";
import { meetsPasswordPolicy } from "@/shared/password-policy";

const input=z.object({token:z.string().min(20).max(200),password:z.string().refine(meetsPasswordPolicy)});

export async function POST(request:Request){
  const rejected=mutationGuard(request);if(rejected)return privateIdentityResponse(rejected);
  const env=getServerEnv(),body=await request.json().catch(()=>null),submitted=body&&typeof body==="object"?body as Record<string,unknown>:{},intentToken=identityTokenIntentFromRequest(request,"password_reset",env.SESSION_SECRET),parsed=input.safeParse({...submitted,token:intentToken??submitted.token});
  const terminal=(response:ReturnType<typeof privateIdentityJson>)=>{response.headers.set("Set-Cookie",clearIdentityTokenIntentCookie("password_reset",env.APP_ORIGIN.startsWith("https://")));return response};
  if(!parsed.success)return terminal(privateIdentityJson({ok:false,code:"invalid_or_expired"},{status:400}));
  const{pool}=localDatabase(),config=identityConfig(),risk=requestRiskContext(request);
  try{
    if(!await consumeRateLimitDimensions(pool,[{action:"reset_complete",riskKey:`network:${risk.networkKey}`,limit:5,windowSeconds:3600,secret:config.secret},{action:"reset_complete",riskKey:`subject:${parsed.data.token.slice(0,16)}`,limit:5,windowSeconds:3600,secret:config.secret}]))return terminal(privateIdentityJson({ok:false,code:"invalid_or_expired"},{status:400}));
    const result=await completePasswordReset(pool,parsed.data.token,parsed.data.password,config);return terminal(privateIdentityJson(result,{status:result.ok?200:400}));
  }finally{await pool.end()}
}
