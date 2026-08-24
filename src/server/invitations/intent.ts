import { decryptEnvelope, encryptEnvelope } from "@/server/security/crypto";
import { parseCookies } from "@/server/security/request";

export const INVITATION_INTENT_COOKIE = "nexaflow_invitation_intent";
export const INVITATION_INTENT_MAX_AGE_SECONDS = 15 * 60;
export const INVITATION_INTENT_PATH = "/workspace/invitations/accept";
export const INVITATION_RETURN_COOKIE = "nexaflow_invitation_return";
export const INVITATION_RETURN_PATH = "/api/auth/login";
export const INVITATION_ACCEPT_DESTINATION = "/workspace/invitations/accept";

type InvitationIntentEnvelope = {
  purpose: "workspace_invitation_accept";
  token: string;
  expiresAt: number;
};

const validToken = (value: string) => value.length >= 32 && value.length <= 128;

export function sealInvitationIntent(token: string, secret: string, now = Date.now()): string {
  if (!validToken(token)) throw new Error("invalid_invitation_intent");
  return encryptEnvelope({ purpose: "workspace_invitation_accept", token, expiresAt: now + INVITATION_INTENT_MAX_AGE_SECONDS * 1000 } satisfies InvitationIntentEnvelope, secret);
}

export function openInvitationIntent(value: string | undefined, secret: string, now = Date.now()): string | null {
  if (!value) return null;
  try {
    const intent = decryptEnvelope<InvitationIntentEnvelope>(value, secret);
    return intent.purpose === "workspace_invitation_accept" && validToken(intent.token) && intent.expiresAt > now ? intent.token : null;
  } catch {
    return null;
  }
}

export function invitationIntentFromRequest(request: Request, secret: string): string | null {
  return openInvitationIntent(parseCookies(request.headers.get("cookie"))[INVITATION_INTENT_COOKIE], secret);
}

export function invitationIntentCookie(value: string, secure: boolean, maxAge = INVITATION_INTENT_MAX_AGE_SECONDS): string {
  return `${INVITATION_INTENT_COOKIE}=${encodeURIComponent(value)}; Path=${INVITATION_INTENT_PATH}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function clearInvitationIntentCookie(secure: boolean): string {
  return invitationIntentCookie("", secure, 0);
}

type InvitationReturnEnvelope = { purpose: "workspace_invitation_return"; expiresAt: number };

export function sealInvitationReturn(secret: string, now = Date.now()): string {
  return encryptEnvelope({ purpose: "workspace_invitation_return", expiresAt: now + INVITATION_INTENT_MAX_AGE_SECONDS * 1000 } satisfies InvitationReturnEnvelope, secret);
}

export function hasValidInvitationReturn(request: Request, secret: string, now = Date.now()): boolean {
  const value = parseCookies(request.headers.get("cookie"))[INVITATION_RETURN_COOKIE];
  if (!value) return false;
  try {
    const intent = decryptEnvelope<InvitationReturnEnvelope>(value, secret);
    return intent.purpose === "workspace_invitation_return" && intent.expiresAt > now;
  } catch {
    return false;
  }
}

export function invitationReturnCookie(value: string, secure: boolean, maxAge = INVITATION_INTENT_MAX_AGE_SECONDS): string {
  return `${INVITATION_RETURN_COOKIE}=${encodeURIComponent(value)}; Path=${INVITATION_RETURN_PATH}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function clearInvitationReturnCookie(secure: boolean): string {
  return invitationReturnCookie("", secure, 0);
}

export function invitationContinuation(value: unknown): typeof INVITATION_ACCEPT_DESTINATION | null {
  return value === INVITATION_ACCEPT_DESTINATION ? INVITATION_ACCEPT_DESTINATION : null;
}
