import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { configuredSessionCookieName, contentSecurityPolicy, proxy } from "../src/proxy";

describe("design-system document boundary", () => {
  it("uses the configured Session cookie and preserves CSP for stale or invalid values", () => {
    const prior = process.env.SESSION_COOKIE_NAME;
    process.env.SESSION_COOKIE_NAME = "uat_session_cookie";
    try {
      const response = proxy(new NextRequest("https://app.nexaflowsystems.com/future-authenticated-route", {
        headers: { cookie: "uat_session_cookie=stale-or-invalid" },
      }));
      const nonce = response.headers.get("x-middleware-request-x-nonce");
      const forwarded = response.headers.get("x-middleware-request-content-security-policy");
      expect(configuredSessionCookieName()).toBe("uat_session_cookie");
      expect(nonce).toBeTruthy();
      expect(forwarded).toContain(`'nonce-${nonce}'`);
      expect(response.headers.get("content-security-policy")).toBe(forwarded);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    } finally {
      if (prior === undefined) delete process.env.SESSION_COOKIE_NAME;
      else process.env.SESSION_COOKIE_NAME = prior;
    }
  });

  it("does not mark an anonymous document private or disclose Session validity", () => {
    const response = proxy(new NextRequest("https://app.nexaflowsystems.com/login"));
    expect(response.headers.has("cache-control")).toBe(false);
    expect(response.headers.get("content-security-policy")).toContain("'nonce-");
    expect([...response.headers.keys()].some(name => /session|authenticated/i.test(name))).toBe(false);
  });

  it("retains the default and production nonce contract", () => {
    expect(configuredSessionCookieName({} as NodeJS.ProcessEnv)).toBe("nexaflow_session");
    const policy = contentSecurityPolicy("boundary-nonce", false);
    expect(policy).toContain("'nonce-boundary-nonce'");
    expect(policy).not.toMatch(/unsafe-inline|unsafe-eval/);
  });
});
