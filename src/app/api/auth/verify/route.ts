import { z } from "zod";
import { getServerEnv } from "@/server/env";
import { identityConfig, localDatabase, mutationGuard, requestRiskContext } from "@/server/http";
import { privateIdentityJson, privateIdentityResponse } from "@/server/identity/http";
import { verifyEmailToken } from "@/server/identity/service";
import { clearIdentityTokenIntentCookie, identityTokenIntentFromRequest } from "@/server/identity/token-intent";

const input=z.object({token:z.string().min(20).max(200)});

export async function POST(request:Request){
  const rejected=mutationGuard(request);if(rejected)return privateIdentityResponse(rejected);
  const env=getServerEnv(),body=await request.json().catch(()=>null),intentToken=identityTokenIntentFromRequest(request,"email_verification",env.SESSION_SECRET),parsed=input.safeParse({token:intentToken??(body as{token?:unknown}|null)?.token});
  const terminal=(response:ReturnType<typeof privateIdentityJson>)=>{response.headers.set("Set-Cookie",clearIdentityTokenIntentCookie("email_verification",env.APP_ORIGIN.startsWith("https://")));return response};
  if(!parsed.success)return terminal(privateIdentityJson({ok:false,code:"invalid_or_expired"},{status:400}));
  const{pool}=localDatabase();
  try{const result=await verifyEmailToken(pool,parsed.data.token,identityConfig(),requestRiskContext(request));return terminal(privateIdentityJson(result,{status:result.ok?200:400}))}finally{await pool.end()}
}
