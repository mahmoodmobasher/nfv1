import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { revalidateActiveActor, workspaceAuthorityParticipant, type TrustedActor } from "@/backend/platform/authorization";
import { writeGoverningAudit } from "@/backend/platform/audit";
import { runModuleTransaction } from "@/backend/platform/database";
import { canonicalRequestHash, idempotencyReceiptParticipant, lockIdempotencyAuthority } from "@/backend/platform/idempotency";
import { writeDomainEventSet } from "@/backend/platform/outbox";
import { LeadManagementError } from "../../contracts/lead-management.contract";
import {
  isAllowedLifecycleTransition, leadLifecycleTransitionResultV1Schema,
  LEAD_LIFECYCLE_TRANSITION_OPERATION, LEAD_LIFECYCLE_TRANSITION_RESULT,
  type LeadLifecycleCode, type LeadLifecycleTransitionCommandV1, type LeadLifecycleTransitionResultV1,
} from "../../contracts/lead-lifecycle.contract";
import { leadTransactionParticipant, type LeadLifecycleRow } from "../../persistence/repositories/lead.repository";

const idempotencyKeyPattern = /^[\x20-\x7E]{16,128}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function principal(actor: TrustedActor, leadId: string) {
  return `workspace:${actor.workspaceId}:membership:${actor.membershipId}:lead:${leadId}`;
}

function mapMutationError(error: unknown): never {
  if (error instanceof LeadManagementError) throw error;
  if (error && typeof error === "object" && "code" in error && "status" in error) {
    const value = error as { code: string; status: number };
    throw new LeadManagementError(value.code as never, value.status);
  }
  throw error;
}

/**
 * Reopening a disqualified Lead is an owner/admin act: it un-does a documented
 * decision, so a Member may not do it even on a Lead they own. Every other
 * transition follows canMoveLeadStage -- owner/admin, or the Lead's own owner.
 */
function assertTransitionPermitted(
  actorRole: TrustedActor["role"],
  lead: LeadLifecycleRow,
  actorMembershipId: string,
  from: LeadLifecycleCode,
) {
  const privileged = actorRole === "owner" || actorRole === "admin";
  if (from === "disqualified" && !privileged) throw new LeadManagementError("permission_required", 403);
  if (privileged || lead.owner_membership_id === actorMembershipId) return;
  throw new LeadManagementError("permission_required", 403);
}

