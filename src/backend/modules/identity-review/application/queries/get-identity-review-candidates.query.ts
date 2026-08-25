import type { Pool } from "pg";
import { runModuleTransaction } from "@/backend/platform/database";
import { revalidateActiveActor, type TrustedActor } from "@/backend/platform/authorization";
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
      const visible = review.owner_membership_id === current.membershipId && (review.visibility === "workspace" || Boolean((await tx.query(
        `select 1 from lead_visible_teams lvt join team_memberships tm on tm.workspace_id=lvt.workspace_id and tm.team_id=lvt.team_id
          where lvt.workspace_id=$1 and lvt.lead_id=$2 and tm.workspace_membership_id=$3`,
        [current.workspaceId, review.lead_id, current.membershipId],
      )).rows[0]));
      if (!visible) throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
    }
    const rows = await tx.query(
      `select c.id "candidateId",case when c.contact_id is not null then 'contact' else 'company' end "targetType",
        coalesce(c.contact_id,c.company_id) "targetId",c.target_version "targetVersion",c.evidence_kind "evidenceKind",
        c.evidence_strength "evidenceStrength",coalesce(p.display_name,o.display_name) "displayName",p.email_display email,
        p.phone_display phone,o.display_name "companyName"
       from lead_identity_candidates c left join contacts p on p.workspace_id=c.workspace_id and p.id=c.contact_id
       left join companies o on o.workspace_id=c.workspace_id and o.id=c.company_id
       where c.workspace_id=$1 and c.review_id=$2
       order by case c.evidence_strength when 'strong' then 1 when 'supplementary' then 2 else 3 end,c.id limit 30`,
      [current.workspaceId, review.id],
    );
    return { contractVersion: "lead-identity-review-candidates.v1", reviewId: review.id, leadId: review.lead_id,
      reviewVersion: review.version, leadVersion: review.lead_version, intakeVersion: review.intake_version, candidates: rows.rows } as IdentityReviewCandidateViewV1;
  });
}
