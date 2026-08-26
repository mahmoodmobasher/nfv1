import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));

import { LeadOperationalEditForm, LeadStageMove } from "@/frontend/features/leads";
import { LeadReadOnlyDetail } from "@/frontend/features/leads/components/lead-presentation";
import { leadManagementErrorDisposition } from "@/frontend/features/leads/components/lead-management";
import { safeLeadSummaryFixture } from "@/frontend/features/leads/testing/lead-presentation.fixtures";
import type { LeadOperationalEditView, LeadPipelineStage } from "@/frontend/shared/contracts/p1a-transport";

const membershipId = "10000000-0000-4000-8000-000000000011";
const teamId = "20000000-0000-4000-8000-000000000021";
const stages: LeadPipelineStage[] = [
  { stageId: safeLeadSummaryFixture.stage.id, name: safeLeadSummaryFixture.stage.name, position: 0, status: "active" },
  { stageId: "30000000-0000-4000-8000-000000000032", name: "Qualified", position: 1, status: "active" },
];
const edit: LeadOperationalEditView = {
  contractVersion: "getLeadOperationalEdit.v1", requestId: "90000000-0000-4000-8000-000000000091",
  leadId: safeLeadSummaryFixture.leadId, version: safeLeadSummaryFixture.version,
  operational: { responsibleMembershipId: membershipId, responsibleTeamId: teamId, visibility: "teams", visibleTeamIds: [teamId] },
  options: { responsibleMemberships: [{ id: membershipId, label: "Morgan Owner" }], teams: [{ id: teamId, label: "Sales" }] },
  capabilities: { canEditLead: true }, nextView: { kind: "lead_edit", leadId: safeLeadSummaryFixture.leadId },
};

describe("P1A Lead management frontend", () => {
  it("renders only the frozen operational fields in the dedicated editor", () => {
    const html = renderToStaticMarkup(<LeadOperationalEditForm workspaceId="70000000-0000-4000-8000-000000000071" initial={edit}/>);
    expect(html).toContain('id="responsibleMembershipId"');
    expect(html).toContain('aria-describedby="responsibleMembershipId-help"');
    expect(html).toContain('id="responsibleTeamId"');
    expect(html).toContain('aria-describedby="responsibleTeamId-help"');
    expect(html).toContain('name="visibility"');
    expect(html).toContain("Teams that can view this Lead");
    for (const forbidden of ['name="email"', 'name="phone"', 'name="stageId"', 'name="status"', 'name="company"'])
      expect(html).not.toContain(forbidden);
    expect(html).toContain("Identity-bearing corrections are not available in this editor.");
    expect(html).not.toContain("MVP");
  });

  it("renders Edit and Move actions only from server-provided capabilities", () => {
    const allowed = renderToStaticMarkup(<LeadReadOnlyDetail lead={safeLeadSummaryFixture} workspaceId="70000000-0000-4000-8000-000000000071" stages={stages}/>);
    expect(allowed).toContain("Edit lead");
    expect(allowed).not.toContain("Edit Lead operations");
    expect(allowed).toContain("Move stage");
    const deniedLead = { ...safeLeadSummaryFixture, capabilities: { ...safeLeadSummaryFixture.capabilities, canEditLead: false, canMoveStage: false } };
    const denied = renderToStaticMarkup(<LeadReadOnlyDetail lead={deniedLead} workspaceId="70000000-0000-4000-8000-000000000071" stages={stages}/>);
    expect(denied).not.toContain("Edit lead");
    expect(denied).not.toContain("Edit Lead operations");
    expect(denied).not.toContain("Move stage");
  });

  it("offers only server-ordered active stage targets outside the current stage", () => {
    const html = renderToStaticMarkup(<LeadStageMove workspaceId="70000000-0000-4000-8000-000000000071"
      leadId={safeLeadSummaryFixture.leadId} leadName={safeLeadSummaryFixture.displayName} version={safeLeadSummaryFixture.version}
      currentStageId={safeLeadSummaryFixture.stage.id} currentStageName={safeLeadSummaryFixture.stage.name} stages={stages}/>);
    expect(html).toContain("Move stage");
    expect(html).not.toContain("drag");
  });

  it("maps authority, reconciliation, retry and new-request errors without client authority inference", () => {
    const error = (code: Parameters<typeof leadManagementErrorDisposition>[0]["code"], action: Parameters<typeof leadManagementErrorDisposition>[0]["reconciliation"]["action"]) =>
      ({ code, message: "Safe error", retryable: action === "retry_same_request", reconciliation: { required: action !== "none", action } });
    expect(leadManagementErrorDisposition(error("resource_not_found", "none"))).toBe("authority_loss");
    expect(leadManagementErrorDisposition(error("permission_required", "none"))).toBe("permission");
    expect(leadManagementErrorDisposition(error("assignment_unavailable", "refetch_lead_operational_edit"))).toBe("refetch_edit");
    expect(leadManagementErrorDisposition(error("stage_unavailable", "refetch_lead_and_stages"))).toBe("refetch_stage");
    expect(leadManagementErrorDisposition(error("lead_mutation_unavailable", "retry_same_request"))).toBe("retry_same_request");
    expect(leadManagementErrorDisposition(error("idempotency_conflict", "none"))).toBe("new_request");
  });
});
