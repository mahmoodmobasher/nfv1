import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { submitLeadInquiryV1 } from "../src/backend/modules/leads";
import { writeGoverningAudit } from "../src/backend/platform/audit";
import { writeDomainEventSet } from "../src/backend/platform/outbox";

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
    await expect(writeDomainEventSet(tx, { workspaceId: actor.workspaceId, operationId: crypto.randomUUID(), events: [{
      topic: "crm.inquiry.created.v1", aggregateType: "lead", aggregateId: crypto.randomUUID(), resultVersion: 1,
      payload: { email: "forbidden@example.test" } }] })).rejects.toThrow("p1a_event_privacy_violation");
  });
});
