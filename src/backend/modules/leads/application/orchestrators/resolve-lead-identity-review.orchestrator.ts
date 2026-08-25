import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { runModuleTransaction } from "@/backend/platform/database";
import { revalidateActiveActor, type TrustedActor } from "@/backend/platform/authorization";
import { canonicalRequestHash, lockIdempotencyAuthority } from "@/backend/platform/idempotency";
import { writeGoverningAudit } from "@/backend/platform/audit";
import { writeDomainEventSet, type DomainEventV1 } from "@/backend/platform/outbox";
import { contactTransactionParticipant } from "@/backend/modules/contacts";
import { companyTransactionParticipant } from "@/backend/modules/companies";
import { identityReviewTransactionParticipant, type ResolveIdentityReviewCommandV1 } from "@/backend/modules/identity-review";
import { leadTransactionParticipant } from "../../persistence/repositories/lead.repository";
import { LeadIntakeError } from "../../contracts/lead-inquiry-intake.contract";

export type ResolveLeadIdentityReviewResultV1 = {
  contractVersion: "lead-identity-review-decision-result.v1";
  reviewId: string;
  leadId: string;
  contactId?: string;
  companyId?: string;
  leadVersion: number;
  reviewVersion: number;
  replayed: boolean;
  requestId: string;
};

async function memberCanResolve(tx: import("@/backend/platform/database").ModuleTransaction, actor: TrustedActor, lead: Record<string, unknown>) {
  if (actor.role !== "member") return true;
  if (lead.owner_membership_id !== actor.membershipId) return false;
  if (lead.visibility === "workspace") return true;
  return Boolean((await tx.query(
    `select 1 from lead_visible_teams lvt join team_memberships tm on tm.workspace_id=lvt.workspace_id and tm.team_id=lvt.team_id
      where lvt.workspace_id=$1 and lvt.lead_id=$2 and tm.workspace_membership_id=$3`,
    [actor.workspaceId, lead.id, actor.membershipId],
  )).rows[0]);
}

