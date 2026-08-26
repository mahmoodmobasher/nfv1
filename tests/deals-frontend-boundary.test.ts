import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const component = readFileSync("src/frontend/features/deals/components/deals.tsx", "utf8"), navigation = readFileSync("src/app/product-navigation.ts", "utf8"), styles = readFileSync("src/frontend/design-system/components.css", "utf8");

describe("DEALS-01 frontend boundaries", () => {
  it("uses only published client contracts and current server capabilities", () => {
    expect(component).not.toMatch(/@\/(?:backend|server)\//);
    expect(component).toContain('endpoint(workspaceId, "deal-pipeline")');
    expect(component).toContain("pipeline?.capabilities.canCreate");
    expect(component).toContain("deal.capabilities.canEdit");
    expect(component).toContain("deal.capabilities.eligibleTargetStageIds");
    expect(component).not.toMatch(/role\s*===\s*["'](?:owner|admin)["']/);
  });
  it("keeps deferred scopes and fabricated data out", () => {
    expect(component).not.toMatch(/lead-convert|exchangeRate|weightedForecast|deliveryProject|draggable|onDrag/);
    expect(component).not.toMatch(/Math\.round|parseFloat|Number\([^)]*amountMinor/);
    expect(component).toContain("Dragging is not required or enabled.");
  });
  it("registers Deals navigation and responsive accessible Board treatment", () => {
    expect(navigation).toContain('capability.deals.canView ? [');
    expect(navigation).toContain('item("/crm/deals", "Deals"');
    expect(navigation).toContain('item("/crm/deals/board", "Deal pipeline"');
    expect(styles).toContain(".deal-board"); expect(styles).toContain("minmax(min(280px,100%),1fr)");
    expect(styles).toContain("@media (forced-colors: active)"); expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });
  it("clears every protected state on authority loss", () => {
    for (const value of ["form.current?.reset()", "setPipeline(null)", "setDetail(null)", "setCompanies([])", "setContacts([])", "setErrors({})", "setSaved(null)", "setAuthorityError(error)"]) expect(component, value).toContain(value);
  });
});
