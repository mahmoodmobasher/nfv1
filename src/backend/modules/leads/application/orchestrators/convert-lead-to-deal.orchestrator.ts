import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { dealPartyReferenceParticipant } from "@/backend/modules/customer-graph";
import { identityReviewTransactionParticipant } from "@/backend/modules/identity-review";
import { salesLeadConversionParticipant } from "@/backend/modules/sales";
import {
  lookupActiveActor,
  revalidateActiveActor,
  salesAuthorityParticipant,
  workspaceAuthorityParticipant,
  type TrustedActor,
} from "@/backend/platform/authorization";
import { writeLeadConversionEvidence } from "@/backend/platform/audit";
import { runModuleTransaction } from "@/backend/platform/database";
import {
  canonicalRequestHash,
  idempotencyReceiptParticipant,
  lockIdempotencyAuthority,
} from "@/backend/platform/idempotency";
import {
  LEAD_CONVERT_TO_DEAL_OPERATION,
  LeadConversionError,
  leadConversionPreviewV1Schema,
  leadConversionResultV1Schema,
  type LeadConvertToDealCommandV1,
  type LeadConversionIneligibilityReasonV1,
  type LeadConversionPreviewV1,
  type LeadConversionResultV1,
} from "../../contracts/lead-conversion.contract";
import { leadTransactionParticipant } from "../../persistence/repositories/lead.repository";

type LeadContext = Awaited<
  ReturnType<ReturnType<typeof leadTransactionParticipant>["conversionContext"]>
>;
function fail(
  code: ConstructorParameters<typeof LeadConversionError>[0],
  status = 409,
): never {
  throw new LeadConversionError(code, status);
}

async function canReadLead(
  tx: PoolClient,
  actor: TrustedActor,
  lead: LeadContext,
) {
  const ids = await workspaceAuthorityParticipant(tx).visibleLeadIds(actor, [
    {
      id: lead.id,
      visibility: lead.visibility,
      ownerMembershipId: lead.ownerMembershipId,
    },
  ]);
  return ids.has(lead.id);
}

function canConvert(actor: TrustedActor, lead: LeadContext) {
  return (
    actor.role === "owner" ||
    actor.role === "admin" ||
    lead.ownerMembershipId === actor.membershipId
  );
}

function sameAssignment(
  lead: LeadContext,
  visibleTeamIds: string[],
  assignment: LeadConvertToDealCommandV1["assignment"],
) {
  return (
    lead.ownerMembershipId === assignment.responsibleMembershipId &&
    lead.responsibleTeamId === assignment.responsibleTeamId &&
    lead.visibility === assignment.visibility &&
    JSON.stringify([...visibleTeamIds].sort()) ===
      JSON.stringify([...assignment.visibleTeamIds].sort())
  );
}

async function facts(
  tx: PoolClient,
  actor: TrustedActor,
  leadId: string,
  lock = false,
) {
  const leads = leadTransactionParticipant(tx);
  const lead = await leads.conversionContext(actor.workspaceId, leadId, lock);
  if (!(await canReadLead(tx, actor, lead))) fail("resource_not_found", 404);
  const review = await identityReviewTransactionParticipant(
    tx,
  ).conversionReview(actor.workspaceId, lead.id, lead.intakeId, lock);
  const customer = await dealPartyReferenceParticipant(tx).conversionChoices(
    actor,
    { companyId: lead.companyId, contactId: lead.contactId },
    lock,
  );
  const pipeline = await salesLeadConversionParticipant(tx).pipeline(
    actor.workspaceId,
    lock,
  );
  const lineage = await salesLeadConversionParticipant(tx).existing(
    actor.workspaceId,
    lead.id,
    lock,
  );
  const visibleTeamIds = await leads.visibleTeamIds(actor.workspaceId, lead.id);
  return { lead, review, customer, pipeline, lineage, visibleTeamIds };
}

