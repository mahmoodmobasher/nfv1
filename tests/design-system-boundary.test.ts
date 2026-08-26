import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import {
  configuredSessionCookieName,
  contentSecurityPolicy,
  proxy,
} from "../src/proxy";
import {
  navigationFromCapabilities,
} from "../src/app/product-navigation";
import type { WorkspaceNavigationCapabilitiesV1 } from "../src/frontend/shared/contracts/workspace-navigation";

describe("design-system document boundary", () => {
  it("publishes one CRM end-product semantic contract with explicit compatibility aliases", () => {
    const css = readFileSync(
      new URL("../src/app/globals.css", import.meta.url),
      "utf8",
    );
    const tokens = readFileSync(
      new URL("../src/frontend/design-system/tokens.css", import.meta.url),
      "utf8",
    );
    expect(css).toContain('@import "../frontend/design-system/tokens.css"');
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
      expect(tokens, token).toContain(`--nx-${token}:`);
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
      expect(tokens, alias).toContain(alias);
    }
    expect(tokens).toContain("--nf-font-sans: var(--font-geist)");
    expect(tokens).toContain("--nf-font-mono: var(--font-geist-mono)");
    expect(tokens).toContain("--nf-sidebar-width: 232px");
    expect(tokens).toContain("--nf-content-max: 1400px");
    expect(tokens).toContain("--nf-content-padding: 28px");
    expect(tokens).toContain("--nx-canvas: #f7f7f5");
    expect(tokens).toContain("--nx-action-primary: #5b57d6");
    expect(tokens).toContain("--nf-radius-card: 14px");
    expect(tokens).not.toMatch(/--spectrum-/);
  });

  it("centralizes the replacement foundation behind only thin product and website configurations", () => {
    const css = readFileSync(
      new URL("../src/app/globals.css", import.meta.url),
      "utf8",
    );
    const tokens = readFileSync(
        new URL("../src/frontend/design-system/tokens.css", import.meta.url),
        "utf8",
      ),
      foundationMarker = "/* CRM end-product design system foundation.",
      phase2Marker = "/* Nexa Spectrum — Phase 2 shared authenticated shell */",
      foundationStart = css.indexOf(foundationMarker),
      phase2Start = css.indexOf(phase2Marker),
      migrated = css.slice(phase2Start),
      deferredLegacy = css.slice(0, foundationStart);
    expect(tokens.match(/--nx-canvas:/g)).toHaveLength(3);
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

  it("gates shell actions through fetched navigation capabilities", () => {
    const source = readFileSync(
      new URL("../src/app/product-shell.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("parsed.data.capabilities.leads.canCreate");
    expect(source).toContain("safeParse(payload?.data)");
    expect(source).toContain('action="/crm"');
    expect(source).toContain('name="q"');
    expect(source).not.toMatch(/>Create<|Automation|Delivery/);
  });

  it("builds supported navigation only from strict server capabilities", () => {
    const value: WorkspaceNavigationCapabilitiesV1 = {
      contractVersion: "workspace-navigation-capabilities.v1",
      workspaceId: "10000000-0000-4000-8000-000000000001",
      requestId: "10000000-0000-4000-8000-000000000002",
      capabilities: {
        home: { canView: true }, companies: { canView: true, canCreate: false },
        contacts: { canView: true, canCreate: false }, leads: { canView: true, canCreate: false },
        identityReview: { canView: false }, deals: { canView: true, canCreate: false },
        pipeline: { canView: true }, settings: { canViewPersonal: true, canViewWorkspace: false,
          canManagePeople: false, canManageInvitations: false, canManageTeams: false },
      },
    };
    const labels = (groups: ReturnType<typeof navigationFromCapabilities>) =>
      groups.flatMap((group) => group.items.map((item) => item.label));
    const actual = labels(navigationFromCapabilities(value));
    expect(actual).toEqual(["Home", "Companies", "Contacts", "Leads", "Lead pipeline", "Deals", "Deal pipeline", "Personal settings"]);
    expect(actual).not.toContain("Workspace settings");
    expect(readFileSync(new URL("../src/app/product-navigation.ts", import.meta.url), "utf8")).not.toMatch(/role\s*===|navigationForRole/);
  });

  it("keeps migrated shell typography in the approved 400/500/600/700 range", () => {
    const css = readFileSync(
      new URL("../src/app/globals.css", import.meta.url),
      "utf8",
    );
    const shell = css.slice(
      css.indexOf("/* Nexa Spectrum — Phase 2 shared authenticated shell */"),
    );
    expect(shell).not.toMatch(/font-weight:\s*(?:[89]00|[1-9]\d{3,})/);
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
    expect(phase3).not.toMatch(/font-weight:\s*(?:[89]00|[1-9]\d{3,})/);
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
      "../src/frontend/features/leads/components/lead-presentation.tsx",
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
      "../src/frontend/features/leads/components/lead-presentation.tsx",
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

  it("uses one direct labelled Sign out control instead of an Account menu", () => {
    const shell = readFileSync(
      new URL("../src/app/product-shell.tsx", import.meta.url),
      "utf8",
    );
    expect(shell).not.toContain('aria-label="Account menu"');
    expect(shell).not.toContain('aria-haspopup="menu"');
    expect(shell).not.toContain('role="menu"');
    expect(shell).toContain('className="product-signout"');
    expect(shell).toContain("Sign out");
    expect(shell).not.toMatch(/global search|create menu|billing portal/i);
  });
  it("renders a persistent truthful CRM top bar from existing Lead authority", () => {
    const shell = readFileSync(
      new URL("../src/app/product-shell.tsx", import.meta.url),
      "utf8",
    );
    const css = readFileSync(
      new URL("../src/app/globals.css", import.meta.url),
      "utf8",
    );
    expect(shell).toContain('aria-label="Breadcrumb"');
    expect(shell).toContain('className="product-create-action"');
    expect(shell).toContain("parsed.data.capabilities.leads.canCreate");
    expect(shell).toContain('href="/crm/leads/new"');
    expect(shell).toContain('className="product-global-search"');
    expect(shell).toContain('action="/crm"');
    expect(shell).toContain('name="q"');
    expect(css).toMatch(/\.product-shell>\.product-topbar\s*\{[\s\S]*?position:\s*sticky/);
    expect(css).toMatch(
      /\.product-shell--crm>\.product-topbar>\.product-breadcrumbs[^{}]*\{[^}]*display:\s*flex[^}]*margin:\s*0/,
    );
    expect(css).toMatch(
      /\.product-shell--crm \.ds-view-row>\.ds-view-tabs[^{}]*\{[^}]*display:\s*inline-flex[^}]*margin:\s*0/,
    );
    expect(shell).toContain("product-shell--${kind}");
    expect(shell).not.toMatch(
      /legacyClass|crm-preview|admin-shell|mobile-crm|admin-mobile|preview-banner|banner: string/,
    );
    for (const relativePath of [
      "../src/app/crm/crm-shell.tsx",
      "../src/app/settings/account-shell.tsx",
      "../src/app/workspace/settings/admin-shell.tsx",
    ]) {
      const wrapper = readFileSync(new URL(relativePath, import.meta.url), "utf8");
      expect(wrapper).not.toContain("banner=");
      expect(wrapper).not.toContain("LOCAL SERVER");
    }
    expect(css).toContain("max-width: var(--nf-content-max)");
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
