import { describe, expect, it } from "vitest";
import { identityReviewDecisionCommandV1Schema as backendDecisionCommand,
  identityReviewDetailViewV1Schema as backendDetail, identityReviewQueueViewV1Schema as backendQueue } from "../src/backend/modules/identity-review";
import { leadInquiryIntakeCommandV1Schema as backendIntakeCommand } from "../src/backend/modules/leads";
import { heldResultFixture, manualInstagramFixture } from "../src/frontend/features/leads/testing/lead-intake.fixtures";
import { emptyQueueFixture, reviewDetailFixture } from "../src/frontend/features/identity-review/testing/identity-review.fixtures";
import { decisionCommandSchema, decisionResultSchema, decisionSuccessEnvelopeSchema, detailSuccessEnvelopeSchema,
  errorEnvelopeSchema, intakeResultSchema, intakeSuccessEnvelopeSchema, leadInquiryIntakeCommandV1Schema,
  queueSuccessEnvelopeSchema, reviewDetailSchema, reviewQueueSchema } from "../src/frontend/shared/contracts/p1a-transport";

const identifiers = { leadId: "30000000-0000-4000-8000-000000000001", reviewId: "30000000-0000-4000-8000-000000000002",
  requestId: "30000000-0000-4000-8000-000000000003" };
const decision = { contractVersion: "lead-identity-review-decision.v1", expectedLeadVersion: 1, expectedReviewVersion: 2,
  expectedIntakeVersion: 3, outcome: "hold" } as const;
const decisionResult = { contractVersion: "lead-identity-review-decision-result.v1", outcome: "hold", disposition: "held_for_review",
  ...identifiers, contactId: null, companyId: null, leadVersion: 2, reviewVersion: 3, replayed: false,
  nextView: { kind: "identity_review_detail", leadId: identifiers.leadId, reviewId: identifiers.reviewId } } as const;
const retryError = { error: { code: "intake_unavailable", message: "Lead intake is temporarily unavailable.", retryable: true,
  reconciliation: { required: true, action: "retry_same_request" } }, requestId: identifiers.requestId } as const;

describe("P1A frontend executable transport contract", () => {
  it("keeps accepted frontend fixtures executable and in parity with backend command/view schemas", () => {
    for (const [frontend, backend, value] of [[leadInquiryIntakeCommandV1Schema, backendIntakeCommand, manualInstagramFixture],
      [decisionCommandSchema, backendDecisionCommand, decision], [reviewDetailSchema, backendDetail, reviewDetailFixture],
      [reviewQueueSchema, backendQueue, emptyQueueFixture]] as const) {
      expect(frontend.safeParse(value).success).toBe(true);
      expect(backend.safeParse(value).success).toBe(true);
    }
  });

  it("parses every success and error envelope before its payload is consumed", () => {
    expect(intakeSuccessEnvelopeSchema.parse({ data: heldResultFixture }).data).toEqual(heldResultFixture);
    expect(detailSuccessEnvelopeSchema.parse({ data: reviewDetailFixture }).data).toEqual(reviewDetailFixture);
    expect(queueSuccessEnvelopeSchema.parse({ data: emptyQueueFixture }).data).toEqual(emptyQueueFixture);
    expect(decisionSuccessEnvelopeSchema.parse({ data: decisionResult }).data).toEqual(decisionResult);
    expect(errorEnvelopeSchema.parse(retryError)).toEqual(retryError);
  });

  it("rejects wire drift through unknown fields, wrong stable identities, and invalid envelope branches", () => {
    expect(intakeResultSchema.safeParse({ ...heldResultFixture, internalReceipt: "not-public" }).success).toBe(false);
    expect(reviewDetailSchema.safeParse({ ...reviewDetailFixture, contractVersion: "lead-identity-review-detail.v2" }).success).toBe(false);
    expect(decisionResultSchema.safeParse({ ...decisionResult, nextView: { kind: "merge_preview" } }).success).toBe(false);
    expect(errorEnvelopeSchema.safeParse({ ...retryError, debug: { stack: "private" } }).success).toBe(false);
    expect(errorEnvelopeSchema.safeParse({ ...retryError, error: { ...retryError.error, retryable: false } }).success).toBe(false);
    expect(errorEnvelopeSchema.safeParse({ ...retryError, error: { ...retryError.error, message: "raw@example.test" } }).success).toBe(false);
  });

  it("rejects unbounded collections, contexts, masks, and cursor values", () => {
    expect(reviewQueueSchema.safeParse({ ...emptyQueueFixture, items: Array.from({ length: 51 }, () => ({})) }).success).toBe(false);
    expect(reviewDetailSchema.safeParse({ ...reviewDetailFixture, candidates: Array.from({ length: 31 }, () => reviewDetailFixture.candidates[0]) }).success).toBe(false);
    expect(reviewDetailSchema.safeParse({ ...reviewDetailFixture, originalAttribution: { ...reviewDetailFixture.originalAttribution,
      sourceDetail: { campaign: "x".repeat(201) } } }).success).toBe(false);
    expect(reviewDetailSchema.safeParse({ ...reviewDetailFixture, lead: { ...reviewDetailFixture.lead, maskedEmail: "raw@example.test" } }).success).toBe(false);
    expect(reviewQueueSchema.safeParse({ ...emptyQueueFixture, nextCursor: "not a cursor" }).success).toBe(false);
  });

  it.each(["email", "phone", "emailNormalized", "phoneNormalized", "domain", "domainNormalized", "secret"])(
    "rejects raw PII or private key %s at every protected boundary", key => {
      expect(reviewDetailSchema.safeParse({ ...reviewDetailFixture, lead: { ...reviewDetailFixture.lead, [key]: "private" } }).success).toBe(false);
      expect(reviewDetailSchema.safeParse({ ...reviewDetailFixture, candidates: [{ ...reviewDetailFixture.candidates[0], [key]: "private" }] }).success).toBe(false);
    });
});
