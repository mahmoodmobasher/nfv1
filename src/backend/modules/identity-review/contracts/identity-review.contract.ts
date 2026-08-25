import { z } from "zod";

export const IDENTITY_REVIEW_DECISION_OPERATION = "lead-identity-review-decision.v1" as const;

const dimension = z.discriminatedUnion("action", [
  z.object({ action: z.literal("dismiss") }),
  z.object({ action: z.literal("create") }),
  z.object({ action: z.literal("link"), candidateId: z.string().uuid(), targetId: z.string().uuid(), expectedTargetVersion: z.number().int().positive() }),
]);

const expectedVersions = {
  expectedLeadVersion: z.number().int().positive(),
  expectedReviewVersion: z.number().int().positive(),
  expectedIntakeVersion: z.number().int().positive(),
};

export const identityReviewDecisionCommandV1Schema = z.discriminatedUnion("outcome", [z.object({
  contractVersion: z.literal(IDENTITY_REVIEW_DECISION_OPERATION),
  ...expectedVersions,
  outcome: z.literal("resolve"),
  contact: dimension,
  company: dimension,
  reasonCode: z.string().trim().min(1).max(80).optional(),
}).strict(), z.object({
  contractVersion: z.literal(IDENTITY_REVIEW_DECISION_OPERATION),
  ...expectedVersions,
  outcome: z.literal("hold"),
  reasonCode: z.string().trim().min(1).max(80).optional(),
}).strict()]);

export const resolveIdentityReviewCommandV1Schema = identityReviewDecisionCommandV1Schema;
export type IdentityReviewDecisionCommandV1 = z.infer<typeof identityReviewDecisionCommandV1Schema>;
export type ResolveIdentityReviewCommandV1 = Extract<IdentityReviewDecisionCommandV1, { outcome: "resolve" }>;
export type HoldIdentityReviewCommandV1 = Extract<IdentityReviewDecisionCommandV1, { outcome: "hold" }>;

export type IdentityReviewCapabilitiesV1 = {
  canCreateContact: boolean;
  canCreateCompany: boolean;
  canLinkContact: boolean;
  canLinkCompany: boolean;
  canDismiss: boolean;
  canHold: boolean;
  canResolve: boolean;
};

export type IdentityReviewCandidateViewV1 = {
  contractVersion: "lead-identity-review-detail.v1";
  reviewId: string;
  leadId: string;
  requestId: string;
  reviewVersion: number;
  leadVersion: number;
  intakeVersion: number;
  lead: {
    displayName: string;
    maskedEmail: string | null;
    maskedPhone: string | null;
    companyName: string | null;
    lifecycle: string;
    receivedAt: string;
  };
  originalAttribution: {
    sourceCategory: string;
    sourcePlatform: string | null;
    sourceMedium: string;
    sourceDetail: Record<string, string>;
    campaignContext: Record<string, string>;
    attributionContractVersion: string;
    intakeChannel: "manual";
  };
  assignment: {
    responsibleMembershipId: string | null;
    responsibleTeamId: string | null;
    visibility: string;
  };
  capabilities: IdentityReviewCapabilitiesV1;
  candidateSummary: { strong: number; supplementary: number; probable: number };
  reconciliation: {
    status: "current" | "stale";
    retryable: boolean;
    action: "none" | "refresh_identity_review";
  };
  candidates: Array<{
    candidateId: string;
    targetType: "contact" | "company";
    targetId: string;
    targetVersion: number;
    expectedTargetVersion: number;
    displayName: string;
    maskedEmail: string | null;
    maskedPhone: string | null;
    companyName?: string;
    evidenceKind: "email" | "phone" | "name_company";
    evidenceStrength: "strong" | "supplementary" | "probable";
    canLink: boolean;
  }>;
  nextView: { kind: "identity_review_detail"; leadId: string; reviewId: string };
};

