// @vitest-environment jsdom
import React, { act } from "react";
// react-dom/client + act() outside a testing-library harness needs this set explicitly,
// or React warns "not configured to support act(...)" on every render in the behavioral
// test below even though the render is correctly wrapped.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeadDetailWithConversion } from "@/frontend/features/leads";
import { safeLeadSummaryFixture } from "@/frontend/features/leads/testing/lead-presentation.fixtures";
import type { LeadConversionPreviewV1 } from "@/frontend/features/leads/contracts/lead-conversion.contracts";

const ineligiblePreview: LeadConversionPreviewV1 = {
  contractVersion: "lead-conversion-preview.v1",
  lead: { leadId: safeLeadSummaryFixture.leadId, label: safeLeadSummaryFixture.displayName, lifecycle: "working", legacyStatus: "open", version: 1, intakeId: "40000000-0000-4000-8000-000000000005", intakeVersion: 1, review: null },
  eligible: false, ineligibilityReasons: ["lead_not_qualified"], capabilities: { canConvert: false },
  choices: { companies: [], primaryContacts: [] }, pipeline: null,
  dealDefaults: { name: safeLeadSummaryFixture.displayName, value: null, expectedCloseOn: null },
  assignment: { responsibleMembershipId: "40000000-0000-4000-8000-000000000006", responsibleTeamId: null, visibility: "workspace", visibleTeamIds: [] },
  effects: { createsDeal: true, createsCustomers: false, createsDeliveryProject: false, writesLineage: true, convertsCanonicalLeadLifecycle: true, preservesLegacyLeadStatus: true },
  requestId: "40000000-0000-4000-8000-000000000007",
};

const component = readFileSync("src/frontend/features/leads/components/lead-conversion.tsx", "utf8");
const globals = readFileSync("src/app/globals.css", "utf8");
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
  describe("re-fetches the conversion preview when a sibling lifecycle transition changes the Lead version", () => {
    // UAT-WALK-FINDINGS-2026-08-29.md #2: LeadLifecycleControl and LeadConversionPanel are
    // unconnected siblings under LeadDetailWithConversion. LeadLifecycleControl calls
    // router.refresh() on a successful transition, which re-fetches the server Lead and
    // gives this tree a new lead.version -- the conversion preview must actually re-fetch
    // when that happens, or a Lead moving new/working -> qualified leaves the panel showing
    // a stale "not eligible" preview until a full page reload. This is a behavioral
    // assertion, not a source-text one: it fails if the mechanism breaks even when the
    // source still contains the right-looking tokens.
    let root: Root | null = null, container: HTMLDivElement | null = null;
    afterEach(async () => {
      if (root) await act(async () => root!.unmount());
      if (container) container.remove();
      root = null; container = null;
      vi.unstubAllGlobals();
    });
    it("calls the preview endpoint again on a version bump, not on an unrelated re-render", async () => {
      const previewCalls: string[] = [];
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.endsWith("/conversion-preview")) {
          previewCalls.push(url);
          return new Response(JSON.stringify({ data: ineligiblePreview }), { status: 200, headers: { "content-type": "application/json" } });
        }
        return new Response(JSON.stringify({ error: { code: "resource_not_found" } }), { status: 404 });
      }));
      container = document.createElement("div"); document.body.appendChild(container);
      root = createRoot(container);
      const lead = { ...safeLeadSummaryFixture, version: 1, capabilities: { ...safeLeadSummaryFixture.capabilities, canMoveStage: false } };
      await act(async () => { root!.render(<LeadDetailWithConversion lead={lead} workspaceId="30000000-0000-4000-8000-000000000001"/>); });
      expect(previewCalls).toHaveLength(1);

      // A re-render with the SAME version (e.g. an unrelated parent state change) must not
      // trigger a second fetch -- the effect is keyed on leadVersion, not on every render.
      await act(async () => { root!.render(<LeadDetailWithConversion lead={{ ...lead }} workspaceId="30000000-0000-4000-8000-000000000001"/>); });
      expect(previewCalls).toHaveLength(1);

      // The version a real lifecycle transition would produce: router.refresh() re-fetches
      // the server Lead, which has version=2 after any transition.
      await act(async () => { root!.render(<LeadDetailWithConversion lead={{ ...lead, version: 2 }} workspaceId="30000000-0000-4000-8000-000000000001"/>); });
      expect(previewCalls).toHaveLength(2);
    });
  });
  it("composes the conversion wrapper through the public Lead feature entry", () => {
    const route = readFileSync("src/app/crm/leads/[leadId]/page.tsx", "utf8"); expect(route).toContain('from "@/frontend/features/leads"'); expect(route).toContain("<LeadDetailWithConversion"); expect(route).not.toContain("lead-conversion/");
  });
  it("inherits responsive Tailwind controls and global accessibility boundaries", () => {
    expect(component).toContain("min-h-11");
    expect(component).toContain("w-[min(36rem,calc(100%-2rem))]");
    expect(component).toContain("flex flex-wrap");
    expect(globals).toContain("@media (forced-colors: active)");
    expect(globals).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
