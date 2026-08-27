import type { TrustedActor } from "../authorization";
import type { ModuleTransaction } from "../database";

export async function writeActivityCreatedAudit(tx: ModuleTransaction, input: {
  actor: TrustedActor; activityId: string; activityVersion: number; requestId: string; operationId: string;
}) {
  const metadata = { operation: "activity-create.v1", result_version: input.activityVersion };
  await tx.query(
    `insert into audit_events(workspace_id,actor_user_id,actor_membership_id,actor_type,session_id,action,target_type,
      target_id,outcome,request_id,correlation_id,source_ip_policy,before,after,metadata_version,metadata)
     values($1,$2,$3,'user',$4,'crm.activity_created','activity',$5,'success',$6,$7,'omitted','{}',$8,1,$9)`,
    [input.actor.workspaceId, input.actor.userId, input.actor.membershipId, input.actor.sessionId, input.activityId,
      input.requestId, input.operationId, JSON.stringify({ version: input.activityVersion }), JSON.stringify(metadata)],
  );
}
