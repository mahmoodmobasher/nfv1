import type { ModuleTransaction } from "@/backend/platform/database";
import type { ContactCandidateV1 } from "@/backend/modules/contacts";
import type { CompanyCandidateV1 } from "@/backend/modules/companies";

export function identityReviewTransactionParticipant(tx: ModuleTransaction) {
  return {
    async open(workspaceId: string, intakeId: string, leadId: string, reviewId: string) {
      return (await tx.query(
        `insert into lead_identity_reviews(id,workspace_id,intake_id,lead_id) values($4,$1,$2,$3) returning id,version`,
        [workspaceId, intakeId, leadId, reviewId],
      )).rows[0] as { id: string; version: number };
    },
    async recordCandidates(workspaceId: string, reviewId: string, contacts: ContactCandidateV1[], companies: CompanyCandidateV1[]) {
      for (const candidate of contacts) await tx.query(
        `insert into lead_identity_candidates(workspace_id,review_id,contact_id,evidence_kind,evidence_strength,normalization_version,target_version,evidence_metadata)
         values($1,$2,$3,$4,$5,'p1a-identity-v1',$6,'{"match_key_version":"p1a-identity-v1"}')`,
        [workspaceId, reviewId, candidate.id, candidate.evidenceKind, candidate.evidenceStrength, candidate.version],
      );
      for (const candidate of companies) await tx.query(
        `insert into lead_identity_candidates(workspace_id,review_id,company_id,evidence_kind,evidence_strength,normalization_version,target_version,evidence_metadata)
         values($1,$2,$3,'name_company','probable','p1a-identity-v1',$4,'{"match_key_version":"p1a-identity-v1"}')`,
        [workspaceId, reviewId, candidate.id, candidate.version],
      );
    },
    async lockPending(workspaceId: string, leadId: string) {
      const refs = (await tx.query(
        `select id,intake_id,lead_id from lead_identity_reviews where workspace_id=$1 and lead_id=$2 and state='pending'`,
        [workspaceId, leadId],
      )).rows[0];
      if (!refs) throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
      const intake = (await tx.query(`select version from lead_intakes where workspace_id=$1 and id=$2 for update`, [workspaceId, refs.intake_id])).rows[0];
      const lead = (await tx.query(`select version,owner_membership_id,visibility from leads where workspace_id=$1 and id=$2 for update`, [workspaceId, refs.lead_id])).rows[0];
      const review = (await tx.query(`select * from lead_identity_reviews where workspace_id=$1 and id=$2 and state='pending' for update`, [workspaceId, refs.id])).rows[0];
      if (!intake || !lead || !review) throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
      return { ...review, intake_version: intake.version, lead_version: lead.version,
        owner_membership_id: lead.owner_membership_id, visibility: lead.visibility };
    },
    async candidate(workspaceId: string, reviewId: string, candidateId: string, target: "contact" | "company") {
      const column = target === "contact" ? "contact_id" : "company_id";
      const row = (await tx.query(
        `select id,${column} target_id,target_version from lead_identity_candidates
          where workspace_id=$1 and review_id=$2 and id=$3 and ${column} is not null`,
        [workspaceId, reviewId, candidateId],
      )).rows[0];
      if (!row) throw Object.assign(new Error("invalid_match_decision"), { code: "invalid_match_decision", status: 409 });
      return row as { id: string; target_id: string; target_version: number };
    },
    async findDecisionReceipt(workspaceId: string, key: string) {
      return (await tx.query(
        `select d.request_hash,d.request_id,d.id,d.governing_outcome,d.contact_id,d.company_id,d.result_lead_version,d.result_review_version,
                r.lead_id,r.id review_id
           from lead_identity_decisions d join lead_identity_reviews r on r.workspace_id=d.workspace_id and r.id=d.review_id
          where d.workspace_id=$1 and d.operation='lead-identity-review-decision.v1' and d.idempotency_key=$2`,
        [workspaceId, key],
      )).rows[0] ?? null;
    },
    async appendDecision(input: Record<string, unknown>) {
      return (await tx.query(
        `insert into lead_identity_decisions(workspace_id,intake_id,review_id,idempotency_key,request_hash,request_id,correlation_id,
          supersedes_decision_id,governing_outcome,contact_action,company_action,contact_id,company_id,contact_candidate_id,
          company_candidate_id,contact_target_version,company_target_version,actor_membership_id,expected_lead_version,
          expected_review_version,expected_intake_version,result_lead_version,result_review_version,contract_version,normalization_version,reason_code)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
          'lead-identity-review-decision.v1','p1a-identity-v1',$24) returning id`,
        [input.workspaceId, input.intakeId, input.reviewId, input.idempotencyKey, input.requestHash, input.requestId,
          input.correlationId, input.supersedesDecisionId ?? null, input.governingOutcome, input.contactAction ?? null,
          input.companyAction ?? null, input.contactId ?? null, input.companyId ?? null, input.contactCandidateId ?? null,
          input.companyCandidateId ?? null, input.contactTargetVersion ?? null, input.companyTargetVersion ?? null,
          input.actorMembershipId, input.expectedLeadVersion, input.expectedReviewVersion, input.expectedIntakeVersion,
          input.resultLeadVersion, input.resultReviewVersion, input.reasonCode ?? null],
      )).rows[0] as { id: string };
    },
    async setDecisionHead(workspaceId: string, intakeId: string, decisionId: string, supersedesDecisionId?: string) {
      if (!supersedesDecisionId) {
        await tx.query(`insert into lead_identity_decision_heads(workspace_id,intake_id,decision_id) values($1,$2,$3)`, [workspaceId, intakeId, decisionId]);
      } else {
        const updated = await tx.query(
          `update lead_identity_decision_heads set decision_id=$4,version=version+1,updated_at=now()
            where workspace_id=$1 and intake_id=$2 and decision_id=$3`,
          [workspaceId, intakeId, supersedesDecisionId, decisionId],
        );
        if (!updated.rowCount) throw Object.assign(new Error("stale_version"), { code: "stale_version", status: 409 });
      }
    },
    async currentHead(workspaceId: string, intakeId: string) {
      return (await tx.query(`select decision_id from lead_identity_decision_heads where workspace_id=$1 and intake_id=$2 for update`, [workspaceId, intakeId])).rows[0]?.decision_id as string | undefined;
    },
    async resolve(workspaceId: string, reviewId: string, expectedVersion: number, actorMembershipId: string) {
      const row = (await tx.query(
        `update lead_identity_reviews set state='resolved',version=version+1,resolved_at=now(),resolved_by_membership_id=$4,updated_at=now()
          where workspace_id=$1 and id=$2 and state='pending' and version=$3 returning version`,
        [workspaceId, reviewId, expectedVersion, actorMembershipId],
      )).rows[0];
      if (!row) throw Object.assign(new Error("stale_version"), { code: "stale_version", status: 409 });
      return row as { version: number };
    },
  };
}
