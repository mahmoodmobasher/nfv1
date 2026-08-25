import type { ModuleTransaction } from "../database";
import type { TrustedActor } from "../authorization";

export async function writeGoverningAudit(tx: ModuleTransaction, input: {
  actor: TrustedActor;
  action: string;
  targetType: string;
  targetId: string;
  requestId: string;
  correlationId: string;
  resultVersion: number;
}): Promise<void> {
  await tx.query(
    `insert into audit_events(workspace_id,actor_user_id,actor_membership_id,actor_type,session_id,action,target_type,target_id,outcome,
      request_id,correlation_id,source_ip_policy,before,after,metadata_version,metadata)
     values($1,$2,$3,'user',$4,$5,$6,$7,'success',$8,$9,'omitted','{}',$10,1,$11)`,
    [input.actor.workspaceId, input.actor.userId, input.actor.membershipId, input.actor.sessionId, input.action,
      input.targetType, input.targetId, input.requestId, input.correlationId,
      JSON.stringify({ version: input.resultVersion }),
      JSON.stringify({ operation: input.action, result_version: input.resultVersion })],
  );
}
