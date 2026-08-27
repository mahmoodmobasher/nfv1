import type { TrustedActor } from "../authorization";
import type { ModuleTransaction } from "../database";
import { writeActivityCreatedEvent } from "../outbox";

export async function writeActivityCreatedEvidence(tx: ModuleTransaction, input: {
  actor: TrustedActor; activityId: string; activityVersion: number; leadId: string; leadVersion: number;
  kind: string; occurredAt: string; requestId: string; operationId: string;
}) {
  const metadata = { operation: "activity-create.v1", result_version: input.activityVersion };
  await tx.query(
    `insert into audit_events(workspace_id,actor_user_id,actor_membership_id,actor_type,session_id,action,target_type,
      target_id,outcome,request_id,correlation_id,source_ip_policy,before,after,metadata_version,metadata)
     values($1,$2,$3,'user',$4,'crm.activity_created','activity',$5,'success',$6,$7,'omitted','{}',$8,1,$9)`,
    [input.actor.workspaceId, input.actor.userId, input.actor.membershipId, input.actor.sessionId, input.activityId,
      input.requestId, input.operationId, JSON.stringify({ version: input.activityVersion }), JSON.stringify(metadata)],
  );
  await writeActivityCreatedEvent(tx, { workspaceId: input.actor.workspaceId, activityId: input.activityId,
    activityVersion: input.activityVersion, leadId: input.leadId, leadVersion: input.leadVersion,
    kind: input.kind, occurredAt: input.occurredAt, requestId: input.requestId, operationId: input.operationId });
}
