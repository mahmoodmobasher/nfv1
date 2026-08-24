import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET as clearTerminalInvitation } from "../src/app/workspace/invitations/accept/terminal/route";
import { POST as retiredClientCapture } from "../src/app/workspace/invitations/accept/intent/route";
import { proxy } from "../src/proxy";
import { INVITATION_ACCEPT_DESTINATION, INVITATION_INTENT_COOKIE, INVITATION_INTENT_PATH, INVITATION_RETURN_COOKIE, INVITATION_RETURN_PATH, clearInvitationIntentCookie, hasValidInvitationReturn, invitationContinuation, invitationIntentCookie, invitationIntentFromRequest, invitationReturnCookie, openInvitationIntent, sealInvitationIntent, sealInvitationReturn } from "../src/server/invitations/intent";

const secret = "phase-four-invitation-test-secret-32-characters";
const token = "invitation-token-value-that-is-long-enough-123456";

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

  it("fails malformed intent and return cookies closed without throwing", () => {
    const malformedIntent = new Request(`http://127.0.0.1:3000${INVITATION_ACCEPT_DESTINATION}`, {
      headers: { cookie: `${INVITATION_INTENT_COOKIE}=%E0%A4%A` },
    });
    const malformedReturn = new Request("http://127.0.0.1:3000/api/auth/login", {
      headers: { cookie: `${INVITATION_RETURN_COOKIE}=%E0%A4%A` },
    });
    expect(() => invitationIntentFromRequest(malformedIntent, secret)).not.toThrow();
    expect(invitationIntentFromRequest(malformedIntent, secret)).toBeNull();
    expect(() => hasValidInvitationReturn(malformedReturn, secret)).not.toThrow();
    expect(hasValidInvitationReturn(malformedReturn, secret)).toBe(false);
  });

  it("captures the exact invitation document before rendering and never reflects raw or encoded tokens", async () => {
    const encoded = encodeURIComponent(token);
    const previousOrigin = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = "https://app.nexaflowsystems.com";
    const response = proxy(new NextRequest(`https://app.nexaflowsystems.com/workspace/invitations/accept?token=${encoded}`));
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
    const body = await response.text();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.nexaflowsystems.com/workspace/invitations/accept");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("set-cookie")).toContain(`${INVITATION_INTENT_COOKIE}=`);
    expect(response.headers.get("set-cookie")).toContain(`${INVITATION_RETURN_COOKIE}=`);
    expect(response.headers.get("set-cookie")).toContain(`Path=${INVITATION_INTENT_PATH}`);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=900");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    for (const output of [body, response.headers.get("location") ?? "", response.headers.get("set-cookie") ?? ""]) {
      expect(output).not.toContain(token);
      expect(output).not.toContain(encoded);
    }
  });

  it("replaces stale authority for empty or malformed capture and ignores non-exact routes", () => {
    for (const suffix of ["?token=", "?token=short"]) {
      const response = proxy(new NextRequest(`https://app.nexaflowsystems.com/workspace/invitations/accept${suffix}`, { headers: { cookie: `${INVITATION_INTENT_COOKIE}=stale-valid-authority` } }));
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("https://app.nexaflowsystems.com/workspace/invitations/accept");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("set-cookie")).toContain(`${INVITATION_INTENT_COOKIE}=`);
      expect(response.headers.get("set-cookie")).toContain(`${INVITATION_RETURN_COOKIE}=`);
      expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    }
    const outside = proxy(new NextRequest(`https://app.nexaflowsystems.com/workspace/invitations/accept/extra?token=${token}`));
    expect(outside.status).toBe(200);
    expect(outside.headers.has("location")).toBe(false);
    expect(outside.headers.has("set-cookie")).toBe(false);
  });

  it("keeps the former post-render capture endpoint fail-closed and token-free", async () => {
    const response = retiredClientCapture();
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.text()).not.toContain(token);
    expect(response.headers.has("set-cookie")).toBe(false);
  });

  it("clears terminal server-owned authority with an exact private redirect", () => {
    const response = clearTerminalInvitation(new Request("https://app.nexaflowsystems.com/workspace/invitations/accept/terminal"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.nexaflowsystems.com/workspace/invitations/accept");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("set-cookie")).toContain(`${INVITATION_INTENT_COOKIE}=`);
    expect(response.headers.get("set-cookie")).toContain(`${INVITATION_RETURN_COOKIE}=`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("separates the non-persistent preview from operational Admin/Member acceptance", () => {
    const preview = readFileSync(new URL("../src/app/invite/preview-client.tsx", import.meta.url), "utf8"), acceptance = readFileSync(new URL("../src/app/workspace/invitations/accept/accept-client.tsx", import.meta.url), "utf8");
    expect(preview).toContain("Nothing on this page sends email, reserves seats, creates Memberships, assigns Roles, or writes Audit events.");
    expect(preview).toContain("This preview did not send email or create Memberships.");
    expect(preview).toContain("<option>Member</option><option>Admin</option>");
    expect(preview).not.toMatch(/sessionStorage|localStorage|<option>Owner<\/option>/);
    expect(acceptance).toContain('href="/login?next=/workspace/invitations/accept"');
    expect(acceptance).toContain('securePost<Envelope>("/workspace/invitations/accept/complete", {}');
    expect(acceptance).not.toMatch(/InvitationIntentCapture|replaceState|sessionStorage|localStorage|token=[${]/);
    const api=readFileSync(new URL("../src/app/api/invitations/accept/route.ts",import.meta.url),"utf8");
    expect(api).toContain('pathname==="/api/invitations/accept"');
    expect(api).toContain("intentToken??(directApi?");
    const page=readFileSync(new URL("../src/app/workspace/invitations/accept/page.tsx",import.meta.url),"utf8");
    expect(page).not.toMatch(/searchParams|queryToken|InvitationIntentCapture/);
    const login=readFileSync(new URL("../src/app/api/auth/login/route.ts",import.meta.url),"utf8"),forms=readFileSync(new URL("../src/app/onboarding/forms.tsx",import.meta.url),"utf8");
    expect(login).toContain("hasValidInvitationReturn(request,env.SESSION_SECRET)");
    expect(forms).toContain('params.get("next")==="/workspace/invitations/accept"');
  });
});
