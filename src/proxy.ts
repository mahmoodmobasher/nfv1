import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/server/env";
import { identityTokenIntentCookie, sealIdentityTokenIntent, type IdentityTokenIntentPurpose } from "@/server/identity/token-intent";
import {
  clearInvitationIntentCookie,
  clearInvitationReturnCookie,
  invitationIntentCookie,
  invitationReturnCookie,
  openInvitationIntent,
  sealInvitationIntent,
  sealInvitationReturn,
  INVITATION_INTENT_COOKIE,
} from "@/server/invitations/intent";

export const DEFAULT_SESSION_COOKIE = "nexaflow_session";

export const PROTECTED_TOKEN_LIFECYCLE_PATHS = Object.freeze([
  "/verify-email",
  "/verify-email/capture",
  "/verify-email/complete",
  "/reset-password",
  "/reset-password/capture",
  "/reset-password/complete",
  "/workspace/invitations/accept",
  "/workspace/invitations/accept/complete",
  "/workspace/invitations/accept/intent",
  "/workspace/invitations/accept/intent/clear",
  "/workspace/invitations/accept/terminal",
] as const);

const protectedTokenLifecyclePathSet: ReadonlySet<string> = new Set(
  PROTECTED_TOKEN_LIFECYCLE_PATHS,
);

export function isProtectedTokenLifecyclePath(pathname: string) {
  return protectedTokenLifecyclePathSet.has(pathname);
}

export function setProtectedTokenLifecycleHeaders(headers: Headers) {
  headers.set("Cache-Control", "private, no-store");
  headers.set("Referrer-Policy", "no-referrer");
}

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
    capture.headers.set("Content-Security-Policy",policy);setProtectedTokenLifecycleHeaders(capture.headers);return capture;
  }
  const invitationDocument = request.nextUrl.pathname === "/workspace/invitations/accept";
  const invitationToken = invitationDocument
    ? request.nextUrl.searchParams.get("token")
    : null;
  if (invitationDocument && invitationToken !== null) {
    const env = getServerEnv();
    const destination = request.nextUrl.clone();
    destination.search = "";
    const capture = NextResponse.redirect(destination, 303);
    const secure = env.APP_ORIGIN.startsWith("https://");
    try {
      capture.headers.set(
        "Set-Cookie",
        invitationIntentCookie(
          sealInvitationIntent(invitationToken, env.SESSION_SECRET),
          secure,
        ),
      );
      capture.headers.append(
        "Set-Cookie",
        invitationReturnCookie(sealInvitationReturn(env.SESSION_SECRET), secure),
      );
    } catch {
      // Invalid input must replace any stale valid authority before the clean page renders.
      capture.headers.set("Set-Cookie", clearInvitationIntentCookie(secure));
      capture.headers.append("Set-Cookie", clearInvitationReturnCookie(secure));
    }
    capture.headers.set("Content-Security-Policy", policy);
    setProtectedTokenLifecycleHeaders(capture.headers);
    return capture;
  }
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  const protectedTokenLifecycle = isProtectedTokenLifecyclePath(
    request.nextUrl.pathname,
  );
  if (request.cookies.has(configuredSessionCookieName()))
    response.headers.set("Cache-Control", "private, no-store");
  if (protectedTokenLifecycle)
    setProtectedTokenLifecycleHeaders(response.headers);
  if (invitationDocument) {
    const env = getServerEnv();
    const value = request.cookies.get(INVITATION_INTENT_COOKIE)?.value;
    if (value && !openInvitationIntent(value, env.SESSION_SECRET)) {
      const secure = env.APP_ORIGIN.startsWith("https://");
      response.headers.set("Set-Cookie", clearInvitationIntentCookie(secure));
      response.headers.append("Set-Cookie", clearInvitationReturnCookie(secure));
    }
  }
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
