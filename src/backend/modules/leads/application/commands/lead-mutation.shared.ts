import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { revalidateActiveActor, workspaceAuthorityParticipant, type TrustedActor } from "@/backend/platform/authorization";
import { writeGoverningAudit } from "@/backend/platform/audit";
import { runModuleTransaction, type ModuleTransaction } from "@/backend/platform/database";
import { canonicalRequestHash, idempotencyReceiptParticipant, lockIdempotencyAuthority,
  type LeadMutationOperation } from "@/backend/platform/idempotency";
import { writeDomainEventSet } from "@/backend/platform/outbox";
import { LeadManagementError, leadOperationalEditResultV1Schema, leadStageTransitionResultV1Schema,
  type LeadOperationalEditCommandV1, type LeadOperationalEditResultV1,
  type LeadStageTransitionCommandV1, type LeadStageTransitionResultV1 } from "../../contracts/lead-management.contract";
import { leadTransactionParticipant, type LeadMutationRow } from "../../persistence/repositories/lead.repository";

const idempotencyKeyPattern = /^[\x20-\x7E]{16,128}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertIdempotencyKey(value: string) {
  if (!idempotencyKeyPattern.test(value)) throw new LeadManagementError("validation_failed", 400, { fields: ["idempotencyKey"] });
}

function principal(actor: TrustedActor, leadId: string) {
  return `workspace:${actor.workspaceId}:membership:${actor.membershipId}:lead:${leadId}`;
}

async function authorizeMutation(tx: ModuleTransaction, actorInput: TrustedActor, lead: LeadMutationRow,
  input: { membershipIds?: Array<string | null>; teamIds?: Array<string | null>; operation: LeadMutationOperation }) {
  const authority = workspaceAuthorityParticipant(tx);
  await authority.lockReferences({ workspaceId: actorInput.workspaceId, leadId: lead.id,
    membershipIds: [actorInput.membershipId, lead.owner_membership_id, ...(input.membershipIds ?? [])],
    teamIds: [lead.responsible_team_id, ...(input.teamIds ?? [])] });
  const actor = await revalidateActiveActor(tx, actorInput);
  const visible = await authority.visibleLeadIds(actor, [{ id: lead.id, visibility: lead.visibility,
    ownerMembershipId: lead.owner_membership_id }]);
  if (!visible.has(lead.id)) throw new LeadManagementError("resource_not_found", 404);
  const allowed = input.operation === "lead-operational-edit.v1"
    ? authority.canEditLead(actor) : authority.canMoveLeadStage(actor, lead);
  if (!allowed) throw new LeadManagementError("permission_required", 403);
  return { actor, authority };
}

function normalizeEdit(command: LeadOperationalEditCommandV1): LeadOperationalEditCommandV1 {
  return { ...command, visibleTeamIds: [...command.visibleTeamIds].sort() };
}

function operationalSnapshot(lead: LeadMutationRow, visibleTeamIds: string[]) {
  return { responsibleMembershipId: lead.owner_membership_id, responsibleTeamId: lead.responsible_team_id,
    visibility: lead.visibility, visibleTeamIds };
}

function changedOperationalFields(before: ReturnType<typeof operationalSnapshot>, after: ReturnType<typeof operationalSnapshot>) {
  const fields: Array<keyof ReturnType<typeof operationalSnapshot>> = [];
  if (before.responsibleMembershipId !== after.responsibleMembershipId) fields.push("responsibleMembershipId");
  if (before.responsibleTeamId !== after.responsibleTeamId) fields.push("responsibleTeamId");
  if (before.visibility !== after.visibility) fields.push("visibility");
  if (before.visibleTeamIds.join(",") !== after.visibleTeamIds.join(",")) fields.push("visibleTeamIds");
  return fields;
}

function mapMutationError(error: unknown): never {
  if (error instanceof LeadManagementError) throw error;
  if (error && typeof error === "object" && "code" in error && "status" in error) {
    const value = error as { code: string; status: number };
    throw new LeadManagementError(value.code as never, value.status);
  }
  throw error;
}

