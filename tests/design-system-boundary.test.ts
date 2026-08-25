import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import {
  configuredSessionCookieName,
  contentSecurityPolicy,
  proxy,
} from "../src/proxy";
import {
  adminNavigationForRole,
  crmNavigationForRole,
} from "../src/app/product-navigation";

describe("design-system document boundary", () => {
  it("publishes one Spectrum semantic contract with explicit compatibility aliases", () => {
    const css = readFileSync(
      new URL("../src/app/globals.css", import.meta.url),
      "utf8",
    );
    for (const token of [
      "canvas",
      "surface-primary",
      "surface-secondary",
      "surface-raised",
      "surface-navigation",
      "surface-overlay",
      "text-strong",
      "text",
      "text-muted",
      "text-disabled",
      "border-subtle",
      "border-strong",
      "action-primary",
      "action-primary-hover",
      "action-primary-pressed",
      "action-primary-text",
      "selected-surface",
      "selected-text",
      "link",
      "focus",
      "blanket",
    ]) {
      expect(css, token).toContain(`--nx-${token}:`);
    }
    for (const alias of [
      "--nf-canvas: var(--nx-canvas)",
      "--nf-surface-1: var(--nx-surface-primary)",
      "--nf-surface-2: var(--nx-surface-secondary)",
      "--nf-text: var(--nx-text)",
      "--nf-brand: var(--nx-action-primary)",
      "--background: var(--nf-canvas)",
      "--primary: var(--nf-brand)",
      "--ring: var(--nf-focus)",
    ]) {
      expect(css, alias).toContain(alias);
    }
  });

  it("centralizes Spectrum foundations behind only thin product and website configurations", () => {
    const css = readFileSync(
      new URL("../src/app/globals.css", import.meta.url),
      "utf8",
    );
    const foundationMarker =
        "/* Nexa Spectrum — Phase 1 foundation with compatibility aliases */",
      phase2Marker = "/* Nexa Spectrum — Phase 2 shared authenticated shell */",
      foundationStart = css.indexOf(foundationMarker),
      phase2Start = css.indexOf(phase2Marker),
      migrated = css.slice(phase2Start),
      deferredLegacy = css.slice(0, foundationStart);
    expect(
      css.match(
        new RegExp(
          foundationMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "g",
        ),
      ),
    ).toHaveLength(1);
    expect(foundationStart).toBeGreaterThan(0);
    expect(phase2Start).toBeGreaterThan(foundationStart);
    expect(migrated).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    expect(migrated).not.toMatch(/html\[data-theme|\.crm-home[^,{]*\{/);
    expect(migrated).not.toMatch(/font-family\s*:/);
    for (const property of ["border-radius", "box-shadow"]) {
      for (const match of migrated.matchAll(
        new RegExp(`${property}\\s*:\\s*([^;]+)`, "g"),
      ))
        expect(match[1].trim(), property).toMatch(/^var\(--/);
    }
    expect(migrated).not.toMatch(/--(?:nx|nf|spectrum)-[\w-]+\s*:/);
    const experiences = [
      ...migrated.matchAll(/\.experience-([\w-]+)\s*\{([^}]+)\}/g),
    ];
    expect(experiences.map((match) => match[1])).toEqual([
      "product",
      "website",
    ]);
    for (const [, , body] of experiences) {
      expect(body.replace(/\s/g, "")).toBe(
        "background:var(--nx-canvas);color:var(--nx-text-strong);",
      );
    }
    expect(deferredLegacy).toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);

    for (const file of [
      "../src/app/product-shell.tsx",
      "../src/app/crm/crm-shell.tsx",
      "../src/app/crm/home/page.tsx",
      "../src/app/workspace/settings/admin-shell.tsx",
    ]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source, file).not.toMatch(
        /data-theme|fontFamily|borderRadius|boxShadow|--(?:nx|nf|spectrum)-|#[0-9a-f]{3,8}\b|rgba?\(/i,
      );
    }
    expect(
      readFileSync(
        new URL("../src/app/product-shell.tsx", import.meta.url),
        "utf8",
      ),
    ).toContain("experience-product");
  });

  it("keeps Phase 2 components on semantic tokens without raw colour literals", () => {
    for (const file of [
      "../src/app/product-shell.tsx",
      "../src/app/crm/crm-shell.tsx",
      "../src/app/workspace/settings/admin-shell.tsx",
    ]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source, file).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
      expect(source, file).not.toMatch(
        /--(?:spectrum-(?:brand|neutral)|nf-(?:surface-[12]|brand|text(?:-strong|-muted)?))\b/,
      );
    }
  });

  it("does not expose unsupported shell search, Create, or future destinations", () => {
    const source = readFileSync(
      new URL("../src/app/product-shell.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(
      /product-global-search|Search leads|>Create<|Companies|Deals|Automation|Delivery/,
    );
  });

  it("builds supported navigation in server adapters from trusted Role presentation facts", () => {
    const labels = (groups: ReturnType<typeof crmNavigationForRole>) =>
      groups.flatMap((group) => group.items.map((item) => item.label));
    expect(labels(crmNavigationForRole("owner"))).toContain(
      "Workspace settings",
    );
    expect(labels(crmNavigationForRole("admin"))).toContain("People and roles");
    expect(labels(crmNavigationForRole("member"))).not.toContain(
      "Workspace settings",
    );
    expect(labels(crmNavigationForRole("member"))).not.toContain(
      "Personal settings",
    );
    expect(adminNavigationForRole("member")).toEqual([]);
    expect(labels(adminNavigationForRole("owner"))).toContain("Invitations");
  });

  it("keeps migrated shell typography in the approved 400/500/600 range", () => {
    const css = readFileSync(
      new URL("../src/app/globals.css", import.meta.url),
      "utf8",
    );
    const shell = css.slice(
      css.indexOf("/* Nexa Spectrum — Phase 2 shared authenticated shell */"),
    );
    expect(shell).not.toMatch(/font-weight:\s*(?:[789]00|[1-9]\d{3,})/);
    expect(shell).toContain(".product-shell .brand>span");
    expect(shell).toContain("font-weight: 600");
  });

  it("keeps Phase 3 CRM presentation on the centralized semantic contract", () => {
    const css = readFileSync(
      new URL("../src/app/globals.css", import.meta.url),
      "utf8",
    );
    const marker = "/* Nexa Spectrum — Phase 3 operational CRM */";
    const phase3 = css.slice(css.indexOf(marker));
    expect(phase3).toContain(marker);
    expect(phase3).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    expect(phase3).not.toMatch(/html\[data-theme|data-account-theme/);
    expect(phase3).not.toMatch(/font-weight:\s*(?:[789]00|[1-9]\d{3,})/);
    expect(phase3).not.toMatch(/--(?:nx|nf|spectrum)-[\w-]+\s*:/);
    for (const property of ["border-radius", "box-shadow"]) {
      for (const match of phase3.matchAll(
        new RegExp(`${property}\\s*:\\s*([^;]+)`, "g"),
      ))
        expect(match[1].trim(), property).toMatch(/^var\(--/);
    }
    for (const file of [
      "../src/app/crm/page.tsx",
      "../src/app/crm/home/page.tsx",
      "../src/app/crm/pipeline/page.tsx",
      "../src/frontend/features/leads/components/manual-lead-intake-page.tsx",
      "../src/app/crm/leads/[leadId]/page.tsx",
      "../src/app/crm/leads/lead-editor.tsx",
    ]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source, file).not.toMatch(
        /data-theme|data-account-theme|--(?:nx|nf|spectrum)-|#[0-9a-f]{3,8}\b|rgba?\(/i,
      );
    }
    for (const file of [
      "../src/app/crm/page.tsx",
      "../src/app/crm/home/page.tsx",
      "../src/app/crm/pipeline/page.tsx",
      "../src/frontend/features/leads/components/manual-lead-intake-page.tsx",
      "../src/app/crm/leads/[leadId]/page.tsx",
    ]) {
      expect(
        readFileSync(new URL(file, import.meta.url), "utf8"),
        file,
      ).toContain("product-page-header");
    }
  });

  it("uses explicit semantic disabled states without shared opacity dimming", () => {
    const css = readFileSync(
      new URL("../src/app/globals.css", import.meta.url),
      "utf8",
    );
    const shared = css.slice(css.indexOf("/* Shared controls */"));
    expect(shared).toContain("--nx-disabled-border");
    expect(shared).toContain("background: var(--nx-disabled-surface)");
    expect(shared).not.toMatch(
      /(?:primary|secondary|danger|menu-button)[^{}]*:disabled\s*\{[\s\S]*?opacity:\s*\.(?!0)/,
    );
  });

  it("keeps the supported account actions discoverable in the shared shell", () => {
    const shell = readFileSync(
      new URL("../src/app/product-shell.tsx", import.meta.url),
      "utf8",
    );
    expect(shell).toContain('aria-label="Account menu"');
    expect(shell).toContain('aria-haspopup="menu"');
    expect(shell).toContain('role="menu"');
    expect(shell).toContain('role="menuitem"');
    expect(shell).toContain('href="/settings"');
    expect(shell).toContain("Personal settings");
    expect(shell).toContain("Sign out");
    expect(shell).not.toMatch(/global search|create menu|billing portal/i);
  });
  it("uses the configured Session cookie and preserves CSP for stale or invalid values", () => {
    const prior = process.env.SESSION_COOKIE_NAME;
    process.env.SESSION_COOKIE_NAME = "uat_session_cookie";
    try {
      const response = proxy(
        new NextRequest(
          "https://app.nexaflowsystems.com/future-authenticated-route",
          {
            headers: { cookie: "uat_session_cookie=stale-or-invalid" },
          },
        ),
      );
      const nonce = response.headers.get("x-middleware-request-x-nonce");
      const forwarded = response.headers.get(
        "x-middleware-request-content-security-policy",
      );
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
    const response = proxy(
      new NextRequest("https://app.nexaflowsystems.com/login"),
    );
    expect(response.headers.has("cache-control")).toBe(false);
    expect(response.headers.get("content-security-policy")).toContain(
      "'nonce-",
    );
    expect(
      [...response.headers.keys()].some((name) =>
        /session|authenticated/i.test(name),
      ),
    ).toBe(false);
  });

  it("retains the default and production nonce contract", () => {
    expect(configuredSessionCookieName({} as NodeJS.ProcessEnv)).toBe(
      "nexaflow_session",
    );
    const policy = contentSecurityPolicy("boundary-nonce", false);
    expect(policy).toContain("'nonce-boundary-nonce'");
    expect(policy).not.toMatch(/unsafe-inline|unsafe-eval/);
  });

  it("renders Phase 4 through one server website shell and semantic configuration", () => {
    const shell = readFileSync(new URL("../src/app/onboarding/website-shell.tsx", import.meta.url), "utf8");
    expect(shell).not.toContain('"use client"');
    expect(shell).toContain('className="experience-website website-root"');
    expect(shell).toContain('href="#website-main"');
    expect(shell).toContain('id="website-main"');
    expect(shell).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|data-theme|fontFamily|borderRadius|boxShadow/i);
  });

  it("keeps anonymous token documents private and prevents referrer disclosure", () => {
    for (const path of ["/verify-email?token=opaque", "/verify-email/capture?token=opaque", "/reset-password?token=opaque", "/reset-password/capture?token=opaque", "/workspace/invitations/accept?token=opaque"]) {
      const response = proxy(new NextRequest(`https://app.nexaflowsystems.com${path}`));
      expect(response.headers.get("cache-control"), path).toBe("private, no-store");
      expect(response.headers.get("referrer-policy"), path).toBe("no-referrer");
      expect(response.headers.get("content-security-policy"), path).toContain("'nonce-");
    }
    for(const path of ["/verify-email","/reset-password","/workspace/invitations/accept"]){const raw="opaque-token-value-long-enough-123456",response=proxy(new NextRequest(`https://app.nexaflowsystems.com${path}?token=${raw}`));expect(response.status,path).toBe(303);expect(response.headers.get("location"),path).toBe(`https://app.nexaflowsystems.com${path}`);expect(response.headers.get("location"),path).not.toContain(raw);expect(response.headers.get("set-cookie"),path).not.toContain(raw)}
  });
});
