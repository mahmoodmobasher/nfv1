import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { runModuleTransaction } from "@/backend/platform/database";
import { lookupActiveActor, revalidateActiveActor, workspaceAuthorityParticipant, type TrustedActor } from "@/backend/platform/authorization";
import { canonicalRequestHash, lockIdempotencyAuthority, lockIdentityKeyAuthority } from "@/backend/platform/idempotency";
import { writeGoverningAudit } from "@/backend/platform/audit";
import { writeDomainEventSet, type DomainEventV1 } from "@/backend/platform/outbox";
import { contactTransactionParticipant } from "@/backend/modules/contacts";
import { companyContactCandidateReadModel, companyTransactionParticipant } from "@/backend/modules/companies";
import { identityReviewTransactionParticipant } from "@/backend/modules/identity-review";
import { canonicalizeIntake } from "../../domain/lead-attribution.domain";
import { CANDIDATE_QUERY_CONTRACT, sameCandidateSet, sameVersionSet, selectCandidateSetV1,
  type CandidateQueryV1 } from "../../domain/identity-candidate-set.domain";
import { leadTransactionParticipant } from "../../persistence/repositories/lead.repository";
import { manualIntakeRepository } from "../../persistence/repositories/manual-intake.repository";
import {
  LEAD_INQUIRY_INTAKE_RESULT, LeadIntakeError, type LeadInquiryIntakeCommandV1,
  type LeadInquiryIntakeResultV1, type LegacyLeadCreateV1,
} from "../../contracts/lead-inquiry-intake.contract";

type Compatibility = Pick<LegacyLeadCreateV1, "stageId" | "visibility" | "teamIds" | "note">;

function contactIdentityLockKeys(identity: Pick<CandidateQueryV1, "emailNormalized" | "phoneNormalized" |
  "personNameNormalized" | "companyNameNormalized">): string[] {
  const comparable = [identity.emailNormalized ? `email:${identity.emailNormalized}` : null,
    identity.phoneNormalized ? `phone:${identity.phoneNormalized}` : null].filter((key): key is string => key !== null);
  return (comparable.length > 0 ? comparable :
    [`name-company:${identity.personNameNormalized}:${identity.companyNameNormalized ?? ""}`]).sort();
}

function asKnownError(error: unknown): never {
  if (error instanceof LeadIntakeError) throw error;
  if (error && typeof error === "object" && "code" in error && "status" in error) {
    const value = error as { code: string; status: number; safe?: unknown };
    throw new LeadIntakeError(value.code as never, value.status, value.safe);
  }
  throw error;
}

function publicResult(outcome: Record<string, unknown>): LeadInquiryIntakeResultV1 {
  const { _candidateQuery: _private, ...result } = outcome;
  void _private;
  const leadId = String(result.leadId), reviewCaseId = result.reviewCaseId ? String(result.reviewCaseId) : null;
  return { ...result, contactId: result.contactId ? String(result.contactId) : null,
    companyId: result.companyId ? String(result.companyId) : null, reviewCaseId,
    reviewVersion: result.reviewVersion ? Number(result.reviewVersion) : null,
    nextView: reviewCaseId ? { kind: "identity_review_detail", leadId, reviewId: reviewCaseId }
      : { kind: "lead_detail", leadId } } as LeadInquiryIntakeResultV1;
}

