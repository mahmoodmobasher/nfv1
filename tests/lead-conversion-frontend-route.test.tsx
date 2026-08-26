import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LeadDetailWithConversion } from "@/frontend/features/leads";
import { safeLeadSummaryFixture } from "@/frontend/features/leads/testing/lead-presentation.fixtures";

const component = readFileSync("src/frontend/features/leads/components/lead-conversion.tsx", "utf8");
const styles = readFileSync("src/frontend/design-system/components.css", "utf8");
describe("LEAD-CONVERSION-01 frontend route and states", () => {
  it("mounts only a truthful preview status before server authority resolves", () => {
    const lead = { ...safeLeadSummaryFixture, capabilities: { ...safeLeadSummaryFixture.capabilities, canMoveStage: false } };
    const html = renderToStaticMarkup(<LeadDetailWithConversion lead={lead} workspaceId="30000000-0000-4000-8000-000000000001"/>);
    expect(html).toContain("Checking conversion eligibility");
    expect(html).not.toContain("Review conversion");
    expect(html).not.toContain("Convert Lead to Deal?");
  });
  it("uses the frozen routes and preview-only eligibility", () => {
    expect(component).toContain('"conversion-preview"'); expect(component).toContain('"convert"');
    expect(component).toContain("next.eligible && (!next.capabilities.canConvert");
    expect(component).toContain("!preview.lead.review");
    expect(component).not.toMatch(/role\s*===\s*["'](?:owner|admin)["']/);
  });
  it("provides native confirmation focus, Escape and invoker restoration", () => {
    expect(component).toContain("node.showModal()"); expect(component).toContain("onCancel"); expect(component).toContain('querySelector<HTMLElement>("button")?.focus()'); expect(component).toContain("restore.current()");
    expect(component.lastIndexOf(">Cancel</Button>")).toBeLessThan(component.lastIndexOf("Converting…"));
    expect(component).not.toContain("window.confirm");
  });
  it("clears all protected conversion and parent Lead state on authority loss", () => {
    for (const state of ["setPreview(null)", "setDraft(null)", "setPendingCommand(null)", "setResult(null)", "setErrors({})", "setConfirming(false)", "onAuthorityLoss(next)"]) expect(component, state).toContain(state);
    expect(component).toContain("if (authorityError) return <SafeConversionState");
  });
  it("covers stale, replay, atomic failure and linked fields without deferred scope", () => {
    expect(component).toContain("Reload conversion preview"); expect(component).toContain("Conversion was already applied"); expect(component).toContain("zeroPartialEffects"); expect(component).toContain("no partial Deal, Lead, customer, lineage");
    for (const field of ["conversion-name", "conversion-value", "conversion-close", "conversion-company", "conversion-contact"]) expect(component).toContain(`${field}-error`);
    expect(component).toContain("Create no customer, Delivery Project, or hidden automation."); expect(component).not.toMatch(/create customer|silent upsert|legacy.*=.*converted/i);
  });
  it("composes the conversion wrapper through the public Lead feature entry", () => {
    const route = readFileSync("src/app/crm/leads/[leadId]/page.tsx", "utf8"); expect(route).toContain('from "@/frontend/features/leads"'); expect(route).toContain("<LeadDetailWithConversion"); expect(route).not.toContain("lead-conversion/");
  });
  it("inherits the accepted responsive, forced-colour and reduced-motion boundaries", () => {
    expect(styles).toContain("min-height: 44px");
    expect(styles).toContain("width: min(520px,calc(100vw - 32px))");
    expect(styles).toContain("@media (max-width: 520px)");
    expect(styles).toContain("@media (forced-colors: active)");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