export async function resolveLeadIdentityReviewV1(pool: Pool, input: {
  actor: TrustedActor;
  leadId: string;
  command: ResolveIdentityReviewCommandV1;
  idempotencyKey: string;
  requestId?: string;
}): Promise<ResolveLeadIdentityReviewResultV1> {
  const requestId = input.requestId ?? randomUUID();
  const requestHash = canonicalRequestHash({ leadId: input.leadId, command: input.command });
  try {
    return await runModuleTransaction(pool, async tx => {
      await lockIdempotencyAuthority(tx, `${input.actor.workspaceId}:lead-identity-review-decision.v1:${input.idempotencyKey}`);
      const reviews = identityReviewTransactionParticipant(tx);
      const receipt = await reviews.findDecisionReceipt(input.actor.workspaceId, input.idempotencyKey);
      const actor = await revalidateActiveActor(tx, input.actor);
      if (receipt) {
        if (receipt.request_hash !== requestHash) throw new LeadIntakeError("idempotency_conflict", 409);
        return { contractVersion: "lead-identity-review-decision-result.v1", reviewId: receipt.review_id,
          leadId: receipt.lead_id, ...(receipt.contact_id ? { contactId: receipt.contact_id } : {}),
          ...(receipt.company_id ? { companyId: receipt.company_id } : {}), leadVersion: receipt.result_lead_version,
          reviewVersion: receipt.result_review_version, replayed: true, requestId: receipt.request_id };
      }

      const review = await reviews.lockPending(actor.workspaceId, input.leadId);
      if (review.version !== input.command.expectedReviewVersion || review.lead_version !== input.command.expectedLeadVersion || review.intake_version !== input.command.expectedIntakeVersion) {
        throw new LeadIntakeError("stale_version", 409);
      }
      const leads = leadTransactionParticipant(tx);
      const lead = await leads.lockForResolution(actor.workspaceId, review.lead_id);
      if (!(await memberCanResolve(tx, actor, lead))) throw new LeadIntakeError("resource_not_found", 404);
      if (actor.role === "member" && (input.command.contact.action === "link" || input.command.company.action === "link")) {
        throw new LeadIntakeError("permission_required", 403);
      }

      const companies = companyTransactionParticipant(tx);
      const contacts = contactTransactionParticipant(tx);
      let companyId: string | null = null;
      let companyVersion: number | null = null;
      let companyCandidateId: string | null = null;
      let companyCreated = false;
      if (input.command.company.action === "link") {
        const candidate = await reviews.candidate(actor.workspaceId, review.id, input.command.company.candidateId, "company");
        if (candidate.target_id !== input.command.company.targetId || candidate.target_version !== input.command.company.expectedTargetVersion) throw new LeadIntakeError("stale_version", 409);
        const target = await companies.lockExisting(actor.workspaceId, candidate.target_id, candidate.target_version);
        companyId = target.id; companyVersion = target.version; companyCandidateId = candidate.id;
      } else if (input.command.company.action === "create") {
        const name = String(lead.company ?? "").trim();
        if (!name) throw new LeadIntakeError("invalid_match_decision", 409);
        const created = await companies.create({ workspaceId: actor.workspaceId, displayName: name,
          nameNormalized: name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US"), domainNormalized: null });
        companyId = created.id; companyVersion = created.version; companyCreated = true;
      }

      let contactId: string | null = null;
      let contactVersion: number | null = null;
      let contactCandidateId: string | null = null;
      let contactCreated = false;
      if (input.command.contact.action === "link") {
        const candidate = await reviews.candidate(actor.workspaceId, review.id, input.command.contact.candidateId, "contact");
        if (candidate.target_id !== input.command.contact.targetId || candidate.target_version !== input.command.contact.expectedTargetVersion) throw new LeadIntakeError("stale_version", 409);
        const target = await contacts.lockExisting(actor.workspaceId, candidate.target_id, candidate.target_version);
        contactId = target.id; contactVersion = target.version; contactCandidateId = candidate.id;
      } else if (input.command.contact.action === "create") {
        const created = await contacts.create({ workspaceId: actor.workspaceId, displayName: lead.display_name,
          personNameNormalized: lead.person_name_normalized, firstName: lead.first_name, lastName: lead.last_name,
          emailDisplay: lead.email_display, emailNormalized: lead.email_normalized, phoneDisplay: lead.phone,
          phoneNormalized: lead.phone_normalized, phoneCountryCodeUsed: lead.phone_country_code_used, companyId });
        contactId = created.id; contactVersion = created.version; contactCreated = true;
      }

      const priorHead = await reviews.currentHead(actor.workspaceId, review.intake_id);
      const resultLeadVersion = review.lead_version + 1;
      const resultReviewVersion = review.version + 1;
      const decision = await reviews.appendDecision({ workspaceId: actor.workspaceId, intakeId: review.intake_id, reviewId: review.id,
        idempotencyKey: input.idempotencyKey, requestHash, requestId, correlationId: requestId, supersedesDecisionId: priorHead,
        governingOutcome: "resolve", contactAction: input.command.contact.action, companyAction: input.command.company.action,
        contactId, companyId, contactCandidateId, companyCandidateId, contactTargetVersion: contactVersion,
        companyTargetVersion: companyVersion, actorMembershipId: actor.membershipId, expectedLeadVersion: review.lead_version,
        expectedReviewVersion: review.version, expectedIntakeVersion: review.intake_version, resultLeadVersion,
        resultReviewVersion, reasonCode: input.command.reasonCode });
      await reviews.setDecisionHead(actor.workspaceId, review.intake_id, decision.id, priorHead);
      const updatedLead = await leads.resolveIdentity({ workspaceId: actor.workspaceId, leadId: review.lead_id,
        expectedVersion: review.lead_version, contactId, companyId });
      const updatedReview = await reviews.resolve(actor.workspaceId, review.id, review.version, actor.membershipId);

      await writeGoverningAudit(tx, { actor, action: "crm.inquiry_review_resolved", targetType: "identity_review",
        targetId: review.id, requestId, correlationId: requestId, resultVersion: updatedReview.version });
      const basePayload = { schemaVersion: 1, workspaceId: actor.workspaceId, leadId: review.lead_id,
        reviewId: review.id, leadVersion: updatedLead.version, reviewVersion: updatedReview.version,
        contactId, companyId, requestId };
      const events: DomainEventV1[] = [{ topic: "crm.inquiry.review_resolved.v1", aggregateType: "lead",
        aggregateId: review.lead_id, resultVersion: updatedReview.version, payload: basePayload }];
      if (contactCreated && contactId) events.push({ topic: "crm.contact.created.v1", aggregateType: "contact",
        aggregateId: contactId, resultVersion: contactVersion!, payload: { schemaVersion: 1, workspaceId: actor.workspaceId, contactId, version: contactVersion, requestId } });
      if (companyCreated && companyId) events.push({ topic: "crm.company.created.v1", aggregateType: "company",
        aggregateId: companyId, resultVersion: companyVersion!, payload: { schemaVersion: 1, workspaceId: actor.workspaceId, companyId, version: companyVersion, requestId } });
      if (contactId || companyId) events.push({ topic: "crm.inquiry.linked.v1", aggregateType: "lead",
        aggregateId: review.lead_id, resultVersion: updatedLead.version, payload: basePayload });
      await writeDomainEventSet(tx, { workspaceId: actor.workspaceId, operationId: decision.id, events });
      return { contractVersion: "lead-identity-review-decision-result.v1", reviewId: review.id, leadId: review.lead_id,
        ...(contactId ? { contactId } : {}), ...(companyId ? { companyId } : {}), leadVersion: updatedLead.version,
        reviewVersion: updatedReview.version, replayed: false, requestId };
    });
  } catch (error) {
    if (error instanceof LeadIntakeError) throw error;
    if (error && typeof error === "object" && "code" in error && "status" in error) {
      const value = error as { code: string; status: number };
      throw new LeadIntakeError(value.code as never, value.status);
    }
    throw error;
  }
}
