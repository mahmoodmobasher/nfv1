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
    expect(html).toContain("Taylor Example");expect(html).toContain("No company provided");expect(html).toContain("Unassigned");expect(html).not.toContain("Save changes");expect(leadAssignmentLabel(safeLeadSummaryFixture)).toBe("Unassigned");
  });
  it("preserves empty server-defined Pipeline stages", () => {
    const stages=pipelineStagesFixture.items.map((stage,index)=>({stage,view:{...leadSummariesFixture,items:index?[]:[safeLeadSummaryFixture]}}));
    const html=renderToStaticMarkup(React.createElement(LeadPipeline,{stages}));expect(html).toContain("New");expect(html).toContain("Working");expect(html).toContain("No leads in this stage");
  });
  it("uses canonical working detail navigation", () => {
    expect(renderToStaticMarkup(React.createElement(LeadSummaryCard,{lead:safeLeadSummaryFixture}))).toContain(`/crm/leads/${safeLeadSummaryFixture.leadId}`);
  });
});
