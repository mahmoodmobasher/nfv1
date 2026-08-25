import type { Pool } from "pg";
import { runModuleTransaction } from "@/backend/platform/database";
import { revalidateActiveActor, workspaceAuthorityParticipant, type TrustedActor } from "@/backend/platform/authorization";
import { contactTransactionParticipant } from "@/backend/modules/contacts";
import { companyTransactionParticipant } from "@/backend/modules/companies";
import { identityReviewTransactionParticipant } from "../../persistence/repositories/identity-review.repository";
import type { IdentityReviewCandidateViewV1 } from "../../contracts/identity-review.contract";

export async function getIdentityReviewCandidatesV1(pool: Pool, actor: TrustedActor, leadId: string): Promise<IdentityReviewCandidateViewV1> {
  return runModuleTransaction(pool, async tx => {
    const current = await revalidateActiveActor(tx, actor);
    const review = (await tx.query(
      `select r.id,r.version,r.lead_id,l.version lead_version,i.version intake_version,l.owner_membership_id,l.visibility
         from lead_identity_reviews r join leads l on l.workspace_id=r.workspace_id and l.id=r.lead_id
         join lead_intakes i on i.workspace_id=r.workspace_id and i.id=r.intake_id
        where r.workspace_id=$1 and r.lead_id=$2 and r.state='pending'`, [current.workspaceId, leadId],
    )).rows[0];
    if (!review) throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
    if (current.role === "member") {
      const visible = await workspaceAuthorityParticipant(tx).canDiscloseLead(current, { ...review, id: review.lead_id });
      if (!visible) throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
    }
    const evidence = await identityReviewTransactionParticipant(tx).evidence(current.workspaceId, review.id);
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
      reviewVersion: review.version, leadVersion: review.lead_version, intakeVersion: review.intake_version, candidates } as IdentityReviewCandidateViewV1;
  });
}
