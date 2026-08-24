import { NextResponse } from "next/server";
import { getServerEnv } from "@/server/env";
import { identityTokenIntentCookie, sealIdentityTokenIntent } from "@/server/identity/token-intent";

export function GET(request:Request){
  const env=getServerEnv(),url=new URL(request.url),token=url.searchParams.get("token"),continuation=url.searchParams.get("next")==="/workspace/invitations/accept"?"/workspace/invitations/accept":undefined;
  const cleanRedirect=()=>{const response=NextResponse.redirect(new URL("/verify-email",env.APP_ORIGIN),303);response.headers.set("Cache-Control","private, no-store");response.headers.set("Referrer-Policy","no-referrer");return response};
  const response=cleanRedirect();
  if(token)try{response.headers.set("Set-Cookie",identityTokenIntentCookie("email_verification",sealIdentityTokenIntent("email_verification",token,env.SESSION_SECRET,Date.now(),continuation),env.APP_ORIGIN.startsWith("https://")))}catch{response.headers.set("Set-Cookie",identityTokenIntentCookie("email_verification","invalid",env.APP_ORIGIN.startsWith("https://")))}
  else response.headers.set("Set-Cookie",identityTokenIntentCookie("email_verification","invalid",env.APP_ORIGIN.startsWith("https://")));
  return response;
}
