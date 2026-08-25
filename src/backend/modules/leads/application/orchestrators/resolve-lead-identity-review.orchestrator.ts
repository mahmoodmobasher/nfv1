import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { runModuleTransaction, type ModuleTransaction } from "@/backend/platform/database";
import { lookupActiveActor, revalidateActiveActor, workspaceAuthorityParticipant, type TrustedActor } from "@/backend/platform/authorization";
import { canonicalRequestHash, lockIdempotencyAuthority, lockIdentityKeyAuthority } from "@/backend/platform/idempotency";
import { writeGoverningAudit } from "@/backend/platform/audit";
import { writeDomainEventSet, type DomainEventV1 } from "@/backend/platform/outbox";
import { contactTransactionParticipant } from "@/backend/modules/contacts";
import { companyTransactionParticipant } from "@/backend/modules/companies";
import { identityReviewTransactionParticipant, type IdentityReviewDecisionCommandV1 } from "@/backend/modules/identity-review";
import { leadTransactionParticipant } from "../../persistence/repositories/lead.repository";
import { LeadIntakeError } from "../../contracts/lead-inquiry-intake.contract";

export type LeadIdentityReviewDecisionResultV1 = {
  contractVersion: "lead-identity-review-decision-result.v1";
  outcome: "hold" | "resolve";
  disposition: "held_for_review" | "resolved" | "replayed";
  reviewId: string; leadId: string; contactId?: string; companyId?: string;
  leadVersion: number; reviewVersion: number; replayed: boolean; requestId: string;
};
export type ResolveLeadIdentityReviewResultV1 = LeadIdentityReviewDecisionResultV1;

function normalized(value: unknown): string | null {
  const text = String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
  return text || null;
}
function sameSnapshot(current: Array<{ id: string; version: number }>, prior: Array<{ id: string; version: number }>) {
  const left = new Map(current.map(item => [item.id, item.version])), right = new Map(prior.map(item => [item.id, item.version]));
  return left.size === right.size && [...left].every(([id, version]) => right.get(id) === version);
}
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

