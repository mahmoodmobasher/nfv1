import type { Pool } from "pg";
import { runModuleTransaction } from "@/backend/platform/database";
import { revalidateActiveActor, workspaceAuthorityParticipant, type TrustedActor } from "@/backend/platform/authorization";
import { contactTransactionParticipant } from "@/backend/modules/contacts";
import { companyTransactionParticipant } from "@/backend/modules/companies";
import { identityReviewTransactionParticipant, type IdentityReviewCandidateViewV1 } from "@/backend/modules/identity-review";
import { leadTransactionParticipant } from "../../persistence/repositories/lead.repository";

export async function getIdentityReviewCandidatesV1(pool: Pool, actor: TrustedActor, leadId: string): Promise<IdentityReviewCandidateViewV1> {
  return runModuleTransaction(pool, async tx => {
    const current = await revalidateActiveActor(tx, actor), reviews = identityReviewTransactionParticipant(tx);
    const review = await reviews.findByLead(current.workspaceId, leadId);
    if (review.state !== "pending") throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
    const lead = await leadTransactionParticipant(tx).readIntakeLeadContext(current.workspaceId, review.intake_id, review.lead_id);
    if (!(await workspaceAuthorityParticipant(tx).canDiscloseLead(current, lead)))
      throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
    const evidence = await reviews.evidence(current.workspaceId, review.id);
    const contactIds = evidence.flatMap(item => item.contactId ? [String(item.contactId)] : []);
    const companyIds = evidence.flatMap(item => item.companyId ? [String(item.companyId)] : []);
    const contacts = new Map((await contactTransactionParticipant(tx).present(current.workspaceId, contactIds)).map(item => [item.id, item]));
    const companies = new Map((await companyTransactionParticipant(tx).present(current.workspaceId, companyIds)).map(item => [item.id, item]));
    const candidates = evidence.flatMap(item => {
      const identity = item.contactId ? contacts.get(String(item.contactId)) : companies.get(String(item.companyId));
      if (!identity || identity.version !== item.targetVersion) return [];
      return [{ candidateId: item.candidateId, targetType: item.contactId ? "contact" : "company",
        targetId: item.contactId ?? item.companyId, targetVersion: item.targetVersion, displayName: identity.displayName,
        ...(item.contactId ? { email: identity.email, phone: identity.phone } : { companyName: identity.displayName }),
        evidenceKind: item.evidenceKind, evidenceStrength: item.evidenceStrength }];
    });
    return { contractVersion: "lead-identity-review-candidates.v1", reviewId: review.id, leadId: review.lead_id,
      reviewVersion: review.version, leadVersion: lead.version, intakeVersion: lead.intake_version, candidates } as IdentityReviewCandidateViewV1;
  });
}
