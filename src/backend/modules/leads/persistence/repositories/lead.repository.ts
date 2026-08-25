import type { ModuleTransaction } from "@/backend/platform/database";
import type { CandidateQueryV1 } from "../../domain/identity-candidate-set.domain";

export type LeadIntakeContext = Record<string, unknown> & {
  id: string; version: number; intake_version: number; candidate_query?: CandidateQueryV1;
  owner_membership_id: string | null; responsible_team_id: string | null; visibility: string;
  company: string | null; display_name: string; person_name_normalized: string;
  first_name: string | null; last_name: string | null; email_display: string | null;
  email_normalized: string | null; phone: string | null; phone_normalized: string | null;
  phone_country_code_used: string | null;
};

function context(row: Record<string, unknown>): LeadIntakeContext {
  const outcome = row.outcome as Record<string, unknown> | null;
  return { ...row, candidate_query: outcome?._candidateQuery as CandidateQueryV1 | undefined } as LeadIntakeContext;
}

export function leadTransactionParticipant(tx: ModuleTransaction) {
  return {
    async readReviewPresentationContexts(workspaceId: string, refs: Array<{ leadId: string; intakeId: string }>) {
      if (!refs.length) return [];
      const leadIds = refs.map(ref => ref.leadId), intakeIds = refs.map(ref => ref.intakeId);
      return (await tx.query(
        `select l.*,i.id intake_id,i.version intake_version,d.code lifecycle_code
           from leads l join lead_intakes i on i.workspace_id=l.workspace_id and i.lead_id=l.id
           join lead_lifecycle_definitions d on d.id=l.lifecycle_definition_id
          where l.workspace_id=$1 and l.id=any($2::uuid[]) and i.id=any($3::uuid[])`,
        [workspaceId, leadIds, intakeIds],
      )).rows.map(context);
    },
    async lockReviewPresentationContexts(workspaceId: string, refs: Array<{ leadId: string; intakeId: string }>) {
      if (!refs.length) return [];
      const intakeIds = [...new Set(refs.map(ref => ref.intakeId))].sort();
      const leadIds = [...new Set(refs.map(ref => ref.leadId))].sort();
      await tx.query(`select id from lead_intakes where workspace_id=$1 and id=any($2::uuid[]) order by id for update`,
        [workspaceId, intakeIds]);
      await tx.query(`select id from leads where workspace_id=$1 and id=any($2::uuid[]) order by id for update`,
        [workspaceId, leadIds]);
      return (await tx.query(
        `select l.*,i.id intake_id,i.version intake_version,d.code lifecycle_code
           from leads l join lead_intakes i on i.workspace_id=l.workspace_id and i.lead_id=l.id
           join lead_lifecycle_definitions d on d.id=l.lifecycle_definition_id
          where l.workspace_id=$1 and l.id=any($2::uuid[]) and i.id=any($3::uuid[])`,
        [workspaceId, leadIds, intakeIds],
      )).rows.map(context);
    },
    async activeStage(workspaceId: string, requestedId?: string) {
      const row = (await tx.query(
        `select id from pipeline_stages where workspace_id=$1 and status='active' and ($2::uuid is null or id=$2)
          order by position,id limit 1`, [workspaceId, requestedId ?? null],
      )).rows[0];
      if (!row) throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
      return row.id as string;
    },
    async create(input: Record<string, unknown>) {
      return (await tx.query(
        `insert into leads(workspace_id,display_name,person_name_normalized,first_name,last_name,email_normalized,email_display,
          company,phone,phone_normalized,phone_country_code_used,normalization_version,source,original_source_category,
          original_source_platform,original_source_medium,original_source_detail,original_campaign_context,attribution_contract_version,
          intake_channel,received_at,status,lifecycle_definition_id,identity_review_status,stage_id,owner_membership_id,
          responsible_team_id,visibility)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'p1a-identity-v1',$12,$12,$13,$14,$15,$16,$17,'manual',$18,'open',
          '00000000-0000-4000-8000-000000000001','not_required',$19,null,null,$20) returning id,version`,
        [input.workspaceId, input.displayName, input.personNameNormalized, input.firstName, input.lastName,
          input.emailNormalized, input.emailDisplay, input.organizationName, input.phoneDisplay, input.phoneNormalized,
          input.phoneCountryCodeUsed, input.sourceCategory, input.sourcePlatform, input.sourceMedium,
          JSON.stringify(input.sourceDetail), JSON.stringify(input.campaignContext), input.attributionContractVersion,
          input.receivedAt, input.stageId, input.visibility ?? "workspace"],
      )).rows[0] as { id: string; version: number };
    },
    async setInitialResponsibility(input: { workspaceId: string; leadId: string; membershipId: string | null; teamId: string | null }) {
      await tx.query(`update leads set owner_membership_id=$3,responsible_team_id=$4 where workspace_id=$1 and id=$2`,
        [input.workspaceId, input.leadId, input.membershipId, input.teamId]);
    },
    async setInitialReview(workspaceId: string, leadId: string, state: "pending" | "not_required") {
      await tx.query(`update leads set identity_review_status=$3 where workspace_id=$1 and id=$2`, [workspaceId, leadId, state]);
    },
    async addVisibleTeams(workspaceId: string, leadId: string, teamIds: string[]) {
      for (const teamId of teamIds) await tx.query(
        `insert into lead_visible_teams(workspace_id,lead_id,team_id) values($1,$2,$3)`, [workspaceId, leadId, teamId],
      );
    },
    async addCreatedActivity(workspaceId: string, leadId: string, actorMembershipId: string, note?: string) {
      await tx.query(
        `insert into lead_activities(workspace_id,lead_id,kind,body,created_by_membership_id)
         values($1,$2,'created','Lead created.',$3)`, [workspaceId, leadId, actorMembershipId],
      );
      if (note?.trim()) await tx.query(
        `insert into lead_activities(workspace_id,lead_id,kind,body,created_by_membership_id)
         values($1,$2,'note',$3,$4)`, [workspaceId, leadId, note.trim().slice(0, 4000), actorMembershipId],
      );
    },
    async lockForResolution(workspaceId: string, leadId: string) {
      const row = (await tx.query(`select * from leads where workspace_id=$1 and id=$2 for update`, [workspaceId, leadId])).rows[0];
      if (!row) throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
      return row;
    },
    async readIntakeLeadContext(workspaceId: string, intakeId: string, leadId: string) {
      const row = (await tx.query(
        `select l.*,i.version intake_version,i.outcome,d.code lifecycle_code from lead_intakes i join leads l
          on l.workspace_id=i.workspace_id and l.id=i.lead_id
          join lead_lifecycle_definitions d on d.id=l.lifecycle_definition_id
          where i.workspace_id=$1 and i.id=$2 and l.id=$3`, [workspaceId, intakeId, leadId])).rows[0];
      if (!row) throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
      return context(row);
    },
    async lockIntakeLeadContext(workspaceId: string, intakeId: string, leadId: string) {
      const intake = (await tx.query(`select version,outcome from lead_intakes where workspace_id=$1 and id=$2 for update`,
        [workspaceId, intakeId])).rows[0];
      const lead = (await tx.query(`select * from leads where workspace_id=$1 and id=$2 for update`, [workspaceId, leadId])).rows[0];
      if (!intake || !lead) throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
      return context({ ...lead, intake_version: intake.version, outcome: intake.outcome });
    },
    async assertIntakeLeadVersions(input: { workspaceId: string; intakeId: string; leadId: string;
      expectedIntakeVersion: number; expectedLeadVersion: number }) {
      const row = (await tx.query(
        `select 1 from lead_intakes i join leads l on l.workspace_id=i.workspace_id and l.id=i.lead_id
          where i.workspace_id=$1 and i.id=$2 and l.id=$3 and i.version=$4 and l.version=$5`,
        [input.workspaceId, input.intakeId, input.leadId, input.expectedIntakeVersion, input.expectedLeadVersion])).rows[0];
      if (!row) throw Object.assign(new Error("stale_version"), { code: "stale_version", status: 409 });
    },
    async resolveIdentity(input: { workspaceId: string; leadId: string; expectedVersion: number; contactId: string | null; companyId: string | null }) {
      const row = (await tx.query(
        `update leads set contact_id=$4,company_id=$5,identity_review_status='resolved',version=version+1,updated_at=now()
          where workspace_id=$1 and id=$2 and version=$3 returning version`,
        [input.workspaceId, input.leadId, input.expectedVersion, input.contactId, input.companyId],
      )).rows[0];
      if (!row) throw Object.assign(new Error("stale_version"), { code: "stale_version", status: 409 });
      return row as { version: number };
    },
  };
}
