import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/server/env";
import { identityTokenIntentCookie, sealIdentityTokenIntent, type IdentityTokenIntentPurpose } from "@/server/identity/token-intent";

export const DEFAULT_SESSION_COOKIE = "nexaflow_session";

export function configuredSessionCookieName(environment: NodeJS.ProcessEnv = process.env) {
  return environment.SESSION_COOKIE_NAME?.trim() || DEFAULT_SESSION_COOKIE;
}

export function contentSecurityPolicy(nonce: string, development = process.env.NODE_ENV === "development") {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self'${development ? " 'unsafe-inline'" : ` 'nonce-${nonce}'`}`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${development ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", policy);
  const capturePurpose:IdentityTokenIntentPurpose|null=request.nextUrl.pathname==="/verify-email"?"email_verification":request.nextUrl.pathname==="/reset-password"?"password_reset":null;
  const rawToken=capturePurpose?request.nextUrl.searchParams.get("token"):null;
  if(capturePurpose&&rawToken!==null){
    const env=getServerEnv(),destination=request.nextUrl.clone(),continuation=capturePurpose==="email_verification"&&request.nextUrl.searchParams.get("next")==="/workspace/invitations/accept"?"/workspace/invitations/accept":null;
    destination.search="";
    const capture=NextResponse.redirect(destination,303);
    try{capture.headers.set("Set-Cookie",identityTokenIntentCookie(capturePurpose,sealIdentityTokenIntent(capturePurpose,rawToken,env.SESSION_SECRET,Date.now(),continuation??undefined),env.APP_ORIGIN.startsWith("https://")))}catch{capture.headers.set("Set-Cookie",identityTokenIntentCookie(capturePurpose,"invalid",env.APP_ORIGIN.startsWith("https://")))}
    capture.headers.set("Content-Security-Policy",policy);capture.headers.set("Cache-Control","private, no-store");capture.headers.set("Referrer-Policy","no-referrer");return capture;
  }
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  const tokenDocument = ["/verify-email", "/verify-email/capture", "/reset-password", "/reset-password/capture", "/workspace/invitations/accept"].includes(request.nextUrl.pathname);
  if (request.cookies.has(configuredSessionCookieName()) || tokenDocument) response.headers.set("Cache-Control", "private, no-store");
  if (tokenDocument) response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export const config = {
  matcher: [{
    source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
    missing: [
      { type: "header", key: "next-router-prefetch" },
      { type: "header", key: "purpose", value: "prefetch" },
    ],
  }],
};