export type IdentityReviewQueueFilterV1 = {
  assignment: "all" | "mine" | "unassigned";
  evidence: "any" | "email" | "phone" | "name_company";
  limit: number;
  cursor?: string;
};

export type IdentityReviewQueueViewV1 = {
  contractVersion: "lead-identity-review-queue.v1";
  requestId: string;
  items: Array<{
    reviewId: string;
    leadId: string;
    lead: { displayName: string; companyName: string | null; receivedAt: string };
    originalAttribution: { sourceCategory: string; sourcePlatform: string | null; sourceMedium: string; intakeChannel: "manual" };
    assignment: { responsibleMembershipId: string | null; responsibleTeamId: string | null; visibility: string };
    versions: { lead: number; review: number; intake: number };
    candidateSummary: { strong: number; supplementary: number; probable: number };
    capabilities: IdentityReviewCapabilitiesV1;
    reconciliation: { status: "current" | "stale"; retryable: boolean; action: "none" | "refresh_identity_review" };
    updatedAt: string;
    nextView: { kind: "identity_review_detail"; leadId: string; reviewId: string };
  }>;
  nextCursor: string | null;
};

const uuidSchema = z.string().uuid();
const boundedNameSchema = z.string().min(1).max(200);
const maskedEmailSchema = z.string().max(320).regex(/^.{1}\*{3}@[^@\s]{1,253}$/u).nullable();
const maskedPhoneSchema = z.string().max(7).regex(/^\*{3}\d{1,4}$/).nullable();
const sourceCategorySchema = z.enum(["website", "referral", "outbound", "event", "partner", "social_media", "import", "manual", "other"]);
const sourcePlatformSchema = z.enum(["tiktok", "instagram", "facebook", "linkedin", "x", "youtube", "other_social"]);
const sourceMediumSchema = z.enum(["organic", "paid", "unknown"]);
const contextSchema = z.partialRecord(z.enum(["page", "account", "campaign", "ad", "form", "post", "operator_context"]),
  z.string().min(1).max(200));

export const identityReviewCapabilitiesV1Schema = z.object({
  canCreateContact: z.boolean(), canCreateCompany: z.boolean(), canLinkContact: z.boolean(), canLinkCompany: z.boolean(),
  canDismiss: z.boolean(), canHold: z.boolean(), canResolve: z.boolean(),
}).strict();

export const identityReviewReconciliationV1Schema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("current"), retryable: z.literal(false), action: z.literal("none") }).strict(),
  z.object({ status: z.literal("stale"), retryable: z.literal(true), action: z.literal("refresh_identity_review") }).strict(),
]);

const assignmentSchema = z.object({ responsibleMembershipId: uuidSchema.nullable(), responsibleTeamId: uuidSchema.nullable(),
  visibility: z.enum(["workspace", "teams"]) }).strict();
const detailNavigationSchema = z.object({ kind: z.literal("identity_review_detail"), leadId: uuidSchema, reviewId: uuidSchema }).strict();
const candidateSummarySchema = z.object({ strong: z.number().int().min(0).max(10),
  supplementary: z.number().int().min(0).max(10), probable: z.number().int().min(0).max(10) }).strict();
const attributionSchema = z.object({ sourceCategory: sourceCategorySchema, sourcePlatform: sourcePlatformSchema.nullable(),
  sourceMedium: sourceMediumSchema, sourceDetail: contextSchema, campaignContext: contextSchema,
  attributionContractVersion: z.literal("p1a-attribution-v1"), intakeChannel: z.literal("manual") }).strict()
  .superRefine((source, context) => {
    if ((source.sourceCategory === "social_media") !== (source.sourcePlatform !== null))
      context.addIssue({ code: "custom", message: "invalid_source_platform" });
  });
