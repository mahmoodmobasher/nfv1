import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("single responsive presentation boundary", () => {
  it("does not bootstrap retired Interface style or Workspace layout geometry", () => {
    const layout = read("../src/app/layout.tsx");
    expect(layout).not.toMatch(/interface-style|workspace-layout|data-interface-style|data-workspace-layout/);
    expect(layout).toContain("themeBootstrapScript");
    expect(layout).toContain('strategy="beforeInteractive"');
  });

  it("does not expose retired presentation selectors in Personal settings", () => {
    const settings = read("../src/app/settings/account-settings-client.tsx");
    expect(settings).not.toMatch(/<option[^>]+value="(?:spectrum|nexa-crm|structured|command-center)"/);
    expect(settings).not.toMatch(/announce(?:InterfaceStyle|WorkspaceLayout)Preference/);
    expect(settings).toContain("one shared responsive presentation");
  });

  it("owns responsive geometry in shared React Tailwind primitives", () => {
    const components = read("../src/frontend/design-system/components.tsx");
    const shell = read("../src/app/product-shell.tsx");
    expect(components).toContain("lg:grid-cols-[280px_minmax(0,1fr)]");
    expect(components).toContain("lg:grid-cols-[184px_minmax(0,1fr)]");
    expect(components).toContain("md:hidden");
    expect(components).toContain("md:block");
    expect(shell).toContain("lg:grid-cols-[232px_minmax(0,1fr)]");
    expect(shell).toContain("lg:hidden");
    expect(shell).toContain("lg:block");
  });

  it("keeps old compatibility modules inert and outside production imports", () => {
    const production = [
      "../src/app/layout.tsx",
      "../src/app/product-shell.tsx",
      "../src/app/settings/account-settings-client.tsx",
    ].map(read).join("\n");
    expect(production).not.toMatch(/from\s+["'][^"']*(?:interface-style|workspace-layout)["']/);
    expect(production).not.toMatch(/data-interface-style|data-workspace-layout/);
  });
});
