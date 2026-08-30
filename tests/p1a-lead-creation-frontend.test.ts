import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { phoneGuidanceIssue } from "@/frontend/features/leads/contracts/lead-intake.contracts";
import { mapServerFields } from "@/frontend/features/leads/components/manual-lead-intake-form";
import { LeadPipeline, LeadReadOnlyDetail, LeadSummaryCard, leadAssignmentLabel } from "@/frontend/features/leads";
import { leadDetailViewSchema, leadPipelineStagesViewSchema, leadSummariesViewSchema } from "@/frontend/shared/contracts/p1a-transport";
import { leadDetailFixture, leadSummariesFixture, phoneAcceptanceMatrix, pipelineStagesFixture, safeLeadSummaryFixture } from "@/frontend/features/leads/testing/lead-presentation.fixtures";

describe("P1A Lead creation frontend integration", () => {
  it("keeps immediate phone guidance aligned with the shared acceptance matrix", () => {
    for (const fixture of phoneAcceptanceMatrix) expect(phoneGuidanceIssue(fixture.phone, "country" in fixture ? fixture.country : undefined) === null, fixture.label).toBe(fixture.accepted);
  });
  it("maps server phone errors to accessible real controls", () => {
    expect(mapServerFields(["person.phone", "person.phoneCountryOverride"])).toEqual({ phone: "Enter a valid phone number in one of the supported formats.", phoneCountry: "Choose Canada or United States for a national phone number." });
  });
  it("parses canonical list, detail and stage fixtures before presentation", () => {
    expect(leadSummariesViewSchema.parse(leadSummariesFixture).items).toHaveLength(1);
    expect(leadDetailViewSchema.parse(leadDetailFixture).lead.capabilities.canEdit).toBe(false);
    expect(leadPipelineStagesViewSchema.parse(pipelineStagesFixture).items.map(stage => stage.name)).toEqual(["New", "Working"]);
  });
  it("renders nullable canonical presentation without legacy editing", () => {
    const html=renderToStaticMarkup(React.createElement(LeadReadOnlyDetail,{lead:safeLeadSummaryFixture}));
    expect(html).toContain("Taylor Example");expect(html).toContain("No company provided");expect(html).toContain("Unassigned");expect(html).toContain("Lifecycle");expect(html).not.toContain("Pipeline stage");expect(html).not.toContain("Save changes");expect(leadAssignmentLabel(safeLeadSummaryFixture)).toBe("Unassigned");
  });
  it("shows the Lead's settled outcome and retires the misnamed Pipeline panel", () => {
    // UAT-WALK-FINDINGS-2026-08-29.md #3/#4: a Lead never showed leads.status (won/lost)
    // on its own detail screen, and the "Pipeline and responsibility" panel showed
    // neither Pipeline stage (retired in 0510611) nor responsibility (that's the other
    // panel), leaving an empty third FactsGrid cell for the two facts it did show.
    const open = renderToStaticMarkup(React.createElement(LeadReadOnlyDetail, { lead: safeLeadSummaryFixture }));
    expect(open).toContain("Not yet settled");
    expect(open).toContain("Lifecycle status");
    expect(open).not.toContain("Pipeline and responsibility");
    const won = { ...safeLeadSummaryFixture, lifecycle: { code: "converted", label: "Converted", status: "won" as const, statusSource: "system" as const } };
    const wonHtml = renderToStaticMarkup(React.createElement(LeadReadOnlyDetail, { lead: won }));
    expect(wonHtml).toContain("Won — automatic");
    const manualLost = { ...safeLeadSummaryFixture, lifecycle: { code: "converted", label: "Converted", status: "lost" as const, statusSource: "manual" as const } };
    const manualHtml = renderToStaticMarkup(React.createElement(LeadReadOnlyDetail, { lead: manualLost }));
    expect(manualHtml).toContain("Lost — manual override");
  });
  it("preserves empty server-defined Pipeline stages", () => {
    const stages=pipelineStagesFixture.items.map((stage,index)=>({stage,view:{...leadSummariesFixture,items:index?[]:[safeLeadSummaryFixture]}}));
    const html=renderToStaticMarkup(React.createElement(LeadPipeline,{stages}));expect(html).toContain("Pipeline stage 1");expect(html).toContain("Pipeline stage 2");expect(html).toContain("New");expect(html).toContain("Working");expect(html).toContain("No leads in this stage");
  });
  // Reverses an earlier decision to show both axes on the card. Lifecycle and Pipeline
  // stage answer different questions, and when they disagree the card read as a
  // contradiction ("Disqualified" beside "Qualified"). Leads present lifecycle only;
  // Pipeline stage belongs to Deals. See the lifecycle spec, "Pipeline stages".
  it("presents lifecycle alone so it cannot contradict the Deal pipeline stage", () => {
    const lead={...safeLeadSummaryFixture,stage:{...safeLeadSummaryFixture.stage,name:"Qualified"}};
    const html=renderToStaticMarkup(React.createElement(LeadSummaryCard,{lead}));
    expect(html).toContain("New");
    expect(html).not.toContain("Qualified");
    expect(html).not.toContain("Pipeline stage");
  });
  it("uses canonical working detail navigation", () => {
    expect(renderToStaticMarkup(React.createElement(LeadSummaryCard,{lead:safeLeadSummaryFixture}))).toContain(`/crm/leads/${safeLeadSummaryFixture.leadId}`);
  });
});
