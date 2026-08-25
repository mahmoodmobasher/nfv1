import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { runModuleTransaction, type ModuleTransaction } from "@/backend/platform/database";
import { lookupActiveActor, revalidateActiveActor, workspaceAuthorityParticipant, type TrustedActor } from "@/backend/platform/authorization";
import { canonicalRequestHash, lockIdempotencyAuthority, lockIdentityKeyAuthority } from "@/backend/platform/idempotency";
import { writeGoverningAudit } from "@/backend/platform/audit";
import { writeDomainEventSet, type DomainEventV1 } from "@/backend/platform/outbox";
import { contactTransactionParticipant } from "@/backend/modules/contacts";
import { companyContactCandidateReadModel, companyTransactionParticipant } from "@/backend/modules/companies";
import { identityReviewTransactionParticipant, type IdentityReviewDecisionCommandV1 } from "@/backend/modules/identity-review";
import { sameCandidateSet, sameVersionSet, selectCandidateSetV1, type CandidateQueryV1 } from "../../domain/identity-candidate-set.domain";
import { leadTransactionParticipant } from "../../persistence/repositories/lead.repository";
import { LeadIntakeError } from "../../contracts/lead-inquiry-intake.contract";

export type LeadIdentityReviewDecisionResultV1 = {
  contractVersion: "lead-identity-review-decision-result.v1";
  outcome: "hold" | "resolve";
  disposition: "held_for_review" | "resolved" | "replayed";
  reviewId: string; leadId: string; contactId: string | null; companyId: string | null;
  leadVersion: number; reviewVersion: number; replayed: boolean; requestId: string;
  nextView: { kind: "identity_review_detail"; leadId: string; reviewId: string } | { kind: "identity_review_queue" };
};
export type ResolveLeadIdentityReviewResultV1 = LeadIdentityReviewDecisionResultV1;

async function authorizeDisclosure(tx: ModuleTransaction, actorInput: TrustedActor, lead: {
  id: string; owner_membership_id: string | null; responsible_team_id?: string | null; visibility: string;
}, originalActorMembershipId: string) {
  const authority = workspaceAuthorityParticipant(tx);
  await authority.lockReferences({ workspaceId: actorInput.workspaceId, leadId: lead.id,
    membershipIds: [actorInput.membershipId, lead.owner_membership_id], teamIds: [lead.responsible_team_id ?? null] });
  const actor = await revalidateActiveActor(tx, actorInput);
  if (actor.membershipId !== originalActorMembershipId || !(await authority.canDiscloseLead(actor, lead)))
    throw new LeadIntakeError("resource_not_found", 404);
  return actor;
}

async function revalidateConflictDisclosure(pool: Pool, actorInput: TrustedActor, leadId: string) {
  try {
    await runModuleTransaction(pool, async tx => {
      const trusted = await lookupActiveActor(tx, actorInput), reviews = identityReviewTransactionParticipant(tx);
      const refs = await reviews.findByLead(trusted.workspaceId, leadId);
      const lead = await leadTransactionParticipant(tx).lockIntakeLeadContext(trusted.workspaceId, refs.intake_id, refs.lead_id);
      const review = await reviews.lockDisclosureReview(trusted.workspaceId, refs.id);
      if (review.state !== "pending") throw new LeadIntakeError("resource_not_found", 404);
      await authorizeDisclosure(tx, actorInput, lead, trusted.membershipId);
    });
  } catch {
    throw new LeadIntakeError("resource_not_found", 404);
  }
}

