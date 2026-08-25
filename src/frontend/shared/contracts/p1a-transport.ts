import { z } from "zod";

const uuid = z.string().uuid();
const positiveVersion = z.number().int().positive();
const boundedName = z.string().min(1).max(200);
const sourceCategory = z.enum(["website", "referral", "outbound", "event", "partner", "social_media", "import", "manual", "other"]);
const socialPlatform = z.enum(["tiktok", "instagram", "facebook", "linkedin", "x", "youtube", "other_social"]);
const sourceMedium = z.enum(["organic", "paid", "unknown"]);
const context = z.partialRecord(z.enum(["page", "account", "campaign", "ad", "form", "post", "operator_context"]), z.string().trim().min(1).max(200));
const candidateSummary = z.object({ strong: z.number().int().min(0).max(10), supplementary: z.number().int().min(0).max(10), probable: z.number().int().min(0).max(10) }).strict();
const maskedEmail = z.string().max(320).regex(/^.{1}\*{3}@[^@\s]{1,253}$/u).nullable();
const maskedPhone = z.string().max(7).regex(/^\*{3}\d{1,4}$/).nullable();

export const leadInquiryIntakeCommandV1Schema = z.object({
  contractVersion: z.literal("lead-inquiry-intake.v1"), intakeChannel: z.literal("manual"),
  person: z.object({ displayName: z.string().trim().min(1).max(200), firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(), email: z.string().trim().email().max(320).optional(),
    phone: z.string().trim().max(50).optional(), phoneCountryOverride: z.enum(["CA", "US"]).optional() }).strict()
    .superRefine((person, issue) => { if (!person.email && !person.phone) issue.addIssue({ code: "custom", message: "email_or_phone_required" }); }),
  organization: z.object({ name: z.string().trim().min(1).max(200), domain: z.string().trim().min(1).max(253).optional() }).strict().optional(),
  inquiry: z.object({ subject: z.string().trim().max(200).optional(), message: z.string().trim().max(4000).optional(), receivedAt: z.string().datetime({ offset: true }) }).strict(),
  source: z.object({ sourceCategory, sourcePlatform: socialPlatform.optional(), sourceMedium: sourceMedium.default("unknown"),
    sourceDetail: context.optional().default({}), campaignContext: context.optional().default({}),
    attributionContractVersion: z.literal("p1a-attribution-v1").default("p1a-attribution-v1") }).strict()
    .superRefine((source, issue) => {
      if (source.sourceCategory === "social_media" && !source.sourcePlatform) issue.addIssue({ code: "custom", message: "source_platform_required", path: ["sourcePlatform"] });
      if (source.sourceCategory !== "social_media" && source.sourcePlatform) issue.addIssue({ code: "custom", message: "source_platform_not_allowed", path: ["sourcePlatform"] });
      if (source.sourcePlatform === "other_social" && !source.sourceDetail.operator_context) issue.addIssue({ code: "custom", message: "source_detail_required", path: ["sourceDetail"] });
    }),
  requestedAssignment: z.object({ responsibleMembershipId: uuid.optional(), responsibleTeamId: uuid.optional(), membershipId: uuid.optional(), teamId: uuid.optional() }).strict()
    .superRefine((assignment, issue) => {
      if (assignment.responsibleMembershipId && assignment.membershipId && assignment.responsibleMembershipId !== assignment.membershipId)
        issue.addIssue({ code: "custom", message: "conflicting_assignment", path: ["responsibleMembershipId"] });
      if (assignment.responsibleTeamId && assignment.teamId && assignment.responsibleTeamId !== assignment.teamId)
        issue.addIssue({ code: "custom", message: "conflicting_assignment", path: ["responsibleTeamId"] });
    }).optional(),
}).strict();

const detailNavigation = z.object({ kind: z.literal("identity_review_detail"), leadId: uuid, reviewId: uuid }).strict();
const leadNavigation = z.object({ kind: z.literal("lead_detail"), leadId: uuid }).strict();
const queueNavigation = z.object({ kind: z.literal("identity_review_queue") }).strict();

export const intakeResultSchema = z.object({ contractVersion: z.literal("lead-inquiry-intake-result.v1"), intakeId: uuid, leadId: uuid,
  disposition: z.enum(["created", "held_for_review", "replayed"]), contactId: uuid.nullable(), companyId: uuid.nullable(),
  reviewCaseId: uuid.nullable(), candidateSummary, leadVersion: positiveVersion, reviewVersion: positiveVersion.nullable(),
  replayed: z.boolean(), requestId: uuid, nextView: z.union([leadNavigation, detailNavigation]) }).strict();

