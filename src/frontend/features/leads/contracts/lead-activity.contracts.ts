import { z } from "zod";

export const ACTIVITY_CREATE_V1 = "activity-create.v1" as const;
export const ACTIVITY_CREATE_RESULT_V1 = "activity-create-result.v1" as const;
export const LEAD_ACTIVITY_LIST_V1 = "lead-activity-list.v1" as const;
export const ACTIVITY_LIST_QUERY_V1 = "activity-list-query.v1" as const;

const uuid = z.string().uuid();
export const activityKindV1Schema = z.enum(["note", "call", "meeting", "email", "message", "other"]);
export const activityDirectionV1Schema = z.enum(["inbound", "outbound", "internal"]);
export const activityOutcomeV1Schema = z.enum(["completed", "connected", "no_answer", "left_message", "rescheduled", "cancelled", "follow_up_required", "other"]);

export const activityCreateCommandV1Schema = z.object({
  contractVersion: z.literal(ACTIVITY_CREATE_V1), expectedLeadVersion: z.number().int().positive(), kind: activityKindV1Schema,
  direction: activityDirectionV1Schema.nullable(), outcome: activityOutcomeV1Schema.nullable(),
  occurredAt: z.string().datetime({ offset: true }), durationMinutes: z.number().int().min(1).max(1440).nullable(),
  subject: z.string().trim().min(1).max(200), details: z.string().trim().min(1).max(10000).nullable(),
}).strict();

export const activityItemV1Schema = z.object({
  activityId: uuid, version: z.number().int().positive(),
  target: z.object({ recordType: z.literal("crm.lead"), recordId: uuid }).strict(), origin: z.literal("manual"),
  kind: activityKindV1Schema, direction: activityDirectionV1Schema.nullable(), outcome: activityOutcomeV1Schema.nullable(),
  occurredAt: z.string().datetime({ offset: true }), durationMinutes: z.number().int().min(1).max(1440).nullable(),
  subject: z.string().min(1).max(200), details: z.string().min(1).max(10000).nullable(), createdByMembershipId: uuid,
  createdAt: z.string().datetime({ offset: true }),
}).strict();

export const activityCreateResultV1Schema = z.object({
  contractVersion: z.literal(ACTIVITY_CREATE_RESULT_V1), activity: activityItemV1Schema,
  leadVersion: z.number().int().positive(), replayed: z.boolean(), requestId: uuid,
}).strict();
export const activityCreateEnvelopeV1Schema = z.object({ data: activityCreateResultV1Schema }).strict();

export const leadActivityListV1Schema = z.object({
  contractVersion: z.literal(LEAD_ACTIVITY_LIST_V1),
  lead: z.object({ leadId: uuid, version: z.number().int().positive(), capabilities: z.object({
    canViewActivities: z.literal(true), canCreateActivity: z.boolean(),
  }).strict() }).strict(),
  items: z.array(activityItemV1Schema).max(50), hasMore: z.boolean(), nextCursor: z.string().min(1).max(1024).nullable(), requestId: uuid,
}).strict().superRefine((view, issue) => {
  if (view.hasMore !== Boolean(view.nextCursor)) issue.addIssue({ code: "custom", message: "activity_cursor_state_invalid", path: ["nextCursor"] });
  for (const [index, item] of view.items.entries()) if (item.target.recordId !== view.lead.leadId)
    issue.addIssue({ code: "custom", message: "activity_target_mismatch", path: ["items", index, "target"] });
});
export const leadActivityListEnvelopeV1Schema = z.object({ data: leadActivityListV1Schema }).strict();

const activityErrorCodeV1Schema = z.enum(["authentication_required", "permission_required", "resource_not_found", "validation_failed",
  "unsupported_contract_version", "idempotency_conflict", "stale_version", "rate_limited", "activity_unavailable", "unexpected_error"]);
const activityReconciliationV1Schema = z.enum(["none", "clear_protected_state", "new_request", "refetch_lead", "retry_same_request"]);
export const activityErrorEnvelopeV1Schema = z.object({ error: z.object({
  code: activityErrorCodeV1Schema, message: z.string().min(1).max(200), retryable: z.boolean(),
  reconciliation: z.object({ required: z.boolean(), action: activityReconciliationV1Schema }).strict(), zeroPartialEffects: z.literal(true),
  fields: z.array(z.enum(["contractVersion", "expectedLeadVersion", "kind", "direction", "outcome", "occurredAt", "durationMinutes", "subject", "details", "idempotencyKey", "queryVersion", "limit", "cursor"])).max(16).optional(),
}).strict(), requestId: uuid }).strict();

export type ActivityKindV1 = z.infer<typeof activityKindV1Schema>;
export type ActivityCreateCommandV1 = z.infer<typeof activityCreateCommandV1Schema>;
export type ActivityItemV1 = z.infer<typeof activityItemV1Schema>;
export type ActivityCreateResultV1 = z.infer<typeof activityCreateResultV1Schema>;
export type LeadActivityListV1 = z.infer<typeof leadActivityListV1Schema>;
export type ActivityErrorV1 = z.infer<typeof activityErrorEnvelopeV1Schema>["error"];

export function activityErrorDisposition(error: ActivityErrorV1): "authority_loss" | "validation" | "new_request" | "refetch" | "retry" | "terminal" {
  if (["authentication_required", "permission_required", "resource_not_found"].includes(error.code) || error.reconciliation.action === "clear_protected_state") return "authority_loss";
  if (error.code === "validation_failed") return "validation";
  if (error.reconciliation.action === "new_request") return "new_request";
  if (error.reconciliation.action === "refetch_lead") return "refetch";
  if (error.reconciliation.action === "retry_same_request") return "retry";
  return "terminal";
}
