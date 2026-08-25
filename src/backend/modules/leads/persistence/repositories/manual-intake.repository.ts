import type { ModuleTransaction } from "@/backend/platform/database";

export function manualIntakeRepository(tx: ModuleTransaction) {
  return {
    async findForReplay(workspaceId: string, key: string) {
      return (await tx.query(
        `select id,request_hash,state,outcome from lead_intakes
          where workspace_id=$1 and operation='lead-inquiry-intake.v1' and intake_channel='manual' and idempotency_key=$2 for update`,
        [workspaceId, key],
      )).rows[0] ?? null;
    },
    async createPending(input: Record<string, unknown>) {
      return (await tx.query(
        `insert into lead_intakes(workspace_id,operation,intake_channel,idempotency_key,actor_membership_id,request_hash,
          contract_version,normalization_version,attribution_contract_version,source_category,source_platform,source_medium,
          source_detail,campaign_context,state)
         values($1,'lead-inquiry-intake.v1','manual',$2,$3,$4,'lead-inquiry-intake.v1','p1a-identity-v1',$5,$6,$7,$8,$9,$10,'pending') returning id,version`,
        [input.workspaceId, input.idempotencyKey, input.actorMembershipId, input.requestHash, input.attributionContractVersion,
          input.sourceCategory, input.sourcePlatform, input.sourceMedium, JSON.stringify(input.sourceDetail), JSON.stringify(input.campaignContext)],
      )).rows[0] as { id: string; version: number };
    },
    async commit(workspaceId: string, intakeId: string, leadId: string, outcome: unknown) {
      return (await tx.query(
        `update lead_intakes set state='committed',lead_id=$3,outcome=$4,version=version+1,updated_at=now()
          where workspace_id=$1 and id=$2 and state='pending' returning version`,
        [workspaceId, intakeId, leadId, JSON.stringify(outcome)],
      )).rows[0] as { version: number };
    },
  };
}