export const capabilitiesSchema = z.object({ canCreateContact: z.boolean(), canCreateCompany: z.boolean(), canLinkContact: z.boolean(),
  canLinkCompany: z.boolean(), canDismiss: z.boolean(), canHold: z.boolean(), canResolve: z.boolean() }).strict();
export const reconciliationSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("current"), retryable: z.literal(false), action: z.literal("none") }).strict(),
  z.object({ status: z.literal("stale"), retryable: z.literal(true), action: z.literal("refresh_identity_review") }).strict(),
]);
const assignment = z.object({ responsibleMembershipId: uuid.nullable(), responsibleTeamId: uuid.nullable(), visibility: z.enum(["workspace", "teams"]) }).strict();
const attribution = z.object({ sourceCategory, sourcePlatform: socialPlatform.nullable(), sourceMedium, sourceDetail: context,
  campaignContext: context, attributionContractVersion: z.literal("p1a-attribution-v1"), intakeChannel: z.literal("manual") }).strict()
  .superRefine((value, issue) => { if ((value.sourceCategory === "social_media") !== (value.sourcePlatform !== null)) issue.addIssue({ code: "custom", message: "invalid_source_platform" }); });
const queueAttribution = z.object({ sourceCategory, sourcePlatform: socialPlatform.nullable(), sourceMedium, intakeChannel: z.literal("manual") }).strict()
  .superRefine((value, issue) => { if ((value.sourceCategory === "social_media") !== (value.sourcePlatform !== null)) issue.addIssue({ code: "custom", message: "invalid_source_platform" }); });
export const candidateSchema = z.object({ candidateId: uuid, targetType: z.enum(["contact", "company"]), targetId: uuid,
  targetVersion: positiveVersion, expectedTargetVersion: positiveVersion, displayName: boundedName, maskedEmail, maskedPhone,
  companyName: boundedName.optional(), evidenceKind: z.enum(["email", "phone", "name_company"]),
  evidenceStrength: z.enum(["strong", "supplementary", "probable"]), canLink: z.boolean() }).strict().superRefine((candidate, issue) => {
    if (candidate.targetVersion !== candidate.expectedTargetVersion) issue.addIssue({ code: "custom", message: "target_version_mismatch" });
    if ((candidate.targetType === "company") !== (candidate.companyName !== undefined)) issue.addIssue({ code: "custom", message: "invalid_company_presentation" });
    if (candidate.targetType === "company" && (candidate.maskedEmail !== null || candidate.maskedPhone !== null)) issue.addIssue({ code: "custom", message: "invalid_company_identity_fields" });
    const validEvidence = candidate.evidenceKind === "email" ? candidate.evidenceStrength === "strong" : candidate.evidenceKind === "phone" ? candidate.evidenceStrength === "supplementary" : candidate.evidenceStrength === "probable";
    if (!validEvidence || (candidate.targetType === "company" && candidate.evidenceKind !== "name_company")) issue.addIssue({ code: "custom", message: "invalid_candidate_evidence" });
  });

function validateStale(value: { reconciliation: z.infer<typeof reconciliationSchema>; capabilities: z.infer<typeof capabilitiesSchema>; candidateSummary: z.infer<typeof candidateSummary> }, issue: z.RefinementCtx) {
  if (value.reconciliation.status !== "stale") return;
  if (!value.capabilities.canHold || value.capabilities.canCreateContact || value.capabilities.canCreateCompany || value.capabilities.canLinkContact || value.capabilities.canLinkCompany || value.capabilities.canDismiss || value.capabilities.canResolve)
    issue.addIssue({ code: "custom", message: "invalid_stale_capabilities" });
  if (value.candidateSummary.strong || value.candidateSummary.supplementary || value.candidateSummary.probable) issue.addIssue({ code: "custom", message: "stale_candidate_summary" });
}

