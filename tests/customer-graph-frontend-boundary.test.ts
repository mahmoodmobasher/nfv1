import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync("src/frontend/features/customer-graph/components/customer-graph.tsx", "utf8");
const contracts = readFileSync("src/frontend/features/customer-graph/contracts/customer-graph.contracts.ts", "utf8");
const navigation = readFileSync("src/app/product-navigation.ts", "utf8");

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
    expect(component).toContain("view?.capabilities.canCreate");
    expect(component).toContain("?bootstrap=true");
    expect(component).not.toMatch(/role\s*===\s*["'](?:owner|admin)["']/);
  });
  it("keeps sensitive disclosure minimized and strict", () => {
    expect(component).toContain("maskedEmail"); expect(component).toContain("maskedPhone");
    expect(component).not.toContain("domainNormalized"); expect(component).not.toContain("emailNormalized");
    expect(contracts).toContain(").strict()");
  });
  it("registers stable Company and Contact navigation and route methods", () => {
    expect(navigation).toContain('href: "/crm/companies"'); expect(navigation).toContain('href: "/crm/contacts"');
    expect(component).toContain('method: editing ? "PATCH" : "POST"');
    expect(component).toContain('"idempotency-key": request.current.key');
    expect(component).toContain("expectedVersion: record.version");
    expect(component).toContain("form.current?.reset()");
    expect(component).toContain("setDetail(null)");
    expect(component).toContain("setCanCreate(false)");
  });
});
