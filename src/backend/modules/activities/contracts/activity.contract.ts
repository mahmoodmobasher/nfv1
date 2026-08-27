import { z } from "zod";

export const ACTIVITY_CREATE_V1 = "activity-create.v1" as const;
export const ACTIVITY_CREATE_RESULT_V1 = "activity-create-result.v1" as const;
export const LEAD_ACTIVITY_LIST_V1 = "lead-activity-list.v1" as const;
export const ACTIVITY_LIST_QUERY_V1 = "activity-list-query.v1" as const;
export const ACTIVITY_FUTURE_SKEW_MS = 5 * 60 * 1000;
export const ACTIVITY_SUPPORTED_VERSION = 1 as const;

const uuid = z.string().uuid();
export const activityKindV1Schema = z.enum(["note", "call", "meeting", "email", "message", "other"]);
export const activityDirectionV1Schema = z.enum(["inbound", "outbound", "internal"]);
export const activityOutcomeV1Schema = z.enum(["completed", "connected", "no_answer", "left_message", "rescheduled",
  "cancelled", "follow_up_required", "other"]);

export const activityCreateCommandV1Schema = z.object({
  contractVersion: z.literal(ACTIVITY_CREATE_V1),
  expectedLeadVersion: z.number().int().positive(),
  kind: activityKindV1Schema,
  direction: activityDirectionV1Schema.nullable().optional().default(null),
  outcome: activityOutcomeV1Schema.nullable().optional().default(null),
  occurredAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(1).max(1440).nullable().optional().default(null),
  subject: z.string().trim().min(1).max(200),
  details: z.string().trim().min(1).max(10000).nullable().optional().default(null),
}).strict();

export const activityItemV1Schema = z.object({
  activityId: uuid,
  version: z.number().int().positive(),
  target: z.object({ recordType: z.literal("crm.lead"), recordId: uuid }).strict(),
  origin: z.literal("manual"),
  kind: activityKindV1Schema,
  direction: activityDirectionV1Schema.nullable(),
  outcome: activityOutcomeV1Schema.nullable(),
  occurredAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(1).max(1440).nullable(),
  subject: z.string().min(1).max(200),
  details: z.string().min(1).max(10000).nullable(),
  createdByMembershipId: uuid,
  createdAt: z.string().datetime({ offset: true }),
}).strict();

export const activityCreateResultV1Schema = z.object({
  contractVersion: z.literal(ACTIVITY_CREATE_RESULT_V1),
  activity: activityItemV1Schema,
  leadVersion: z.number().int().positive(),
  replayed: z.boolean(),
  requestId: uuid,
}).strict();

export const activityListQueryV1Schema = z.object({
  queryVersion: z.literal(ACTIVITY_LIST_QUERY_V1).default(ACTIVITY_LIST_QUERY_V1),
  kind: activityKindV1Schema.optional(),
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(1024).optional(),
}).strict();

export const leadActivityListV1Schema = z.object({
  contractVersion: z.literal(LEAD_ACTIVITY_LIST_V1),
  lead: z.object({ leadId: uuid, version: z.number().int().positive(), capabilities: z.object({
    canViewActivities: z.literal(true), canCreateActivity: z.boolean(),
  }).strict() }).strict(),
  items: z.array(activityItemV1Schema).max(50),
  hasMore: z.boolean(),
  nextCursor: z.string().max(1024).nullable(),
  requestId: uuid,
}).strict();

export type ActivityCreateCommandV1 = z.infer<typeof activityCreateCommandV1Schema>;
export type ActivityItemV1 = z.infer<typeof activityItemV1Schema>;
export type ActivityCreateResultV1 = z.infer<typeof activityCreateResultV1Schema>;
export type ActivityListQueryV1 = z.infer<typeof activityListQueryV1Schema>;

export type ActivityErrorCode = "authentication_required" | "permission_required" | "resource_not_found" |
  "validation_failed" | "unsupported_contract_version" | "idempotency_conflict" | "stale_version" |
  "rate_limited" | "activity_unavailable" | "unexpected_error";
export class ActivityError extends Error {
  constructor(public code: ActivityErrorCode, public status: number, public safe?: { fields?: string[] }) { super(code); }
}
