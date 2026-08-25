import { describe, expect, it } from "vitest";
import { toJSONSchema, type ZodType } from "zod";
import { readFileSync } from "node:fs";
import { LeadIntakeError } from "../src/backend/modules/leads/contracts/lead-inquiry-intake.contract";
import type { LeadInquiryIntakeResultV1 as BackendIntakeResult } from "../src/backend/modules/leads/contracts/lead-inquiry-intake.contract";
import type { LeadIdentityReviewDecisionResultV1 as BackendDecisionResult } from "../src/backend/modules/leads";
import { leadIntakeFailure } from "../src/backend/modules/leads/presentation/lead-intake.http";
import { identityReviewDecisionCommandV1Schema as backendDecisionCommand,
  identityReviewDetailViewV1Schema as backendDetail, identityReviewQueueViewV1Schema as backendQueue } from "../src/backend/modules/identity-review";
import { leadInquiryIntakeCommandV1Schema as backendIntakeCommand } from "../src/backend/modules/leads";
import { heldResultFixture, manualInstagramFixture } from "../src/frontend/features/leads/testing/lead-intake.fixtures";
import { emptyQueueFixture, reviewDetailFixture } from "../src/frontend/features/identity-review/testing/identity-review.fixtures";
import { decisionCommandSchema, decisionResultSchema, decisionSuccessEnvelopeSchema, detailSuccessEnvelopeSchema,
  errorEnvelopeSchema, intakeResultSchema, intakeSuccessEnvelopeSchema, leadInquiryIntakeCommandV1Schema,
  queueSuccessEnvelopeSchema, reviewDetailSchema, reviewQueueSchema } from "../src/frontend/shared/contracts/p1a-transport";
import type { DecisionResult as FrontendDecisionResult, IntakeResult as FrontendIntakeResult } from "../src/frontend/shared/contracts/p1a-transport";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ?
  ((<Value>() => Value extends Right ? 1 : 2) extends (<Value>() => Value extends Left ? 1 : 2) ? true : false) : false;
