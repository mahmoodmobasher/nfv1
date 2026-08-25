import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { submitLeadInquiryV1 } from "../src/backend/modules/leads";
import { writeGoverningAudit } from "../src/backend/platform/audit";
import { writeDomainEventSet } from "../src/backend/platform/outbox";
import { assertIdentityReviewPresentationSafe, identityReviewDetailViewV1Schema,
  identityReviewQueueViewV1Schema } from "../src/backend/modules/identity-review";

const actor = { userId: crypto.randomUUID(), sessionId: crypto.randomUUID(), workspaceId: crypto.randomUUID(),
  membershipId: crypto.randomUUID(), role: "owner" as const };
const base = { contractVersion: "lead-inquiry-intake.v1", intakeChannel: "manual", person: { displayName: "Safe", email: "safe@example.test" },
  inquiry: { receivedAt: "2026-08-25T12:00:00.000Z" }, source: { sourceCategory: "manual", sourceMedium: "unknown" } };

describe("P1A stable errors and privacy allowlists", () => {
  it("maps canonical version and source taxonomy failures to stable identities", async () => {
    const pool = {} as Pool;
    await expect(submitLeadInquiryV1(pool, { actor, idempotencyKey: "1234567890123456",
      command: { ...base, contractVersion: "lead-inquiry-intake.v2" } as never })).rejects.toMatchObject({ code: "unsupported_contract_version" });
    await expect(submitLeadInquiryV1(pool, { actor, idempotencyKey: "1234567890123456",
      command: { ...base, source: { sourceCategory: "unknown", sourceMedium: "unknown" } } as never })).rejects.toMatchObject({ code: "invalid_source_category" });
    await expect(submitLeadInquiryV1(pool, { actor, idempotencyKey: "1234567890123456",
      command: { ...base, source: { sourceCategory: "social_media", sourceMedium: "unknown" } } as never })).rejects.toMatchObject({ code: "source_platform_required" });
    await expect(submitLeadInquiryV1(pool, { actor, idempotencyKey: "1234567890123456",
      command: { ...base, source: { sourceCategory: "manual", sourcePlatform: "instagram", sourceMedium: "unknown" } } as never })).rejects.toMatchObject({ code: "source_platform_not_allowed" });
    await expect(submitLeadInquiryV1(pool, { actor, idempotencyKey: "1234567890123456",
      command: { ...base, source: { sourceCategory: "social_media", sourcePlatform: "threads", sourceMedium: "unknown" } } as never })).rejects.toMatchObject({ code: "invalid_source_platform" });
    await expect(submitLeadInquiryV1(pool, { actor, idempotencyKey: "1234567890123456",
      command: { ...base, source: { sourceCategory: "manual", sourceMedium: "affiliate" } } as never })).rejects.toMatchObject({ code: "invalid_source_medium" });
    await expect(submitLeadInquiryV1(pool, { actor, idempotencyKey: "1234567890123456",
      command: { ...base, source: { sourceCategory: "manual", sourceMedium: "unknown",
        sourceDetail: { campaign: "x".repeat(201) } } } as never })).rejects.toMatchObject({ code: "source_detail_too_large" });
  });

  it("rejects non-allowlisted Audit metadata and personal Outbox payload keys", async () => {
    const tx = { query: async () => ({ rows: [], rowCount: 1 }) } as never;
    await expect(writeGoverningAudit(tx, { actor, operation: "lead-inquiry-intake.v1", action: "crm.inquiry_created",
      targetType: "lead", targetId: crypto.randomUUID(), requestId: crypto.randomUUID(), correlationId: crypto.randomUUID(),
      resultVersion: 1, metadata: { email: "forbidden" } as never })).rejects.toThrow("invalid_p1a_audit_metadata");
    await expect(writeGoverningAudit(tx, { actor, operation: "lead-inquiry-intake.v1", action: "crm.inquiry_created",
      targetType: "lead", targetId: crypto.randomUUID(), requestId: crypto.randomUUID(), correlationId: crypto.randomUUID(),
      resultVersion: 1, metadata: { source_category: { raw: "forbidden" } } as never })).rejects.toThrow("invalid_p1a_audit_metadata");
    await expect(writeDomainEventSet(tx, { workspaceId: actor.workspaceId, operationId: crypto.randomUUID(), events: [{
      topic: "crm.inquiry.created.v1", aggregateType: "lead", aggregateId: crypto.randomUUID(), resultVersion: 1,
      payload: { email: "forbidden@example.test" } }] })).rejects.toThrow("p1a_event_privacy_violation");
  });

  it("rejects invalid runtime Audit identities and event contracts", async () => {
    const tx = { query: async () => ({ rows: [], rowCount: 1 }) } as never;
    const common = { actor, targetType: "lead", targetId: crypto.randomUUID(), requestId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(), resultVersion: 1 };
    await expect(writeGoverningAudit(tx, { ...common, operation: "unknown.v1", action: "crm.inquiry_created" } as never))
      .rejects.toThrow("invalid_p1a_audit_identity");
    await expect(writeGoverningAudit(tx, { ...common, operation: "lead-inquiry-intake.v1",
      action: "crm.inquiry_review_resolved" })).rejects.toThrow("invalid_p1a_audit_identity");
    const validPayload = { schemaVersion: 1, workspaceId: actor.workspaceId, leadId: crypto.randomUUID(), leadVersion: 1,
      lifecycle: "new", disposition: "created", intakeChannel: "manual", sourceCategory: "manual", sourcePlatform: null,
      sourceMedium: "unknown", candidateSummary: { strong: 0, supplementary: 0, probable: 0 }, requestId: crypto.randomUUID() };
    await expect(writeDomainEventSet(tx, { workspaceId: actor.workspaceId, operationId: crypto.randomUUID(), events: [{
      topic: "crm.inquiry.created.v1", aggregateType: "contact", aggregateId: crypto.randomUUID(), resultVersion: 1,
      payload: validPayload }] })).rejects.toThrow("invalid_p1a_event_aggregate");
    await expect(writeDomainEventSet(tx, { workspaceId: actor.workspaceId, operationId: crypto.randomUUID(), events: [{
      topic: "crm.inquiry.created.v1", aggregateType: "lead", aggregateId: crypto.randomUUID(), resultVersion: 1,
      payload: { ...validPayload, secret: "no" } }] })).rejects.toThrow("invalid_p1a_event_payload");
    await expect(writeDomainEventSet(tx, { workspaceId: actor.workspaceId, operationId: crypto.randomUUID(), events: [{
      topic: "crm.inquiry.created.v1", aggregateType: "lead", aggregateId: validPayload.leadId, resultVersion: 1,
      payload: { ...validPayload, candidateSummary: { strong: "ten", supplementary: 0, probable: 0 } } }] }))
      .rejects.toThrow("invalid_p1a_event_payload");
    await expect(writeDomainEventSet(tx, { workspaceId: actor.workspaceId, operationId: crypto.randomUUID(), events: [{
      topic: "unknown.v1", aggregateType: "lead", aggregateId: crypto.randomUUID(), resultVersion: 1,
      payload: validPayload }] } as never)).rejects.toThrow("invalid_p1a_event_topic");
    const contactId = crypto.randomUUID();
    await expect(writeDomainEventSet(tx, { workspaceId: actor.workspaceId, operationId: crypto.randomUUID(), events: [{
      topic: "crm.contact.created.v1", aggregateType: "contact", aggregateId: contactId, resultVersion: 1,
      payload: { schemaVersion: 1, workspaceId: actor.workspaceId, contactId, version: 1, requestId: crypto.randomUUID() } }] }))
      .rejects.toThrow("invalid_p1a_event_set");
  });

  it("rejects raw identity fields and unbounded protected presentation at runtime", () => {
    expect(() => assertIdentityReviewPresentationSafe({ contractVersion: "lead-identity-review-detail.v1",
      candidates: [{ email: "raw@example.test" }] } as never)).toThrow("identity_review_presentation_privacy_violation");
    expect(() => assertIdentityReviewPresentationSafe({ contractVersion: "lead-identity-review-queue.v1",
      items: Array.from({ length: 51 }, () => ({})) } as never)).toThrow("identity_review_presentation_contract_violation");
  });

  it("runtime-validates every protected presentation shape and bounded allowlist", () => {
    const leadId = crypto.randomUUID(), reviewId = crypto.randomUUID(), candidateId = crypto.randomUUID(), targetId = crypto.randomUUID();
    const capabilities = { canCreateContact: true, canCreateCompany: true, canLinkContact: true, canLinkCompany: false,
      canDismiss: true, canHold: true, canResolve: true };
    const detail = { contractVersion: "lead-identity-review-detail.v1", requestId: crypto.randomUUID(), leadId, reviewId,
      leadVersion: 1, reviewVersion: 1, intakeVersion: 2, lead: { displayName: "Safe Lead", maskedEmail: "s***@example.test",
        maskedPhone: "***1234", companyName: "Safe Co", lifecycle: "new", receivedAt: "2026-08-25T12:00:00.000Z" },
      originalAttribution: { sourceCategory: "manual", sourcePlatform: null, sourceMedium: "unknown", sourceDetail: {},
        campaignContext: { campaign: "Launch" }, attributionContractVersion: "p1a-attribution-v1", intakeChannel: "manual" },
      assignment: { responsibleMembershipId: null, responsibleTeamId: null, visibility: "workspace" }, capabilities,
      candidateSummary: { strong: 1, supplementary: 0, probable: 0 },
      reconciliation: { status: "current", retryable: false, action: "none" }, candidates: [{ candidateId,
        targetType: "contact", targetId, targetVersion: 1, expectedTargetVersion: 1, displayName: "Candidate",
        maskedEmail: "c***@example.test", maskedPhone: null, evidenceKind: "email", evidenceStrength: "strong", canLink: true }],
      nextView: { kind: "identity_review_detail", leadId, reviewId } };
    expect(identityReviewDetailViewV1Schema.safeParse(detail).success).toBe(true);
    expect(identityReviewDetailViewV1Schema.safeParse({ ...detail, unexpected: true }).success).toBe(false);
    expect(identityReviewDetailViewV1Schema.safeParse({ ...detail, capabilities: { ...capabilities, canMerge: true } }).success).toBe(false);
    expect(identityReviewDetailViewV1Schema.safeParse({ ...detail, reconciliation: {
      status: "current", retryable: true, action: "none" } }).success).toBe(false);
    expect(identityReviewDetailViewV1Schema.safeParse({ ...detail, originalAttribution: {
      ...detail.originalAttribution, sourceDetail: { operator_context: "x".repeat(201) } } }).success).toBe(false);
    expect(identityReviewDetailViewV1Schema.safeParse({ ...detail, candidates: [{ ...detail.candidates[0],
      expectedTargetVersion: 2 }] }).success).toBe(false);
    expect(identityReviewDetailViewV1Schema.safeParse({ ...detail, reconciliation: {
      status: "stale", retryable: true, action: "refresh_identity_review" } }).success).toBe(false);
    expect(identityReviewDetailViewV1Schema.safeParse({ ...detail, candidates: [], candidateSummary: {
      strong: 0, supplementary: 0, probable: 0 }, capabilities: { ...capabilities, canCreateContact: false,
      canCreateCompany: false, canLinkContact: false, canLinkCompany: false, canDismiss: false, canHold: false,
      canResolve: false }, reconciliation: { status: "stale", retryable: true, action: "refresh_identity_review" } }).success)
      .toBe(false);
    expect(identityReviewDetailViewV1Schema.safeParse({ ...detail, candidates: [{ ...detail.candidates[0],
      evidenceKind: "phone", evidenceStrength: "strong" }] }).success).toBe(false);
    expect(identityReviewDetailViewV1Schema.safeParse({ ...detail, candidates: [{ ...detail.candidates[0],
      targetType: "company", companyName: "Safe Co", evidenceKind: "email" }] }).success).toBe(false);
    expect(identityReviewDetailViewV1Schema.safeParse({ ...detail, capabilities: { ...capabilities, canLinkContact: false } }).success)
      .toBe(false);
    expect(identityReviewDetailViewV1Schema.safeParse({ ...detail,
      candidateSummary: { strong: 0, supplementary: 0, probable: 1 } }).success).toBe(false);
    expect(identityReviewDetailViewV1Schema.safeParse({ ...detail, nextView: { ...detail.nextView, extra: true } }).success).toBe(false);
    expect(identityReviewDetailViewV1Schema.safeParse({ ...detail, nextView: { ...detail.nextView,
      leadId: crypto.randomUUID() } }).success).toBe(false);
    const queue = { contractVersion: "lead-identity-review-queue.v1", requestId: crypto.randomUUID(), items: [{ reviewId, leadId,
      lead: { displayName: "Safe Lead", companyName: "Safe Co", receivedAt: "2026-08-25T12:00:00.000Z" },
      originalAttribution: { sourceCategory: "manual", sourcePlatform: null, sourceMedium: "unknown", intakeChannel: "manual" },
      assignment: { responsibleMembershipId: null, responsibleTeamId: null, visibility: "workspace" },
      versions: { lead: 1, review: 1, intake: 2 }, candidateSummary: { strong: 1, supplementary: 0, probable: 0 },
      capabilities, reconciliation: { status: "current", retryable: false, action: "none" },
      updatedAt: "2026-08-25T12:00:00.000Z", nextView: { kind: "identity_review_detail", leadId, reviewId } }], nextCursor: "abc_DEF-123" };
    expect(identityReviewQueueViewV1Schema.safeParse(queue).success).toBe(true);
    expect(identityReviewQueueViewV1Schema.safeParse({ ...queue, items: [{ ...queue.items[0], nextView: {
      ...queue.items[0].nextView, reviewId: crypto.randomUUID() } }] }).success).toBe(false);
    expect(identityReviewQueueViewV1Schema.safeParse({ ...queue, items: [{ ...queue.items[0], reconciliation: {
      status: "stale", retryable: true, action: "refresh_identity_review" } }] }).success).toBe(false);
    expect(identityReviewQueueViewV1Schema.safeParse({ ...queue, items: [{ ...queue.items[0], candidateSummary: {
      strong: 0, supplementary: 0, probable: 0 }, capabilities: { ...capabilities, canCreateContact: false,
      canCreateCompany: false, canLinkContact: false, canLinkCompany: false, canDismiss: false, canHold: false,
      canResolve: false }, reconciliation: { status: "stale", retryable: true, action: "refresh_identity_review" } }] }).success)
      .toBe(false);
    expect(identityReviewQueueViewV1Schema.safeParse({ ...queue, nextCursor: "not valid!" }).success).toBe(false);
    expect(identityReviewQueueViewV1Schema.safeParse({ ...queue, items: Array.from({ length: 51 }, () => queue.items[0]) }).success).toBe(false);
  });
});
