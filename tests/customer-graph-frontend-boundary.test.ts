import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync("src/frontend/features/customer-graph/components/customer-graph.tsx", "utf8");
const listComponent = readFileSync("src/frontend/features/customer-graph/components/customer-graph-list.tsx", "utf8");
const contracts = readFileSync("src/frontend/features/customer-graph/contracts/customer-graph.contracts.ts", "utf8");
const navigation = readFileSync("src/app/product-navigation.ts", "utf8");
const actionMenu = readFileSync("src/frontend/design-system/action-menu.tsx", "utf8");

describe("CUSTOMER-GRAPH-01 frontend boundaries", () => {
  it("keeps browser code outside backend, database, environment, and server graphs", () => {
    expect(component).not.toMatch(/@\/(?:backend|server)\//);
    expect(component).not.toMatch(/process\.env|DATABASE_URL|\bfrom\s+["']pg["']/);
  });
  it("makes legacy authority visibly read-only and every action capability-driven", () => {
    expect(component).toContain('authorityContractVersion === "legacy-p1a-root-v1"');
    expect(component).toContain("record.capabilities.canEdit");
    expect(component).toContain("record.capabilities.canArchive");
    expect(component).toContain("record.capabilities.canRestore");
    expect(component).toContain("No adoption or backfill action is offered.");
    expect(listComponent).toContain("parsed.data.data.capabilities.canCreate");
    expect(component).toContain("?bootstrap=true");
    expect(component).not.toMatch(/role\s*===\s*["'](?:owner|admin)["']/);
    expect(listComponent).not.toMatch(/role\s*===\s*["'](?:owner|admin)["']/);
  });
  it("keeps directory rows disclosure-safe and active/archived keysets independent", () => {
    expect(listComponent).toContain("Include archived");
    expect(listComponent).toContain("Load more active");
    expect(listComponent).toContain("Load more archived");
    expect(listComponent).toContain("Search applies only to the records currently loaded below.");
    expect(listComponent).not.toMatch(/maskedEmail|maskedPhone|companyName|industry|subsidiar|dealCount|contactCount/i);
  });
  it("makes every directory action explicit and capability-derived", () => {
    expect(listComponent).toContain("parsed.data.data.capabilities.canCreate");
    expect(listComponent).toContain("item.capabilities.canEdit &&");
    expect(listComponent).toContain("item.capabilities.canArchive");
    expect(listComponent).toContain("item.capabilities.canRestore");
    expect(listComponent).toContain("View<span className=\"sr-only\"");
    expect(listComponent).toContain("Edit<span className=\"sr-only\"");
    expect(listComponent).not.toMatch(/method:\s*["']DELETE["']|hard delete|permanently delete/i);
  });
  it("dismisses the originating action menu before opening lifecycle confirmation", () => {
    expect(actionMenu).toContain("function closeOnAction");
    expect(actionMenu).toContain('closest<HTMLElement>("a,button")');
    expect(actionMenu).toContain("setDismissed(true)");
    expect(actionMenu).toContain('contents [&>a]:hidden [&>button]:hidden [&>div]:contents [&>div>*:not(dialog)]:hidden');
    expect(actionMenu).toContain('querySelector("dialog")');
    expect(listComponent).toContain('closest("details")?.querySelector<HTMLElement>("summary")');
    expect(listComponent).toContain("restoreRef.current()");
  });
  it("keeps sensitive disclosure minimized and strict", () => {
    expect(component).toContain("maskedEmail"); expect(component).toContain("maskedPhone");
    expect(component).not.toContain("domainNormalized"); expect(component).not.toContain("emailNormalized");
    expect(contracts).toContain(").strict()");
  });
  it("registers stable Company and Contact navigation and route methods", () => {
    expect(navigation).toContain('capability.companies.canView ? [item("/crm/companies"'); expect(navigation).toContain('capability.contacts.canView ? [item("/crm/contacts"');
    expect(component).toContain('method: editing ? "PATCH" : "POST"');
    expect(component).toContain('"idempotency-key": request.current.key');
    expect(component).toContain("expectedVersion: record.version");
    expect(component).toContain("form.current?.reset()");
    expect(component).toContain("setDetail(null)");
    expect(component).toContain("setCanCreate(false)");
  });
});
