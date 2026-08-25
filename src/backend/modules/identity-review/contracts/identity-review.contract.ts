import { z } from "zod";

export const IDENTITY_REVIEW_DECISION_OPERATION = "lead-identity-review-decision.v1" as const;

const dimension = z.discriminatedUnion("action", [
  z.object({ action: z.literal("dismiss") }),
  z.object({ action: z.literal("create") }),
  z.object({ action: z.literal("link"), candidateId: z.string().uuid(), targetId: z.string().uuid(), expectedTargetVersion: z.number().int().positive() }),
]);

export const resolveIdentityReviewCommandV1Schema = z.object({
  contractVersion: z.literal(IDENTITY_REVIEW_DECISION_OPERATION),
  expectedLeadVersion: z.number().int().positive(),
  expectedReviewVersion: z.number().int().positive(),
  expectedIntakeVersion: z.number().int().positive(),
  outcome: z.literal("resolve"),
  contact: dimension,
  company: dimension,
  reasonCode: z.string().trim().min(1).max(80).optional(),
});

export type ResolveIdentityReviewCommandV1 = z.infer<typeof resolveIdentityReviewCommandV1Schema>;

export type IdentityReviewCandidateViewV1 = {
  contractVersion: "lead-identity-review-candidates.v1";
  reviewId: string;
  leadId: string;
  reviewVersion: number;
  leadVersion: number;
  intakeVersion: number;
  candidates: Array<{
    candidateId: string;
    targetType: "contact" | "company";
    targetId: string;
    targetVersion: number;
    displayName: string;
    email?: string;
    phone?: string;
    companyName?: string;
    evidenceKind: "email" | "phone" | "name_company";
    evidenceStrength: "strong" | "supplementary" | "probable";
  }>;
};
