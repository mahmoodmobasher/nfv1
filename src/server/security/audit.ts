import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const metadataKeys = new Set([
  "risk_bucket", "change_fields", "provider", "auth_method", "policy_version", "operation",
  "invitation_generation", "assigned_role", "team_count", "expected_version", "result_version",
  "seat_limit", "active_seats", "auth_age_bucket", "selection_version",
]);
const stateKeys = new Set([
  "status", "role", "version", "workspaceId", "invitationGeneration", "teamCount",
]);

const canonicalActions: Record<string, string> = {
  "workspace.membership_role_changed": "workspace.membership_changed",
  "workspace.membership_role_change_denied": "workspace.membership_change_denied",
  "workspace.membership_suspended": "workspace.membership_changed",
  "workspace.membership_removed": "workspace.membership_changed",
  "workspace.selection_change_denied": "workspace.selection_denied",
};

function assertAllowed(value: Record<string, unknown> | unknown[] | undefined, keys: Set<string>, label: string) {
  if (!value) return;
  if (Array.isArray(value)) throw new Error(`${label} must be an object`);
  const invalid = Object.keys(value).filter((key) => !keys.has(key));
  if (invalid.length) throw new Error(`${label} contains non-allowlisted keys`);
}

/** Correlates an attempt without retaining a caller-provided idempotency key. */
export function auditCorrelation(operation: string, key: string): string {
  return `${operation}:${createHash("sha256").update(key).digest("hex")}`;
}

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
  before?: Record<string, unknown> | unknown[];
  after?: Record<string, unknown> | unknown[];
  metadata?: Record<string, unknown>;
};

export async function writeAudit(client: PoolClient, input: AuditInput): Promise<void> {
  const originalAction = input.action;
  const action = canonicalActions[originalAction] ?? originalAction;
  const metadata: Record<string, unknown> = { operation: action, ...input.metadata };
  let before = input.before;
  let after = input.after;
  if (input.outcome === "success" && !before && !after) {
    const expected = metadata.expected_version;
    const result = metadata.result_version;
    const assignedRole = metadata.assigned_role;
    before = expected === undefined ? {} : { version: expected };
    after = {
      ...(result === undefined ? {} : { version: result }),
      ...(assignedRole === undefined ? {} : { role: assignedRole }),
    };
    if (originalAction === "workspace.invitation_created") {
      before = { status: "absent" };
      after = { status: "pending", ...(assignedRole === undefined ? {} : { role: assignedRole }), ...(metadata.invitation_generation === undefined ? {} : { invitationGeneration: metadata.invitation_generation }) };
    } else if (originalAction === "workspace.invitation_resent") {
      after = { ...after, status: "pending", ...(metadata.invitation_generation === undefined ? {} : { invitationGeneration: metadata.invitation_generation }) };
    } else if (originalAction === "workspace.invitation_revoked") {
      before = { ...before, status: "pending" };
      after = { ...after, status: "revoked" };
    } else if (originalAction === "workspace.invitation_accepted") {
      before = { status: "pending" };
      after = { status: "accepted", ...(assignedRole === undefined ? {} : { role: assignedRole }) };
    } else if (originalAction === "workspace.membership_suspended") {
      before = { ...before, status: "active" };
      after = { ...after, status: "suspended" };
    } else if (originalAction === "workspace.membership_restored") {
      before = { ...before, status: "suspended" };
      after = { ...after, status: "active" };
    } else if (originalAction === "workspace.membership_removed") {
      after = { ...after, status: "removed" };
    } else if (originalAction === "workspace.ownership_transferred") {
      after = { ...after, role: "owner" };
    }
  }
  const correlationId = input.correlationId ?? auditCorrelation(action, [
    input.workspaceId, input.actorMembershipId, input.targetId, metadata.result_version, input.requestId,
  ].filter(Boolean).join(":"));
  assertAllowed(metadata, metadataKeys, "audit metadata");
  assertAllowed(before, stateKeys, "audit before state");
  assertAllowed(after, stateKeys, "audit after state");
  await client.query(
    `insert into audit_events
      (workspace_id, actor_user_id, actor_membership_id, actor_type, session_id, action, target_type, target_id, outcome, reason_code,
       request_id, correlation_id, source_ip_policy, before, after, metadata_version, metadata)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'omitted', $13, $14, 1, $15)`,
    [input.workspaceId ?? null, input.actorUserId ?? null, input.actorMembershipId ?? null, input.actorUserId ? "user" : "system", input.sessionId ?? null,
      action, input.targetType, input.targetId ?? null, input.outcome, input.reasonCode ?? null,
      input.requestId ?? null, correlationId, before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null, JSON.stringify(metadata)],
  );
}
