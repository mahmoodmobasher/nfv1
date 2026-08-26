import type { ModuleTransaction } from "../database";
import type { TrustedActor } from "../authorization";
import { writeSalesEvent, type SalesEventTopic } from "../outbox";
export type SalesOperation =
  | "sales-deal-create.v1"
  | "sales-deal-update.v1"
  | "sales-deal-stage-transition.v1"
  | "sales-deal-archive.v1"
  | "sales-deal-restore.v1";
const actions: Record<SalesOperation, string> = {
    "sales-deal-create.v1": "sales.deal_created",
    "sales-deal-update.v1": "sales.deal_updated",
    "sales-deal-stage-transition.v1": "sales.deal_stage_transitioned",
    "sales-deal-archive.v1": "sales.deal_archived",
    "sales-deal-restore.v1": "sales.deal_restored",
  },
  topics: Record<SalesOperation, SalesEventTopic> = {
    "sales-deal-create.v1": "sales.deal.created.v1",
    "sales-deal-update.v1": "sales.deal.updated.v1",
    "sales-deal-stage-transition.v1": "sales.deal.stage_transitioned.v1",
    "sales-deal-archive.v1": "sales.deal.archived.v1",
    "sales-deal-restore.v1": "sales.deal.restored.v1",
  };
export async function writeSalesEvidence(
  tx: ModuleTransaction,
  input: {
    actor: TrustedActor;
    operation: SalesOperation;
    dealId: string;
    version: number;
    requestId: string;
    operationId: string;
    changeFields: string[];
  },
) {
  const metadata = {
    operation: input.operation,
    result_version: input.version,
    change_fields: [...new Set(input.changeFields)].slice(0, 8),
  };
  if (
    /(?:name|amount|currency|company|contact|reason)/i.test(
      JSON.stringify(metadata),
    )
  )
    throw new Error("sales_evidence_privacy_violation");
  await tx.query(
    `insert into audit_events(workspace_id,actor_user_id,actor_membership_id,actor_type,session_id,action,target_type,target_id,outcome,request_id,correlation_id,source_ip_policy,before,after,metadata_version,metadata) values($1,$2,$3,'user',$4,$5,'deal',$6,'success',$7,$8,'omitted','{}',$9,1,$10)`,
    [
      input.actor.workspaceId,
      input.actor.userId,
      input.actor.membershipId,
      input.actor.sessionId,
      actions[input.operation],
      input.dealId,
      input.requestId,
      input.operationId,
      JSON.stringify({ version: input.version }),
      JSON.stringify(metadata),
    ],
  );
  await writeSalesEvent(tx, {
    workspaceId: input.actor.workspaceId,
    topic: topics[input.operation],
    dealId: input.dealId,
    operationId: input.operationId,
    version: input.version,
    requestId: input.requestId,
    changeFields: input.changeFields,
  });
}
