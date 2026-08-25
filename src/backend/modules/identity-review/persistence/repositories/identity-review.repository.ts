import type { ModuleTransaction } from "@/backend/platform/database";
import type { ContactCandidateV1 } from "@/backend/modules/contacts";
import type { CompanyCandidateV1 } from "@/backend/modules/companies";

export function identityReviewTransactionParticipant(tx: ModuleTransaction) {
  return {
    async listPendingPage(input: { workspaceId: string; beforeUpdatedAt: string | null; beforeId: string | null;
      limit: number; evidence: "any" | "email" | "phone" | "name_company" }) {
      return (await tx.query(
        `with selected as materialized (
          select r.id,r.workspace_id,r.intake_id,r.lead_id,r.version,r.updated_at
            from lead_identity_reviews r
           where r.workspace_id=$1 and r.state='pending'
             and ($2::timestamptz is null or (r.updated_at,r.id)<($2::timestamptz,$3::uuid))
             and ($4='any' or exists(select 1 from lead_identity_candidates f
               where f.workspace_id=r.workspace_id and f.review_id=r.id and f.evidence_kind=$4))
           order by r.updated_at desc,r.id desc limit $5
        ) select r.id "reviewId",r.intake_id "intakeId",r.lead_id "leadId",r.version "reviewVersion",r.updated_at "updatedAt",
            least(count(c.id) filter(where c.evidence_strength='strong'),10)::int "strongCount",
            least(count(c.id) filter(where c.evidence_strength='supplementary'),10)::int "supplementaryCount",
            least(count(c.id) filter(where c.evidence_strength='probable'),10)::int "probableCount"
           from selected r
           left join lead_identity_candidates c on c.workspace_id=r.workspace_id and c.review_id=r.id
          group by r.id,r.intake_id,r.lead_id,r.version,r.updated_at order by r.updated_at desc,r.id desc limit $5`,
        [input.workspaceId, input.beforeUpdatedAt, input.beforeId, input.evidence, input.limit],
      )).rows as Array<{ reviewId: string; intakeId: string; leadId: string; reviewVersion: number; updatedAt: Date;
        strongCount: number; supplementaryCount: number; probableCount: number }>;
    },
    async queueTargetSnapshots(workspaceId: string, reviewIds: string[]) {
      if (!reviewIds.length) return [];
      return (await tx.query(
        `with ranked as (
          select *,row_number() over(partition by review_id,evidence_kind order by coalesce(contact_id,company_id),id) rank
            from lead_identity_candidates where workspace_id=$1 and review_id=any($2::uuid[])
        ) select review_id "reviewId",contact_id "contactId",company_id "companyId",target_version "targetVersion"
            from ranked where rank<=10 order by review_id,coalesce(contact_id,company_id),id`, [workspaceId, reviewIds],
      )).rows as Array<{ reviewId: string; contactId: string | null; companyId: string | null; targetVersion: number }>;
    },
    async lockQueueDisclosureReviews(workspaceId: string, reviewIds: string[]) {
      if (!reviewIds.length) return [];
      return (await tx.query(
        `select id,lead_id "leadId",intake_id "intakeId",state,version from lead_identity_reviews
          where workspace_id=$1 and id=any($2::uuid[]) order by id for update`, [workspaceId, [...new Set(reviewIds)].sort()],
      )).rows as Array<{ id: string; leadId: string; intakeId: string; state: string; version: number }>;
    },
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
    async evidence(workspaceId: string, reviewId: string) {
      return (await tx.query(
        `with ranked as (
          select *,row_number() over(partition by evidence_kind order by coalesce(contact_id,company_id),id) rank
            from lead_identity_candidates where workspace_id=$1 and review_id=$2
        ) select id "candidateId",contact_id "contactId",company_id "companyId",target_version "targetVersion",
          evidence_kind "evidenceKind",evidence_strength "evidenceStrength" from ranked where rank<=10
         order by case evidence_strength when 'strong' then 1 when 'supplementary' then 2 else 3 end,
          coalesce(contact_id,company_id),id limit 30`,
        [workspaceId, reviewId])).rows as Array<Record<string, unknown>>;
    },
    async findByLead(workspaceId: string, leadId: string) {
      const refs = (await tx.query(`select id,intake_id,lead_id,state,version from lead_identity_reviews
        where workspace_id=$1 and lead_id=$2`, [workspaceId, leadId])).rows[0];
      if (!refs) throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
      return refs;
    },
    async lockReview(workspaceId: string, reviewId: string) {
      const review = (await tx.query(`select * from lead_identity_reviews where workspace_id=$1 and id=$2 for update`,
        [workspaceId, reviewId])).rows[0];
      if (!review) throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
      return review;
    },
    async lockDisclosureReview(workspaceId: string, reviewId: string) {
      const review = (await tx.query(`select id,version,state,intake_id,lead_id from lead_identity_reviews
        where workspace_id=$1 and id=$2 for update`, [workspaceId, reviewId])).rows[0];
      if (!review) throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
      await tx.query(`select decision_id from lead_identity_decision_heads where workspace_id=$1 and intake_id=$2 for update`,
        [workspaceId, review.intake_id]);
      return review;
    },
    async assertPendingReviewHead(input: { workspaceId: string; reviewId: string; intakeId: string;
      expectedReviewVersion: number; expectedHead?: string }) {
      const row = (await tx.query(
        `select 1 from lead_identity_reviews r join lead_identity_decision_heads h
          on h.workspace_id=r.workspace_id and h.intake_id=r.intake_id
          where r.workspace_id=$1 and r.id=$2 and r.intake_id=$3 and r.state='pending' and r.version=$4
            and ($5::uuid is null or h.decision_id=$5)`,
        [input.workspaceId, input.reviewId, input.intakeId, input.expectedReviewVersion, input.expectedHead ?? null])).rows[0];
      if (!row) throw Object.assign(new Error("stale_version"), { code: "stale_version", status: 409 });
    },
    async targetSnapshot(workspaceId: string, reviewId: string, type: "contact" | "company") {
      const column = type === "contact" ? "contact_id" : "company_id";
      return (await tx.query(
        `select ${column} id,target_version version,evidence_kind "evidenceKind" from lead_identity_candidates
          where workspace_id=$1 and review_id=$2 and ${column} is not null order by ${column}`,
        [workspaceId, reviewId])).rows as Array<{ id: string; version: number; evidenceKind: string }>;
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
                d.actor_membership_id,r.lead_id,r.id review_id,r.intake_id
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
    async touchPending(workspaceId: string, reviewId: string, expectedVersion: number) {
      const row = (await tx.query(
        `update lead_identity_reviews set version=version+1,updated_at=now()
          where workspace_id=$1 and id=$2 and state='pending' and version=$3 returning version`,
        [workspaceId, reviewId, expectedVersion])).rows[0];
      if (!row) throw Object.assign(new Error("stale_version"), { code: "stale_version", status: 409 });
      return row as { version: number };
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