const intakeResultTypeParity: Equal<FrontendIntakeResult, BackendIntakeResult> = true;
const decisionResultTypeParity: Equal<FrontendDecisionResult, BackendDecisionResult> = true;

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
  it("keeps intake-result and decision-result types exactly equal to backend authority", () => {
    expect(intakeResultTypeParity).toBe(true);
    expect(decisionResultTypeParity).toBe(true);
    const intakeBranches: BackendIntakeResult[] = [heldResultFixture, {
      ...heldResultFixture, disposition: "created", reviewCaseId: null, reviewVersion: null,
      candidateSummary: { strong: 0, supplementary: 0, probable: 0 }, nextView: { kind: "lead_detail", leadId: heldResultFixture.leadId },
    }, { ...heldResultFixture, disposition: "replayed", replayed: true }];
    const decisionBranches: BackendDecisionResult[] = [decisionResult, {
      ...decisionResult, outcome: "resolve", disposition: "resolved", nextView: { kind: "identity_review_queue" },
    }, { ...decisionResult, disposition: "replayed", replayed: true }];
    for (const value of intakeBranches) expect(intakeResultSchema.safeParse(value).success).toBe(true);
    for (const value of decisionBranches) expect(decisionResultSchema.safeParse(value).success).toBe(true);
  });

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

  it("parses complete backend-produced error details and authorized conflict navigation", async () => {
    const validation = await leadIntakeFailure(new LeadIntakeError("validation_failed", 400,
      { fields: ["person.email", "source.sourcePlatform"] }), identifiers.requestId).json();
    expect(errorEnvelopeSchema.parse(validation).error.details?.fields).toEqual(["person.email", "source.sourcePlatform"]);
    const conflict = await leadIntakeFailure(new LeadIntakeError("invalid_match_decision", 409, undefined,
      { kind: "identity_review_detail", leadId: identifiers.leadId }, true), identifiers.requestId).json();
    expect(errorEnvelopeSchema.parse(conflict).nextView).toEqual({ kind: "identity_review_detail", leadId: identifiers.leadId });
    const unsafeDetails = await leadIntakeFailure(new LeadIntakeError("validation_failed", 400,
      { fields: ["person.email"], raw: "private" }), identifiers.requestId).json();
    expect(unsafeDetails.error).not.toHaveProperty("details");
    const unsafeNavigation = await leadIntakeFailure(new LeadIntakeError("stale_version", 409, undefined,
      { kind: "identity_review_detail", leadId: "not-a-uuid" }, true), identifiers.requestId).json();
    expect(unsafeNavigation).not.toHaveProperty("nextView");
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

  it("covers every backend custom refinement with deterministic positive and negative parity matrices", () => {
    const contact = reviewDetailFixture.candidates[0];
    const company = { ...contact, candidateId: "30000000-0000-4000-8000-000000000010",
      targetId: "30000000-0000-4000-8000-000000000011", targetType: "company" as const,
      displayName: "Example Company", companyName: "Example Company", maskedEmail: null, maskedPhone: null,
      evidenceKind: "name_company" as const, evidenceStrength: "probable" as const };
    const phoneContact = { ...contact, candidateId: "30000000-0000-4000-8000-000000000012",
      targetId: "30000000-0000-4000-8000-000000000013", maskedEmail: null, maskedPhone: "***1234",
      evidenceKind: "phone" as const, evidenceStrength: "supplementary" as const };
    const detailWith = (candidates: typeof reviewDetailFixture.candidates) => ({ ...reviewDetailFixture, candidates,
      candidateSummary: { strong: candidates.filter(item => item.evidenceStrength === "strong").length,
        supplementary: candidates.filter(item => item.evidenceStrength === "supplementary").length,
        probable: candidates.filter(item => item.evidenceStrength === "probable").length },
      capabilities: { ...reviewDetailFixture.capabilities, canLinkCompany: true } });
    const stale = { ...reviewDetailFixture, candidates: [], candidateSummary: { strong: 0, supplementary: 0, probable: 0 },
      capabilities: { canCreateContact: false, canCreateCompany: false, canLinkContact: false, canLinkCompany: false,
        canDismiss: false, canHold: true, canResolve: false },
      reconciliation: { status: "stale" as const, retryable: true as const, action: "refresh_identity_review" as const } };
    const queueItem = { ...emptyQueueFixture, items: [{ reviewId: reviewDetailFixture.reviewId, leadId: reviewDetailFixture.leadId,
      lead: { displayName: reviewDetailFixture.lead.displayName, companyName: reviewDetailFixture.lead.companyName,
        receivedAt: reviewDetailFixture.lead.receivedAt },
      originalAttribution: { sourceCategory: "manual" as const, sourcePlatform: null, sourceMedium: "unknown" as const, intakeChannel: "manual" as const },
      assignment: reviewDetailFixture.assignment, versions: { lead: 1, review: 1, intake: 1 }, candidateSummary: reviewDetailFixture.candidateSummary,
      capabilities: reviewDetailFixture.capabilities, reconciliation: reviewDetailFixture.reconciliation,
      updatedAt: "2026-08-25T12:00:00.000Z", nextView: reviewDetailFixture.nextView }] };
    const positive = [
      [leadInquiryIntakeCommandV1Schema, backendIntakeCommand, manualInstagramFixture],
      [reviewDetailSchema, backendDetail, detailWith([contact, phoneContact, company] as typeof reviewDetailFixture.candidates)],
      [reviewDetailSchema, backendDetail, stale],
      [reviewQueueSchema, backendQueue, queueItem],
    ] as const;
    for (const [frontend, backend, value] of positive) {
      expect(frontend.safeParse(value).success).toBe(true);
      expect(backend.safeParse(value).success).toBe(true);
    }
    const invalidIntake = [
      { ...manualInstagramFixture, person: { ...manualInstagramFixture.person, email: undefined } },
      { ...manualInstagramFixture, source: { ...manualInstagramFixture.source, sourcePlatform: undefined } },
      { ...manualInstagramFixture, source: { ...manualInstagramFixture.source, sourceCategory: "manual" as const } },
      { ...manualInstagramFixture, source: { ...manualInstagramFixture.source, sourcePlatform: "other_social" as const, sourceDetail: {} } },
      { ...manualInstagramFixture, requestedAssignment: { responsibleMembershipId: identifiers.leadId, membershipId: identifiers.reviewId } },
    ];
    const invalidDetails = [
      detailWith([{ ...contact, targetVersion: contact.expectedTargetVersion + 1 }]),
      detailWith([{ ...contact, evidenceStrength: "probable" as const }]),
      detailWith([{ ...phoneContact, evidenceStrength: "strong" as const }]),
      detailWith([{ ...company, evidenceKind: "email" as const, evidenceStrength: "strong" as const }]),
      detailWith([{ ...company, companyName: undefined }]),
      detailWith([{ ...company, maskedEmail: "a***@example.test" }]),
      { ...detailWith([contact]), candidateSummary: { strong: 0, supplementary: 0, probable: 0 } },
      { ...detailWith([contact]), capabilities: { ...reviewDetailFixture.capabilities, canLinkContact: false } },
      { ...stale, candidates: [contact] },
      { ...stale, candidateSummary: { strong: 1, supplementary: 0, probable: 0 } },
      { ...stale, capabilities: { ...stale.capabilities, canResolve: true } },
      { ...reviewDetailFixture, candidates: Array.from({ length: 11 }, (_, index) => ({ ...contact,
        candidateId: `30000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
        targetId: `30000000-0000-4000-8000-${String(index + 200).padStart(12, "0")}` })), candidateSummary: { strong: 10, supplementary: 0, probable: 0 } },
      { ...reviewDetailFixture, nextView: { ...reviewDetailFixture.nextView, leadId: identifiers.requestId } },
      { ...reviewDetailFixture, originalAttribution: { ...reviewDetailFixture.originalAttribution,
        sourceCategory: "social_media" as const, sourcePlatform: null } },
    ];
    const invalidQueues = [
      { ...queueItem, items: [{ ...queueItem.items[0], nextView: { ...queueItem.items[0].nextView, reviewId: identifiers.requestId } }] },
      { ...queueItem, items: [{ ...queueItem.items[0], originalAttribution: { ...queueItem.items[0].originalAttribution,
        sourceCategory: "social_media" as const, sourcePlatform: null } }] },
      { ...queueItem, items: [{ ...queueItem.items[0], reconciliation: stale.reconciliation,
        capabilities: reviewDetailFixture.capabilities }] },
    ];
    for (const value of invalidIntake) {
      expect(leadInquiryIntakeCommandV1Schema.safeParse(value).success).toBe(false);
      expect(backendIntakeCommand.safeParse(value).success).toBe(false);
    }
    for (const value of invalidDetails) {
      expect(reviewDetailSchema.safeParse(value).success).toBe(false);
      expect(backendDetail.safeParse(value).success).toBe(false);
    }
    for (const value of invalidQueues) {
      expect(reviewQueueSchema.safeParse(value).success).toBe(false);
      expect(backendQueue.safeParse(value).success).toBe(false);
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
