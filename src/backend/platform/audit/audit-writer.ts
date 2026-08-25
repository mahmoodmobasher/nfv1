import type { ModuleTransaction } from "../database";
import type { TrustedActor } from "../authorization";

export type P1AOperation = "lead-inquiry-intake.v1" | "lead-identity-review-decision.v1";
export type P1AAuditAction = "crm.inquiry_created" | "crm.inquiry_held_for_review" | "crm.inquiry_review_resolved";
export type P1AAuditMetadata = Partial<Record<"contract_version" | "intake_channel" | "source_category" | "source_platform" |
  "source_medium" | "disposition" | "candidate_strong_count" | "candidate_supplementary_count" |
  "candidate_probable_count" | "expected_version" | "normalization_version", string | number | null>>;

export async function writeGoverningAudit(tx: ModuleTransaction, input: {
  actor: TrustedActor;
  operation: P1AOperation;
  action: P1AAuditAction;
  targetType: string;
  targetId: string;
  requestId: string;
  correlationId: string;
  resultVersion: number;
  metadata?: P1AAuditMetadata;
}): Promise<void> {
  const allowed = new Set(["contract_version", "intake_channel", "source_category", "source_platform", "source_medium",
    "disposition", "candidate_strong_count", "candidate_supplementary_count", "candidate_probable_count",
    "expected_version", "normalization_version"]);
  if (Object.keys(input.metadata ?? {}).some(key => !allowed.has(key))) throw new Error("invalid_p1a_audit_metadata");
  await tx.query(
    `insert into audit_events(workspace_id,actor_user_id,actor_membership_id,actor_type,session_id,action,target_type,target_id,outcome,
      request_id,correlation_id,source_ip_policy,before,after,metadata_version,metadata)
     values($1,$2,$3,'user',$4,$5,$6,$7,'success',$8,$9,'omitted','{}',$10,1,$11)`,
    [input.actor.workspaceId, input.actor.userId, input.actor.membershipId, input.actor.sessionId, input.action,
      input.targetType, input.targetId, input.requestId, input.correlationId,
      JSON.stringify({ version: input.resultVersion }),
      JSON.stringify({ operation: input.operation, result_version: input.resultVersion })],
  );
}
