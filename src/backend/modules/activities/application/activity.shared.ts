import { ActivityError, type ActivityErrorCode, type ActivityItemV1 } from "../contracts/activity.contract";
import type { ActivityRow } from "../persistence/activity.repository";

export function activityFail(code: ActivityErrorCode, status: number, safe?: { fields?: string[] }): never {
  throw new ActivityError(code, status, safe);
}
export function mapActivityError(error: unknown): never {
  if (error instanceof ActivityError) throw error;
  if (error && typeof error === "object" && "code" in error && "status" in error) {
    const value = error as { code: ActivityErrorCode; status: number; safe?: { fields?: string[] } };
    throw new ActivityError(value.code, value.status, value.safe);
  }
  throw error;
}
export function activityItem(row: ActivityRow): ActivityItemV1 {
  return { activityId: row.activity_id, version: 1, target: { recordType: "crm.lead", recordId: row.record_id },
    origin: "manual", kind: row.kind, direction: row.direction, outcome: row.outcome,
    occurredAt: row.occurred_at.toISOString(), durationMinutes: row.duration_minutes, subject: row.subject,
    details: row.details, createdByMembershipId: row.created_by_membership_id, createdAt: row.created_at.toISOString() };
}