export async function executeLeadLifecycleTransitionV1(pool: Pool, input: { actor: TrustedActor; leadId: string;
  command: LeadLifecycleTransitionCommandV1; idempotencyKey: string; requestId?: string,
}): Promise<LeadLifecycleTransitionResultV1> {
  if (!uuidPattern.test(input.leadId)) throw new LeadManagementError("resource_not_found", 404);
  if (!idempotencyKeyPattern.test(input.idempotencyKey))
    throw new LeadManagementError("validation_failed", 400, { fields: ["idempotencyKey"] });
  const requestId = input.requestId ?? randomUUID();
  const operation = LEAD_LIFECYCLE_TRANSITION_OPERATION, principalKey = principal(input.actor, input.leadId);
  const requestHash = canonicalRequestHash({ contractVersion: operation, workspaceId: input.actor.workspaceId,
    leadId: input.leadId, expectedVersion: input.command.expectedVersion, command: input.command });
  try {
    return await runModuleTransaction(pool, async tx => {
      await lockIdempotencyAuthority(tx, `${principalKey}:${operation}:${input.idempotencyKey}`);
      const receipts = idempotencyReceiptParticipant(tx);
      const receipt = await receipts.find<LeadLifecycleTransitionResultV1>(principalKey, operation, input.idempotencyKey);
      const leads = leadTransactionParticipant(tx);
      const lead = await leads.lockForLifecycle(input.actor.workspaceId, input.leadId);

      const authority = workspaceAuthorityParticipant(tx);
      await authority.lockReferences({ workspaceId: input.actor.workspaceId, leadId: lead.id,
        membershipIds: [input.actor.membershipId, lead.owner_membership_id], teamIds: [lead.responsible_team_id] });
      const actor = await revalidateActiveActor(tx, input.actor);
      const visible = await authority.visibleLeadIds(actor, [{ id: lead.id, visibility: lead.visibility,
        ownerMembershipId: lead.owner_membership_id }]);
      if (!visible.has(lead.id)) throw new LeadManagementError("resource_not_found", 404);

      if (receipt) {
        if (receipt.requestHash !== requestHash) throw new LeadManagementError("idempotency_conflict", 409);
        return leadLifecycleTransitionResultV1Schema.parse({ ...receipt.outcome, replayed: true });
      }
      if (lead.version !== input.command.expectedVersion) throw new LeadManagementError("stale_version", 409);

      // Legacy pre-P1A Leads carry no lifecycle and cannot join one retroactively.
      if (!lead.lifecycle_code) throw new LeadManagementError("lifecycle_unavailable", 409);
      const from = lead.lifecycle_code as LeadLifecycleCode, to = input.command.targetLifecycle;
      assertTransitionPermitted(actor.role, lead, actor.membershipId, from);

      if (from === to) {
        const result = leadLifecycleTransitionResultV1Schema.parse({
          contractVersion: LEAD_LIFECYCLE_TRANSITION_RESULT, leadId: lead.id, leadVersion: lead.version,
          lifecycle: { code: from, previousCode: from, disqualificationReason: lead.disqualification_reason,
            reopenCount: lead.lifecycle_reopen_count },
          changed: false, replayed: false, requestId, nextView: { kind: "lead_detail", leadId: lead.id } });
        await receipts.save({ principalKey, operation, idempotencyKey: input.idempotencyKey, requestHash, outcome: result });
        return result;
      }
      if (!isAllowedLifecycleTransition(from, to)) throw new LeadManagementError("lifecycle_transition_not_allowed", 409);
      // `working` means somebody owns it and is acting on it.
      if (to === "working" && !lead.owner_membership_id) throw new LeadManagementError("assignment_unavailable", 409);
      if (to === "qualified" && !lead.owner_membership_id) throw new LeadManagementError("assignment_unavailable", 409);

      const reopenIncrement = from === "disqualified" ? 1 : 0;
      const { version: leadVersion, reopenCount } = await leads.transitionLifecycle({
        workspaceId: actor.workspaceId, leadId: lead.id, expectedVersion: input.command.expectedVersion,
        targetLifecycle: to, disqualificationReason: input.command.disqualificationReason,
        disqualificationNote: input.command.disqualificationNote, reopenIncrement });

      await leads.addMutationActivity({ workspaceId: actor.workspaceId, leadId: lead.id,
        actorMembershipId: actor.membershipId, kind: "status_changed",
        body: to === "disqualified"
          ? `Lead disqualified (${input.command.disqualificationReason}).`
          : reopenIncrement ? `Lead reopened to ${to}.` : `Lead lifecycle moved to ${to}.` });

      const operationId = randomUUID();
      const before = { lifecycle: from, disqualificationReason: lead.disqualification_reason,
        reopenCount: lead.lifecycle_reopen_count, version: lead.version };
      const after = { lifecycle: to, disqualificationReason: input.command.disqualificationReason,
        reopenCount, version: leadVersion };
      await writeGoverningAudit(tx, { actor, operation, action: "crm.lead_lifecycle_transitioned", targetType: "lead",
        targetId: lead.id, requestId, correlationId: operationId, resultVersion: leadVersion,
        metadata: { expected_version: input.command.expectedVersion, change_fields: ["lifecycle"], from, to },
        before, after });
      await writeDomainEventSet(tx, { workspaceId: actor.workspaceId, operationId, events: [{
        topic: "crm.lead.lifecycle_transitioned.v1", aggregateType: "lead", aggregateId: lead.id,
        resultVersion: leadVersion,
        payload: { schemaVersion: 1, workspaceId: actor.workspaceId, leadId: lead.id, leadVersion,
          previousLifecycle: from, lifecycle: to,
          disqualificationReason: input.command.disqualificationReason, requestId },
      }] });

      const result = leadLifecycleTransitionResultV1Schema.parse({
        contractVersion: LEAD_LIFECYCLE_TRANSITION_RESULT, leadId: lead.id, leadVersion,
        lifecycle: { code: to, previousCode: from, disqualificationReason: input.command.disqualificationReason,
          reopenCount },
        changed: true, replayed: false, requestId, nextView: { kind: "lead_detail", leadId: lead.id } });
      await receipts.save({ principalKey, operation, idempotencyKey: input.idempotencyKey, requestHash, outcome: result });
      return result;
    });
  } catch (error) { return mapMutationError(error); }
}
