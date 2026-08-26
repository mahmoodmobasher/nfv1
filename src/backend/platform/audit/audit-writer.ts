import type { ModuleTransaction } from "../database";
import type { TrustedActor } from "../authorization";

export type P1AOperation = "lead-inquiry-intake.v1" | "lead-identity-review-decision.v1" |
  "lead-operational-edit.v1" | "lead-stage-transition.v1";
export type P1AAuditAction = "crm.inquiry_created" | "crm.inquiry_held_for_review" | "crm.inquiry_review_resolved" |
  "crm.lead_operational_updated" | "crm.lead_stage_transitioned";
export type P1AAuditMetadata = Partial<Record<"contract_version" | "intake_channel" | "source_category" | "source_platform" |
  "source_medium" | "disposition" | "candidate_strong_count" | "candidate_supplementary_count" |
  "candidate_probable_count" | "expected_version" | "normalization_version", string | number | null>> & {
    change_fields?: string[];
  };

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
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}): Promise<void> {
  const operations = new Set<P1AOperation>(["lead-inquiry-intake.v1", "lead-identity-review-decision.v1",
    "lead-operational-edit.v1", "lead-stage-transition.v1"]);
  const actions = new Set<P1AAuditAction>(["crm.inquiry_created", "crm.inquiry_held_for_review", "crm.inquiry_review_resolved",
    "crm.lead_operational_updated", "crm.lead_stage_transitioned"]);
  const operationActions: Record<P1AOperation, Set<P1AAuditAction>> = {
    "lead-inquiry-intake.v1": new Set(["crm.inquiry_created", "crm.inquiry_held_for_review"]),
    "lead-identity-review-decision.v1": new Set(["crm.inquiry_held_for_review", "crm.inquiry_review_resolved"]),
    "lead-operational-edit.v1": new Set(["crm.lead_operational_updated"]),
    "lead-stage-transition.v1": new Set(["crm.lead_stage_transitioned"]),
  };
  if (!operations.has(input.operation) || !actions.has(input.action) || !operationActions[input.operation]?.has(input.action))
    throw new Error("invalid_p1a_audit_identity");
  if ((input.operation === "lead-inquiry-intake.v1" && input.targetType !== "lead") ||
      (input.operation === "lead-identity-review-decision.v1" && input.targetType !== "identity_review") ||
      ((input.operation === "lead-operational-edit.v1" || input.operation === "lead-stage-transition.v1") && input.targetType !== "lead"))
    throw new Error("invalid_p1a_audit_target");
  const allowed = new Set(["contract_version", "intake_channel", "source_category", "source_platform", "source_medium",
    "disposition", "candidate_strong_count", "candidate_supplementary_count", "candidate_probable_count",
    "expected_version", "normalization_version", "change_fields"]);
  if (Object.keys(input.metadata ?? {}).some(key => !allowed.has(key))) throw new Error("invalid_p1a_audit_metadata");
  if (Object.entries(input.metadata ?? {}).some(([key, value]) => key === "change_fields"
    ? !Array.isArray(value) || value.length > 4 || value.some(field => typeof field !== "string" ||
      !["responsibleMembershipId", "responsibleTeamId", "visibility", "visibleTeamIds", "stageId"].includes(field))
    : value !== null && !["string", "number"].includes(typeof value)))
    throw new Error("invalid_p1a_audit_metadata");
  const metadata = { operation: input.operation, result_version: input.resultVersion,
    ...(input.metadata?.expected_version !== undefined ? { expected_version: input.metadata.expected_version } : {}),
    ...(input.metadata?.change_fields !== undefined ? { change_fields: input.metadata.change_fields } : {}) };
  await tx.query(
    `insert into audit_events(workspace_id,actor_user_id,actor_membership_id,actor_type,session_id,action,target_type,target_id,outcome,
      request_id,correlation_id,source_ip_policy,before,after,metadata_version,metadata)
     values($1,$2,$3,'user',$4,$5,$6,$7,'success',$8,$9,'omitted',$10,$11,1,$12)`,
    [input.actor.workspaceId, input.actor.userId, input.actor.membershipId, input.actor.sessionId, input.action,
      input.targetType, input.targetId, input.requestId, input.correlationId,
      JSON.stringify(input.before ?? {}), JSON.stringify(input.after ?? { version: input.resultVersion }), JSON.stringify(metadata)],
  );
}
