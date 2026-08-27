import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { leadActivityTargetParticipant } from "@/backend/modules/leads";
import type { TrustedActor } from "@/backend/platform/authorization";
import { runModuleTransaction } from "@/backend/platform/database";
import { canonicalRequestHash, idempotencyReceiptParticipant, lockIdempotencyAuthority } from "@/backend/platform/idempotency";
import { writeActivityCreatedEvidence } from "@/backend/platform/audit";
import { ACTIVITY_CREATE_RESULT_V1, ACTIVITY_CREATE_V1, ACTIVITY_FUTURE_SKEW_MS, activityCreateCommandV1Schema,
  activityCreateResultV1Schema, type ActivityCreateCommandV1 } from "../contracts/activity.contract";
import { activityRepository } from "../persistence/activity.repository";
import { activityFail, activityItem, mapActivityError } from "./activity.shared";

type StoredReceipt = { activityId: string; activityVersion: 1; leadId: string; leadVersion: number; requestId: string };
export type ActivityFailurePoint = "root_and_reference" | "audit" | "outbox" | "receipt";
function inject(point: ActivityFailurePoint, selected?: ActivityFailurePoint) {
  if (point === selected) throw new Error(`injected_activity_failure:${point}`);
}
function principal(actor: TrustedActor, leadId: string) {
  return `workspace:${actor.workspaceId}:membership:${actor.membershipId}:crm.lead:${leadId}`;
}

export async function createLeadActivityV1(pool: Pool, input: { actor: TrustedActor; leadId: string;
  command: ActivityCreateCommandV1; idempotencyKey: string; requestId?: string;
  failurePoint?: ActivityFailurePoint; beforeFinalFence?: () => Promise<void> }) {
  const parsed = activityCreateCommandV1Schema.safeParse(input.command);
  if (!parsed.success) activityFail("validation_failed", 400,
    { fields: parsed.error.issues.map(issue => String(issue.path[0] ?? "")) });
  const command = parsed.data;
  if (Date.parse(command.occurredAt) > Date.now() + ACTIVITY_FUTURE_SKEW_MS)
    activityFail("validation_failed", 400, { fields: ["occurredAt"] });
  if (!/^[\x20-\x7e]{16,128}$/.test(input.idempotencyKey))
    activityFail("validation_failed", 400, { fields: ["idempotencyKey"] });
  const requestId = input.requestId ?? randomUUID(), operation = ACTIVITY_CREATE_V1;
  const principalKey = principal(input.actor, input.leadId);
  const requestHash = canonicalRequestHash({ contractVersion: operation, workspaceId: input.actor.workspaceId,
    leadId: input.leadId, command });
  try {
    return await runModuleTransaction(pool, async tx => {
      await lockIdempotencyAuthority(tx, `${principalKey}:${operation}:${input.idempotencyKey}`);
      const receipts = idempotencyReceiptParticipant(tx), prior = await receipts.find<StoredReceipt>(
        principalKey, operation, input.idempotencyKey), target = leadActivityTargetParticipant(tx);
      const authorized = await target.authorizeCreate(input.actor, input.leadId, command.expectedLeadVersion);
      const activities = activityRepository(tx);
      if (prior) {
        if (prior.requestHash !== requestHash) activityFail("idempotency_conflict", 409);
        const stored = await activities.get(authorized.actor.workspaceId, input.leadId, prior.outcome.activityId);
        return activityCreateResultV1Schema.parse({ contractVersion: ACTIVITY_CREATE_RESULT_V1,
          activity: activityItem(stored), leadVersion: authorized.lead.version, replayed: true,
          requestId: prior.outcome.requestId });
      }
      const created = await activities.create({ workspaceId: authorized.actor.workspaceId, leadId: input.leadId,
        actorMembershipId: authorized.actor.membershipId, command });
      inject("root_and_reference", input.failurePoint);
      await input.beforeFinalFence?.();
      const final = await target.authorizeCreate(authorized.actor, input.leadId, command.expectedLeadVersion);
      const stored = await activities.get(final.actor.workspaceId, input.leadId, created.id), operationId = randomUUID();
      await writeActivityCreatedEvidence(tx, { actor: final.actor, activityId: stored.activity_id,
        activityVersion: stored.version, leadId: input.leadId, leadVersion: final.lead.version, kind: stored.kind,
        occurredAt: stored.occurred_at.toISOString(), requestId, operationId });
      inject("audit", input.failurePoint);
      inject("outbox", input.failurePoint);
      const receipt: StoredReceipt = { activityId: stored.activity_id, activityVersion: 1, leadId: input.leadId,
        leadVersion: final.lead.version, requestId };
      await receipts.save({ principalKey, operation, idempotencyKey: input.idempotencyKey, requestHash, outcome: receipt });
      inject("receipt", input.failurePoint);
      return activityCreateResultV1Schema.parse({ contractVersion: ACTIVITY_CREATE_RESULT_V1,
        activity: activityItem(stored), leadVersion: final.lead.version, replayed: false, requestId });
    });
  } catch (error) { return mapActivityError(error); }
}
