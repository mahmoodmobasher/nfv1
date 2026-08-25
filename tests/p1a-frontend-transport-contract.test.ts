import { describe, expect, it } from "vitest";
import { toJSONSchema, type ZodType } from "zod";
import { readFileSync } from "node:fs";
import { LeadIntakeError } from "../src/backend/modules/leads/contracts/lead-inquiry-intake.contract";
import { leadIntakeFailure } from "../src/backend/modules/leads/presentation/lead-intake.http";
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

function canonicalSchema(schema: ZodType): unknown {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "$schema").sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, normalize(child)]));
  };
  return normalize(toJSONSchema(schema));
}

function backendErrorStatuses(): Array<[string, number]> {
  const source = readFileSync(new URL("../src/backend/modules/leads/presentation/lead-intake.http.ts", import.meta.url), "utf8");
  const block = source.match(/const stableStatus = \{([\s\S]*?)\} as const;/)?.[1];
  if (!block) throw new Error("backend_error_status_registry_missing");
  return [...block.matchAll(/([a-z_]+):\s*(\d+)/g)].map(([, code, status]) => [code, Number(status)]);
}

describe("P1A frontend executable transport contract", () => {
  it("fails deterministically on backend-authoritative shape, constraint, or nullability drift", () => {
    for (const [frontend, backend] of [[leadInquiryIntakeCommandV1Schema, backendIntakeCommand],
      [decisionCommandSchema, backendDecisionCommand], [reviewDetailSchema, backendDetail], [reviewQueueSchema, backendQueue]] as const)
      expect(canonicalSchema(frontend)).toEqual(canonicalSchema(backend));
  });

  it("accepts every backend-authoritative stable error presentation and reconciliation branch", async () => {
    const statuses = backendErrorStatuses();
    expect(statuses.length).toBeGreaterThan(0);
    for (const [code, status] of statuses) {
      const response = leadIntakeFailure(new LeadIntakeError(code as never, status), identifiers.requestId);
      const payload = await response.json();
      const parsed = errorEnvelopeSchema.safeParse(payload);
      expect(parsed.success, code).toBe(true);
      if (parsed.success) expect(parsed.data.error.code).toBe(code);
    }
  });

  it("keeps accepted frontend fixtures executable and in parity with backend command/view schemas", () => {
    for (const [frontend, backend, value] of [[leadInquiryIntakeCommandV1Schema, backendIntakeCommand, manualInstagramFixture],
      [decisionCommandSchema, backendDecisionCommand, decision], [reviewDetailSchema, backendDetail, reviewDetailFixture],
      [reviewQueueSchema, backendQueue, emptyQueueFixture]] as const) {
      expect(frontend.safeParse(value).success).toBe(true);
      expect(backend.safeParse(value).success).toBe(true);
    }
  });

  it("keeps backend-authoritative conditional and reconciliation refinements in parity", () => {
    const staleWithAuthority = { ...reviewDetailFixture, reconciliation: { status: "stale", retryable: true,
      action: "refresh_identity_review" }, capabilities: { ...reviewDetailFixture.capabilities, canResolve: true } };
    const mismatchedNavigation = { ...reviewDetailFixture, nextView: { ...reviewDetailFixture.nextView,
      leadId: "30000000-0000-4000-8000-000000000099" } };
    const invalidCases = [
      [leadInquiryIntakeCommandV1Schema, backendIntakeCommand, { ...manualInstagramFixture,
        source: { ...manualInstagramFixture.source, sourcePlatform: undefined } }],
      [reviewDetailSchema, backendDetail, staleWithAuthority],
      [reviewDetailSchema, backendDetail, mismatchedNavigation],
    ] as const;
    for (const [frontend, backend, value] of invalidCases) {
      expect(frontend.safeParse(value).success).toBe(false);
      expect(backend.safeParse(value).success).toBe(false);
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
