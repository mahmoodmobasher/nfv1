import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("shared workspace layout boundary", () => {
  it("defaults to Structured Workspace and bootstraps the presentation preference before paint", () => {
    const layout = read("../src/app/layout.tsx");
    expect(layout).toContain('data-workspace-layout="structured"');
    expect(layout).toContain('id="nexaflow-workspace-layout"');
    expect(layout).toContain('strategy="beforeInteractive"');
  });

  it("offers the two labelled personal presentation modes without extending the account API", () => {
    const settings = read("../src/app/settings/account-settings-client.tsx");
    expect(settings).toContain("Workspace layout");
    expect(settings).toContain("Structured Workspace");
    expect(settings).toContain("Command Center");
    expect(settings).toContain("Presentation only");
    expect(settings).not.toMatch(/accountMutation\([^)]*workspaceLayout/);
  });

  it("keeps mode ownership in the shared root, token, and component layers", () => {
    const tokens = read("../src/frontend/design-system/tokens.css");
    const components = read("../src/frontend/design-system/components.css");
    const globals = read("../src/app/globals.css");
    expect(tokens).toContain('html[data-workspace-layout="command-center"]');
    for (const primitive of [
      ".ds-page-header",
      ".ds-list-toolbar",
      ".ds-record-workspace",
      ".ds-form-workbench",
      ".ds-stage-column",
    ]) expect(components, primitive).toContain(primitive);
    for (const archetype of [
      ".dashboard-welcome",
      ".ds-review-workspace",
      ".pipeline-board",
    ]) expect(globals, archetype).toContain(archetype);
    for (const feature of [
      "../src/app/crm/home/page.tsx",
      "../src/frontend/features/customer-graph/components/customer-graph-list.tsx",
      "../src/frontend/features/customer-graph/components/customer-graph.tsx",
      "../src/frontend/features/screen-forms/components/screen-profile-form.tsx",
      "../src/frontend/features/leads/components/lead-presentation.tsx",
      "../src/frontend/features/identity-review/components/identity-review-queue.tsx",
    ]) expect(read(feature), feature).not.toContain("data-workspace-layout");
  });

  it("converges shared split workspaces to one column at narrow widths", () => {
    const components = read("../src/frontend/design-system/components.css");
    const narrow = components.slice(components.indexOf("@media (max-width: 900px)"));
    expect(narrow).toContain('html[data-workspace-layout="command-center"] .ds-record-workspace');
    expect(narrow).toContain('html[data-workspace-layout="command-center"] .ds-form-workbench');
    expect(narrow).toContain("grid-template-columns: minmax(0,1fr)");
  });
});