export async function orchestrateManualLeadInquiryV1(pool: Pool, input: {
  actor: TrustedActor;
  command: LeadInquiryIntakeCommandV1;
  idempotencyKey: string;
  requestId?: string;
  compatibility?: Compatibility;
  normalized?: ReturnType<typeof canonicalizeIntake>;
}): Promise<LeadInquiryIntakeResultV1> {
  const requestId = input.requestId ?? randomUUID();
  const normalized = input.normalized ?? canonicalizeIntake(input.command);
  const { phone: _phone, phoneCountryOverride: _phoneCountryOverride, ...personWithoutPhone } = input.command.person;
  void _phone;
  const semanticCommand = { ...input.command, person: personWithoutPhone };
  const hashedCommand = input.compatibility ? { ...semanticCommand, inquiry: {
    subject: input.command.inquiry.subject, message: input.command.inquiry.message,
  } } : semanticCommand;
  const requestHash = canonicalRequestHash({ command: hashedCommand, effectiveAttribution: {
    category: normalized.sourceCategory, platform: normalized.sourcePlatform, medium: normalized.sourceMedium,
    detail: normalized.sourceDetail, campaign: normalized.campaignContext, version: normalized.attributionContractVersion,
  }, canonicalPhone: normalized.phoneNormalized === null ? null : {
    display: normalized.phoneDisplay, e164: normalized.phoneNormalized,
    callingCode: normalized.phoneCountryCodeUsed, normalizationVersion: normalized.normalizationVersion,
    effectiveCountryInput: normalized.phoneDisplay?.startsWith("+") ? null : _phoneCountryOverride ?? null,
  }, compatibility: input.compatibility });
  try {
    return await runModuleTransaction(pool, async tx => {
      await lockIdempotencyAuthority(tx, `${input.actor.workspaceId}:lead-inquiry-intake.v1:manual:${input.idempotencyKey}`);
      const receipts = manualIntakeRepository(tx);
      const existing = await receipts.findForReplay(input.actor.workspaceId, input.idempotencyKey);
      if (existing) {
        if (existing.request_hash !== requestHash) throw new LeadIntakeError("idempotency_conflict", 409);
        if (existing.state !== "committed" || !existing.outcome) throw new LeadIntakeError("intake_unavailable", 503);
        const lead = await leadTransactionParticipant(tx).lockForResolution(input.actor.workspaceId, existing.lead_id);
        const authority = workspaceAuthorityParticipant(tx);
        await authority.lockReferences({ workspaceId: input.actor.workspaceId, leadId: lead.id,
          membershipIds: [input.actor.membershipId, lead.owner_membership_id], teamIds: [lead.responsible_team_id] });
        const actor = await revalidateActiveActor(tx, input.actor);
        if (actor.membershipId !== existing.actor_membership_id || !(await authority.canDiscloseLead(actor, lead)))
          throw new LeadIntakeError("resource_not_found", 404);
        return { ...publicResult(existing.outcome as Record<string, unknown>), disposition: "replayed", replayed: true };
      }

      const actorLookup = await lookupActiveActor(tx, input.actor);
      const intake = await receipts.createPending({ workspaceId: actorLookup.workspaceId, idempotencyKey: input.idempotencyKey,
        actorMembershipId: actorLookup.membershipId, requestHash, ...normalized });
      const leads = leadTransactionParticipant(tx);
      const stageId = await leads.activeStage(actorLookup.workspaceId, input.compatibility?.stageId);
      const lead = await leads.create({ workspaceId: actorLookup.workspaceId, stageId, visibility: input.compatibility?.visibility ?? "workspace", ...normalized });

      const contacts = contactTransactionParticipant(tx);
      const companies = companyTransactionParticipant(tx);
      const companyContacts = companyContactCandidateReadModel(tx);
      const candidateQuery: CandidateQueryV1 = { contractVersion: CANDIDATE_QUERY_CONTRACT,
        emailNormalized: normalized.emailNormalized, phoneNormalized: normalized.phoneNormalized,
        personNameNormalized: normalized.personNameNormalized, companyNameNormalized: normalized.organizationNameNormalized,
        companyDomainNormalized: normalized.organizationDomainNormalized };
      const companyKey = `${candidateQuery.companyNameNormalized ?? ""}:${candidateQuery.companyDomainNormalized ?? ""}`;
      if (companyKey !== ":") await lockIdentityKeyAuthority(tx,
        `${actorLookup.workspaceId}:company:${companyKey}`);
      const companyQuery = { workspaceId: actorLookup.workspaceId, nameNormalized: candidateQuery.companyNameNormalized,
        domainNormalized: candidateQuery.companyDomainNormalized };
      const probableQuery = { workspaceId: actorLookup.workspaceId, personNameNormalized: candidateQuery.personNameNormalized,
        companyNameNormalized: candidateQuery.companyNameNormalized };
      const initialCompanies = await companies.findCandidates(companyQuery);
      const initialProbable = await companyContacts.findProbableContacts(probableQuery);
      const probableCompanyRows = await companies.findActiveRowsByIds(actorLookup.workspaceId,
        initialProbable.flatMap(candidate => candidate.companyId ? [candidate.companyId] : []));
      const companyRows = [...new Map([...initialCompanies, ...probableCompanyRows].map(item => [item.id, item])).values()];
      await companies.lockCandidateSet(actorLookup.workspaceId, companyRows);
      const companyRerun = await companies.findCandidates(companyQuery);
      const probableRerun = await companyContacts.findProbableContacts(probableQuery);
      const probableCompanyRerun = await companies.findActiveRowsByIds(actorLookup.workspaceId,
        probableRerun.flatMap(candidate => candidate.companyId ? [candidate.companyId] : []));
      if (!sameCandidateSet(initialCompanies, companyRerun) || !sameCandidateSet(initialProbable, probableRerun) ||
          !sameVersionSet(probableCompanyRows, probableCompanyRerun))
        throw new LeadIntakeError("stale_version", 409);
      for (const contactKey of contactIdentityLockKeys(candidateQuery))
        await lockIdentityKeyAuthority(tx, `${actorLookup.workspaceId}:contact:${contactKey}`);
      const contactQuery = { workspaceId: actorLookup.workspaceId, emailNormalized: candidateQuery.emailNormalized,
        phoneNormalized: candidateQuery.phoneNormalized };
      const initialDirect = await contacts.findCandidates(contactQuery);
      const probableContacts = await companyContacts.findProbableContacts(probableQuery);
      const selected = selectCandidateSetV1(initialDirect, probableContacts, initialCompanies);
      await contacts.lockCandidateSet(actorLookup.workspaceId, selected.contacts);
      const refreshed = selectCandidateSetV1(await contacts.findCandidates(contactQuery),
        await companyContacts.findProbableContacts(probableQuery), await companies.findCandidates(companyQuery));
      if (!sameCandidateSet(selected.companies, refreshed.companies) || !sameCandidateSet(selected.contacts, refreshed.contacts))
        throw new LeadIntakeError("stale_version", 409);
      const contactCandidates = selected.contacts, companyCandidates = selected.companies, summary = selected.summary;

      const requestedMembership = input.command.requestedAssignment?.responsibleMembershipId ??
        input.command.requestedAssignment?.membershipId ??
        (input.compatibility ? input.actor.membershipId : null);
      const requestedTeam = input.command.requestedAssignment?.responsibleTeamId ?? input.command.requestedAssignment?.teamId ?? null;
      const authority = workspaceAuthorityParticipant(tx);
      await authority.lockReferences({ workspaceId: actorLookup.workspaceId, membershipIds: [actorLookup.membershipId, requestedMembership],
        teamIds: [requestedTeam, ...(input.compatibility?.teamIds ?? [])] });
      const actor = await revalidateActiveActor(tx, input.actor);
      if (actor.role === "member" && ((requestedMembership && requestedMembership !== actor.membershipId) || requestedTeam)) {
        throw new LeadIntakeError("permission_required", 403);
      }
      await authority.validateAssignment(actor.workspaceId, requestedMembership, requestedTeam);
      for (const teamId of input.compatibility?.teamIds ?? []) await authority.validateAssignment(actor.workspaceId, null, teamId);
      const finalCandidates = selectCandidateSetV1(await contacts.findCandidates(contactQuery),
        await companyContacts.findProbableContacts(probableQuery), await companies.findCandidates(companyQuery));
      if (!sameCandidateSet(companyCandidates, finalCandidates.companies) ||
          !sameCandidateSet(contactCandidates, finalCandidates.contacts)) throw new LeadIntakeError("stale_version", 409);
      await leads.setInitialResponsibility({ workspaceId: actor.workspaceId, leadId: lead.id, membershipId: requestedMembership, teamId: requestedTeam });
      if (input.compatibility?.visibility === "teams") {
        await leads.addVisibleTeams(actor.workspaceId, lead.id, input.compatibility.teamIds);
      }
      await leads.addCreatedActivity(actor.workspaceId, lead.id, actor.membershipId, input.compatibility?.note);

      const reviewId = summary.strong + summary.supplementary + summary.probable > 0 ? randomUUID() : undefined;
      const reviews = identityReviewTransactionParticipant(tx);
      const baseResult: LeadInquiryIntakeResultV1 = {
        contractVersion: LEAD_INQUIRY_INTAKE_RESULT, intakeId: intake.id, leadId: lead.id,
        disposition: reviewId ? "held_for_review" : "created", candidateSummary: summary, leadVersion: lead.version,
        contactId: null, companyId: null, reviewCaseId: reviewId ?? null, reviewVersion: reviewId ? 1 : null,
        replayed: false, requestId, nextView: reviewId ? { kind: "identity_review_detail", leadId: lead.id, reviewId }
          : { kind: "lead_detail", leadId: lead.id },
      };
      const committed = await receipts.commit(actor.workspaceId, intake.id, lead.id, { ...baseResult, _candidateQuery: candidateQuery });
      let review: { id: string; version: number } | undefined;
      if (reviewId) {
        review = await reviews.open(actor.workspaceId, intake.id, lead.id, reviewId);
        await reviews.recordCandidates(actor.workspaceId, review.id, contactCandidates, companyCandidates, normalized.normalizationVersion);
        await leads.setInitialReview(actor.workspaceId, lead.id, "pending");
        const decision = await reviews.appendDecision({ workspaceId: actor.workspaceId, intakeId: intake.id, reviewId: review.id,
          idempotencyKey: canonicalRequestHash({ intakeId: intake.id, outcome: "hold" }), requestHash, requestId, correlationId: requestId, governingOutcome: "hold",
          actorMembershipId: actor.membershipId, expectedLeadVersion: lead.version, expectedReviewVersion: review.version,
          expectedIntakeVersion: committed.version, resultLeadVersion: lead.version, resultReviewVersion: review.version,
          normalizationVersion: normalized.normalizationVersion });
        await reviews.setDecisionHead(actor.workspaceId, intake.id, decision.id);
      }
      const auditAction = review ? "crm.inquiry_held_for_review" : "crm.inquiry_created";
      await writeGoverningAudit(tx, { actor, operation: "lead-inquiry-intake.v1", action: auditAction, targetType: "lead", targetId: lead.id,
        requestId, correlationId: requestId, resultVersion: lead.version, metadata: {
          contract_version: "lead-inquiry-intake.v1", intake_channel: "manual", source_category: normalized.sourceCategory,
          source_platform: normalized.sourcePlatform, source_medium: normalized.sourceMedium, disposition: baseResult.disposition,
          candidate_strong_count: summary.strong, candidate_supplementary_count: summary.supplementary,
          candidate_probable_count: summary.probable, normalization_version: normalized.normalizationVersion } });
      const payload = { schemaVersion: 1, workspaceId: actor.workspaceId, leadId: lead.id, leadVersion: lead.version,
        lifecycle: "new", disposition: baseResult.disposition, intakeChannel: "manual", sourceCategory: normalized.sourceCategory,
        sourcePlatform: normalized.sourcePlatform, sourceMedium: normalized.sourceMedium, candidateSummary: summary, requestId };
      const events: DomainEventV1[] = [{ topic: "crm.inquiry.created.v1", aggregateType: "lead",
        aggregateId: lead.id, resultVersion: lead.version, payload }];
      if (review) events.push({ topic: "crm.inquiry.review_required.v1", aggregateType: "lead", aggregateId: lead.id,
        resultVersion: review.version, payload: { ...payload, reviewId: review.id, reviewVersion: review.version } });
      await writeDomainEventSet(tx, { workspaceId: actor.workspaceId, operationId: intake.id, events });
      return baseResult;
    });
  } catch (error) { return asKnownError(error); }
}