function reasonsFor(
  actor: TrustedActor,
  state: Awaited<ReturnType<typeof facts>>,
): LeadConversionIneligibilityReasonV1[] {
  const reasons: LeadConversionIneligibilityReasonV1[] = [];
  if (!canConvert(actor, state.lead)) reasons.push("permission_required");
  if (state.lead.lifecycle !== "qualified") reasons.push("lead_not_qualified");
  if (state.review.pending) reasons.push("identity_review_pending");
  if (!state.review.resolved) reasons.push("identity_review_unresolved");
  if (state.lineage || state.lead.lifecycle === "converted")
    reasons.push("already_converted");
  if (state.lead.status !== "open") reasons.push("legacy_status_terminal");
  if (!state.lead.companyId) reasons.push("customer_selection_required");
  else if (!state.customer.company) reasons.push("customer_unavailable");
  if (state.lead.contactId && !state.customer.contact)
    reasons.push("contact_not_primary_eligible");
  if (!state.pipeline) reasons.push("pipeline_unavailable");
  if (!state.pipeline?.stage) reasons.push("stage_unavailable");
  if (!state.lead.ownerMembershipId) reasons.push("assignment_unavailable");
  if (
    state.review.resolved &&
    (state.review.resolved.companyId !== state.lead.companyId ||
      state.review.resolved.contactId !== state.lead.contactId)
  )
    reasons.push("customer_unavailable");
  return [...new Set(reasons)];
}

async function previewInTransaction(
  tx: PoolClient,
  suppliedActor: TrustedActor,
  leadId: string,
  requestId: string,
) {
  const actor = await lookupActiveActor(tx, suppliedActor);
  const state = await facts(tx, actor, leadId, true);
  await workspaceAuthorityParticipant(tx).lockReferences({
    workspaceId: actor.workspaceId,
    leadId,
    membershipIds: [state.lead.ownerMembershipId],
    teamIds: [state.lead.responsibleTeamId, ...state.visibleTeamIds],
  });
  const finalActor = await revalidateActiveActor(tx, actor);
  if (!(await canReadLead(tx, finalActor, state.lead)))
    fail("resource_not_found", 404);
  state.customer = await dealPartyReferenceParticipant(tx).conversionChoices(
    finalActor,
    { companyId: state.lead.companyId, contactId: state.lead.contactId },
  );
  const reasons = reasonsFor(finalActor, state);
  const eligible = reasons.length === 0;
  const preview: LeadConversionPreviewV1 = {
    contractVersion: "lead-conversion-preview.v1",
    lead: {
      leadId: state.lead.id,
      label: state.lead.displayName,
      lifecycle: state.lead
        .lifecycle as LeadConversionPreviewV1["lead"]["lifecycle"],
      legacyStatus: state.lead.status,
      version: state.lead.version,
      intakeId: state.lead.intakeId,
      intakeVersion: state.lead.intakeVersion,
      review: state.review.resolved
        ? {
            reviewId: state.review.resolved.reviewId,
            reviewVersion: state.review.resolved.reviewVersion,
            decisionHeadId: state.review.resolved.decisionHeadId,
            decisionHeadVersion: state.review.resolved.decisionHeadVersion,
          }
        : null,
    },
    eligible,
    ineligibilityReasons: reasons,
    capabilities: { canConvert: eligible },
    choices: {
      companies: state.customer.company
        ? [
            {
              companyId: state.customer.company.id,
              label: state.customer.company.label,
              version: state.customer.company.version,
              disclosure: "full",
            },
          ]
        : [],
      primaryContacts: state.customer.contact
        ? [
            {
              contactId: state.customer.contact.id,
              companyId: state.customer.company!.id,
              label: state.customer.contact.label,
              version: state.customer.contact.version,
              disclosure: "full",
              primaryEligible: true,
            },
          ]
        : [],
    },
    pipeline: state.pipeline
      ? {
          pipelineId: state.pipeline.pipelineId,
          label: state.pipeline.label,
          version: state.pipeline.version,
          configurationVersion: state.pipeline.configurationVersion,
          initialStage: {
            stageId: state.pipeline.stage.stageId,
            label: state.pipeline.stage.label,
            version: state.pipeline.stage.version,
          },
        }
      : null,
    dealDefaults: {
      name: state.lead.displayName.slice(0, 200),
      value: null,
      expectedCloseOn: null,
    },
    assignment: {
      responsibleMembershipId:
        state.lead.ownerMembershipId ?? finalActor.membershipId,
      responsibleTeamId: state.lead.responsibleTeamId,
      visibility: state.lead.visibility,
      visibleTeamIds: state.visibleTeamIds,
    },
    effects: {
      createsDeal: true,
      createsCustomers: false,
      createsDeliveryProject: false,
      writesLineage: true,
      convertsCanonicalLeadLifecycle: true,
      preservesLegacyLeadStatus: true,
    },
    requestId,
  };
  return leadConversionPreviewV1Schema.parse(preview);
}

