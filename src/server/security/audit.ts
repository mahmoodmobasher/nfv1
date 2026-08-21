import type { PoolClient } from "pg";

export type AuditInput = {
  actorUserId?: string;
  workspaceId?: string;
  actorMembershipId?: string;
  sessionId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  outcome: "success" | "denied" | "failure";
  reasonCode?: string;
  requestId?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
};

export async function writeAudit(client: PoolClient, input: AuditInput): Promise<void> {
  await client.query(
    `insert into audit_events
      (workspace_id, actor_user_id, actor_membership_id, actor_type, session_id, action, target_type, target_id, outcome, reason_code,
       request_id, correlation_id, source_ip_policy, metadata_version, metadata)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'omitted', 1, $13)`,
    [input.workspaceId ?? null, input.actorUserId ?? null, input.actorMembershipId ?? null, input.actorUserId ? "user" : "system", input.sessionId ?? null,
      input.action, input.targetType, input.targetId ?? null, input.outcome, input.reasonCode ?? null,
      input.requestId ?? null, input.correlationId ?? null, JSON.stringify(input.metadata ?? {})],
  );
}