export async function decideLeadIdentityReviewV1(pool: Pool, input: {
  actor: TrustedActor; leadId: string; command: IdentityReviewDecisionCommandV1; idempotencyKey: string; requestId?: string;
}): Promise<LeadIdentityReviewDecisionResultV1> {
  const requestId = input.requestId ?? randomUUID(), requestHash = canonicalRequestHash({ leadId: input.leadId, command: input.command });
  try {
    return await runModuleTransaction(pool, async tx => {
      await lockIdempotencyAuthority(tx, `${input.actor.workspaceId}:lead-identity-review-decision.v1:${input.idempotencyKey}`);
      const reviews = identityReviewTransactionParticipant(tx), leads = leadTransactionParticipant(tx);
      const receipt = await reviews.findDecisionReceipt(input.actor.workspaceId, input.idempotencyKey);
      if (receipt) {
        const disclosure = await leads.lockIntakeLeadContext(input.actor.workspaceId, receipt.intake_id, receipt.lead_id);
        await reviews.lockDisclosureReview(input.actor.workspaceId, receipt.review_id);
        await authorizeDisclosure(tx, input.actor, disclosure, receipt.actor_membership_id);
        if (receipt.request_hash !== requestHash)
          throw new LeadIntakeError("idempotency_conflict", 409, undefined, undefined, true);
        return { contractVersion: "lead-identity-review-decision-result.v1", outcome: receipt.governing_outcome,
          disposition: "replayed", reviewId: receipt.review_id, leadId: receipt.lead_id,
          contactId: receipt.contact_id ?? null, companyId: receipt.company_id ?? null,
          leadVersion: receipt.result_lead_version, reviewVersion: receipt.result_review_version, replayed: true, requestId: receipt.request_id,
          nextView: receipt.governing_outcome === "hold" ? { kind: "identity_review_detail", leadId: receipt.lead_id, reviewId: receipt.review_id }
            : { kind: "identity_review_queue" } };
      }

      const trusted = await lookupActiveActor(tx, input.actor);
      const refs = await reviews.findByLead(trusted.workspaceId, input.leadId);
      const lead = await leads.lockIntakeLeadContext(trusted.workspaceId, refs.intake_id, refs.lead_id);
      const reviewsLocked = await reviews.lockReview(trusted.workspaceId, refs.id);
      const priorHead = await reviews.currentHead(trusted.workspaceId, refs.intake_id);
      if (reviewsLocked.state !== "pending" || !(await workspaceAuthorityParticipant(tx).canDiscloseLead(trusted, lead)))
        throw new LeadIntakeError("resource_not_found", 404);
      const candidateQuery = lead.candidate_query as CandidateQueryV1 | undefined;
      if (!candidateQuery || candidateQuery.contractVersion !== "p1a-candidate-query.v1")
        throw new LeadIntakeError("stale_version", 409);
      const companies = companyTransactionParticipant(tx), contacts = contactTransactionParticipant(tx);
      const companyContacts = companyContactCandidateReadModel(tx);
      let companyCandidate: { id: string; target_id: string; target_version: number } | undefined;
      let contactCandidate: { id: string; target_id: string; target_version: number } | undefined;
      if (input.command.outcome === "resolve" && input.command.company.action === "link") {
        companyCandidate = await reviews.candidate(trusted.workspaceId, reviewsLocked.id, input.command.company.candidateId, "company");
        if (input.command.company.targetId !== companyCandidate.target_id)
          throw new LeadIntakeError("invalid_match_decision", 409);
        if (input.command.company.expectedTargetVersion !== companyCandidate.target_version)
          throw new LeadIntakeError("stale_version", 409);
      }
      if (input.command.outcome === "resolve" && input.command.contact.action === "link") {
        contactCandidate = await reviews.candidate(trusted.workspaceId, reviewsLocked.id, input.command.contact.candidateId, "contact");
        if (input.command.contact.targetId !== contactCandidate.target_id)
          throw new LeadIntakeError("invalid_match_decision", 409);
        if (input.command.contact.expectedTargetVersion !== contactCandidate.target_version)
          throw new LeadIntakeError("stale_version", 409);
      }

      const companyKey = `${candidateQuery.companyNameNormalized ?? ""}:${candidateQuery.companyDomainNormalized ?? ""}`;
      if (input.command.outcome === "resolve" && input.command.company.action === "create" && companyKey !== ":")
        await lockIdentityKeyAuthority(tx, `${trusted.workspaceId}:company:${String(lead.normalization_version)}:${companyKey}`);
      const companyQuery = { workspaceId: trusted.workspaceId, nameNormalized: candidateQuery.companyNameNormalized,
        domainNormalized: candidateQuery.companyDomainNormalized };
      const probableQuery = { workspaceId: trusted.workspaceId, personNameNormalized: candidateQuery.personNameNormalized,
        companyNameNormalized: candidateQuery.companyNameNormalized };
      const contactQuery = { workspaceId: trusted.workspaceId, emailNormalized: candidateQuery.emailNormalized,
        phoneNormalized: candidateQuery.phoneNormalized };
      if (input.command.outcome === "resolve") {
        const initialCompanies = await companies.findCandidates(companyQuery);
        const initialProbable = await companyContacts.findProbableContacts(probableQuery);
        const probableCompanyRows = await companies.findActiveRowsByIds(trusted.workspaceId,
          initialProbable.flatMap(candidate => candidate.companyId ? [candidate.companyId] : []));
        const companyRows = [...initialCompanies, ...probableCompanyRows,
          ...(companyCandidate ? [{ id: companyCandidate.target_id, version: companyCandidate.target_version }] : [])];
        await companies.lockCandidateSet(trusted.workspaceId, companyRows);
        const companyRerun = await companies.findCandidates(companyQuery);
        const probableRerun = await companyContacts.findProbableContacts(probableQuery);
        const probableCompanyRerun = await companies.findActiveRowsByIds(trusted.workspaceId,
          probableRerun.flatMap(candidate => candidate.companyId ? [candidate.companyId] : []));
        if (!sameCandidateSet(initialCompanies, companyRerun) || !sameCandidateSet(initialProbable, probableRerun) ||
            !sameVersionSet(probableCompanyRows, probableCompanyRerun))
          throw new LeadIntakeError("stale_version", 409);
        if (input.command.contact.action === "create") {
          const key = candidateQuery.emailNormalized ?? candidateQuery.phoneNormalized ??
            `${candidateQuery.personNameNormalized}:${candidateQuery.companyNameNormalized ?? ""}`;
          await lockIdentityKeyAuthority(tx, `${trusted.workspaceId}:contact:${String(lead.normalization_version)}:${key}`);
        }
        const selected = selectCandidateSetV1(await contacts.findCandidates(contactQuery),
          await companyContacts.findProbableContacts(probableQuery), await companies.findCandidates(companyQuery));
        await contacts.lockCandidateSet(trusted.workspaceId, [...selected.contacts,
          ...(contactCandidate ? [{ id: contactCandidate.target_id, version: contactCandidate.target_version }] : [])]);
        const lockedRerun = selectCandidateSetV1(await contacts.findCandidates(contactQuery),
          await companyContacts.findProbableContacts(probableQuery), await companies.findCandidates(companyQuery));
        if (!sameCandidateSet(selected.contacts, lockedRerun.contacts) ||
            !sameCandidateSet(selected.companies, lockedRerun.companies)) throw new LeadIntakeError("stale_version", 409);
        if (!sameCandidateSet(lockedRerun.contacts,
            await reviews.targetSnapshot(trusted.workspaceId, reviewsLocked.id, "contact")) ||
            !sameCandidateSet(lockedRerun.companies,
              await reviews.targetSnapshot(trusted.workspaceId, reviewsLocked.id, "company")))
          throw new LeadIntakeError("stale_version", 409);
      }

      const authority = workspaceAuthorityParticipant(tx);
      await authority.lockReferences({ workspaceId: trusted.workspaceId, leadId: lead.id,
        membershipIds: [trusted.membershipId, lead.owner_membership_id], teamIds: [lead.responsible_team_id] });
      const actor = await revalidateActiveActor(tx, input.actor);
      if (!(await authority.canDiscloseLead(actor, lead))) throw new LeadIntakeError("resource_not_found", 404);
      const authorizedConflict = (code: "stale_version" | "invalid_match_decision") =>
        new LeadIntakeError(code, 409, undefined, { kind: "identity_review_detail", leadId: lead.id }, true);
      if (actor.role === "member" && input.command.outcome === "resolve" &&
          (input.command.contact.action === "link" || input.command.company.action === "link")) throw new LeadIntakeError("permission_required", 403);
      if (companyCandidate) {
        const fresh = await reviews.candidate(actor.workspaceId, reviewsLocked.id, companyCandidate.id, "company");
        if (fresh.target_id !== companyCandidate.target_id || fresh.target_version !== companyCandidate.target_version)
          throw authorizedConflict("stale_version");
        await companies.assertFresh(actor.workspaceId, fresh.target_id, fresh.target_version);
      }
      if (contactCandidate) {
        const fresh = await reviews.candidate(actor.workspaceId, reviewsLocked.id, contactCandidate.id, "contact");
        if (fresh.target_id !== contactCandidate.target_id || fresh.target_version !== contactCandidate.target_version)
          throw authorizedConflict("stale_version");
        await contacts.assertFresh(actor.workspaceId, fresh.target_id, fresh.target_version);
      }
      if (input.command.outcome === "resolve") {
        const finalCandidates = selectCandidateSetV1(await contacts.findCandidates(contactQuery),
          await companyContacts.findProbableContacts(probableQuery), await companies.findCandidates(companyQuery));
        if (!sameCandidateSet(finalCandidates.contacts, await reviews.targetSnapshot(actor.workspaceId, reviewsLocked.id, "contact")) ||
            !sameCandidateSet(finalCandidates.companies, await reviews.targetSnapshot(actor.workspaceId, reviewsLocked.id, "company")))
          throw authorizedConflict("stale_version");
      }
      try {
        await leads.assertIntakeLeadVersions({ workspaceId: actor.workspaceId, intakeId: reviewsLocked.intake_id,
          leadId: lead.id, expectedIntakeVersion: input.command.expectedIntakeVersion,
          expectedLeadVersion: input.command.expectedLeadVersion });
        await reviews.assertPendingReviewHead({ workspaceId: actor.workspaceId, reviewId: reviewsLocked.id,
          intakeId: reviewsLocked.intake_id, expectedReviewVersion: input.command.expectedReviewVersion, expectedHead: priorHead });
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "stale_version")
          throw authorizedConflict("stale_version");
        throw error;
      }

      if (input.command.outcome === "hold") {
        const resultReviewVersion = reviewsLocked.version + 1;
        const decision = await reviews.appendDecision({ workspaceId: actor.workspaceId, intakeId: reviewsLocked.intake_id,
          reviewId: reviewsLocked.id, idempotencyKey: input.idempotencyKey, requestHash, requestId, correlationId: requestId,
          supersedesDecisionId: priorHead, governingOutcome: "hold", actorMembershipId: actor.membershipId,
          expectedLeadVersion: lead.version, expectedReviewVersion: reviewsLocked.version,
          expectedIntakeVersion: lead.intake_version, resultLeadVersion: lead.version,
          resultReviewVersion, reasonCode: input.command.reasonCode,
          normalizationVersion: String(lead.normalization_version) });
        await reviews.setDecisionHead(actor.workspaceId, reviewsLocked.intake_id, decision.id, priorHead);
        const held = await reviews.touchPending(actor.workspaceId, reviewsLocked.id, reviewsLocked.version);
        await writeGoverningAudit(tx, { actor, operation: "lead-identity-review-decision.v1", action: "crm.inquiry_held_for_review",
          targetType: "identity_review", targetId: reviewsLocked.id, requestId, correlationId: requestId, resultVersion: held.version,
          metadata: { contract_version: "lead-identity-review-decision.v1", disposition: "held_for_review",
            expected_version: reviewsLocked.version, normalization_version: String(lead.normalization_version) } });
        await writeDomainEventSet(tx, { workspaceId: actor.workspaceId, operationId: decision.id, events: [{
          topic: "crm.inquiry.review_required.v1", aggregateType: "lead", aggregateId: lead.id, resultVersion: held.version,
          payload: { schemaVersion: 1, workspaceId: actor.workspaceId, leadId: lead.id, leadVersion: lead.version,
            reviewId: reviewsLocked.id, reviewVersion: held.version, disposition: "held_for_review", requestId } }] });
        return { contractVersion: "lead-identity-review-decision-result.v1", outcome: "hold", disposition: "held_for_review",
          reviewId: reviewsLocked.id, leadId: lead.id, contactId: null, companyId: null,
          leadVersion: lead.version, reviewVersion: held.version, replayed: false, requestId,
          nextView: { kind: "identity_review_detail", leadId: lead.id, reviewId: reviewsLocked.id } };
      }

      let companyId: string | null = null, companyVersion: number | null = null, companyCreated = false;
      if (input.command.company.action === "link" && companyCandidate) {
        companyId = companyCandidate.target_id; companyVersion = companyCandidate.target_version;
      } else if (input.command.company.action === "create") {
        if (!candidateQuery.companyNameNormalized) throw new LeadIntakeError("invalid_match_decision", 409);
        const created = await companies.create({ workspaceId: actor.workspaceId, displayName: String(lead.company),
          nameNormalized: candidateQuery.companyNameNormalized, domainNormalized: candidateQuery.companyDomainNormalized });
        companyId = created.id; companyVersion = created.version; companyCreated = true;
      }
      let contactId: string | null = null, contactVersion: number | null = null, contactCreated = false;
      if (input.command.contact.action === "link" && contactCandidate) {
        contactId = contactCandidate.target_id; contactVersion = contactCandidate.target_version;
      } else if (input.command.contact.action === "create") {
        const created = await contacts.create({ workspaceId: actor.workspaceId, displayName: lead.display_name,
          personNameNormalized: lead.person_name_normalized, firstName: lead.first_name, lastName: lead.last_name,
          emailDisplay: lead.email_display, emailNormalized: lead.email_normalized, phoneDisplay: lead.phone,
          phoneNormalized: lead.phone_normalized, phoneCountryCodeUsed: lead.phone_country_code_used,
          normalizationVersion: String(lead.normalization_version), companyId });
        contactId = created.id; contactVersion = created.version; contactCreated = true;
      }
      const resultLeadVersion = lead.version + 1, resultReviewVersion = reviewsLocked.version + 1;
      const decision = await reviews.appendDecision({ workspaceId: actor.workspaceId, intakeId: reviewsLocked.intake_id,
        reviewId: reviewsLocked.id, idempotencyKey: input.idempotencyKey, requestHash, requestId, correlationId: requestId,
        supersedesDecisionId: priorHead, governingOutcome: "resolve", contactAction: input.command.contact.action,
        companyAction: input.command.company.action, contactId, companyId, contactCandidateId: contactCandidate?.id,
        companyCandidateId: companyCandidate?.id, contactTargetVersion: contactVersion, companyTargetVersion: companyVersion,
        actorMembershipId: actor.membershipId, expectedLeadVersion: lead.version,
        expectedReviewVersion: reviewsLocked.version, expectedIntakeVersion: lead.intake_version,
        resultLeadVersion, resultReviewVersion, reasonCode: input.command.reasonCode,
        normalizationVersion: String(lead.normalization_version) });
      await reviews.setDecisionHead(actor.workspaceId, reviewsLocked.intake_id, decision.id, priorHead);
      const updatedLead = await leads.resolveIdentity({ workspaceId: actor.workspaceId, leadId: reviewsLocked.lead_id,
        expectedVersion: lead.version, contactId, companyId });
      const updatedReview = await reviews.resolve(actor.workspaceId, reviewsLocked.id, reviewsLocked.version, actor.membershipId);
      await writeGoverningAudit(tx, { actor, operation: "lead-identity-review-decision.v1", action: "crm.inquiry_review_resolved",
        targetType: "identity_review", targetId: reviewsLocked.id, requestId, correlationId: requestId, resultVersion: updatedReview.version,
        metadata: { contract_version: "lead-identity-review-decision.v1", disposition: "resolved",
          expected_version: reviewsLocked.version, normalization_version: String(lead.normalization_version) } });
      const basePayload = { schemaVersion: 1, workspaceId: actor.workspaceId, leadId: reviewsLocked.lead_id,
        reviewId: reviewsLocked.id, leadVersion: updatedLead.version, reviewVersion: updatedReview.version, contactId, companyId, requestId };
      const events: DomainEventV1[] = [{ topic: "crm.inquiry.review_resolved.v1", aggregateType: "lead",
        aggregateId: reviewsLocked.lead_id, resultVersion: updatedReview.version, payload: basePayload }];
      if (contactCreated && contactId) events.push({ topic: "crm.contact.created.v1", aggregateType: "contact",
        aggregateId: contactId, resultVersion: contactVersion!, payload: { schemaVersion: 1, workspaceId: actor.workspaceId, contactId, version: contactVersion, requestId } });
      if (companyCreated && companyId) events.push({ topic: "crm.company.created.v1", aggregateType: "company",
        aggregateId: companyId, resultVersion: companyVersion!, payload: { schemaVersion: 1, workspaceId: actor.workspaceId, companyId, version: companyVersion, requestId } });
      if (contactId || companyId) events.push({ topic: "crm.inquiry.linked.v1", aggregateType: "lead",
        aggregateId: reviewsLocked.lead_id, resultVersion: updatedLead.version, payload: basePayload });
      await writeDomainEventSet(tx, { workspaceId: actor.workspaceId, operationId: decision.id, events });
      return { contractVersion: "lead-identity-review-decision-result.v1", outcome: "resolve", disposition: "resolved",
        reviewId: reviewsLocked.id, leadId: reviewsLocked.lead_id, contactId, companyId,
        leadVersion: updatedLead.version, reviewVersion: updatedReview.version,
        replayed: false, requestId, nextView: { kind: "identity_review_queue" } };
    });
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && Number(error.status) === 409 &&
        !(error instanceof LeadIntakeError && error.disclosureAuthorized))
      await revalidateConflictDisclosure(pool, input.actor, input.leadId);
    if (error instanceof LeadIntakeError) throw error;
    if (error && typeof error === "object" && "code" in error && "status" in error) {
      const value = error as { code: string; status: number }; throw new LeadIntakeError(value.code as never, value.status);
    }
    throw error;
  }
}

export const resolveLeadIdentityReviewV1 = decideLeadIdentityReviewV1;
