import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { leadActivityTargetParticipant } from "@/backend/modules/leads";
import type { TrustedActor } from "@/backend/platform/authorization";
import { runModuleTransaction, type ModuleTransaction } from "@/backend/platform/database";
import { canonicalRequestHash, idempotencyReceiptParticipant, lockIdempotencyAuthority } from "@/backend/platform/idempotency";
import { writeActivityCreatedAudit } from "@/backend/platform/audit";
import { writeActivityCreatedEvent } from "@/backend/platform/outbox";
import { ACTIVITY_CREATE_RESULT_V1, ACTIVITY_CREATE_V1, ACTIVITY_FUTURE_SKEW_MS, ACTIVITY_SUPPORTED_VERSION,
  activityCreateCommandV1Schema, activityCreateResultV1Schema, type ActivityCreateCommandV1 }
  from "../contracts/activity.contract";
import { activityRepository } from "../persistence/activity.repository";
import { activityFail, activityItem, mapActivityError } from "./activity.shared";

const storedReceiptSchema = z.object({ activityId: z.string().uuid(), activityVersion: z.number().int().positive(),
  leadId: z.string().uuid(), leadVersion: z.number().int().positive(), requestId: z.string().uuid() }).strict();
type StoredReceipt = z.infer<typeof storedReceiptSchema>;
export type ActivityFailurePoint = "after_root_reference" | "after_audit" | "after_outbox" | "after_receipt";
function inject(point: ActivityFailurePoint, selected?: ActivityFailurePoint) {
  if (point === selected) throw new Error(`injected_activity_failure:${point}`);
}
export function normalizedActivityOccurredAt(value: string): string {
  return new Date(value).toISOString();
}
export function isActivityOccurredAtAllowed(occurredAt: string, transactionNow: Date): boolean {
  return Date.parse(occurredAt) <= transactionNow.getTime() + ACTIVITY_FUTURE_SKEW_MS;
}
function principal(actor: TrustedActor, leadId: string) {
  return `workspace:${actor.workspaceId}:membership:${actor.membershipId}:crm.lead:${leadId}`;
}

export async function createLeadActivityV1(pool: Pool, input: { actor: TrustedActor; leadId: string;
  command: ActivityCreateCommandV1; idempotencyKey: string; requestId?: string;
  failurePoint?: ActivityFailurePoint; testOnlyBeforeFinalFence?: (tx: ModuleTransaction) => Promise<void> }) {
  const parsed = activityCreateCommandV1Schema.safeParse(input.command);
  if (!parsed.success) activityFail("validation_failed", 400,
    { fields: parsed.error.issues.map(issue => String(issue.path[0] ?? "")) });
  const command = { ...parsed.data, occurredAt: normalizedActivityOccurredAt(parsed.data.occurredAt) };
  if (!/^[\x20-\x7e]{16,128}$/.test(input.idempotencyKey))
    activityFail("validation_failed", 400, { fields: ["idempotencyKey"] });
  const requestId = input.requestId ?? randomUUID(), operation = ACTIVITY_CREATE_V1;
  const principalKey = principal(input.actor, input.leadId);
  const requestHash = canonicalRequestHash({ contractVersion: operation, workspaceId: input.actor.workspaceId,
    leadId: input.leadId, command });
  try {
    return await runModuleTransaction(pool, async tx => {
      await lockIdempotencyAuthority(tx, `${principalKey}:${operation}:${input.idempotencyKey}`);
      const receipts = idempotencyReceiptParticipant(tx), prior = await receipts.find<unknown>(
        principalKey, operation, input.idempotencyKey), target = leadActivityTargetParticipant(tx);
      const activities = activityRepository(tx);
      if (prior) {
        const authorized = await target.authorizeView(input.actor, input.leadId);
        const receipt = storedReceiptSchema.safeParse(prior.outcome);
        if (!receipt.success) activityFail("activity_unavailable", 503);
        const hashConflict = prior.requestHash !== requestHash;
        if (hashConflict) activityFail("idempotency_conflict", 409);
        if (receipt.data.leadId !== input.leadId || receipt.data.activityVersion !== ACTIVITY_SUPPORTED_VERSION)
          activityFail("activity_unavailable", 503);
        const stored = await activities.find(authorized.actor.workspaceId, receipt.data.leadId, receipt.data.activityId);
        if (!stored || stored.record_id !== receipt.data.leadId || stored.version !== receipt.data.activityVersion)
          activityFail("activity_unavailable", 503);
        return activityCreateResultV1Schema.parse({ contractVersion: ACTIVITY_CREATE_RESULT_V1,
          activity: activityItem(stored), leadVersion: receipt.data.leadVersion, replayed: true,
          requestId: receipt.data.requestId });
      }
      const transactionNow = await activities.transactionTimestamp();
      if (!isActivityOccurredAtAllowed(command.occurredAt, transactionNow))
        activityFail("validation_failed", 400, { fields: ["occurredAt"] });
      const authorized = await target.authorizeCreate(input.actor, input.leadId, command.expectedLeadVersion);
      const created = await activities.create({ workspaceId: authorized.actor.workspaceId, leadId: input.leadId,
        actorMembershipId: authorized.actor.membershipId, command });
      inject("after_root_reference", input.failurePoint);
      await input.testOnlyBeforeFinalFence?.(tx);
      const final = await target.authorizeCreate(authorized.actor, input.leadId, command.expectedLeadVersion);
      const stored = await activities.get(final.actor.workspaceId, input.leadId, created.id), operationId = randomUUID();
      await writeActivityCreatedAudit(tx, { actor: final.actor, activityId: stored.activity_id,
        activityVersion: stored.version, requestId, operationId });
      inject("after_audit", input.failurePoint);
      await writeActivityCreatedEvent(tx, { workspaceId: final.actor.workspaceId, activityId: stored.activity_id,
        activityVersion: stored.version, leadId: input.leadId, leadVersion: final.lead.version, kind: stored.kind,
        occurredAt: stored.occurred_at.toISOString(), requestId, operationId });
      inject("after_outbox", input.failurePoint);
      const receipt: StoredReceipt = { activityId: stored.activity_id, activityVersion: stored.version, leadId: input.leadId,
        leadVersion: final.lead.version, requestId };
      await receipts.save({ principalKey, operation, idempotencyKey: input.idempotencyKey, requestHash, outcome: receipt });
      inject("after_receipt", input.failurePoint);
      return activityCreateResultV1Schema.parse({ contractVersion: ACTIVITY_CREATE_RESULT_V1,
        activity: activityItem(stored), leadVersion: final.lead.version, replayed: false, requestId });
    });
  } catch (error) { return mapActivityError(error); }
}
