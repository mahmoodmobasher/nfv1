import type { ModuleTransaction } from "@/backend/platform/database";
import type { TrustedActor } from "@/backend/platform/authorization";
type ConversionCommand = {
  company: { companyId: string };
  primaryContact: { contactId: string } | null;
  pipeline: { pipelineId: string; stageId: string };
  deal: {
    name: string;
    value: {
      amountMinor: string;
      currencyCode: "USD" | "CAD";
      currencyExponent: 2;
    } | null;
    expectedCloseOn: string | null;
  };
  assignment: {
    responsibleMembershipId: string;
    responsibleTeamId: string | null;
    visibility: "workspace" | "teams";
    visibleTeamIds: string[];
  };
};

export function salesLeadConversionParticipant(tx: ModuleTransaction) {
  return {
    async pipeline(workspaceId: string, lock = false) {
      const pipeline = (
        await tx.query<{
          pipelineId: string;
          label: string;
          version: number;
          configurationVersion: number;
        }>(
          `select id "pipelineId",label,version,configuration_version "configurationVersion" from sales_pipelines
          where workspace_id=$1 and lifecycle='active' and is_default ${lock ? "for no key update" : ""}`,
          [workspaceId],
        )
      ).rows[0];
      if (!pipeline) return null;
      const stage = (
        await tx.query<{
          stageId: string;
          label: string;
          version: number;
          defaultProbabilityBps: number;
        }>(
          `select id "stageId",label,version,default_probability_bps "defaultProbabilityBps" from deal_stage_definitions
          where workspace_id=$1 and pipeline_id=$2 and lifecycle='active' and outcome_class='open'
          order by sort_key,id limit 1 ${lock ? "for no key update" : ""}`,
          [workspaceId, pipeline.pipelineId],
        )
      ).rows[0];
      return stage ? { ...pipeline, stage } : null;
    },
    async existing(workspaceId: string, leadId: string, lock = false) {
      return (
        (
          await tx.query<{
            dealId: string;
            resultLeadVersion: number;
            resultDealVersion: number;
          }>(
            `select deal_id "dealId",result_lead_version "resultLeadVersion",result_deal_version "resultDealVersion"
          from lead_deal_conversion_lineage where workspace_id=$1 and lead_record_type='crm.lead' and lead_record_id=$2 ${lock ? "for update" : ""}`,
            [workspaceId, leadId],
          )
        ).rows[0] ?? null
      );
    },
    async create(input: {
      actor: TrustedActor;
      leadId: string;
      sourceLeadVersion: number;
      resultLeadVersion: number;
      operationId: string;
      command: ConversionCommand;
      probabilityBps: number;
    }) {
      const value = input.command.deal.value;
      const deal = (
        await tx.query<{ id: string; version: number }>(
          `insert into deals(workspace_id,pipeline_id,stage_id,outcome_class,name,amount_minor,currency_code,currency_exponent,
          probability_bps,probability_source,expected_close_on,stage_entered_at,responsible_membership_id,responsible_team_id,
          visibility,governing_operation_id,created_by_membership_id,updated_by_membership_id)
          values($1,$2,$3,'open',$4,$5,$6,$7,$8,'stage_default',$9,now(),$10,$11,$12,$13,$14,$14) returning id,version`,
          [
            input.actor.workspaceId,
            input.command.pipeline.pipelineId,
            input.command.pipeline.stageId,
            input.command.deal.name,
            value?.amountMinor ?? null,
            value?.currencyCode ?? null,
            value?.currencyExponent ?? null,
            input.probabilityBps,
            input.command.deal.expectedCloseOn,
            input.command.assignment.responsibleMembershipId,
            input.command.assignment.responsibleTeamId,
            input.command.assignment.visibility,
            input.operationId,
            input.actor.membershipId,
          ],
        )
      ).rows[0];
      await tx.query(
        `insert into deal_party_refs(workspace_id,deal_id,role_code,record_type,record_id,is_primary,governing_operation_id,created_by_membership_id)
        values($1,$2,'customer_company','crm.company',$3,false,$4,$5)`,
        [
          input.actor.workspaceId,
          deal.id,
          input.command.company.companyId,
          input.operationId,
          input.actor.membershipId,
        ],
      );
      if (input.command.primaryContact)
        await tx.query(
          `insert into deal_party_refs(workspace_id,deal_id,role_code,record_type,record_id,contact_slot,is_primary,governing_operation_id,created_by_membership_id)
        values($1,$2,'buying_contact','crm.contact',$3,1,true,$4,$5)`,
          [
            input.actor.workspaceId,
            deal.id,
            input.command.primaryContact.contactId,
            input.operationId,
            input.actor.membershipId,
          ],
        );
      let slot = 1;
      for (const teamId of input.command.assignment.visibleTeamIds)
        await tx.query(
          `insert into deal_visible_teams(workspace_id,deal_id,team_id,visible_team_slot,created_by_membership_id)
        values($1,$2,$3,$4,$5)`,
          [
            input.actor.workspaceId,
            deal.id,
            teamId,
            slot++,
            input.actor.membershipId,
          ],
        );
      await tx.query(
        `insert into deal_stage_transitions(workspace_id,deal_id,to_pipeline_id,to_stage_id,to_outcome_class,result_deal_version,changed_by_membership_id,governing_operation_id,occurred_at)
        values($1,$2,$3,$4,'open',$5,$6,$7,now())`,
        [
          input.actor.workspaceId,
          deal.id,
          input.command.pipeline.pipelineId,
          input.command.pipeline.stageId,
          deal.version,
          input.actor.membershipId,
          input.operationId,
        ],
      );
      await tx.query(
        `insert into lead_deal_conversion_lineage(workspace_id,lead_record_id,deal_id,source_lead_version,result_lead_version,result_deal_version,governing_operation_id,converted_by_membership_id,converted_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,now())`,
        [
          input.actor.workspaceId,
          input.leadId,
          deal.id,
          input.sourceLeadVersion,
          input.resultLeadVersion,
          deal.version,
          input.operationId,
          input.actor.membershipId,
        ],
      );
      return deal;
    },
    async canDiscloseDeal(actor: TrustedActor, dealId: string) {
      return Boolean(
        (
          await tx.query(
            `select 1 from deals d where d.workspace_id=$1 and d.id=$2 and
      ($3::text<>'member' or d.visibility='workspace' or d.responsible_membership_id=$4 or exists(select 1 from deal_visible_teams dvt join team_memberships tm on tm.workspace_id=dvt.workspace_id and tm.team_id=dvt.team_id join teams t on t.workspace_id=tm.workspace_id and t.id=tm.team_id and t.status='active' where dvt.workspace_id=d.workspace_id and dvt.deal_id=d.id and tm.workspace_membership_id=$4))`,
            [actor.workspaceId, dealId, actor.role, actor.membershipId],
          )
        ).rows[0],
      );
    },
  };
}