export async function getLeadConversionPreviewV1(
  pool: Pool,
  actor: TrustedActor,
  leadId: string,
  requestId: string = randomUUID(),
) {
  return runModuleTransaction(pool, (tx) =>
    previewInTransaction(tx, actor, leadId, requestId),
  );
}

function assertCurrentCommand(
  state: Awaited<ReturnType<typeof facts>>,
  command: LeadConvertToDealCommandV1,
) {
  const review = state.review.resolved;
  if (state.review.pending) fail("identity_review_pending");
  if (!review) fail("stale_preview");
  // A primary Contact is OPTIONAL on a converted Deal (product decision, 2026-08-29;
  // see UAT-WALK-FINDINGS-2026-08-29.md #5). The identity review may have created or
  // matched a Contact without requiring it be used as the Deal's primary Contact --
  // omitting primaryContact is always allowed, even when the review bound one. A
  // SUPPLIED primary Contact must still be exactly the one the review resolved, at the
  // version the preview showed: that check is the actual point of this guard, and it
  // gets its own error code so a rejected selection is never reported as a stale preview
  // (the previous behaviour, which read as a race and invited endless retries).
  if (
    command.primaryContact &&
    (review.contactId !== command.primaryContact.contactId ||
      state.customer.contact?.id !== command.primaryContact.contactId ||
      state.customer.contact?.version !== command.primaryContact.expectedVersion)
  )
    fail("primary_contact_mismatch");
  if (
    state.lead.version !== command.expectedLeadVersion ||
    state.lead.intakeId !== command.intakeId ||
    state.lead.intakeVersion !== command.expectedIntakeVersion ||
    review.reviewId !== command.review.reviewId ||
    review.reviewVersion !== command.review.reviewVersion ||
    review.decisionHeadId !== command.review.decisionHeadId ||
    review.decisionHeadVersion !== command.review.decisionHeadVersion ||
    state.customer.company?.id !== command.company.companyId ||
    state.customer.company.version !== command.company.expectedVersion ||
    state.pipeline?.pipelineId !== command.pipeline.pipelineId ||
    state.pipeline.version !== command.pipeline.expectedVersion ||
    state.pipeline.configurationVersion !==
      command.pipeline.expectedConfigurationVersion ||
    state.pipeline.stage.stageId !== command.pipeline.stageId ||
    state.pipeline.stage.version !== command.pipeline.expectedStageVersion ||
    review.companyId !== command.company.companyId ||
    !sameAssignment(state.lead, state.visibleTeamIds, command.assignment)
  )
    fail("stale_preview");
}

