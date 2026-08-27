import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const form = readFileSync(
  "src/frontend/features/screen-forms/components/screen-profile-form.tsx",
  "utf8",
);
const fields = readFileSync(
  "src/frontend/features/screen-forms/components/screen-form-fields.tsx",
  "utf8",
);

describe("shared CRM Record Editor migration", () => {
  it("uses the global header, workbench, navigation, sections, grids, and actions for every screen kind", () => {
    expect(form.match(/<ProductPageHeader/g)).toHaveLength(1);
    expect(form).not.toContain('<header className="product-page-header">');
    expect(form).toContain("<FormWorkbench");
    expect(form).toContain("<SectionNav");
    expect(form).toContain("<FormSection");
    expect(form).toContain("<FormGrid");
    expect(form).toContain("<FormActions>");
    expect(form).not.toContain("<Panel");
  });

  it("keeps Company and Contact sections domain-specific while layout remains shared", () => {
    expect(form).toContain('title="Company profile"');
    expect(form).toContain('title="Contact & address"');
    expect(form).toContain('title="Contact overview"');
    expect(form).toContain('title="Contact channels"');
    expect(form).toContain('title="Internal notes"');
    expect(form).toContain('<AssignmentSection kind={kind}>');
    expect(fields).toContain("embedded?: boolean");
    expect(fields).toContain("<FormGrid>");
  });

  it("preserves the shared authority, safe-draft, stale, and replay boundaries", () => {
    expect(form).toContain("clearProtectedState");
    expect(form).toContain("your safe draft remains available");
    expect(form).toContain("result.replayed");
    expect(form).toContain("stale || selectionConflict !== null");
    expect(form).toContain("Protected choices come only from current server authority");
  });
});