export const reviewDetailSchema = z.object({ contractVersion: z.literal("lead-identity-review-detail.v1"), reviewId: uuid, leadId: uuid,
  requestId: uuid, reviewVersion: positiveVersion, leadVersion: positiveVersion, intakeVersion: positiveVersion,
  lead: z.object({ displayName: boundedName, maskedEmail, maskedPhone, companyName: boundedName.nullable(),
    lifecycle: z.enum(["new", "working", "qualified", "disqualified", "converted"]), receivedAt: z.string().datetime({ offset: true }) }).strict(),
  originalAttribution: attribution, assignment, capabilities: capabilitiesSchema, candidateSummary, reconciliation: reconciliationSchema,
  candidates: z.array(candidateSchema).max(30), nextView: detailNavigation }).strict().superRefine((view, issue) => {
    validateStale(view, issue);
    if (view.reconciliation.status === "stale" && view.candidates.length) issue.addIssue({ code: "custom", message: "stale_candidate_disclosure" });
    if (view.nextView.leadId !== view.leadId || view.nextView.reviewId !== view.reviewId) issue.addIssue({ code: "custom", message: "navigation_identity_mismatch" });
    const totals = { strong: 0, supplementary: 0, probable: 0 };
    for (const candidate of view.candidates) {
      totals[candidate.evidenceStrength]++;
      if (candidate.canLink && !(candidate.targetType === "contact" ? view.capabilities.canLinkContact : view.capabilities.canLinkCompany)) issue.addIssue({ code: "custom", message: "candidate_link_capability_mismatch" });
    }
    if (Object.keys(totals).some(key => totals[key as keyof typeof totals] !== view.candidateSummary[key as keyof typeof totals])) issue.addIssue({ code: "custom", message: "candidate_summary_mismatch" });
    for (const kind of ["email", "phone", "name_company"] as const) if (view.candidates.filter(candidate => candidate.evidenceKind === kind).length > 10) issue.addIssue({ code: "custom", message: "candidate_class_unbounded" });
  });

export const reviewQueueSchema = z.object({ contractVersion: z.literal("lead-identity-review-queue.v1"), requestId: uuid,
  items: z.array(z.object({ reviewId: uuid, leadId: uuid, lead: z.object({ displayName: boundedName, companyName: boundedName.nullable(), receivedAt: z.string().datetime({ offset: true }) }).strict(),
    originalAttribution: queueAttribution, assignment, versions: z.object({ lead: positiveVersion, review: positiveVersion, intake: positiveVersion }).strict(),
    candidateSummary, capabilities: capabilitiesSchema, reconciliation: reconciliationSchema, updatedAt: z.string().datetime({ offset: true }), nextView: detailNavigation }).strict()
    .superRefine((item, issue) => { validateStale(item, issue); if (item.nextView.leadId !== item.leadId || item.nextView.reviewId !== item.reviewId) issue.addIssue({ code: "custom", message: "navigation_identity_mismatch" }); })).max(50),
  nextCursor: z.string().min(1).max(1024).regex(/^[A-Za-z0-9_-]+$/).nullable() }).strict();

const leadContext = z.partialRecord(z.enum(["page", "account", "campaign", "ad", "form", "post", "operator_context", "platform_context"]),
  z.string().min(1).max(200));
const leadReviewNavigation = z.object({ kind: z.literal("identity_review_detail"), leadId: uuid }).strict();
export const leadSummaryItemSchema = z.object({
  leadId: uuid, displayName: boundedName,
  structuredName: z.object({ firstName: z.string().max(100).nullable(), lastName: z.string().max(100).nullable() }).strict(),
  contact: z.object({ contactId: uuid.nullable(), maskedEmail, maskedPhone }).strict(),
  company: z.object({ companyId: uuid.nullable(), displayName: z.string().max(200).nullable() }).strict(),
  assignment: z.object({ responsibleMembershipId: uuid.nullable(), responsibleMembershipLabel: z.string().max(200).nullable(),
    responsibleTeamId: uuid.nullable(), responsibleTeamLabel: z.string().max(200).nullable(), isUnassigned: z.boolean() }).strict(),
  lifecycle: z.object({ code: z.string().max(80).nullable(), label: z.string().max(120).nullable(),
    status: z.enum(["open", "won", "lost"]) }).strict(),
  stage: z.object({ id: uuid, name: z.string().min(1).max(160), status: z.enum(["active", "archived"]) }).strict(),
  version: positiveVersion, identityReviewStatus: z.enum(["not_required", "pending", "resolved"]), visibility: z.enum(["workspace", "teams"]),
  receivedAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }),
  originalAttribution: z.object({ sourceCategory, sourcePlatform: socialPlatform.nullable(), sourceMedium,
    sourceDetail: leadContext, campaignContext: leadContext, attributionContractVersion: z.string().min(1).max(80),
    intakeChannel: z.enum(["web_form", "manual", "csv", "spreadsheet", "future_api", "future_integration"]) }).strict(),
  capabilities: z.object({ canView: z.literal(true), canEdit: z.literal(false), canReview: z.boolean() }).strict(),
  nextView: z.discriminatedUnion("kind", [leadNavigation, leadReviewNavigation]),
}).strict().superRefine((lead, issue) => {
  if (lead.nextView.leadId !== lead.leadId) issue.addIssue({ code: "custom", message: "navigation_identity_mismatch" });
  if (lead.capabilities.canReview !== (lead.identityReviewStatus === "pending" && lead.nextView.kind === "identity_review_detail"))
    issue.addIssue({ code: "custom", message: "review_capability_navigation_mismatch" });
});
export const leadSummariesViewSchema = z.object({ contractVersion: z.literal("listLeadSummaries.v1"), requestId: uuid,
  items: z.array(leadSummaryItemSchema).max(50), nextCursor: z.string().max(1024).nullable() }).strict();
