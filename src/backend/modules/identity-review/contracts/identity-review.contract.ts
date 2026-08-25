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
  if ("candidates" in value && value.candidates.length > 30) throw new Error("identity_review_presentation_unbounded");
  if ("items" in value && value.items.length > 50) throw new Error("identity_review_presentation_unbounded");
  return value;
}