const queueAttributionSchema = z.object({ sourceCategory: sourceCategorySchema, sourcePlatform: sourcePlatformSchema.nullable(),
  sourceMedium: sourceMediumSchema, intakeChannel: z.literal("manual") }).strict()
  .superRefine((source, context) => {
    if ((source.sourceCategory === "social_media") !== (source.sourcePlatform !== null))
      context.addIssue({ code: "custom", message: "invalid_source_platform" });
  });
const candidateSchema = z.object({ candidateId: uuidSchema, targetType: z.enum(["contact", "company"]), targetId: uuidSchema,
  targetVersion: z.number().int().positive(), expectedTargetVersion: z.number().int().positive(), displayName: boundedNameSchema,
  maskedEmail: maskedEmailSchema, maskedPhone: maskedPhoneSchema, companyName: boundedNameSchema.optional(),
  evidenceKind: z.enum(["email", "phone", "name_company"]), evidenceStrength: z.enum(["strong", "supplementary", "probable"]),
  canLink: z.boolean() }).strict().superRefine((candidate, context) => {
    if (candidate.targetVersion !== candidate.expectedTargetVersion)
      context.addIssue({ code: "custom", message: "target_version_mismatch" });
    if ((candidate.targetType === "company") !== (candidate.companyName !== undefined))
      context.addIssue({ code: "custom", message: "invalid_company_presentation" });
    if (candidate.targetType === "company" && (candidate.maskedEmail !== null || candidate.maskedPhone !== null))
      context.addIssue({ code: "custom", message: "invalid_company_identity_fields" });
    if (candidate.targetType === "company" &&
        (candidate.evidenceKind !== "name_company" || candidate.evidenceStrength !== "probable"))
      context.addIssue({ code: "custom", message: "invalid_company_evidence" });
    if (candidate.evidenceKind === "email" && candidate.evidenceStrength !== "strong")
      context.addIssue({ code: "custom", message: "invalid_email_evidence" });
    if (candidate.evidenceKind === "phone" && candidate.evidenceStrength !== "supplementary")
      context.addIssue({ code: "custom", message: "invalid_phone_evidence" });
    if (candidate.evidenceKind === "name_company" && candidate.evidenceStrength !== "probable")
      context.addIssue({ code: "custom", message: "invalid_name_company_evidence" });
  });

function validateStalePresentation(value: { reconciliation: { status: "current" | "stale" };
  capabilities: IdentityReviewCapabilitiesV1; candidateSummary: { strong: number; supplementary: number; probable: number } },
context: z.RefinementCtx) {
  if (value.reconciliation.status !== "stale") return;
  if (!value.capabilities.canHold) context.addIssue({ code: "custom", message: "stale_hold_unavailable" });
  if (value.capabilities.canCreateContact || value.capabilities.canCreateCompany || value.capabilities.canLinkContact ||
      value.capabilities.canLinkCompany || value.capabilities.canDismiss || value.capabilities.canResolve)
    context.addIssue({ code: "custom", message: "stale_capability_disclosure" });
  if (value.candidateSummary.strong || value.candidateSummary.supplementary || value.candidateSummary.probable)
    context.addIssue({ code: "custom", message: "stale_candidate_summary" });
}

