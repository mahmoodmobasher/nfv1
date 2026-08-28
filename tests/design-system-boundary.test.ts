import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { configuredSessionCookieName, contentSecurityPolicy, proxy } from "../src/proxy";
import { navigationFromCapabilities } from "../src/app/product-navigation";
import type { WorkspaceNavigationCapabilitiesV1 } from "../src/frontend/shared/contracts/workspace-navigation";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

function filesBelow(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory() ? filesBelow(path) : [path];
  });
}

const sourceFiles = filesBelow("src").filter((path) => /\.(?:css|ts|tsx)$/.test(path));
const sourceText = () => sourceFiles.map((path) => `${path}\n${readFileSync(path, "utf8")}`).join("\n");

describe("Tailwind design-system boundary", () => {
  it("keeps globals.css as the only source stylesheet and limits it to shared foundations", () => {
    const cssFiles = sourceFiles.filter((path) => path.endsWith(".css")).map((path) => relative(".", path));
    const globals = read("../src/app/globals.css");
    expect(cssFiles).toEqual(["src/app/globals.css"]);
    expect(globals).toContain('@import "tailwindcss"');
    expect(globals).toContain("@theme inline");
    expect(globals).toContain("@layer base");
    expect(globals).toContain("@media (prefers-reduced-motion: reduce)");
    expect(globals).toContain("@media (forced-colors: active)");
    expect(globals).not.toMatch(/^\s*\.[a-z][\w-]*\s*[,{]/im);
  });

  it("publishes matching semantic Light and Dark roles with accessible dark corrections", () => {
    const globals = read("../src/app/globals.css");
    for (const role of [
      "canvas", "surface", "surface-muted", "line", "line-soft", "control",
      "ink", "ink-muted", "ink-faint", "accent", "accent-soft", "accent-ink",
      "on-accent", "disabled", "disabled-text", "success", "success-soft",
      "warning", "warning-soft", "danger", "danger-soft",
    ]) {
      expect(globals, role).toContain(`--color-${role}: var(--nf-${role})`);
      expect(globals.match(new RegExp(`--nf-${role}:`, "g")), role).toHaveLength(2);
    }
    expect(globals).toContain('html[data-theme="dark"]');
    expect(globals).toContain("--nf-ink-faint: #98938b");
    expect(globals).toContain("--nf-on-accent: #1a1830");
    expect(globals).toContain("--nf-control: #706b76");
    expect(globals).toMatch(/:root\s*\{[\s\S]*?color-scheme:\s*light/);
    expect(globals).toMatch(/html\[data-theme="dark"\]\s*\{[\s\S]*?color-scheme:\s*dark/);
  });

  it("contains no inline style props or production references to retired styling contracts", () => {
    const source = sourceText();
    expect(source).not.toMatch(/\bstyle\s*=/);
    expect(source).not.toMatch(/(?:tokens|components)\.css|nexa-crm-variants/);
    expect(source).not.toMatch(/data-interface-style|data-workspace-layout/);
  });

  it("keeps shared Tailwind recipes literal and discoverable", () => {
    const components = read("../src/frontend/design-system/components.tsx");
    for (const primitive of [
      "ProductPageHeader", "Button", "DataToolbar", "DataTable", "RecordCards",
      "RecordWorkspace", "FormWorkbench", "FormGrid", "StageColumn",
      "FeedbackState", "ReviewWorkspace", "AdminWorkspace",
    ]) expect(components, primitive).toContain(`function ${primitive}`);
    for (const recipe of [
      "min-h-11", "rounded-control", "border-control", "bg-surface",
      "text-ink", "md:grid-cols-12", "lg:grid-cols-[184px_minmax(0,1fr)]",
      "min-w-[280px]", "motion-reduce:animate-none",
    ]) expect(components, recipe).toContain(recipe);
    expect(components).toContain("const buttonTone = {");
    expect(components).toContain("const feedbackTone = {");
    expect(components).not.toMatch(/(?:bg|text|border|grid-cols)-\$\{/);
  });

  it("retains pre-paint Light, System, and Dark preference behavior", () => {
    const layout = read("../src/app/layout.tsx");
    const theme = read("../src/app/theme.ts");
    const sync = read("../src/app/account-theme-sync.tsx");
    const settings = read("../src/app/settings/account-settings-client.tsx");
    expect(layout).toContain("themeBootstrapScript");
    expect(layout).toContain('strategy="beforeInteractive"');
    expect(layout).toContain("data-theme-preference");
    expect(theme).toContain('matchMedia("(prefers-color-scheme: dark)")');
    expect(theme).toContain("THEME_STORAGE_KEY");
    expect(sync).toContain("updateSystemSubscription");
    expect(settings).toContain('<option value="light">Light</option>');
    expect(settings).toContain('<option value="system">Use device setting</option>');
    expect(settings).toContain('<option value="dark">Dark</option>');
    expect(settings).toContain("announceThemePreference(theme)");
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
    const labels = navigationFromCapabilities(value).flatMap((group) => group.items.map((item) => item.label));
    expect(labels).toEqual(["Home", "Companies", "Contacts", "Leads", "Lead pipeline", "Deals", "Deal pipeline", "Personal settings"]);
    expect(labels).not.toContain("Workspace settings");
  });

  it("retains the Session cookie and CSP boundaries", () => {
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
    } finally {
      if (prior === undefined) delete process.env.SESSION_COOKIE_NAME;
      else process.env.SESSION_COOKIE_NAME = prior;
    }
    expect(configuredSessionCookieName({} as NodeJS.ProcessEnv)).toBe("nexaflow_session");
    expect(contentSecurityPolicy("boundary-nonce", false)).toContain("'nonce-boundary-nonce'");
  });
});
