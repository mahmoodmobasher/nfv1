import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { toJSONSchema, type ZodType } from "zod";
import {
  leadConversionErrorEnvelopeV1Schema,
  leadConversionIneligibilityReasonV1Schema,
  leadConversionPreviewV1Schema,
  leadConversionResultV1Schema,
  leadConvertToDealCommandV1Schema,
} from "@/frontend/features/leads";

function canonical(schema: ZodType): unknown {
  const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== "$schema").sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)])) : value;
  return normalize(toJSONSchema(schema));
}
const ids = Array.from({ length: 12 }, (_, index) => `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const review = { reviewId: ids[2], reviewVersion: 1, decisionHeadId: ids[3], decisionHeadVersion: 1 };
const assignment = { responsibleMembershipId: ids[4], responsibleTeamId: null, visibility: "workspace" as const, visibleTeamIds: [] as string[] };
const preview = {
  contractVersion: "lead-conversion-preview.v1", lead: { leadId: ids[0], label: "Qualified Lead", lifecycle: "qualified", legacyStatus: "open", version: 2, intakeId: ids[1], intakeVersion: 1, review },
  eligible: true, ineligibilityReasons: [], capabilities: { canConvert: true },
  choices: { companies: [{ companyId: ids[5], label: "Visible Company", version: 1, disclosure: "full" }], primaryContacts: [{ contactId: ids[6], companyId: ids[5], label: "Visible Contact", version: 1, disclosure: "full", primaryEligible: true }] },
  pipeline: { pipelineId: ids[7], label: "Sales", version: 1, configurationVersion: 1, initialStage: { stageId: ids[8], label: "Qualification", version: 1 } },
  dealDefaults: { name: "Qualified Lead", value: null, expectedCloseOn: null }, assignment,
  effects: { createsDeal: true, createsCustomers: false, createsDeliveryProject: false, writesLineage: true, convertsCanonicalLeadLifecycle: true, preservesLegacyLeadStatus: true }, requestId: ids[9],
} as const;

describe("LEAD-CONVERSION-01 frontend transport", () => {
  const accepted = "src/backend/modules/leads/contracts/lead-conversion.contract.ts";
  it("mechanically matches the accepted backend schemas in ancestry", async () => {
    const backend = await import(/* @vite-ignore */ pathToFileURL(accepted).href), frontend = await import("@/frontend/features/leads/contracts/lead-conversion.contracts") as Record<string, unknown>;
    for (const name of ["leadConvertToDealCommandV1Schema", "leadConversionIneligibilityReasonV1Schema", "leadConversionPreviewV1Schema", "leadConversionResultV1Schema", "leadConversionErrorEnvelopeV1Schema"]) expect(canonical(frontend[name] as ZodType), name).toEqual(canonical(backend[name] as ZodType));
  });
  it("requires a resolved review head for every eligible preview", () => {
    expect(leadConversionPreviewV1Schema.safeParse(preview).success).toBe(true);
    expect(leadConversionPreviewV1Schema.safeParse({ ...preview, lead: { ...preview.lead, review: null } }).success).toBe(false);
    expect(leadConversionPreviewV1Schema.safeParse({ ...preview, eligible: false, capabilities: { canConvert: false }, ineligibilityReasons: ["identity_review_unresolved"], lead: { ...preview.lead, review: null } }).success).toBe(true);
  });
  it("echoes every preview token and enforces inherited Team visibility", () => {
    const command = { contractVersion: "lead-convert-to-deal.v1", expectedLeadVersion: 2, intakeId: ids[1], expectedIntakeVersion: 1, review, company: { companyId: ids[5], expectedVersion: 1 }, primaryContact: { contactId: ids[6], expectedVersion: 1 }, pipeline: { pipelineId: ids[7], expectedVersion: 1, expectedConfigurationVersion: 1, stageId: ids[8], expectedStageVersion: 1 }, deal: { name: "Qualified Lead", value: { amountMinor: "0", currencyCode: "CAD", currencyExponent: 2 }, expectedCloseOn: null }, assignment };
    expect(leadConvertToDealCommandV1Schema.safeParse(command).success).toBe(true);
    expect(leadConvertToDealCommandV1Schema.safeParse({ ...command, assignment: { responsibleMembershipId: ids[4], responsibleTeamId: ids[10], visibility: "teams", visibleTeamIds: [ids[11]] } }).success).toBe(false);
  });
  it("keeps results minimized and every failure atomic", () => {
    expect(leadConversionResultV1Schema.safeParse({ contractVersion: "lead-conversion-result.v1", leadId: ids[0], leadVersion: 3, deal: { available: true, dealId: ids[10] }, committed: true, replayed: true, requestId: ids[9], nextView: { kind: "deal_detail", dealId: ids[10] } }).success).toBe(true);
    expect(leadConversionErrorEnvelopeV1Schema.safeParse({ error: { code: "stale_preview", message: "Reload.", retryable: false, reconciliation: { required: true, action: "refetch_preview" }, guarantees: { zeroPartialEffects: true } }, requestId: ids[9] }).success).toBe(true);
    expect(leadConversionIneligibilityReasonV1Schema.safeParse("legacy_status_terminal").success).toBe(true);
  });
  it("keeps post-preview drift and request guards inside conversion-owned envelopes", () => {
    const stale = { error: { code: "stale_preview", message: "Reload the conversion preview.", retryable: false, reconciliation: { required: true, action: "refetch_preview" }, guarantees: { zeroPartialEffects: true } }, requestId: ids[9] };
    expect(leadConversionErrorEnvelopeV1Schema.safeParse(stale).success).toBe(true);
    expect(leadConversionErrorEnvelopeV1Schema.safeParse({ ...stale, error: { ...stale.error, code: "assignment_unavailable" } }).success).toBe(false);
    expect(leadConversionErrorEnvelopeV1Schema.safeParse({ code: "invalid_origin" }).success).toBe(false);
  });
});