export const leadDetailViewSchema = z.object({ contractVersion: z.literal("getLeadDetail.v1"), requestId: uuid,
  lead: leadSummaryItemSchema }).strict();
export const leadPipelineStageSchema = z.object({ stageId: uuid, name: z.string().min(1).max(160),
  position: z.number().int().min(0), status: z.literal("active") }).strict();
export const leadPipelineStagesViewSchema = z.object({ contractVersion: z.literal("listLeadPipelineStages.v1"), requestId: uuid,
  items: z.array(leadPipelineStageSchema).max(100) }).strict().superRefine((view, issue) => {
  for (let index = 1; index < view.items.length; index++) {
    const previous = view.items[index - 1], current = view.items[index];
    if (previous.position > current.position || (previous.position === current.position && previous.stageId >= current.stageId))
      issue.addIssue({ code: "custom", message: "pipeline_stage_order_invalid", path: ["items", index] });
  }
});

const dimensionDecision = z.discriminatedUnion("action", [z.object({ action: z.literal("dismiss") }).strict(), z.object({ action: z.literal("create") }).strict(),
  z.object({ action: z.literal("link"), candidateId: uuid, targetId: uuid, expectedTargetVersion: positiveVersion }).strict()]);
export const decisionCommandSchema = z.discriminatedUnion("outcome", [
  z.object({ contractVersion: z.literal("lead-identity-review-decision.v1"), expectedLeadVersion: positiveVersion, expectedReviewVersion: positiveVersion,
    expectedIntakeVersion: positiveVersion, outcome: z.literal("hold"), reasonCode: z.string().trim().min(1).max(80).optional() }).strict(),
  z.object({ contractVersion: z.literal("lead-identity-review-decision.v1"), expectedLeadVersion: positiveVersion, expectedReviewVersion: positiveVersion,
    expectedIntakeVersion: positiveVersion, outcome: z.literal("resolve"), contact: dimensionDecision, company: dimensionDecision,
    reasonCode: z.string().trim().min(1).max(80).optional() }).strict(),
]);
export const decisionResultSchema = z.object({ contractVersion: z.literal("lead-identity-review-decision-result.v1"), outcome: z.enum(["hold", "resolve"]),
  disposition: z.enum(["held_for_review", "resolved", "replayed"]), reviewId: uuid, leadId: uuid, contactId: uuid.nullable(),
  companyId: uuid.nullable(), leadVersion: positiveVersion, reviewVersion: positiveVersion, replayed: z.boolean(), requestId: uuid,
  nextView: z.union([detailNavigation, queueNavigation]) }).strict();

const errorCode = z.enum(["authentication_required", "permission_required", "resource_not_found", "validation_failed", "unsupported_contract_version",
  "source_platform_required", "source_platform_not_allowed", "invalid_source_category", "invalid_source_platform", "invalid_source_medium",
  "source_detail_too_large", "idempotency_conflict", "stale_version", "invalid_match_decision", "assignment_unavailable", "rate_limited",
  "intake_unavailable", "unexpected_error"]);
