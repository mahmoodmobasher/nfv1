import { NextResponse } from "next/server";
import { getServerEnv } from "@/server/env";
import { identityTokenIntentCookie, sealIdentityTokenIntent } from "@/server/identity/token-intent";

export function GET(request:Request){
  const env=getServerEnv(),token=new URL(request.url).searchParams.get("token");
  const cleanRedirect=()=>{const response=NextResponse.redirect(new URL("/reset-password",env.APP_ORIGIN),303);response.headers.set("Cache-Control","private, no-store");response.headers.set("Referrer-Policy","no-referrer");return response};
  const response=cleanRedirect();
  if(token)try{response.headers.set("Set-Cookie",identityTokenIntentCookie("password_reset",sealIdentityTokenIntent("password_reset",token,env.SESSION_SECRET),env.APP_ORIGIN.startsWith("https://")))}catch{response.headers.set("Set-Cookie",identityTokenIntentCookie("password_reset","invalid",env.APP_ORIGIN.startsWith("https://")))}
  else response.headers.set("Set-Cookie",identityTokenIntentCookie("password_reset","invalid",env.APP_ORIGIN.startsWith("https://")));
  return response;
}
