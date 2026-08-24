import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { configuredSessionCookieName, contentSecurityPolicy, proxy } from "../src/proxy";

describe("design-system document boundary", () => {
  it("publishes one Spectrum semantic contract with explicit compatibility aliases", () => {
    const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
    for (const token of ["canvas", "surface-primary", "surface-secondary", "surface-raised", "surface-navigation", "surface-overlay", "text-strong", "text", "text-muted", "text-disabled", "border-subtle", "border-strong", "action-primary", "action-primary-hover", "action-primary-pressed", "action-primary-text", "selected-surface", "selected-text", "link", "focus", "blanket"]) {
      expect(css, token).toContain(`--nx-${token}:`);
    }
    for (const alias of ["--nf-canvas: var(--nx-canvas)", "--nf-surface-1: var(--nx-surface-primary)", "--nf-surface-2: var(--nx-surface-secondary)", "--nf-text: var(--nx-text)", "--nf-brand: var(--nx-action-primary)", "--background: var(--nf-canvas)", "--primary: var(--nf-brand)", "--ring: var(--nf-focus)"]) {
      expect(css, alias).toContain(alias);
    }
  });

  it("keeps Phase 2 components on semantic tokens without raw colour literals", () => {
    for (const file of ["../src/app/product-shell.tsx", "../src/app/crm/crm-shell.tsx", "../src/app/workspace/settings/admin-shell.tsx"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source, file).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
      expect(source, file).not.toMatch(/--(?:spectrum-(?:brand|neutral)|nf-(?:surface-[12]|brand|text(?:-strong|-muted)?))\b/);
    }
  });

  it("does not expose unsupported shell search, Create, or future destinations", () => {
    const source = readFileSync(new URL("../src/app/product-shell.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/product-global-search|Search leads|>Create<|Companies|Deals|Automation|Delivery/);
  });
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
