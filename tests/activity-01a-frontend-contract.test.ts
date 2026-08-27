import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { activityCreateCommandV1Schema as backendCreate, leadActivityListV1Schema as backendList } from "@/backend/modules/activities";
import {
  activityCreateCommandV1Schema as frontendCreate, activityErrorDisposition, activityErrorEnvelopeV1Schema,
  leadActivityListEnvelopeV1Schema,
} from "@/frontend/features/leads";
import { leadActivityFixture } from "@/frontend/features/leads/testing/lead-activity.fixtures";

describe("ACTIVITY-01A frontend transport", () => {
  it("parses the accepted create vocabulary with backend/frontend parity", () => {
    const valid = { contractVersion: "activity-create.v1", expectedLeadVersion: 4, kind: "email", direction: null,
      outcome: "follow_up_required", occurredAt: "2026-08-27T14:00:00.000Z", durationMinutes: 12,
      subject: "Record-only email evidence", details: "No delivery is implied." };
    expect(frontendCreate.parse(valid)).toEqual(backendCreate.parse(valid));
    for (const forbidden of [{ ...valid, kind: "task" }, { ...valid, provider: "smtp" }, { ...valid, durationMinutes: 1441 }]) {
      expect(frontendCreate.safeParse(forbidden).success).toBe(false); expect(backendCreate.safeParse(forbidden).success).toBe(false);
    }
  });

  it("strictly parses target-scoped keyset envelopes without a total count", () => {
    const envelope = { data: leadActivityFixture }, parsed = leadActivityListEnvelopeV1Schema.parse(envelope);
    expect(backendList.parse(parsed.data)).toEqual(parsed.data);
    expect(parsed.data).toMatchObject({ hasMore: false, nextCursor: null });
    expect(parsed.data).not.toHaveProperty("totalCount");
    expect(leadActivityListEnvelopeV1Schema.safeParse({ data: { ...leadActivityFixture, totalCount: 1 } }).success).toBe(false);
    expect(leadActivityListEnvelopeV1Schema.safeParse({ data: { ...leadActivityFixture, items: [{ ...leadActivityFixture.items[0], target: { recordType: "crm.lead", recordId: "40000000-0000-4000-8000-000000000041" } }] } }).success).toBe(false);
  });

  it("maps accepted safe reconciliation without deriving authority", () => {
    const error = (code: "permission_required" | "validation_failed" | "idempotency_conflict" | "stale_version" | "rate_limited", action: "clear_protected_state" | "none" | "new_request" | "refetch_lead" | "retry_same_request") => activityErrorEnvelopeV1Schema.parse({ error: { code, message: "Safe message", retryable: action === "retry_same_request", reconciliation: { required: action !== "none", action }, zeroPartialEffects: true }, requestId: "90000000-0000-4000-8000-000000000091" }).error;
    expect(activityErrorDisposition(error("permission_required", "clear_protected_state"))).toBe("authority_loss");
    expect(activityErrorDisposition(error("validation_failed", "none"))).toBe("validation");
    expect(activityErrorDisposition(error("idempotency_conflict", "new_request"))).toBe("new_request");
    expect(activityErrorDisposition(error("stale_version", "refetch_lead"))).toBe("refetch");
    expect(activityErrorDisposition(error("rate_limited", "retry_same_request"))).toBe("retry");
  });

  it("keeps the server adapter on the accepted owner contract and private port", () => {
    const source = readFileSync("src/frontend/features/leads/server/lead-activity.server.ts", "utf8");
    expect(source).toContain('import "server-only"');
    expect(source).toContain("authoritativeLeadActivityListV1Schema");
    expect(source).toContain('queryVersion: "activity-list-query.v1"');
    expect(source).not.toMatch(/activity_records|lead_activities|SELECT|totalCount/);
  });
});
