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
    expect(directory).toContain("<DataToolbar");
    expect(directory).toContain("<SearchInput");
    expect(directory).toContain("<SearchButton");
    expect(directory).toContain('flex-wrap items-center gap-2');
    expect(directory).toContain('className="min-w-60 flex-1"');
    expect(directory).toContain("<RecordCards");
  });

  it("keeps local-search truth, archive controls, and shared input affordance together", () => {
    expect(directory).toContain("Search applies only to the records currently loaded below.");
    expect(directory).toContain("Include archived");
    expect(directory).toContain("placeholder={`Search loaded ${title(kind).toLowerCase()}`}");
    expect(directory).not.toContain("[&_input]:min-w-[240px]");
  });

  it("retains capability-derived Company creation and lifecycle controls", () => {
    expect(directory).toContain("action={canCreate ?");
    expect(directory).toContain('href={`${base}/new`}');
    expect(directory).toContain("item.capabilities.canEdit &&");
    expect(directory).toContain("item.capabilities.canArchive");
    expect(directory).toContain("item.capabilities.canRestore");
  });
});
