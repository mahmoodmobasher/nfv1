import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { runModuleTransaction } from "@/backend/platform/database";
import { revalidateActiveActor, type TrustedActor } from "@/backend/platform/authorization";
import { canonicalRequestHash, lockIdempotencyAuthority } from "@/backend/platform/idempotency";
import { writeGoverningAudit } from "@/backend/platform/audit";
import { writeDomainEventSet } from "@/backend/platform/outbox";
import { contactTransactionParticipant } from "@/backend/modules/contacts";
import { companyTransactionParticipant } from "@/backend/modules/companies";
import { identityReviewTransactionParticipant } from "@/backend/modules/identity-review";
import { canonicalizeIntake } from "../../domain/lead-attribution.domain";
import { leadTransactionParticipant } from "../../persistence/repositories/lead.repository";
import { manualIntakeRepository } from "../../persistence/repositories/manual-intake.repository";
import {
  LEAD_INQUIRY_INTAKE_RESULT, LeadIntakeError, type LeadInquiryIntakeCommandV1,
  type LeadInquiryIntakeResultV1, type LegacyLeadCreateV1,
} from "../../contracts/lead-inquiry-intake.contract";

type Compatibility = Pick<LegacyLeadCreateV1, "stageId" | "visibility" | "teamIds" | "note">;

function asKnownError(error: unknown): never {
  if (error instanceof LeadIntakeError) throw error;
  if (error && typeof error === "object" && "code" in error && "status" in error) {
    const value = error as { code: string; status: number; safe?: unknown };
    throw new LeadIntakeError(value.code as never, value.status, value.safe);
  }
  throw error;
}