const stableErrors = {
  authentication_required: ["Authentication is required.", "none"], permission_required: ["This action is not available.", "none"],
  resource_not_found: ["The requested resource is unavailable.", "none"], validation_failed: ["The request is invalid.", "none"],
  unsupported_contract_version: ["The contract version is not supported.", "none"], source_platform_required: ["The source platform is required.", "none"],
  source_platform_not_allowed: ["The source platform is not allowed.", "none"], invalid_source_category: ["The source category is invalid.", "none"],
  invalid_source_platform: ["The source platform is invalid.", "none"], invalid_source_medium: ["The source medium is invalid.", "none"],
  source_detail_too_large: ["The source context is too large.", "none"], idempotency_conflict: ["The idempotency key conflicts with a prior request.", "none"],
  stale_version: ["The identity review has changed.", "refetch_identity_review"], invalid_match_decision: ["The selected identity is no longer available.", "refetch_identity_review"],
  assignment_unavailable: ["The selected responsibility is unavailable.", "refetch_identity_review"], rate_limited: ["Too many requests. Try again later.", "retry_same_request"],
  intake_unavailable: ["Lead intake is temporarily unavailable.", "retry_same_request"], unexpected_error: ["The request could not be completed.", "retry_same_request"],
} as const;
export const errorEnvelopeSchema = z.object({ error: z.object({ code: errorCode, message: z.string().min(1).max(200), retryable: z.boolean(),
  reconciliation: z.object({ required: z.boolean(), action: z.enum(["none", "refetch_identity_review", "retry_same_request"]) }).strict(),
  details: z.object({ fields: z.array(z.string().min(1).max(128).regex(/^[A-Za-z0-9_.-]+$/)).max(32) }).strict().optional() }).strict(),
  requestId: uuid, nextView: z.object({ kind: z.literal("identity_review_detail"), leadId: uuid }).strict().optional() }).strict()
  .superRefine((envelope, issue) => {
    const action = envelope.error.reconciliation.action;
    const expected = stableErrors[envelope.error.code];
    if (envelope.error.message !== expected[0] || action !== expected[1]) issue.addIssue({ code: "custom", message: "invalid_stable_error_presentation" });
    if (envelope.error.reconciliation.required !== (action !== "none")) issue.addIssue({ code: "custom", message: "invalid_reconciliation_required" });
    if (envelope.error.retryable !== (action === "retry_same_request")) issue.addIssue({ code: "custom", message: "invalid_retryability" });
  });

export const intakeSuccessEnvelopeSchema = z.object({ data: intakeResultSchema }).strict();
export const detailSuccessEnvelopeSchema = z.object({ data: reviewDetailSchema }).strict();
export const queueSuccessEnvelopeSchema = z.object({ data: reviewQueueSchema }).strict();
export const decisionSuccessEnvelopeSchema = z.object({ data: decisionResultSchema }).strict();
export const leadSummariesSuccessEnvelopeSchema = z.object({ data: leadSummariesViewSchema }).strict();
export const leadDetailSuccessEnvelopeSchema = z.object({ data: leadDetailViewSchema }).strict();
export const leadPipelineStagesSuccessEnvelopeSchema = z.object({ data: leadPipelineStagesViewSchema }).strict();

export type SourceCategory = z.infer<typeof sourceCategory>;
export type SocialPlatform = z.infer<typeof socialPlatform>;
export type SourceMedium = z.infer<typeof sourceMedium>;
export type LeadInquiryIntakeCommandV1 = z.infer<typeof leadInquiryIntakeCommandV1Schema>;
export type IntakeResult = z.infer<typeof intakeResultSchema>;
export type P1AError = z.infer<typeof errorEnvelopeSchema>["error"];
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
export type Capabilities = z.infer<typeof capabilitiesSchema>;
export type Reconciliation = z.infer<typeof reconciliationSchema>;
export type Candidate = z.infer<typeof candidateSchema>;
export type ReviewDetail = z.infer<typeof reviewDetailSchema>;
export type ReviewQueue = z.infer<typeof reviewQueueSchema>;
export type QueueItem = ReviewQueue["items"][number];
export type DimensionDecision = z.infer<typeof dimensionDecision>;
export type DecisionCommand = z.infer<typeof decisionCommandSchema>;
export type DecisionResult = z.infer<typeof decisionResultSchema>;
export type ReviewErrorEnvelope = ErrorEnvelope;
export type LeadSummaryItem = z.infer<typeof leadSummaryItemSchema>;
export type LeadSummariesView = z.infer<typeof leadSummariesViewSchema>;
export type LeadDetailView = z.infer<typeof leadDetailViewSchema>;
export type LeadPipelineStage = z.infer<typeof leadPipelineStageSchema>;
export type LeadPipelineStagesView = z.infer<typeof leadPipelineStagesViewSchema>;