export async function decideLeadIdentityReviewV1(pool: Pool, input: {
  actor: TrustedActor; leadId: string; command: IdentityReviewDecisionCommandV1; idempotencyKey: string; requestId?: string;
}): Promise<LeadIdentityReviewDecisionResultV1> {
  const requestId = input.requestId ?? randomUUID(), requestHash = canonicalRequestHash({ leadId: input.leadId, command: input.command });
  try {
    return await runModuleTransaction(pool, async tx => {
      await lockIdempotencyAuthority(tx, `${input.actor.workspaceId}:lead-identity-review-decision.v1:${input.idempotencyKey}`);
      const reviews = identityReviewTransactionParticipant(tx), receipt = await reviews.findDecisionReceipt(input.actor.workspaceId, input.idempotencyKey);
      if (receipt) {
        if (receipt.request_hash !== requestHash) throw new LeadIntakeError("idempotency_conflict", 409);
        const disclosure = await reviews.lockDisclosure(input.actor.workspaceId, receipt.review_id);
        await authorizeDisclosure(tx, input.actor, disclosure, receipt.actor_membership_id);
        return { contractVersion: "lead-identity-review-decision-result.v1", outcome: receipt.governing_outcome,
          disposition: "replayed", reviewId: receipt.review_id, leadId: receipt.lead_id,
          ...(receipt.contact_id ? { contactId: receipt.contact_id } : {}), ...(receipt.company_id ? { companyId: receipt.company_id } : {}),
          leadVersion: receipt.result_lead_version, reviewVersion: receipt.result_review_version, replayed: true, requestId: receipt.request_id };
      }

      const trusted = await lookupActiveActor(tx, input.actor), reviewsLocked = await reviews.lockPending(input.actor.workspaceId, input.leadId);
      const priorHead = await reviews.currentHead(trusted.workspaceId, reviewsLocked.intake_id);
      if (reviewsLocked.version !== input.command.expectedReviewVersion || reviewsLocked.lead_version !== input.command.expectedLeadVersion ||
          reviewsLocked.intake_version !== input.command.expectedIntakeVersion) throw new LeadIntakeError("stale_version", 409);
      const leads = leadTransactionParticipant(tx), lead = await leads.lockForResolution(trusted.workspaceId, reviewsLocked.lead_id);
      const companies = companyTransactionParticipant(tx), contacts = contactTransactionParticipant(tx);
      let companyCandidate: { id: string; target_id: string; target_version: number } | undefined;
      let contactCandidate: { id: string; target_id: string; target_version: number } | undefined;
      if (input.command.outcome === "resolve" && input.command.company.action === "link")
        companyCandidate = await reviews.candidate(trusted.workspaceId, reviewsLocked.id, input.command.company.candidateId, "company");
      if (input.command.outcome === "resolve" && input.command.contact.action === "link")
        contactCandidate = await reviews.candidate(trusted.workspaceId, reviewsLocked.id, input.command.contact.candidateId, "contact");

      const companyNameNormalized = normalized(lead.company);
      if (input.command.outcome === "resolve" && input.command.company.action === "create" && companyNameNormalized)
        await lockIdentityKeyAuthority(tx, `${trusted.workspaceId}:company:p1a-identity-v1:${companyNameNormalized}`);
      if (companyCandidate) await companies.lockExisting(trusted.workspaceId, companyCandidate.target_id, companyCandidate.target_version);
      if (input.command.outcome === "resolve" && input.command.company.action === "create") {
        const query = { workspaceId: trusted.workspaceId, nameNormalized: companyNameNormalized, domainNormalized: null };
        const current = await companies.findCandidates(query); await companies.lockCandidateSet(trusted.workspaceId, current);
        if (!sameSnapshot(await companies.findCandidates(query), await reviews.targetSnapshot(trusted.workspaceId, reviewsLocked.id, "company")))
          throw new LeadIntakeError("stale_version", 409);
      }
      if (input.command.outcome === "resolve" && input.command.contact.action === "create") {
        const key = lead.email_normalized ?? lead.phone_normalized ?? `${lead.person_name_normalized}:${companyNameNormalized ?? ""}`;
        await lockIdentityKeyAuthority(tx, `${trusted.workspaceId}:contact:p1a-identity-v1:${key}`);
      }
      if (contactCandidate) await contacts.lockExisting(trusted.workspaceId, contactCandidate.target_id, contactCandidate.target_version);
      if (input.command.outcome === "resolve" && input.command.contact.action === "create") {
        const query = { workspaceId: trusted.workspaceId, emailNormalized: lead.email_normalized,
          phoneNormalized: lead.phone_normalized, personNameNormalized: lead.person_name_normalized, companyNameNormalized };
        const current = await contacts.findCandidates(query); await contacts.lockCandidateSet(trusted.workspaceId, current);
        if (!sameSnapshot(await contacts.findCandidates(query), await reviews.targetSnapshot(trusted.workspaceId, reviewsLocked.id, "contact")))
          throw new LeadIntakeError("stale_version", 409);
      }

      const authority = workspaceAuthorityParticipant(tx);
      await authority.lockReferences({ workspaceId: trusted.workspaceId, leadId: lead.id,
        membershipIds: [trusted.membershipId, lead.owner_membership_id], teamIds: [lead.responsible_team_id] });
      const actor = await revalidateActiveActor(tx, input.actor);
      if (!(await authority.canDiscloseLead(actor, lead))) throw new LeadIntakeError("resource_not_found", 404);
      if (actor.role === "member" && input.command.outcome === "resolve" &&
          (input.command.contact.action === "link" || input.command.company.action === "link")) throw new LeadIntakeError("permission_required", 403);
      if (companyCandidate) {
        const fresh = await reviews.candidate(actor.workspaceId, reviewsLocked.id, companyCandidate.id, "company");
        if (fresh.target_id !== companyCandidate.target_id || fresh.target_version !== companyCandidate.target_version)
          throw new LeadIntakeError("stale_version", 409);
        await companies.lockExisting(actor.workspaceId, fresh.target_id, fresh.target_version);
      }
      if (contactCandidate) {
        const fresh = await reviews.candidate(actor.workspaceId, reviewsLocked.id, contactCandidate.id, "contact");
        if (fresh.target_id !== contactCandidate.target_id || fresh.target_version !== contactCandidate.target_version)
          throw new LeadIntakeError("stale_version", 409);
        await contacts.lockExisting(actor.workspaceId, fresh.target_id, fresh.target_version);
      }
      if (input.command.outcome === "resolve" && input.command.company.action === "create") {
        const current = await companies.findCandidates({ workspaceId: actor.workspaceId,
          nameNormalized: companyNameNormalized, domainNormalized: null });
        if (!sameSnapshot(current, await reviews.targetSnapshot(actor.workspaceId, reviewsLocked.id, "company")))
          throw new LeadIntakeError("stale_version", 409);
      }
      if (input.command.outcome === "resolve" && input.command.contact.action === "create") {
        const current = await contacts.findCandidates({ workspaceId: actor.workspaceId, emailNormalized: lead.email_normalized,
          phoneNormalized: lead.phone_normalized, personNameNormalized: lead.person_name_normalized, companyNameNormalized });
        if (!sameSnapshot(current, await reviews.targetSnapshot(actor.workspaceId, reviewsLocked.id, "contact")))
          throw new LeadIntakeError("stale_version", 409);
      }
      await reviews.assertPendingVersions({ workspaceId: actor.workspaceId, reviewId: reviewsLocked.id, leadId: lead.id,
        intakeId: reviewsLocked.intake_id, expectedReviewVersion: input.command.expectedReviewVersion,
        expectedLeadVersion: input.command.expectedLeadVersion, expectedIntakeVersion: input.command.expectedIntakeVersion, expectedHead: priorHead });

      if (input.command.outcome === "hold") {
        const resultReviewVersion = reviewsLocked.version + 1;
        const decision = await reviews.appendDecision({ workspaceId: actor.workspaceId, intakeId: reviewsLocked.intake_id,
          reviewId: reviewsLocked.id, idempotencyKey: input.idempotencyKey, requestHash, requestId, correlationId: requestId,
          supersedesDecisionId: priorHead, governingOutcome: "hold", actorMembershipId: actor.membershipId,
          expectedLeadVersion: reviewsLocked.lead_version, expectedReviewVersion: reviewsLocked.version,
          expectedIntakeVersion: reviewsLocked.intake_version, resultLeadVersion: reviewsLocked.lead_version,
          resultReviewVersion, reasonCode: input.command.reasonCode });
        await reviews.setDecisionHead(actor.workspaceId, reviewsLocked.intake_id, decision.id, priorHead);
        const held = await reviews.touchPending(actor.workspaceId, reviewsLocked.id, reviewsLocked.version);
        await writeGoverningAudit(tx, { actor, operation: "lead-identity-review-decision.v1", action: "crm.inquiry_held_for_review",
          targetType: "identity_review", targetId: reviewsLocked.id, requestId, correlationId: requestId, resultVersion: held.version,
          metadata: { contract_version: "lead-identity-review-decision.v1", disposition: "held_for_review",
            expected_version: reviewsLocked.version, normalization_version: "p1a-identity-v1" } });
        await writeDomainEventSet(tx, { workspaceId: actor.workspaceId, operationId: decision.id, events: [{
          topic: "crm.inquiry.review_required.v1", aggregateType: "lead", aggregateId: lead.id, resultVersion: held.version,
          payload: { schemaVersion: 1, workspaceId: actor.workspaceId, leadId: lead.id, leadVersion: reviewsLocked.lead_version,
            reviewId: reviewsLocked.id, reviewVersion: held.version, disposition: "held_for_review", requestId } }] });
        return { contractVersion: "lead-identity-review-decision-result.v1", outcome: "hold", disposition: "held_for_review",
          reviewId: reviewsLocked.id, leadId: lead.id, leadVersion: reviewsLocked.lead_version, reviewVersion: held.version,
          replayed: false, requestId };
      }

      let companyId: string | null = null, companyVersion: number | null = null, companyCreated = false;
      if (input.command.company.action === "link" && companyCandidate) {
        companyId = companyCandidate.target_id; companyVersion = companyCandidate.target_version;
      } else if (input.command.company.action === "create") {
        if (!companyNameNormalized) throw new LeadIntakeError("invalid_match_decision", 409);
        const created = await companies.create({ workspaceId: actor.workspaceId, displayName: String(lead.company),
          nameNormalized: companyNameNormalized, domainNormalized: null });
        companyId = created.id; companyVersion = created.version; companyCreated = true;
      }
      let contactId: string | null = null, contactVersion: number | null = null, contactCreated = false;
      if (input.command.contact.action === "link" && contactCandidate) {
        contactId = contactCandidate.target_id; contactVersion = contactCandidate.target_version;
      } else if (input.command.contact.action === "create") {
        const created = await contacts.create({ workspaceId: actor.workspaceId, displayName: lead.display_name,
          personNameNormalized: lead.person_name_normalized, firstName: lead.first_name, lastName: lead.last_name,
          emailDisplay: lead.email_display, emailNormalized: lead.email_normalized, phoneDisplay: lead.phone,
          phoneNormalized: lead.phone_normalized, phoneCountryCodeUsed: lead.phone_country_code_used, companyId });
        contactId = created.id; contactVersion = created.version; contactCreated = true;
      }
      const resultLeadVersion = reviewsLocked.lead_version + 1, resultReviewVersion = reviewsLocked.version + 1;
      const decision = await reviews.appendDecision({ workspaceId: actor.workspaceId, intakeId: reviewsLocked.intake_id,
        reviewId: reviewsLocked.id, idempotencyKey: input.idempotencyKey, requestHash, requestId, correlationId: requestId,
        supersedesDecisionId: priorHead, governingOutcome: "resolve", contactAction: input.command.contact.action,
        companyAction: input.command.company.action, contactId, companyId, contactCandidateId: contactCandidate?.id,
        companyCandidateId: companyCandidate?.id, contactTargetVersion: contactVersion, companyTargetVersion: companyVersion,
        actorMembershipId: actor.membershipId, expectedLeadVersion: reviewsLocked.lead_version,
        expectedReviewVersion: reviewsLocked.version, expectedIntakeVersion: reviewsLocked.intake_version,
        resultLeadVersion, resultReviewVersion, reasonCode: input.command.reasonCode });
      await reviews.setDecisionHead(actor.workspaceId, reviewsLocked.intake_id, decision.id, priorHead);
      const updatedLead = await leads.resolveIdentity({ workspaceId: actor.workspaceId, leadId: reviewsLocked.lead_id,
        expectedVersion: reviewsLocked.lead_version, contactId, companyId });
      const updatedReview = await reviews.resolve(actor.workspaceId, reviewsLocked.id, reviewsLocked.version, actor.membershipId);
      await writeGoverningAudit(tx, { actor, operation: "lead-identity-review-decision.v1", action: "crm.inquiry_review_resolved",
        targetType: "identity_review", targetId: reviewsLocked.id, requestId, correlationId: requestId, resultVersion: updatedReview.version,
        metadata: { contract_version: "lead-identity-review-decision.v1", disposition: "resolved",
          expected_version: reviewsLocked.version, normalization_version: "p1a-identity-v1" } });
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
        reviewId: reviewsLocked.id, leadId: reviewsLocked.lead_id, ...(contactId ? { contactId } : {}),
        ...(companyId ? { companyId } : {}), leadVersion: updatedLead.version, reviewVersion: updatedReview.version,
        replayed: false, requestId };
    });
  } catch (error) {
    if (error instanceof LeadIntakeError) throw error;
    if (error && typeof error === "object" && "code" in error && "status" in error) {
      const value = error as { code: string; status: number }; throw new LeadIntakeError(value.code as never, value.status);
    }
    throw error;
  }
}

export const resolveLeadIdentityReviewV1 = decideLeadIdentityReviewV1;