export async function orchestrateManualLeadInquiryV1(pool: Pool, input: {
  actor: TrustedActor;
  command: LeadInquiryIntakeCommandV1;
  idempotencyKey: string;
  requestId?: string;
  compatibility?: Compatibility;
}): Promise<LeadInquiryIntakeResultV1> {
  const requestId = input.requestId ?? randomUUID();
  const normalized = canonicalizeIntake(input.command);
  const hashedCommand = input.compatibility ? { ...input.command, inquiry: {
    subject: input.command.inquiry.subject, message: input.command.inquiry.message,
  } } : input.command;
  const requestHash = canonicalRequestHash({ command: hashedCommand, effectiveAttribution: {
    category: normalized.sourceCategory, platform: normalized.sourcePlatform, medium: normalized.sourceMedium,
    detail: normalized.sourceDetail, campaign: normalized.campaignContext, version: normalized.attributionContractVersion,
  }, compatibility: input.compatibility });
  try {
    return await runModuleTransaction(pool, async tx => {
      await lockIdempotencyAuthority(tx, `${input.actor.workspaceId}:lead-inquiry-intake.v1:manual:${input.idempotencyKey}`);
      const receipts = manualIntakeRepository(tx);
      const existing = await receipts.findForReplay(input.actor.workspaceId, input.idempotencyKey);
      const actor = await revalidateActiveActor(tx, input.actor);
      if (existing) {
        if (existing.request_hash !== requestHash) throw new LeadIntakeError("idempotency_conflict", 409);
        if (existing.state !== "committed" || !existing.outcome) throw new LeadIntakeError("intake_unavailable", 503);
        return { ...(existing.outcome as LeadInquiryIntakeResultV1), disposition: "replayed", replayed: true };
      }

      const intake = await receipts.createPending({ workspaceId: actor.workspaceId, idempotencyKey: input.idempotencyKey,
        actorMembershipId: actor.membershipId, requestHash, ...normalized });
      const leads = leadTransactionParticipant(tx);
      const stageId = await leads.activeStage(actor.workspaceId, input.compatibility?.stageId);
      const lead = await leads.create({ workspaceId: actor.workspaceId, stageId, visibility: input.compatibility?.visibility ?? "workspace", ...normalized });

      const contacts = contactTransactionParticipant(tx);
      const companies = companyTransactionParticipant(tx);
      const contactCandidates = await contacts.findCandidates({ workspaceId: actor.workspaceId,
        emailNormalized: normalized.emailNormalized, phoneNormalized: normalized.phoneNormalized,
        personNameNormalized: normalized.personNameNormalized, companyNameNormalized: normalized.organizationNameNormalized });
      const allCompanyCandidates = await companies.findCandidates({ workspaceId: actor.workspaceId,
        nameNormalized: normalized.organizationNameNormalized, domainNormalized: normalized.organizationDomainNormalized });
      const probableContacts = contactCandidates.filter(candidate => candidate.evidenceStrength === "probable");
      const companyCandidates = allCompanyCandidates.slice(0, Math.max(0, 10 - probableContacts.length));
      const summary = {
        strong: contactCandidates.filter(candidate => candidate.evidenceStrength === "strong").length,
        supplementary: contactCandidates.filter(candidate => candidate.evidenceStrength === "supplementary").length,
        probable: contactCandidates.filter(candidate => candidate.evidenceStrength === "probable").length + companyCandidates.length,
      };

      const requestedMembership = input.command.requestedAssignment?.membershipId ??
        (input.compatibility ? input.actor.membershipId : null);
      const requestedTeam = input.command.requestedAssignment?.teamId ?? null;
      if (actor.role === "member" && ((requestedMembership && requestedMembership !== actor.membershipId) || requestedTeam)) {
        throw new LeadIntakeError("permission_required", 403);
      }
      await leads.lockAssignment({ workspaceId: actor.workspaceId, membershipId: requestedMembership, teamId: requestedTeam });
      await leads.setInitialResponsibility({ workspaceId: actor.workspaceId, leadId: lead.id, membershipId: requestedMembership, teamId: requestedTeam });
      if (input.compatibility?.visibility === "teams") {
        for (const teamId of [...input.compatibility.teamIds].sort()) await leads.lockAssignment({ workspaceId: actor.workspaceId, membershipId: null, teamId });
        await leads.addVisibleTeams(actor.workspaceId, lead.id, input.compatibility.teamIds);
      }
      await leads.addCreatedActivity(actor.workspaceId, lead.id, actor.membershipId, input.compatibility?.note);

      const reviewId = summary.strong + summary.supplementary + summary.probable > 0 ? randomUUID() : undefined;
      const reviews = identityReviewTransactionParticipant(tx);
      const baseResult: LeadInquiryIntakeResultV1 = {
        contractVersion: LEAD_INQUIRY_INTAKE_RESULT, intakeId: intake.id, leadId: lead.id,
        disposition: reviewId ? "held_for_review" : "created", candidateSummary: summary, leadVersion: lead.version,
        ...(reviewId ? { reviewCaseId: reviewId, reviewVersion: 1 } : {}), replayed: false, requestId,
      };
      const committed = await receipts.commit(actor.workspaceId, intake.id, lead.id, baseResult);
      let review: { id: string; version: number } | undefined;
      if (reviewId) {
        review = await reviews.open(actor.workspaceId, intake.id, lead.id, reviewId);
        await reviews.recordCandidates(actor.workspaceId, review.id, contactCandidates, companyCandidates);
        await leads.setInitialReview(actor.workspaceId, lead.id, "pending");
        const decision = await reviews.appendDecision({ workspaceId: actor.workspaceId, intakeId: intake.id, reviewId: review.id,
          idempotencyKey: canonicalRequestHash({ intakeId: intake.id, outcome: "hold" }), requestHash, requestId, correlationId: requestId, governingOutcome: "hold",
          actorMembershipId: actor.membershipId, expectedLeadVersion: lead.version, expectedReviewVersion: review.version,
          expectedIntakeVersion: committed.version, resultLeadVersion: lead.version, resultReviewVersion: review.version });
        await reviews.setDecisionHead(actor.workspaceId, intake.id, decision.id);
      }
      const auditAction = review ? "crm.inquiry_held_for_review" : "crm.inquiry_created";
      await writeGoverningAudit(tx, { actor, action: auditAction, targetType: "lead", targetId: lead.id,
        requestId, correlationId: requestId, resultVersion: lead.version });
      const payload = { schemaVersion: 1, workspaceId: actor.workspaceId, leadId: lead.id, leadVersion: lead.version,
        lifecycle: "new", disposition: baseResult.disposition, intakeChannel: "manual", sourceCategory: normalized.sourceCategory,
        sourcePlatform: normalized.sourcePlatform, sourceMedium: normalized.sourceMedium, candidateSummary: summary, requestId };
      await writeDomainEventSet(tx, { workspaceId: actor.workspaceId, operationId: intake.id, events: [
        { topic: "crm.inquiry.created.v1", aggregateType: "lead", aggregateId: lead.id, resultVersion: lead.version, payload },
        ...(review ? [{ topic: "crm.inquiry.review_required.v1", aggregateType: "lead", aggregateId: lead.id,
          resultVersion: review.version, payload: { ...payload, reviewId: review.id, reviewVersion: review.version } }] : []),
      ] });
      return baseResult;
    });
  } catch (error) { return asKnownError(error); }
}