export async function convertLeadToDealV1(
  pool: Pool,
  input: {
    actor: TrustedActor;
    leadId: string;
    command: LeadConvertToDealCommandV1;
    idempotencyKey: string;
    requestId?: string;
    beforeEvidence?: () => Promise<void>;
  },
) {
  if (
    input.idempotencyKey.length < 16 ||
    input.idempotencyKey.length > 128 ||
    [...input.idempotencyKey].some((c) => c < " " || c > "~")
  )
    fail("validation_failed", 400);
  const requestId = input.requestId ?? randomUUID();
  return runModuleTransaction(pool, async (tx) => {
    const principal = `workspace:${input.actor.workspaceId}:membership:${input.actor.membershipId}:lead:${input.leadId}`;
    const requestHash = canonicalRequestHash({
      leadId: input.leadId,
      command: input.command,
    });
    await lockIdempotencyAuthority(
      tx,
      `${principal}:${LEAD_CONVERT_TO_DEAL_OPERATION}:${input.idempotencyKey}`,
    );
    const receipts = idempotencyReceiptParticipant(tx);
    const old = await receipts.find<LeadConversionResultV1>(
      principal,
      LEAD_CONVERT_TO_DEAL_OPERATION,
      input.idempotencyKey,
    );
    if (old?.requestHash !== undefined && old.requestHash !== requestHash)
      fail("idempotency_conflict");

    const actor = await revalidateActiveActor(tx, input.actor);
    const state = await facts(tx, actor, input.leadId, true);
    if (!canConvert(actor, state.lead)) fail("permission_required", 403);

    if (old) {
      const oldResult = old.outcome;
      const available =
        oldResult.deal.available &&
        (await salesLeadConversionParticipant(tx).canDiscloseDeal(
          actor,
          oldResult.deal.dealId,
        ));
      return leadConversionResultV1Schema.parse({
        ...oldResult,
        deal: available ? oldResult.deal : { available: false },
        replayed: true,
        requestId,
        nextView: available
          ? {
              kind: "deal_detail",
              dealId: oldResult.deal.available ? oldResult.deal.dealId : "",
            }
          : { kind: "lead_detail", leadId: input.leadId },
      });
    }

    const reasons = reasonsFor(actor, state);
    if (state.lineage || reasons.includes("already_converted"))
      fail("already_converted");
    if (reasons.includes("identity_review_pending"))
      fail("identity_review_pending");
    if (reasons.length) fail("stale_preview");
    assertCurrentCommand(state, input.command);

    try {
      await salesAuthorityParticipant(tx).lockAndValidate(
        actor,
        input.command.assignment,
      );
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code: string }).code === "assignment_unavailable"
      )
        fail("stale_preview");
      throw error;
    }
    await workspaceAuthorityParticipant(tx).lockReferences({
      workspaceId: actor.workspaceId,
      leadId: input.leadId,
      membershipIds: [state.lead.ownerMembershipId],
      teamIds: [state.lead.responsibleTeamId, ...state.visibleTeamIds],
    });
    const finalActor = await revalidateActiveActor(tx, actor);
    if (
      !canConvert(finalActor, state.lead) ||
      !(await canReadLead(tx, finalActor, state.lead))
    )
      fail("permission_required", 403);
    state.customer = await dealPartyReferenceParticipant(tx).conversionChoices(
      finalActor,
      { companyId: state.lead.companyId, contactId: state.lead.contactId },
    );
    assertCurrentCommand(state, input.command);

    const operationId = randomUUID();
    const resultLeadVersion = await leadTransactionParticipant(
      tx,
    ).convertLifecycle({
      workspaceId: actor.workspaceId,
      leadId: input.leadId,
      expectedVersion: input.command.expectedLeadVersion,
      actorMembershipId: finalActor.membershipId,
      operationId,
    });
    const deal = await salesLeadConversionParticipant(tx).create({
      actor: finalActor,
      leadId: input.leadId,
      sourceLeadVersion: input.command.expectedLeadVersion,
      resultLeadVersion,
      operationId,
      command: input.command,
      probabilityBps: state.pipeline!.stage.defaultProbabilityBps,
    });
    await input.beforeEvidence?.();
    await writeLeadConversionEvidence(tx, {
      actor: finalActor,
      leadId: input.leadId,
      dealId: deal.id,
      leadVersion: resultLeadVersion,
      dealVersion: deal.version,
      requestId,
      operationId,
    });
    const result = leadConversionResultV1Schema.parse({
      contractVersion: "lead-conversion-result.v1",
      leadId: input.leadId,
      leadVersion: resultLeadVersion,
      deal: { available: true, dealId: deal.id },
      committed: true,
      replayed: false,
      requestId,
      nextView: { kind: "deal_detail", dealId: deal.id },
    });
    await receipts.save({
      principalKey: principal,
      operation: LEAD_CONVERT_TO_DEAL_OPERATION,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      outcome: result,
    });
    return result;
  });
}
