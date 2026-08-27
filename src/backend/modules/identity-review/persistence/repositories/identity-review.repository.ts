import { randomUUID } from "node:crypto";
import type { ModuleTransaction } from "@/backend/platform/database";
import type { ContactCandidateV1 } from "@/backend/modules/contacts";
import type { CompanyCandidateV1 } from "@/backend/modules/companies";

export function identityReviewTransactionParticipant(tx: ModuleTransaction) {
  return {
    async screenReviewSummary(
      workspaceId: string,
      leadId: string,
      leadReviewStatus: string,
      leadCompanyId: string | null,
      leadContactId: string | null,
      leadNormalizationVersion: string,
      lock = false,
    ) {
      if (lock) {
        await tx.query(
          `select id from lead_identity_reviews where workspace_id=$1 and lead_id=$2 order by id for update`,
          [workspaceId, leadId],
        );
        await tx.query(
          `select h.intake_id from lead_identity_decision_heads h
           join lead_identity_reviews r on r.workspace_id=h.workspace_id and r.intake_id=h.intake_id
           where r.workspace_id=$1 and r.lead_id=$2 order by h.intake_id for update of h`,
          [workspaceId, leadId],
        );
      }
      const facts = (
        await tx.query<{
          reviews: number;
          resolvedReviews: number;
          resolvedHeads: number;
          pendingReviews: number;
          contactOnlyPendingReviews: number;
        }>(
          `select
             count(distinct r.id)::int reviews,
             count(distinct r.id) filter(where r.state='resolved')::int "resolvedReviews",
             count(distinct h.decision_id) filter(where r.state='resolved' and d.governing_outcome='resolve'
               and d.normalization_version=$5
               and ((d.company_action='dismiss' and d.company_id is null and d.company_candidate_id is null
                     and d.company_target_version is null and $3::uuid is null)
                 or (d.company_action='create' and d.company_id=$3::uuid and d.company_id is not null
                     and d.company_candidate_id is null and d.company_target_version is not null)
                 or (d.company_action='link' and d.company_id=$3::uuid and d.company_id is not null
                     and d.company_candidate_id is not null and d.company_target_version is not null
                     and cc.company_id=d.company_id and cc.contact_id is null
                     and cc.target_version=d.company_target_version
                     and cc.normalization_version=d.normalization_version))
               and ((d.contact_action='dismiss' and d.contact_id is null and d.contact_candidate_id is null
                     and d.contact_target_version is null and $4::uuid is null)
                 or (d.contact_action='create' and d.contact_id=$4::uuid and d.contact_id is not null
                     and d.contact_candidate_id is null and d.contact_target_version is not null)
                 or (d.contact_action='link' and d.contact_id=$4::uuid and d.contact_id is not null
                     and d.contact_candidate_id is not null and d.contact_target_version is not null
                     and ct.contact_id=d.contact_id and ct.company_id is null
                     and ct.target_version=d.contact_target_version
                     and ct.normalization_version=d.normalization_version)))::int "resolvedHeads",
             count(distinct r.id) filter(where r.state='pending')::int "pendingReviews",
             count(distinct r.id) filter(where r.state='pending'
               and exists(select 1 from lead_identity_candidates c where c.workspace_id=r.workspace_id and c.review_id=r.id and c.contact_id is not null)
               and not exists(select 1 from lead_identity_candidates c where c.workspace_id=r.workspace_id and c.review_id=r.id and c.company_id is not null))::int "contactOnlyPendingReviews"
           from lead_identity_reviews r
           left join lead_identity_decisions d on d.workspace_id=r.workspace_id and d.review_id=r.id
           left join lead_identity_decision_heads h on h.workspace_id=d.workspace_id and h.intake_id=d.intake_id and h.decision_id=d.id
           left join lead_identity_candidates cc on cc.workspace_id=d.workspace_id and cc.review_id=d.review_id and cc.id=d.company_candidate_id
           left join lead_identity_candidates ct on ct.workspace_id=d.workspace_id and ct.review_id=d.review_id and ct.id=d.contact_candidate_id
           where r.workspace_id=$1 and r.lead_id=$2`,
          [workspaceId, leadId, leadCompanyId, leadContactId, leadNormalizationVersion],
        )
      ).rows[0];
      if (
        !facts ||
        facts.resolvedReviews !== 1 ||
        facts.resolvedHeads !== 1 ||
        facts.pendingReviews < 0 ||
        facts.pendingReviews > 1 ||
        facts.contactOnlyPendingReviews !== facts.pendingReviews ||
        facts.reviews !== 1 + facts.pendingReviews ||
        leadReviewStatus !== (facts.pendingReviews === 1 ? "pending" : "resolved")
      ) return null;
      return {
        companyDimension: "resolved" as const,
        contactDimension: facts.pendingReviews === 1 ? "pending" as const : "resolved" as const,
      };
    },
    async openExplicitCompanyScreenReview(input: {
      workspaceId: string;
      intakeId: string;
      leadId: string;
      reviewId: string;
      company: { id: string; version: number };
      contacts: ContactCandidateV1[];
      actorMembershipId: string;
      idempotencyKey: string;
      requestHash: string;
      requestId: string;
      correlationId: string;
      normalizationVersion: string;
    }) {
      await tx.query(
        `insert into lead_identity_reviews(id,workspace_id,intake_id,lead_id) values($4,$1,$2,$3)`,
        [input.workspaceId, input.intakeId, input.leadId, input.reviewId],
      );
      const companyCandidate = (
        await tx.query<{ id: string }>(
          `insert into lead_identity_candidates(workspace_id,review_id,company_id,evidence_kind,evidence_strength,normalization_version,target_version,evidence_metadata) values($1,$2,$3,'name_company','probable',$4,$5,jsonb_build_object('match_key_version',$4::text)) returning id`,
          [
            input.workspaceId,
            input.reviewId,
            input.company.id,
            input.normalizationVersion,
            input.company.version,
          ],
        )
      ).rows[0];
      const decision = (
        await tx.query<{ id: string }>(
          `insert into lead_identity_decisions(workspace_id,intake_id,review_id,idempotency_key,request_hash,request_id,correlation_id,governing_outcome,contact_action,company_action,company_id,company_candidate_id,company_target_version,actor_membership_id,expected_lead_version,expected_review_version,expected_intake_version,result_lead_version,result_review_version,contract_version,normalization_version) values($1,$2,$3,$4,$5,$6,$7,'resolve','dismiss','link',$8,$9,$10,$11,1,1,1,1,2,'lead-identity-review-decision.v1',$12) returning id`,
          [
            input.workspaceId,
            input.intakeId,
            input.reviewId,
            input.idempotencyKey,
            input.requestHash,
            input.requestId,
            input.correlationId,
            input.company.id,
            companyCandidate.id,
            input.company.version,
            input.actorMembershipId,
            input.normalizationVersion,
          ],
        )
      ).rows[0];
      await tx.query(
        `insert into lead_identity_decision_heads(workspace_id,intake_id,decision_id) values($1,$2,$3)`,
        [input.workspaceId, input.intakeId, decision.id],
      );
      const resolved = (
        await tx.query<{ version: number }>(
          `update lead_identity_reviews set state='resolved',version=version+1,resolved_at=now(),resolved_by_membership_id=$3,updated_at=now() where workspace_id=$1 and id=$2 and state='pending' and version=1 returning version`,
          [input.workspaceId, input.reviewId, input.actorMembershipId],
        )
      ).rows[0];
      if (!resolved)
        throw Object.assign(new Error("stale_version"), {
          code: "stale_version",
          status: 409,
        });
      if (input.contacts.length) {
        // DB-06B decisions resolve a complete review, so represent the already
        // resolved explicit Company dimension and the still-ambiguous Contact
        // dimension as separate owner-governed reviews. The decision head keeps
        // the retained Company link while the pending review blocks conversion.
        const contactReviewId = randomUUID();
        await tx.query(
          `insert into lead_identity_reviews(id,workspace_id,intake_id,lead_id) values($4,$1,$2,$3)`,
          [input.workspaceId, input.intakeId, input.leadId, contactReviewId],
        );
        for (const candidate of input.contacts)
          await tx.query(
            `insert into lead_identity_candidates(workspace_id,review_id,contact_id,evidence_kind,evidence_strength,normalization_version,target_version,evidence_metadata) values($1,$2,$3,$4,$5,$6,$7,jsonb_build_object('match_key_version',$6::text))`,
            [
              input.workspaceId,
              contactReviewId,
              candidate.id,
              candidate.evidenceKind,
              candidate.evidenceStrength,
              input.normalizationVersion,
              candidate.version,
            ],
          );
        return {
          disposition: "held_for_contact_review" as const,
          reviewVersion: 1,
          decisionId: decision.id,
        };
      }
      return {
        disposition: "resolved" as const,
        reviewVersion: resolved.version,
        decisionId: decision.id,
      };
    },
    async conversionReview(
      workspaceId: string,
      leadId: string,
      intakeId: string,
      lock = false,
    ) {
      if (lock) {
        await tx.query(
          `select id from lead_identity_reviews where workspace_id=$1 and lead_id=$2 order by id for update`,
          [workspaceId, leadId],
        );
        await tx.query(
          `select intake_id from lead_identity_decision_heads where workspace_id=$1 and intake_id=$2 for update`,
          [workspaceId, intakeId],
        );
      }
      const pending = Boolean(
        (
          await tx.query(
            `select 1 from lead_identity_reviews where workspace_id=$1 and lead_id=$2 and state='pending' limit 1`,
            [workspaceId, leadId],
          )
        ).rows[0],
      );
      const resolved = (
        await tx.query(
          `select r.id "reviewId",r.version "reviewVersion",h.decision_id "decisionHeadId",h.version "decisionHeadVersion",
          d.company_id "companyId",d.contact_id "contactId"
          from lead_identity_decision_heads h join lead_identity_decisions d on d.workspace_id=h.workspace_id and d.intake_id=h.intake_id and d.id=h.decision_id
          join lead_identity_reviews r on r.workspace_id=d.workspace_id and r.id=d.review_id and r.intake_id=d.intake_id
          where r.workspace_id=$1 and r.lead_id=$2 and r.intake_id=$3 and r.state='resolved'`,
          [workspaceId, leadId, intakeId],
        )
      ).rows[0] as
        | {
            reviewId: string;
            reviewVersion: number;
            decisionHeadId: string;
            decisionHeadVersion: number;
            companyId: string | null;
            contactId: string | null;
          }
        | undefined;
      return { pending, resolved: resolved ?? null };
    },
    async listPendingPage(input: {
      workspaceId: string;
      beforeUpdatedAt: string | null;
      beforeId: string | null;
      limit: number;
      evidence: "any" | "email" | "phone" | "name_company";
    }) {
      return (
        await tx.query(
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
          [
            input.workspaceId,
            input.beforeUpdatedAt,
            input.beforeId,
            input.evidence,
            input.limit,
          ],
        )
      ).rows as Array<{
        reviewId: string;
        intakeId: string;
        leadId: string;
        reviewVersion: number;
        updatedAt: Date;
        strongCount: number;
        supplementaryCount: number;
        probableCount: number;
      }>;
    },
    async queueTargetSnapshots(workspaceId: string, reviewIds: string[]) {
      if (!reviewIds.length) return [];
      return (
        await tx.query(
          `with ranked as (
          select *,row_number() over(partition by review_id,evidence_kind order by coalesce(contact_id,company_id),id) rank
            from lead_identity_candidates where workspace_id=$1 and review_id=any($2::uuid[])
        ) select review_id "reviewId",contact_id "contactId",company_id "companyId",target_version "targetVersion"
            from ranked where rank<=10 order by review_id,coalesce(contact_id,company_id),id`,
          [workspaceId, reviewIds],
        )
      ).rows as Array<{
        reviewId: string;
        contactId: string | null;
        companyId: string | null;
        targetVersion: number;
      }>;
    },
    async lockQueueDisclosureReviews(workspaceId: string, reviewIds: string[]) {
      if (!reviewIds.length) return [];
      return (
        await tx.query(
          `select id,lead_id "leadId",intake_id "intakeId",state,version from lead_identity_reviews
          where workspace_id=$1 and id=any($2::uuid[]) order by id for update`,
          [workspaceId, [...new Set(reviewIds)].sort()],
        )
      ).rows as Array<{
        id: string;
        leadId: string;
        intakeId: string;
        state: string;
        version: number;
      }>;
    },
    async open(
      workspaceId: string,
      intakeId: string,
      leadId: string,
      reviewId: string,
    ) {
      return (
        await tx.query(
          `insert into lead_identity_reviews(id,workspace_id,intake_id,lead_id) values($4,$1,$2,$3) returning id,version`,
          [workspaceId, intakeId, leadId, reviewId],
        )
      ).rows[0] as { id: string; version: number };
    },
    async recordCandidates(
      workspaceId: string,
      reviewId: string,
      contacts: ContactCandidateV1[],
      companies: CompanyCandidateV1[],
      normalizationVersion: string,
    ) {
      for (const candidate of contacts)
        await tx.query(
          `insert into lead_identity_candidates(workspace_id,review_id,contact_id,evidence_kind,evidence_strength,normalization_version,target_version,evidence_metadata)
         values($1,$2,$3,$4,$5,$6,$7,jsonb_build_object('match_key_version',$6::text))`,
          [
            workspaceId,
            reviewId,
            candidate.id,
            candidate.evidenceKind,
            candidate.evidenceStrength,
            normalizationVersion,
            candidate.version,
          ],
        );
      for (const candidate of companies)
        await tx.query(
          `insert into lead_identity_candidates(workspace_id,review_id,company_id,evidence_kind,evidence_strength,normalization_version,target_version,evidence_metadata)
         values($1,$2,$3,'name_company','probable',$4,$5,jsonb_build_object('match_key_version',$4::text))`,
          [
            workspaceId,
            reviewId,
            candidate.id,
            normalizationVersion,
            candidate.version,
          ],
        );
    },
    async evidence(workspaceId: string, reviewId: string) {
      return (
        await tx.query(
          `with ranked as (
          select *,row_number() over(partition by evidence_kind order by coalesce(contact_id,company_id),id) rank
            from lead_identity_candidates where workspace_id=$1 and review_id=$2
        ) select id "candidateId",contact_id "contactId",company_id "companyId",target_version "targetVersion",
          evidence_kind "evidenceKind",evidence_strength "evidenceStrength" from ranked where rank<=10
         order by case evidence_strength when 'strong' then 1 when 'supplementary' then 2 else 3 end,
          coalesce(contact_id,company_id),id limit 30`,
          [workspaceId, reviewId],
        )
      ).rows as Array<Record<string, unknown>>;
    },
    async findByLead(workspaceId: string, leadId: string) {
      const refs = (
        await tx.query(
          `select id,intake_id,lead_id,state,version from lead_identity_reviews
        where workspace_id=$1 and lead_id=$2`,
          [workspaceId, leadId],
        )
      ).rows[0];
      if (!refs)
        throw Object.assign(new Error("resource_not_found"), {
          code: "resource_not_found",
          status: 404,
        });
      return refs;
    },
    async lockReview(workspaceId: string, reviewId: string) {
      const review = (
        await tx.query(
          `select * from lead_identity_reviews where workspace_id=$1 and id=$2 for update`,
          [workspaceId, reviewId],
        )
      ).rows[0];
      if (!review)
        throw Object.assign(new Error("resource_not_found"), {
          code: "resource_not_found",
          status: 404,
        });
      return review;
    },
    async lockDisclosureReview(workspaceId: string, reviewId: string) {
      const review = (
        await tx.query(
          `select id,version,state,intake_id,lead_id from lead_identity_reviews
        where workspace_id=$1 and id=$2 for update`,
          [workspaceId, reviewId],
        )
      ).rows[0];
      if (!review)
        throw Object.assign(new Error("resource_not_found"), {
          code: "resource_not_found",
          status: 404,
        });
      await tx.query(
        `select decision_id from lead_identity_decision_heads where workspace_id=$1 and intake_id=$2 for update`,
        [workspaceId, review.intake_id],
      );
      return review;
    },
    async assertPendingReviewHead(input: {
      workspaceId: string;
      reviewId: string;
      intakeId: string;
      expectedReviewVersion: number;
      expectedHead?: string;
    }) {
      const row = (
        await tx.query(
          `select 1 from lead_identity_reviews r join lead_identity_decision_heads h
          on h.workspace_id=r.workspace_id and h.intake_id=r.intake_id
          where r.workspace_id=$1 and r.id=$2 and r.intake_id=$3 and r.state='pending' and r.version=$4
            and ($5::uuid is null or h.decision_id=$5)`,
          [
            input.workspaceId,
            input.reviewId,
            input.intakeId,
            input.expectedReviewVersion,
            input.expectedHead ?? null,
          ],
        )
      ).rows[0];
      if (!row)
        throw Object.assign(new Error("stale_version"), {
          code: "stale_version",
          status: 409,
        });
    },
    async targetSnapshot(
      workspaceId: string,
      reviewId: string,
      type: "contact" | "company",
    ) {
      const column = type === "contact" ? "contact_id" : "company_id";
      return (
        await tx.query(
          `select ${column} id,target_version version,evidence_kind "evidenceKind" from lead_identity_candidates
          where workspace_id=$1 and review_id=$2 and ${column} is not null order by ${column}`,
          [workspaceId, reviewId],
        )
      ).rows as Array<{ id: string; version: number; evidenceKind: string }>;
    },
    async candidate(
      workspaceId: string,
      reviewId: string,
      candidateId: string,
      target: "contact" | "company",
    ) {
      const column = target === "contact" ? "contact_id" : "company_id";
      const row = (
        await tx.query(
          `select id,${column} target_id,target_version from lead_identity_candidates
          where workspace_id=$1 and review_id=$2 and id=$3 and ${column} is not null`,
          [workspaceId, reviewId, candidateId],
        )
      ).rows[0];
      if (!row)
        throw Object.assign(new Error("invalid_match_decision"), {
          code: "invalid_match_decision",
          status: 409,
        });
      return row as { id: string; target_id: string; target_version: number };
    },
    async findDecisionReceipt(workspaceId: string, key: string) {
      return (
        (
          await tx.query(
            `select d.request_hash,d.request_id,d.id,d.governing_outcome,d.contact_id,d.company_id,d.result_lead_version,d.result_review_version,
                d.actor_membership_id,r.lead_id,r.id review_id,r.intake_id
           from lead_identity_decisions d join lead_identity_reviews r on r.workspace_id=d.workspace_id and r.id=d.review_id
          where d.workspace_id=$1 and d.operation='lead-identity-review-decision.v1' and d.idempotency_key=$2`,
            [workspaceId, key],
          )
        ).rows[0] ?? null
      );
    },
    async appendDecision(input: Record<string, unknown>) {
      return (
        await tx.query(
          `insert into lead_identity_decisions(workspace_id,intake_id,review_id,idempotency_key,request_hash,request_id,correlation_id,
          supersedes_decision_id,governing_outcome,contact_action,company_action,contact_id,company_id,contact_candidate_id,
          company_candidate_id,contact_target_version,company_target_version,actor_membership_id,expected_lead_version,
          expected_review_version,expected_intake_version,result_lead_version,result_review_version,contract_version,normalization_version,reason_code)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
          'lead-identity-review-decision.v1',$24,$25) returning id`,
          [
            input.workspaceId,
            input.intakeId,
            input.reviewId,
            input.idempotencyKey,
            input.requestHash,
            input.requestId,
            input.correlationId,
            input.supersedesDecisionId ?? null,
            input.governingOutcome,
            input.contactAction ?? null,
            input.companyAction ?? null,
            input.contactId ?? null,
            input.companyId ?? null,
            input.contactCandidateId ?? null,
            input.companyCandidateId ?? null,
            input.contactTargetVersion ?? null,
            input.companyTargetVersion ?? null,
            input.actorMembershipId,
            input.expectedLeadVersion,
            input.expectedReviewVersion,
            input.expectedIntakeVersion,
            input.resultLeadVersion,
            input.resultReviewVersion,
            input.normalizationVersion,
            input.reasonCode ?? null,
          ],
        )
      ).rows[0] as { id: string };
    },
    async setDecisionHead(
      workspaceId: string,
      intakeId: string,
      decisionId: string,
      supersedesDecisionId?: string,
    ) {
      if (!supersedesDecisionId) {
        await tx.query(
          `insert into lead_identity_decision_heads(workspace_id,intake_id,decision_id) values($1,$2,$3)`,
          [workspaceId, intakeId, decisionId],
        );
      } else {
        const updated = await tx.query(
          `update lead_identity_decision_heads set decision_id=$4,version=version+1,updated_at=now()
            where workspace_id=$1 and intake_id=$2 and decision_id=$3`,
          [workspaceId, intakeId, supersedesDecisionId, decisionId],
        );
        if (!updated.rowCount)
          throw Object.assign(new Error("stale_version"), {
            code: "stale_version",
            status: 409,
          });
      }
    },
    async currentHead(workspaceId: string, intakeId: string) {
      return (
        await tx.query(
          `select decision_id from lead_identity_decision_heads where workspace_id=$1 and intake_id=$2 for update`,
          [workspaceId, intakeId],
        )
      ).rows[0]?.decision_id as string | undefined;
    },
    async touchPending(
      workspaceId: string,
      reviewId: string,
      expectedVersion: number,
    ) {
      const row = (
        await tx.query(
          `update lead_identity_reviews set version=version+1,updated_at=now()
          where workspace_id=$1 and id=$2 and state='pending' and version=$3 returning version`,
          [workspaceId, reviewId, expectedVersion],
        )
      ).rows[0];
      if (!row)
        throw Object.assign(new Error("stale_version"), {
          code: "stale_version",
          status: 409,
        });
      return row as { version: number };
    },
    async resolve(
      workspaceId: string,
      reviewId: string,
      expectedVersion: number,
      actorMembershipId: string,
    ) {
      const row = (
        await tx.query(
          `update lead_identity_reviews set state='resolved',version=version+1,resolved_at=now(),resolved_by_membership_id=$4,updated_at=now()
          where workspace_id=$1 and id=$2 and state='pending' and version=$3 returning version`,
          [workspaceId, reviewId, expectedVersion, actorMembershipId],
        )
      ).rows[0];
      if (!row)
        throw Object.assign(new Error("stale_version"), {
          code: "stale_version",
          status: 409,
        });
      return row as { version: number };
    },
  };
}
