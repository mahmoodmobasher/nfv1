import type { LeadActivityListV1 } from "../contracts/lead-activity.contracts";

export const leadActivityFixture: LeadActivityListV1 = {
  contractVersion: "lead-activity-list.v1", requestId: "90000000-0000-4000-8000-000000000091",
  lead: { leadId: "10000000-0000-4000-8000-000000000011", version: 4, capabilities: { canViewActivities: true, canCreateActivity: true } },
  items: [{ activityId: "20000000-0000-4000-8000-000000000021", version: 1,
    target: { recordType: "crm.lead", recordId: "10000000-0000-4000-8000-000000000011" }, origin: "manual", kind: "call",
    direction: "outbound", outcome: "connected", occurredAt: "2026-08-27T14:00:00.000Z", durationMinutes: 12,
    subject: "Qualification call", details: "Confirmed the next discovery step.", createdByMembershipId: "30000000-0000-4000-8000-000000000031",
    createdAt: "2026-08-27T14:05:00.000Z" }], hasMore: false, nextCursor: null,
};
