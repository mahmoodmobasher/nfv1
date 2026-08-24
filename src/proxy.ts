import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/server/env";
import {
  clearIdentityTokenIntentCookie,
  identityTokenIntentCookie,
  sealIdentityTokenIntent,
  type IdentityTokenIntentPurpose,
} from "@/server/identity/token-intent";
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

export type IdentityTokenCaptureEntry = Readonly<{
  purpose: IdentityTokenIntentPurpose;
  destination: "/verify-email" | "/reset-password";
}>;

export const IDENTITY_TOKEN_CAPTURE_ENTRIES = Object.freeze({
  "/verify-email/capture": Object.freeze({
    purpose: "email_verification",
    destination: "/verify-email",
  }),
  "/verify-email": Object.freeze({
    purpose: "email_verification",
    destination: "/verify-email",
  }),
  "/reset-password/capture": Object.freeze({
    purpose: "password_reset",
    destination: "/reset-password",
  }),
  "/reset-password": Object.freeze({
    purpose: "password_reset",
    destination: "/reset-password",
  }),
} satisfies Readonly<Record<string, IdentityTokenCaptureEntry>>);

export function identityTokenCaptureEntry(pathname: string): IdentityTokenCaptureEntry | null {
  return Object.prototype.hasOwnProperty.call(IDENTITY_TOKEN_CAPTURE_ENTRIES, pathname)
    ? IDENTITY_TOKEN_CAPTURE_ENTRIES[pathname as keyof typeof IDENTITY_TOKEN_CAPTURE_ENTRIES]
    : null;
}

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

function setCaptureSecurityHeaders(response: NextResponse, policy: string) {
  response.headers.set("Content-Security-Policy", policy);
  setProtectedTokenLifecycleHeaders(response.headers);
}

function cleanDestination(request: NextRequest, pathname: string) {
  const destination = request.nextUrl.clone();
  destination.pathname = pathname;
  destination.search = "";
  destination.hash = "";
  return destination;
}

function unsupportedCaptureMethod(policy: string) {
  const response = new NextResponse(null, { status: 405 });
  response.headers.set("Allow", "GET, HEAD");
  setCaptureSecurityHeaders(response, policy);
  return response;
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", policy);
  const identityCapture = identityTokenCaptureEntry(request.nextUrl.pathname);
  if (identityCapture && request.nextUrl.searchParams.has("token")) {
    const env = getServerEnv();
    const secure = env.APP_ORIGIN.startsWith("https://");
    const tokenValues = request.nextUrl.searchParams.getAll("token");
    const capture = request.method === "GET" || request.method === "HEAD"
      ? NextResponse.redirect(cleanDestination(request, identityCapture.destination), 303)
      : unsupportedCaptureMethod(policy);

    if (request.method === "GET" && tokenValues.length === 1) {
      const continuation = identityCapture.purpose === "email_verification"
        && request.nextUrl.searchParams.get("next") === "/workspace/invitations/accept"
        ? "/workspace/invitations/accept"
        : undefined;
      try {
        capture.headers.set(
          "Set-Cookie",
          identityTokenIntentCookie(
            identityCapture.purpose,
            sealIdentityTokenIntent(
              identityCapture.purpose,
              tokenValues[0],
              env.SESSION_SECRET,
              Date.now(),
              continuation,
            ),
            secure,
          ),
        );
      } catch {
        capture.headers.set(
          "Set-Cookie",
          clearIdentityTokenIntentCookie(identityCapture.purpose, secure),
        );
      }
    } else {
      capture.headers.set(
        "Set-Cookie",
        clearIdentityTokenIntentCookie(identityCapture.purpose, secure),
      );
    }
    setCaptureSecurityHeaders(capture, policy);
    return capture;
  }
  const invitationDocument = request.nextUrl.pathname === "/workspace/invitations/accept";
  const invitationToken = invitationDocument
    ? request.nextUrl.searchParams.get("token")
    : null;
  if (invitationDocument && invitationToken !== null) {
    const env = getServerEnv();
    const tokenValues = request.nextUrl.searchParams.getAll("token");
    const capture = request.method === "GET" || request.method === "HEAD"
      ? NextResponse.redirect(cleanDestination(request, "/workspace/invitations/accept"), 303)
      : unsupportedCaptureMethod(policy);
    const secure = env.APP_ORIGIN.startsWith("https://");
    try {
      if (request.method !== "GET" || tokenValues.length !== 1)
        throw new Error("invalid_invitation_capture_method_or_token");
      capture.headers.set(
        "Set-Cookie",
        invitationIntentCookie(
          sealInvitationIntent(tokenValues[0], env.SESSION_SECRET),
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
    setCaptureSecurityHeaders(capture, policy);
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
  matcher: [{ source: "/((?!api|_next/static|_next/image|favicon.ico).*)" }],
};