export const identityReviewDetailViewV1Schema = z.object({ contractVersion: z.literal("lead-identity-review-detail.v1"),
  reviewId: uuidSchema, leadId: uuidSchema, requestId: uuidSchema, reviewVersion: z.number().int().positive(),
  leadVersion: z.number().int().positive(), intakeVersion: z.number().int().positive(),
  lead: z.object({ displayName: boundedNameSchema, maskedEmail: maskedEmailSchema, maskedPhone: maskedPhoneSchema,
    companyName: boundedNameSchema.nullable(), lifecycle: z.enum(["new", "working", "qualified", "disqualified", "converted"]),
    receivedAt: z.string().datetime({ offset: true }) }).strict(),
  originalAttribution: attributionSchema, assignment: assignmentSchema, capabilities: identityReviewCapabilitiesV1Schema,
  candidateSummary: candidateSummarySchema, reconciliation: identityReviewReconciliationV1Schema,
  candidates: z.array(candidateSchema).max(30), nextView: detailNavigationSchema }).strict()
  .superRefine((view, context) => {
    validateStalePresentation(view, context);
    if (view.reconciliation.status === "stale" && view.candidates.length)
      context.addIssue({ code: "custom", message: "stale_candidate_disclosure" });
    if (view.nextView.leadId !== view.leadId || view.nextView.reviewId !== view.reviewId)
      context.addIssue({ code: "custom", message: "navigation_identity_mismatch" });
    const actual = { strong: view.candidates.filter(candidate => candidate.evidenceStrength === "strong").length,
      supplementary: view.candidates.filter(candidate => candidate.evidenceStrength === "supplementary").length,
      probable: view.candidates.filter(candidate => candidate.evidenceStrength === "probable").length };
    if (actual.strong !== view.candidateSummary.strong || actual.supplementary !== view.candidateSummary.supplementary ||
        actual.probable !== view.candidateSummary.probable)
      context.addIssue({ code: "custom", message: "candidate_summary_mismatch" });
    for (const candidate of view.candidates)
      if (candidate.canLink && !(candidate.targetType === "contact" ? view.capabilities.canLinkContact : view.capabilities.canLinkCompany))
        context.addIssue({ code: "custom", message: "candidate_link_capability_mismatch" });
    for (const kind of ["email", "phone", "name_company"] as const)
      if (view.candidates.filter(candidate => candidate.evidenceKind === kind).length > 10)
        context.addIssue({ code: "custom", message: "candidate_class_unbounded" });
  });

export const identityReviewQueueViewV1Schema = z.object({ contractVersion: z.literal("lead-identity-review-queue.v1"),
  requestId: uuidSchema, items: z.array(z.object({ reviewId: uuidSchema, leadId: uuidSchema,
    lead: z.object({ displayName: boundedNameSchema, companyName: boundedNameSchema.nullable(),
      receivedAt: z.string().datetime({ offset: true }) }).strict(), originalAttribution: queueAttributionSchema,
    assignment: assignmentSchema, versions: z.object({ lead: z.number().int().positive(), review: z.number().int().positive(),
      intake: z.number().int().positive() }).strict(), candidateSummary: candidateSummarySchema,
    capabilities: identityReviewCapabilitiesV1Schema, reconciliation: identityReviewReconciliationV1Schema,
    updatedAt: z.string().datetime({ offset: true }), nextView: detailNavigationSchema }).strict()
    .superRefine((item, context) => {
      validateStalePresentation(item, context);
      if (item.nextView.leadId !== item.leadId || item.nextView.reviewId !== item.reviewId)
        context.addIssue({ code: "custom", message: "navigation_identity_mismatch" });
    })).max(50),
  nextCursor: z.string().min(1).max(1024).regex(/^[A-Za-z0-9_-]+$/).nullable() }).strict();

const forbiddenPresentationKeys = new Set(["email", "phone", "emailNormalized", "phoneNormalized", "domain",
  "domainNormalized", "personNameNormalized", "candidateCount"]);

export function assertIdentityReviewPresentationSafe<T extends IdentityReviewCandidateViewV1 | IdentityReviewQueueViewV1>(value: T): T {
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) { for (const child of item) visit(child); return; }
    if (!item || typeof item !== "object") return;
    for (const [key, child] of Object.entries(item)) {
      if (forbiddenPresentationKeys.has(key)) throw new Error("identity_review_presentation_privacy_violation");
      visit(child);
    }
  };
  visit(value);
  const parsed = value.contractVersion === "lead-identity-review-detail.v1"
    ? identityReviewDetailViewV1Schema.safeParse(value) : identityReviewQueueViewV1Schema.safeParse(value);
  if (!parsed.success) throw new Error("identity_review_presentation_contract_violation");
  return value;
}