/**
 * Deal outcomes grouped by the Lead each Deal was converted from. Sales owns the
 * conversion lineage and Deals; the Leads module matches this against its own `leads`
 * rows in TypeScript so neither module reads the other's tables.
 *
 * Note: the SQL-ownership scanner allows zero whitespace after its keywords, so even a
 * plural of one of those verbs in ordinary prose registers as a table reference. Keep
 * them out of comments in this module.
 */
export function dealOutcomesByLeadParticipant(tx: ModuleTransaction) {
  return {
    async forWorkspace(workspaceId: string, limit = 500) {
      return (await tx.query<{ leadId: string; won: number; lost: number; open: number }>(
        `select lineage.lead_record_id "leadId",
            count(*) filter (where deal.outcome_class='won')::int won,
            count(*) filter (where deal.outcome_class='lost')::int lost,
            count(*) filter (where deal.outcome_class='open')::int open
           from lead_deal_conversion_lineage lineage
           join deals deal on deal.workspace_id=lineage.workspace_id and deal.id=lineage.deal_id
          where lineage.workspace_id=$1 and lineage.lead_record_type='crm.lead'
          group by lineage.lead_record_id
          order by lineage.lead_record_id
          limit $2`,
        [workspaceId, limit],
      )).rows;
    },
  };
}
