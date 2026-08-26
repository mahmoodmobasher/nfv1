import { z } from "zod";

export const LEAD_CONVERSION_PREVIEW_QUERY = "lead-conversion-preview.v1" as const;
export const LEAD_CONVERT_TO_DEAL_OPERATION = "lead-convert-to-deal.v1" as const;

const uuid = z.string().uuid();
const version = z.number().int().positive();
const clean = (max: number) => z.string().trim().min(1).max(max).refine(value => !/[\u0000-\u001f\u007f]/.test(value));
const money = z.object({ amountMinor: z.string().regex(/^(0|[1-9][0-9]{0,19})$/), currencyCode: z.enum(["USD", "CAD"]), currencyExponent: z.literal(2) }).strict().nullable();
const assignment = z.object({ responsibleMembershipId: uuid, responsibleTeamId: uuid.nullable(), visibility: z.enum(["workspace", "teams"]), visibleTeamIds: z.array(uuid).max(20) }).strict();
const resolvedReviewToken = z.object({ reviewId: uuid, reviewVersion: version, decisionHeadId: uuid, decisionHeadVersion: version }).strict();
const reviewToken = resolvedReviewToken.nullable();

export const leadConvertToDealCommandV1Schema = z.object({
  contractVersion: z.literal(LEAD_CONVERT_TO_DEAL_OPERATION), expectedLeadVersion: version, intakeId: uuid, expectedIntakeVersion: version,
  review: resolvedReviewToken, company: z.object({ companyId: uuid, expectedVersion: version }).strict(),
  primaryContact: z.object({ contactId: uuid, expectedVersion: version }).strict().nullable(),
  pipeline: z.object({ pipelineId: uuid, expectedVersion: version, expectedConfigurationVersion: version, stageId: uuid, expectedStageVersion: version }).strict(),
  deal: z.object({ name: clean(200), value: money, expectedCloseOn: z.string().date().nullable() }).strict(), assignment,
}).strict().superRefine((value, context) => {
  if (new Set(value.assignment.visibleTeamIds).size !== value.assignment.visibleTeamIds.length) context.addIssue({ code: "custom", message: "duplicate_visible_team", path: ["assignment", "visibleTeamIds"] });
  if (value.assignment.visibility === "workspace" && value.assignment.visibleTeamIds.length > 0 || value.assignment.visibility === "teams" && value.assignment.visibleTeamIds.length === 0) context.addIssue({ code: "custom", message: "invalid_visible_team_set", path: ["assignment", "visibleTeamIds"] });
  if (value.assignment.visibility === "teams" && value.assignment.responsibleTeamId && !value.assignment.visibleTeamIds.includes(value.assignment.responsibleTeamId)) context.addIssue({ code: "custom", message: "responsible_team_must_be_visible", path: ["assignment", "visibleTeamIds"] });
});

export const leadConversionIneligibilityReasonV1Schema = z.enum(["permission_required", "lead_not_qualified", "identity_review_pending", "identity_review_unresolved", "already_converted", "legacy_status_terminal", "customer_selection_required", "customer_unavailable", "contact_not_primary_eligible", "pipeline_unavailable", "stage_unavailable", "assignment_unavailable"]);
const partyChoice = z.object({ id: uuid, label: clean(200), version, disclosure: z.literal("full") }).strict();
export const leadConversionPreviewV1Schema = z.object({
  contractVersion: z.literal(LEAD_CONVERSION_PREVIEW_QUERY),
  lead: z.object({ leadId: uuid, label: clean(200), lifecycle: z.enum(["new", "working", "qualified", "disqualified", "converted"]), legacyStatus: z.enum(["open", "won", "lost"]), version, intakeId: uuid, intakeVersion: version, review: reviewToken }).strict(),
  eligible: z.boolean(), ineligibilityReasons: z.array(leadConversionIneligibilityReasonV1Schema).max(12), capabilities: z.object({ canConvert: z.boolean() }).strict(),
  choices: z.object({
    companies: z.array(partyChoice.extend({ companyId: uuid }).omit({ id: true }).strict()).max(1),
    primaryContacts: z.array(partyChoice.extend({ contactId: uuid, companyId: uuid, primaryEligible: z.literal(true) }).omit({ id: true }).strict()).max(1),
  }).strict(),
  pipeline: z.object({ pipelineId: uuid, label: clean(100), version, configurationVersion: version, initialStage: z.object({ stageId: uuid, label: clean(100), version }).strict() }).strict().nullable(),
  dealDefaults: z.object({ name: clean(200), value: money, expectedCloseOn: z.string().date().nullable() }).strict(), assignment,
  effects: z.object({ createsDeal: z.literal(true), createsCustomers: z.literal(false), createsDeliveryProject: z.literal(false), writesLineage: z.literal(true), convertsCanonicalLeadLifecycle: z.literal(true), preservesLegacyLeadStatus: z.literal(true) }).strict(), requestId: uuid,
}).strict().superRefine((value, context) => {
  if (value.eligible !== value.capabilities.canConvert || value.eligible === Boolean(value.ineligibilityReasons.length)) context.addIssue({ code: "custom", message: "eligibility_mismatch", path: ["eligible"] });
  if (value.eligible && !value.lead.review) context.addIssue({ code: "custom", message: "resolved_review_required", path: ["lead", "review"] });
});

export const leadConversionResultV1Schema = z.object({
  contractVersion: z.literal("lead-conversion-result.v1"), leadId: uuid, leadVersion: version,
  deal: z.union([z.object({ available: z.literal(true), dealId: uuid }).strict(), z.object({ available: z.literal(false) }).strict()]),
  committed: z.literal(true), replayed: z.boolean(), requestId: uuid,
  nextView: z.union([z.object({ kind: z.literal("deal_detail"), dealId: uuid }).strict(), z.object({ kind: z.literal("lead_detail"), leadId: uuid }).strict()]),
}).strict();

export const leadConversionErrorEnvelopeV1Schema = z.object({ error: z.object({
  code: z.enum(["authentication_required", "permission_required", "resource_not_found", "validation_failed", "unsupported_contract_version", "stale_preview", "identity_review_pending", "selection_unavailable", "already_converted", "idempotency_conflict", "conversion_unavailable", "unexpected_error"]),
  message: clean(200), retryable: z.boolean(), reconciliation: z.object({ required: z.boolean(), action: z.enum(["none", "refetch_preview", "new_request", "retry_same_request", "clear_conversion_state"]) }).strict(), guarantees: z.object({ zeroPartialEffects: z.literal(true) }).strict(),
}).strict(), requestId: uuid }).strict();

export const leadConversionPreviewEnvelopeSchema = z.object({ data: leadConversionPreviewV1Schema }).strict();
export const leadConversionResultEnvelopeSchema = z.object({ data: leadConversionResultV1Schema }).strict();

export type LeadConvertToDealCommandV1 = z.infer<typeof leadConvertToDealCommandV1Schema>;
export type LeadConversionPreviewV1 = z.infer<typeof leadConversionPreviewV1Schema>;
export type LeadConversionResultV1 = z.infer<typeof leadConversionResultV1Schema>;
export type LeadConversionError = z.infer<typeof leadConversionErrorEnvelopeV1Schema>["error"];
