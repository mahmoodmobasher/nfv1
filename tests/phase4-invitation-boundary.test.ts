import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { POST as captureInvitationIntent } from "../src/app/workspace/invitations/accept/intent/route";
import { INVITATION_ACCEPT_DESTINATION, INVITATION_INTENT_COOKIE, INVITATION_INTENT_PATH, INVITATION_RETURN_COOKIE, INVITATION_RETURN_PATH, clearInvitationIntentCookie, hasValidInvitationReturn, invitationContinuation, invitationIntentCookie, invitationReturnCookie, openInvitationIntent, sealInvitationIntent, sealInvitationReturn } from "../src/server/invitations/intent";

const secret = "phase-four-invitation-test-secret-32-characters";
const token = "invitation-token-value-that-is-long-enough-123456";
const headers = { origin: "http://127.0.0.1:3000", cookie: "nexaflow_csrf=csrf-token", "x-csrf-token": "csrf-token", "content-type": "application/json" };

describe("Phase 4 invitation privacy and presentation boundary", () => {
  it("seals a short-lived purpose-bound invitation intent without exposing its token", () => {
    const now = Date.now(), sealed = sealInvitationIntent(token, secret, now);
    expect(sealed).not.toContain(token);
    expect(openInvitationIntent(sealed, secret, now + 14 * 60_000)).toBe(token);
    expect(openInvitationIntent(sealed, secret, now + 16 * 60_000)).toBeNull();
    expect(openInvitationIntent(sealed, "wrong-secret-that-is-also-long-enough")).toBeNull();
  });

  it("scopes the encrypted browser handoff to the acceptance route and clears exactly that cookie", () => {
    const persistent = invitationIntentCookie("sealed-value", true), cleared = clearInvitationIntentCookie(true);
    for (const value of [persistent, cleared]) {
      expect(value).toContain(`${INVITATION_INTENT_COOKIE}=`);
      expect(value).toContain(`Path=${INVITATION_INTENT_PATH}`);
      expect(value).toContain("HttpOnly");
      expect(value).toContain("SameSite=Lax");
      expect(value).toContain("; Secure");
    }
    expect(persistent).toContain("Max-Age=900");
    expect(cleared).toContain("Max-Age=0");
  });

  it("allows only the exact token-free return path when a server-owned marker is valid", () => {
    const now=Date.now(),marker=sealInvitationReturn(secret,now),request=new Request("http://127.0.0.1:3000/api/auth/login",{headers:{cookie:`${INVITATION_RETURN_COOKIE}=${encodeURIComponent(marker)}`}}),cookie=invitationReturnCookie(marker,true);
    expect(marker).not.toContain(token);
    expect(hasValidInvitationReturn(request,secret,now+14*60_000)).toBe(true);
    expect(hasValidInvitationReturn(request,secret,now+16*60_000)).toBe(false);
    expect(invitationContinuation(INVITATION_ACCEPT_DESTINATION)).toBe(INVITATION_ACCEPT_DESTINATION);
    for(const value of ["//attacker.invalid","https://attacker.invalid","/%2f%2fattacker.invalid","/workspace/invitations/accept?token=raw","/login"])expect(invitationContinuation(value),value).toBeNull();
    expect(cookie).toContain(`Path=${INVITATION_RETURN_PATH}`);
    expect(cookie).toContain("HttpOnly");
  });

  it("captures through same-origin CSRF, returns private no-store, and never reflects the raw token", async () => {
    const response = await captureInvitationIntent(new Request("http://127.0.0.1:3000/workspace/invitations/accept/intent", { method: "POST", headers, body: JSON.stringify({ token }) }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("set-cookie")).toContain(`${INVITATION_INTENT_COOKIE}=`);
    expect(response.headers.get("set-cookie")).toContain(`${INVITATION_RETURN_COOKIE}=`);
    expect(response.headers.get("set-cookie")).not.toContain(token);
    expect(await response.json()).toEqual({ captured: true });
  });

  it("keeps invalid and cross-origin capture outcomes private and cookie-free", async () => {
    const invalid = await captureInvitationIntent(new Request("http://127.0.0.1:3000/workspace/invitations/accept/intent", { method: "POST", headers, body: JSON.stringify({ token: "short" }) }));
    const crossOrigin = await captureInvitationIntent(new Request("http://127.0.0.1:3000/workspace/invitations/accept/intent", { method: "POST", headers: { ...headers, origin: "https://attacker.invalid" }, body: JSON.stringify({ token }) }));
    expect([invalid.status, crossOrigin.status]).toEqual([400, 403]);
    for (const response of [invalid, crossOrigin]) {
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.has("set-cookie")).toBe(false);
    }
  });

  it("separates the non-persistent preview from operational Admin/Member acceptance", () => {
    const preview = readFileSync(new URL("../src/app/invite/preview-client.tsx", import.meta.url), "utf8"), acceptance = readFileSync(new URL("../src/app/workspace/invitations/accept/accept-client.tsx", import.meta.url), "utf8");
    expect(preview).toContain("Nothing on this page sends email, reserves seats, creates Memberships, assigns Roles, or writes Audit events.");
    expect(preview).toContain("This preview did not send email or create Memberships.");
    expect(preview).toContain("<option>Member</option><option>Admin</option>");
    expect(preview).not.toMatch(/sessionStorage|localStorage|<option>Owner<\/option>/);
    expect(acceptance).toContain('replaceState(null, "", "/workspace/invitations/accept")');
    expect(acceptance).toContain('href="/login?next=/workspace/invitations/accept"');
    expect(acceptance).toContain('securePost<Envelope>("/workspace/invitations/accept/complete", {}');
    expect(acceptance).not.toMatch(/sessionStorage|localStorage|token=[${]/);
    const login=readFileSync(new URL("../src/app/api/auth/login/route.ts",import.meta.url),"utf8"),forms=readFileSync(new URL("../src/app/onboarding/forms.tsx",import.meta.url),"utf8");
    expect(login).toContain("hasValidInvitationReturn(request,env.SESSION_SECRET)");
    expect(forms).toContain('params.get("next")==="/workspace/invitations/accept"');
  });
});
