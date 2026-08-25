import { z } from "zod";

export const LEAD_INQUIRY_INTAKE_OPERATION = "lead-inquiry-intake.v1" as const;
export const LEAD_INQUIRY_INTAKE_RESULT = "lead-inquiry-intake-result.v1" as const;
export const IDENTITY_NORMALIZATION_VERSION = "p1a-identity-v1" as const;
export const ATTRIBUTION_CONTRACT_VERSION = "p1a-attribution-v1" as const;

const boundedContext = z.partialRecord(
  z.enum(["page", "account", "campaign", "ad", "form", "post", "operator_context"]),
  z.string().trim().min(1).max(200),
).optional().default({});

export const leadInquiryIntakeCommandV1Schema = z.object({
  contractVersion: z.literal(LEAD_INQUIRY_INTAKE_OPERATION),
  intakeChannel: z.literal("manual"),
  person: z.object({
    displayName: z.string().trim().min(1).max(200),
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    email: z.string().trim().email().max(320).optional(),
    phone: z.string().trim().min(3).max(50).optional(),
    phoneCountryOverride: z.enum(["CA", "US"]).optional(),
  }).superRefine((person, context) => {
    if (!person.email && !person.phone) context.addIssue({ code: "custom", message: "email_or_phone_required" });
  }),
  organization: z.object({
    name: z.string().trim().min(1).max(200),
    domain: z.string().trim().min(1).max(253).optional(),
  }).optional(),
  inquiry: z.object({
    subject: z.string().trim().max(200).optional(),
    message: z.string().trim().max(4000).optional(),
    receivedAt: z.string().datetime({ offset: true }),
  }),
  source: z.object({
    sourceCategory: z.enum(["website", "referral", "outbound", "event", "partner", "social_media", "import", "manual", "other"]),
    sourcePlatform: z.enum(["tiktok", "instagram", "facebook", "linkedin", "x", "youtube", "other_social"]).optional(),
    sourceMedium: z.enum(["organic", "paid", "unknown"]).default("unknown"),
    sourceDetail: boundedContext,
    campaignContext: boundedContext,
    attributionContractVersion: z.literal(ATTRIBUTION_CONTRACT_VERSION).default(ATTRIBUTION_CONTRACT_VERSION),
  }).superRefine((source, context) => {
    if (source.sourceCategory === "social_media" && !source.sourcePlatform) {
      context.addIssue({ code: "custom", message: "source_platform_required", path: ["sourcePlatform"] });
    }
    if (source.sourceCategory !== "social_media" && source.sourcePlatform) {
      context.addIssue({ code: "custom", message: "source_platform_not_allowed", path: ["sourcePlatform"] });
    }
    if (source.sourcePlatform === "other_social" && !source.sourceDetail.operator_context) {
      context.addIssue({ code: "custom", message: "source_detail_required", path: ["sourceDetail"] });
    }
  }),
  requestedAssignment: z.object({
    responsibleMembershipId: z.string().uuid().optional(),
    responsibleTeamId: z.string().uuid().optional(),
    membershipId: z.string().uuid().optional(),
    teamId: z.string().uuid().optional(),
  }).superRefine((assignment, context) => {
    if (assignment.responsibleMembershipId && assignment.membershipId && assignment.responsibleMembershipId !== assignment.membershipId)
      context.addIssue({ code: "custom", message: "conflicting_assignment", path: ["responsibleMembershipId"] });
    if (assignment.responsibleTeamId && assignment.teamId && assignment.responsibleTeamId !== assignment.teamId)
      context.addIssue({ code: "custom", message: "conflicting_assignment", path: ["responsibleTeamId"] });
  }).optional(),
}).strict();

export type LeadInquiryIntakeCommandV1 = z.infer<typeof leadInquiryIntakeCommandV1Schema>;

export type CandidateSummaryV1 = { strong: number; supplementary: number; probable: number };
export type LeadInquiryIntakeResultV1 = {
  contractVersion: typeof LEAD_INQUIRY_INTAKE_RESULT;
  intakeId: string;
  leadId: string;
  disposition: "created" | "held_for_review" | "replayed";
  contactId: string | null;
  companyId: string | null;
  reviewCaseId: string | null;
  candidateSummary: CandidateSummaryV1;
  leadVersion: number;
  reviewVersion: number | null;
  replayed: boolean;
  requestId: string;
  nextView: { kind: "lead_detail"; leadId: string } | { kind: "identity_review_detail"; leadId: string; reviewId: string };
};

export type LegacyLeadCreateV1 = {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  phone?: string;
  source: "website" | "referral" | "event" | "partner" | "other";
  stageId: string;
  ownerMembershipId?: string;
  visibility: "workspace" | "teams";
  teamIds: string[];
  note?: string;
};

export type LeadIntakeErrorCode =
  | "authentication_required" | "permission_required" | "resource_not_found" | "validation_failed"
  | "unsupported_contract_version" | "source_platform_required" | "source_platform_not_allowed"
  | "invalid_source_category" | "invalid_source_platform" | "invalid_source_medium" | "source_detail_too_large"
  | "idempotency_conflict" | "stale_version" | "invalid_match_decision"
  | "assignment_unavailable" | "rate_limited" | "intake_unavailable" | "unexpected_error";

export class LeadIntakeError extends Error {
  constructor(public code: LeadIntakeErrorCode, public status: number, public safe?: unknown) { super(code); }
}
