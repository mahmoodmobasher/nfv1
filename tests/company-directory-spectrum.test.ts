import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const directory = readFileSync(
  "src/frontend/features/customer-graph/components/customer-graph-list.tsx",
  "utf8",
);

describe("Company directory Nexa Spectrum migration", () => {
  it("uses the shared page header, toolbar, table, and responsive cards", () => {
    expect(directory).toContain("DataTable");
    expect(directory).toContain("RecordCards");
    expect(directory).toContain('kind === "company" ? <ProductPageHeader');
    expect(directory).toContain('marker="CO"');
    expect(directory).toContain('context="Customer records"');
    expect(directory).toContain('title="Companies"');
    expect(directory).toContain('className="cg-directory-tools ds-list-toolbar"');
    expect(directory).toContain('className="cg-directory-results ds-responsive-record-list"');
  });

  it("retains capability-derived Company creation and lifecycle controls", () => {
    expect(directory).toContain("action={canCreate ?");
    expect(directory).toContain('href={`${base}/new`}');
    expect(directory).toContain("item.capabilities.canEdit &&");
    expect(directory).toContain("item.capabilities.canArchive");
    expect(directory).toContain("item.capabilities.canRestore");
  });
});