export async function executeLeadOperationalEditV1(pool: Pool, input: { actor: TrustedActor; leadId: string;
  command: LeadOperationalEditCommandV1; idempotencyKey: string; requestId?: string }): Promise<LeadOperationalEditResultV1> {
  if (!uuidPattern.test(input.leadId)) throw new LeadManagementError("resource_not_found", 404);
  assertIdempotencyKey(input.idempotencyKey);
  const requestId = input.requestId ?? randomUUID(), command = normalizeEdit(input.command);
  const operation = "lead-operational-edit.v1" as const, principalKey = principal(input.actor, input.leadId);
  const requestHash = canonicalRequestHash({ contractVersion: operation, workspaceId: input.actor.workspaceId,
    leadId: input.leadId, expectedVersion: command.expectedVersion, command });
  try {
    return await runModuleTransaction(pool, async tx => {
      await lockIdempotencyAuthority(tx, `${principalKey}:${operation}:${input.idempotencyKey}`);
      const receipts = idempotencyReceiptParticipant(tx);
      const receipt = await receipts.find<LeadOperationalEditResultV1>(principalKey, operation, input.idempotencyKey);
      const leads = leadTransactionParticipant(tx), lead = await leads.lockForMutation(input.actor.workspaceId, input.leadId);
      const { actor, authority } = await authorizeMutation(tx, input.actor, lead, { operation,
        membershipIds: [command.responsibleMembershipId],
        teamIds: [command.responsibleTeamId, ...command.visibleTeamIds] });
      if (receipt) {
        if (receipt.requestHash !== requestHash) throw new LeadManagementError("idempotency_conflict", 409);
        return leadOperationalEditResultV1Schema.parse({ ...receipt.outcome, replayed: true });
      }
      if (lead.version !== command.expectedVersion) throw new LeadManagementError("stale_version", 409);
      await authority.validateAssignment(actor.workspaceId, command.responsibleMembershipId, command.responsibleTeamId);
      await authority.validateVisibleTeams(actor.workspaceId, command.visibleTeamIds);
      const beforeVisibleTeamIds = await leads.visibleTeamIds(actor.workspaceId, lead.id);
      const before = operationalSnapshot(lead, beforeVisibleTeamIds);
      const after = { responsibleMembershipId: command.responsibleMembershipId,
        responsibleTeamId: command.responsibleTeamId, visibility: command.visibility,
        visibleTeamIds: command.visibleTeamIds };
      const changeFields = changedOperationalFields(before, after);
      if (!changeFields.length) throw new LeadManagementError("validation_failed", 400);
      const leadVersion = await leads.updateOperational({ workspaceId: actor.workspaceId, leadId: lead.id,
        expectedVersion: command.expectedVersion, ...after });
      await leads.addMutationActivity({ workspaceId: actor.workspaceId, leadId: lead.id,
        actorMembershipId: actor.membershipId, kind: "updated", body: "Lead assignment or visibility updated." });
      const operationId = randomUUID();
      await writeGoverningAudit(tx, { actor, operation, action: "crm.lead_operational_updated", targetType: "lead",
        targetId: lead.id, requestId, correlationId: operationId, resultVersion: leadVersion,
        metadata: { expected_version: command.expectedVersion, change_fields: changeFields }, before, after: { ...after, version: leadVersion } });
      await writeDomainEventSet(tx, { workspaceId: actor.workspaceId, operationId, events: [{
        topic: "crm.lead.operational_updated.v1", aggregateType: "lead", aggregateId: lead.id, resultVersion: leadVersion,
        payload: { schemaVersion: 1, workspaceId: actor.workspaceId, leadId: lead.id, leadVersion,
          changeFields, requestId },
      }] });
      const result = leadOperationalEditResultV1Schema.parse({ contractVersion: "lead-operational-edit-result.v1",
        leadId: lead.id, leadVersion, operational: after, changed: true, replayed: false, requestId,
        nextView: { kind: "lead_detail", leadId: lead.id } });
      await receipts.save({ principalKey, operation, idempotencyKey: input.idempotencyKey, requestHash, outcome: result });
      return result;
    });
  } catch (error) { return mapMutationError(error); }
}

export async function executeLeadStageTransitionV1(pool: Pool, input: { actor: TrustedActor; leadId: string;
  command: LeadStageTransitionCommandV1; idempotencyKey: string; requestId?: string }): Promise<LeadStageTransitionResultV1> {
  if (!uuidPattern.test(input.leadId)) throw new LeadManagementError("resource_not_found", 404);
  assertIdempotencyKey(input.idempotencyKey);
  const requestId = input.requestId ?? randomUUID(), operation = "lead-stage-transition.v1" as const;
  const principalKey = principal(input.actor, input.leadId);
  const requestHash = canonicalRequestHash({ contractVersion: operation, workspaceId: input.actor.workspaceId,
    leadId: input.leadId, expectedVersion: input.command.expectedVersion, command: input.command });
  try {
    return await runModuleTransaction(pool, async tx => {
      await lockIdempotencyAuthority(tx, `${principalKey}:${operation}:${input.idempotencyKey}`);
      const receipts = idempotencyReceiptParticipant(tx);
      const receipt = await receipts.find<LeadStageTransitionResultV1>(principalKey, operation, input.idempotencyKey);
      const leads = leadTransactionParticipant(tx), lead = await leads.lockForMutation(input.actor.workspaceId, input.leadId);
      const stage = await leads.lockPipelineStage(input.actor.workspaceId, input.command.targetStageId);
      const { actor } = await authorizeMutation(tx, input.actor, lead, { operation });
      if (receipt) {
        if (receipt.requestHash !== requestHash) throw new LeadManagementError("idempotency_conflict", 409);
        return leadStageTransitionResultV1Schema.parse({ ...receipt.outcome, replayed: true });
      }
      if (lead.version !== input.command.expectedVersion) throw new LeadManagementError("stale_version", 409);
      if (!stage || stage.status !== "active") throw new LeadManagementError("stage_unavailable", 409);
      if (lead.stage_id === stage.id) {
        const result = leadStageTransitionResultV1Schema.parse({ contractVersion: "lead-stage-transition-result.v1",
          leadId: lead.id, leadVersion: lead.version, stage: { stageId: stage.id, name: stage.name, position: stage.position },
          changed: false, replayed: false, requestId, nextView: { kind: "lead_detail", leadId: lead.id } });
        await receipts.save({ principalKey, operation, idempotencyKey: input.idempotencyKey, requestHash, outcome: result });
        return result;
      }
      const leadVersion = await leads.transitionStage({ workspaceId: actor.workspaceId, leadId: lead.id,
        expectedVersion: input.command.expectedVersion, stageId: stage.id });
      await leads.addMutationActivity({ workspaceId: actor.workspaceId, leadId: lead.id,
        actorMembershipId: actor.membershipId, kind: "stage_changed", body: `Lead moved to ${stage.name}.` });
      const operationId = randomUUID();
      await writeGoverningAudit(tx, { actor, operation, action: "crm.lead_stage_transitioned", targetType: "lead",
        targetId: lead.id, requestId, correlationId: operationId, resultVersion: leadVersion,
        metadata: { expected_version: input.command.expectedVersion, change_fields: ["stageId"] },
        before: { stageId: lead.stage_id, version: lead.version }, after: { stageId: stage.id, version: leadVersion } });
      await writeDomainEventSet(tx, { workspaceId: actor.workspaceId, operationId, events: [{
        topic: "crm.lead.stage_transitioned.v1", aggregateType: "lead", aggregateId: lead.id, resultVersion: leadVersion,
        payload: { schemaVersion: 1, workspaceId: actor.workspaceId, leadId: lead.id, leadVersion,
          previousStageId: lead.stage_id, stageId: stage.id, requestId },
      }] });
      const result = leadStageTransitionResultV1Schema.parse({ contractVersion: "lead-stage-transition-result.v1",
        leadId: lead.id, leadVersion, stage: { stageId: stage.id, name: stage.name, position: stage.position },
        changed: true, replayed: false, requestId, nextView: { kind: "lead_detail", leadId: lead.id } });
      await receipts.save({ principalKey, operation, idempotencyKey: input.idempotencyKey, requestHash, outcome: result });
      return result;
    });
  } catch (error) { return mapMutationError(error); }
}
