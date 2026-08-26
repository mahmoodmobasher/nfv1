import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export const STREAMS = ["lead_root", "intake", "identity_review", "visibility", "lead_history", "platform_evidence"] as const;
export const LEAD_SOURCE_COLUMNS = [
  "id", "workspace_id", "display_name", "person_name_normalized", "first_name", "last_name", "email_display",
  "email_normalized", "company", "phone", "phone_normalized", "phone_country_code_used", "normalization_version",
  "source", "original_source_category", "original_source_platform", "original_source_medium", "original_source_detail",
  "original_campaign_context", "attribution_contract_version", "intake_channel", "received_at", "status",
  "lifecycle_definition_id", "identity_review_status", "contact_id", "company_id", "stage_id", "owner_membership_id",
  "responsible_team_id", "visibility", "version", "created_at", "updated_at",
] as const;
export const INTAKE_SOURCE_COLUMNS = [
  "id", "workspace_id", "operation", "intake_channel", "idempotency_key", "actor_membership_id", "request_hash",
  "contract_version", "normalization_version", "attribution_contract_version", "source_category", "source_platform",
  "source_medium", "source_detail", "campaign_context", "state", "lead_id", "outcome", "version", "created_at", "updated_at",
] as const;
export const ISSUE_SAFE_CODES: Record<string, readonly string[]> = {
  missing_intake: ["missing"], multiple_intakes: ["multiple"],
  lifecycle_status_ambiguous: ["legacy_open_null", "legacy_won_null", "legacy_lost_null", "converted_status_unfrozen", "pair_mismatch"],
  lifecycle_definition_unavailable: ["missing", "archived", "contract_mismatch"], stage_unavailable: ["missing", "archived"],
  assignment_unavailable: ["membership_missing", "membership_inactive", "user_inactive", "team_missing", "team_inactive", "responsible_team_not_visible"],
  visibility_invalid: ["teams_empty", "workspace_has_team_rows"],
  identity_review_lineage_invalid: ["missing_review", "multiple_pending", "state_mismatch", "head_missing", "head_mismatch", "candidate_version_mismatch"],
  linked_record_workspace_mismatch: ["contact", "company"],
  history_gap: ["created_missing", "version_gap", "stage_history_missing", "operational_history_missing", "review_history_missing"],
  evidence_cardinality_mismatch: ["audit_missing", "audit_multiple", "outbox_missing", "outbox_multiple", "receipt_missing", "receipt_multiple", "activity_missing", "activity_multiple", "parity_hash_mismatch"],
  source_version_changed: ["version_changed"], authority_conflict: ["writer_not_p1a", "root_contract_mismatch"],
  unsupported_legacy_row: ["no_committed_intake", "unnormalized_phone", "source_missing", "unsupported_identity_normalization_version"],
};

export type ScalarToken = { tag: "N" } | { tag: "B"; value: boolean } | { tag: "S"; value: string }
  | { tag: "U"; value: string } | { tag: "I"; value: string } | { tag: "T"; value: string };
export type Canonical = ScalarToken | Canonical[] | { [key: string]: Canonical };
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const N = (): ScalarToken => ({ tag: "N" });
export const B = (value: unknown): ScalarToken => {
  if (typeof value !== "boolean") throw new Error("boolean_required");
  return { tag: "B", value };
};
export const S = (value: unknown): ScalarToken => {
  if (typeof value !== "string") throw new Error("string_required");
  return { tag: "S", value };
};
export const U = (value: unknown): ScalarToken => {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new Error("uuid_required");
  return { tag: "U", value: value.toLowerCase() };
};
export const I = (value: unknown): ScalarToken => {
  const numeric = typeof value === "bigint" ? value : typeof value === "string" && /^-?\d+$/.test(value)
    ? BigInt(value) : typeof value === "number" && Number.isSafeInteger(value) ? BigInt(value) : null;
  if (numeric === null || numeric > BigInt(Number.MAX_SAFE_INTEGER) || numeric < BigInt(Number.MIN_SAFE_INTEGER))
    throw new Error("safe_integer_required");
  return { tag: "I", value: numeric.toString() };
};
export const T = (value: unknown): ScalarToken => {
  const text = value instanceof Date ? value.toISOString() : typeof value === "string" ? new Date(value).toISOString() : "";
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(text)) throw new Error("timestamp_required");
  return { tag: "T", value: text };
};
export type FieldKind = "string" | "uuid" | "integer" | "boolean" | "timestamp" | "json";
export function jsonToken(value: unknown): Canonical {
  if (value === null) return N();
  if (typeof value === "boolean") return B(value);
  if (typeof value === "string") return S(value);
  if (typeof value === "number" || typeof value === "bigint") return I(value);
  if (Array.isArray(value)) return value.map((item) => jsonToken(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .map(([key, item]) => [key, jsonToken(item)]));
  throw new Error("unsupported_json_value");
}
export function fieldToken(kind: FieldKind, value: unknown): Canonical {
  if (value === null || value === undefined) return N();
  if (kind === "string") return S(value);
  if (kind === "uuid") return U(value);
  if (kind === "integer") return I(value);
  if (kind === "boolean") return B(value);
  if (kind === "timestamp") return T(value);
  return jsonToken(value);
}
export function codePointCompare(left: string, right: string) {
  const a = Array.from(left, (char) => char.codePointAt(0)!); const b = Array.from(right, (char) => char.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return a.length - b.length;
}
export function encodeCanonical(value: Canonical): string {
  if (!Array.isArray(value) && value && typeof value === "object" && "tag" in value) {
    if (value.tag === "N") return "N";
    if (value.tag === "B") return value.value ? "B1" : "B0";
    if (value.tag === "S") return `S${Buffer.byteLength(value.value)}:${value.value}`;
    if (value.tag === "U") return `U36:${value.value}`;
    if (value.tag === "I") return `I${Buffer.byteLength(value.value)}:${value.value}`;
    if (value.tag === "T") return `T24:${value.value}`;
  }
  if (Array.isArray(value)) return `A${value.length}[${value.map(encodeCanonical).join("")}]`;
  if (!value || typeof value !== "object") throw new Error("untyped_canonical_value");
  const entries = Object.entries(value).sort(([left], [right]) => codePointCompare(left, right));
  return `O${entries.length}{${entries.map(([key, item]) => `${encodeCanonical(S(key))}${encodeCanonical(item)}`).join("")}}`;
}
export function parityDigest(key: Buffer, value: Canonical) {
  return createHmac("sha256", key).update(encodeCanonical(value)).digest();
}
export function parityEqual(key: Buffer, source: Canonical, projection: Canonical) {
  return timingSafeEqual(parityDigest(key, source), parityDigest(key, projection));
}
export function encodeJsonDirect(value: unknown): string {
  if (value === null) return "N";
  if (typeof value === "boolean") return value ? "B1" : "B0";
  if (typeof value === "string") return `S${Buffer.byteLength(value)}:${value}`;
  if (typeof value === "number" || typeof value === "bigint") {
    const token = I(value); if (token.tag !== "I") throw new Error("safe_integer_required");
    return `I${Buffer.byteLength(token.value)}:${token.value}`;
  }
  if (Array.isArray(value)) return `A${value.length}[${value.map(encodeJsonDirect).join("")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) => codePointCompare(left, right));
    return `O${entries.length}{${entries.map(([key, item]) => `S${Buffer.byteLength(key)}:${key}${encodeJsonDirect(item)}`).join("")}}`;
  }
  throw new Error("unsupported_json_value");
}
export function encodeFieldDirect(kind: FieldKind, value: unknown): string {
  if (value === null || value === undefined) return "N";
  if (kind === "string") {
    const token = S(value); if (token.tag !== "S") throw new Error("string_required");
    return `S${Buffer.byteLength(token.value)}:${token.value}`;
  }
  if (kind === "uuid") { const token = U(value); if (token.tag !== "U") throw new Error("uuid_required"); return `U36:${token.value}`; }
  if (kind === "integer") {
    const token = I(value); if (token.tag !== "I") throw new Error("safe_integer_required");
    return `I${Buffer.byteLength(token.value)}:${token.value}`;
  }
  if (kind === "boolean") { const token = B(value); if (token.tag !== "B") throw new Error("boolean_required"); return token.value ? "B1" : "B0"; }
  if (kind === "timestamp") { const token = T(value); if (token.tag !== "T") throw new Error("timestamp_required"); return `T24:${token.value}`; }
  return encodeJsonDirect(value);
}

export type RawRow = Record<string, unknown>;
export type RawInventory = Record<InventoryGroup, RawRow[]>;
export type InventoryGroup = "lead" | "intakes" | "reviews" | "candidates" | "decisions" | "heads"
  | "visibleTeams" | "lifecycle" | "stage" | "contacts" | "companies" | "history" | "audits" | "outbox" | "receipts";
export const GROUPS: readonly InventoryGroup[] = ["lead", "intakes", "reviews", "candidates", "decisions", "heads",
  "visibleTeams", "lifecycle", "stage", "contacts", "companies", "history", "audits", "outbox", "receipts"];
export const emptyInventory = (): RawInventory => ({ lead: [], intakes: [], reviews: [], candidates: [], decisions: [], heads: [],
  visibleTeams: [], lifecycle: [], stage: [], contacts: [], companies: [], history: [], audits: [], outbox: [], receipts: [] });
export const specs: Record<InventoryGroup, Record<string, FieldKind>> = {
  lead: Object.fromEntries(LEAD_SOURCE_COLUMNS.map((column) => [column,
    ["id", "workspace_id", "lifecycle_definition_id", "contact_id", "company_id", "stage_id", "owner_membership_id",
      "responsible_team_id"].includes(column) ? "uuid"
      : ["version"].includes(column) ? "integer"
      : ["received_at", "created_at", "updated_at"].includes(column) ? "timestamp"
      : ["original_source_detail", "original_campaign_context"].includes(column) ? "json" : "string"])),
  intakes: Object.fromEntries(INTAKE_SOURCE_COLUMNS.map((column) => [column,
    ["id", "workspace_id", "actor_membership_id", "lead_id"].includes(column) ? "uuid"
      : column === "version" ? "integer" : ["created_at", "updated_at"].includes(column) ? "timestamp"
      : ["source_detail", "campaign_context", "outcome"].includes(column) ? "json" : "string"])),
  reviews: { id: "uuid", intake_id: "uuid", lead_id: "uuid", state: "string", version: "integer",
    resolved_at: "timestamp", resolved_by_membership_id: "uuid", created_at: "timestamp", updated_at: "timestamp" },
  candidates: { id: "uuid", review_id: "uuid", contact_id: "uuid", company_id: "uuid", evidence_kind: "string",
    evidence_strength: "string", normalization_version: "string", target_version: "integer", evidence_metadata: "json",
    created_at: "timestamp" },
  decisions: { id: "uuid", intake_id: "uuid", review_id: "uuid", operation: "string", idempotency_key: "string",
    request_hash: "string", request_id: "uuid", correlation_id: "uuid", supersedes_decision_id: "uuid",
    governing_outcome: "string", contact_action: "string", company_action: "string", contact_id: "uuid",
    company_id: "uuid", contact_candidate_id: "uuid", company_candidate_id: "uuid", contact_target_version: "integer",
    company_target_version: "integer", actor_membership_id: "uuid", expected_lead_version: "integer",
    expected_review_version: "integer", expected_intake_version: "integer", result_lead_version: "integer",
    result_review_version: "integer", contract_version: "string", normalization_version: "string", reason_code: "string",
    created_at: "timestamp" },
  heads: { intake_id: "uuid", decision_id: "uuid", version: "integer", updated_at: "timestamp" },
  visibleTeams: { team_id: "uuid", created_at: "timestamp" },
  lifecycle: { id: "uuid", code: "string", is_terminal: "boolean", status: "string", contract_version: "string", version: "integer" },
  stage: { id: "uuid", name: "string", position: "integer", status: "string", created_at: "timestamp", updated_at: "timestamp" },
  contacts: { id: "uuid", status: "string", version: "integer" },
  companies: { id: "uuid", status: "string", version: "integer" },
  history: { id: "uuid", kind: "string", body: "string", created_by_membership_id: "uuid", created_at: "timestamp" },
  audits: { id: "uuid", workspace_id: "uuid", target_type: "string", target_id: "uuid", action: "string", outcome: "string",
    request_id: "string", correlation_id: "string", metadata_version: "integer", metadata: "json", occurred_at: "timestamp" },
  outbox: { id: "uuid", workspace_id: "uuid", topic: "string", aggregate_type: "string", aggregate_id: "uuid",
    operation_id: "uuid", result_version: "integer", status: "string", payload: "json" },
  receipts: { id: "uuid", principal_key: "string", operation: "string", outcome: "json", created_at: "timestamp", expires_at: "timestamp" },
};
export const sortedGroups = [...GROUPS].sort(codePointCompare);
export function sourceInventoryDigest(key: Buffer, inventory: RawInventory) {
  const hash = createHmac("sha256", key); hash.update(`O${sortedGroups.length}{`);
  for (const group of sortedGroups) {
    hash.update(`S${Buffer.byteLength(group)}:${group}`); hash.update(`A${inventory[group].length}[`);
    const columns = Object.keys(specs[group]).sort(codePointCompare);
    for (const row of inventory[group]) {
      hash.update(`O${columns.length}{`);
      for (const column of columns) {
        hash.update(`S${Buffer.byteLength(column)}:${column}`); hash.update(encodeFieldDirect(specs[group][column], row[column]));
      }
      hash.update("}");
    }
    hash.update("]");
  }
  hash.update("}"); return hash.digest();
}
export function vnextInventoryDigest(key: Buffer, inventory: RawInventory) {
  const hash = createHmac("sha256", key); hash.update(`O${sortedGroups.length}{`);
  for (const group of sortedGroups) {
    hash.update(`S${Buffer.byteLength(group)}:${group}`); const projectedRows = inventory[group];
    hash.update(`A${projectedRows.length}[`); const projectedFields = Object.entries(specs[group])
      .sort(([left], [right]) => codePointCompare(left, right));
    for (let index = 0; index < projectedRows.length; index += 1) {
      hash.update(`O${projectedFields.length}{`);
      for (const [field, kind] of projectedFields) {
        hash.update(`S${Buffer.byteLength(field)}:${field}`); hash.update(encodeFieldDirect(kind, projectedRows[index][field]));
      }
      hash.update("}");
    }
    hash.update("]");
  }
  hash.update("}"); return hash.digest();
}
export function sourceRecord(group: InventoryGroup, row: RawRow): Canonical {
  return Object.fromEntries(Object.entries(specs[group]).map(([column, kind]) => {
    try { return [column, fieldToken(kind, row[column])]; }
    catch (error) { throw new Error(`canonical_${group}_${column}_${error instanceof Error ? error.message : "invalid"}`); }
  }));
}
export function projectionRecord(group: InventoryGroup, row: RawRow): Canonical {
  const result: Record<string, Canonical> = {};
  for (const column of Object.keys(specs[group]).reverse()) {
    try { result[column] = fieldToken(specs[group][column], row[column]); }
    catch (error) { throw new Error(`canonical_${group}_${column}_${error instanceof Error ? error.message : "invalid"}`); }
  }
  return result;
}
export function sourceProjection(inventory: RawInventory): Canonical {
  return Object.fromEntries(GROUPS.map((group) => [group, inventory[group].map((row) => sourceRecord(group, row))]));
}
export function vnextProjection(inventory: RawInventory, mutate?: InventoryGroup): Canonical {
  return Object.fromEntries([...GROUPS].reverse().map((group) => [group, inventory[group].map((sourceRow) => {
    const row = mutate === group && sourceRow === inventory[group][0] ? { ...sourceRow, __parity_defect: "forced" } : sourceRow;
    const projected = projectionRecord(group, row) as Record<string, Canonical>;
    if (mutate === group && row.__parity_defect) projected.__parity_defect = S(String(row.__parity_defect));
    return projected;
  })]));
}

export const selectList = (group: InventoryGroup) => Object.keys(specs[group]).join(",");
export async function loadInventory(db: Pool | PoolClient, workspaceId: string, leadId: string): Promise<RawInventory> {
  const lead = (await db.query<RawRow>(`select ${selectList("lead")} from leads where workspace_id=$1 and id=$2`,
    [workspaceId, leadId])).rows;
  const intakes = (await db.query<RawRow>(`select ${selectList("intakes")} from lead_intakes where workspace_id=$1 and lead_id=$2 order by created_at,id`,
    [workspaceId, leadId])).rows;
  const reviews = (await db.query<RawRow>(`select ${selectList("reviews")} from lead_identity_reviews where workspace_id=$1 and lead_id=$2 order by created_at,id`,
    [workspaceId, leadId])).rows;
  const reviewIds = reviews.map((row) => row.id);
  const intakeIds = intakes.map((row) => row.id);
  const candidates = reviewIds.length ? (await db.query<RawRow>(`select ${selectList("candidates")} from lead_identity_candidates
    where workspace_id=$1 and review_id=any($2::uuid[]) order by created_at,id`, [workspaceId, reviewIds])).rows : [];
  const decisions = reviewIds.length ? (await db.query<RawRow>(`select ${selectList("decisions")} from lead_identity_decisions
    where workspace_id=$1 and review_id=any($2::uuid[]) order by created_at,id`, [workspaceId, reviewIds])).rows : [];
  const heads = intakeIds.length ? (await db.query<RawRow>(`select ${selectList("heads")} from lead_identity_decision_heads
    where workspace_id=$1 and intake_id=any($2::uuid[]) order by intake_id`, [workspaceId, intakeIds])).rows : [];
  const visibleTeams = (await db.query<RawRow>(`select ${selectList("visibleTeams")} from lead_visible_teams
    where workspace_id=$1 and lead_id=$2 order by team_id`, [workspaceId, leadId])).rows;
  const lifecycleId = lead[0]?.lifecycle_definition_id;
  const lifecycle = lifecycleId ? (await db.query<RawRow>(`select ${selectList("lifecycle")} from lead_lifecycle_definitions where id=$1`, [lifecycleId])).rows : [];
  const stage = lead[0]?.stage_id ? (await db.query<RawRow>(`select ${selectList("stage")} from pipeline_stages where workspace_id=$1 and id=$2`,
    [workspaceId, lead[0].stage_id])).rows : [];
  const contacts = lead[0]?.contact_id ? (await db.query<RawRow>(`select ${selectList("contacts")} from contacts where workspace_id=$1 and id=$2`,
    [workspaceId, lead[0].contact_id])).rows : [];
  const companies = lead[0]?.company_id ? (await db.query<RawRow>(`select ${selectList("companies")} from companies where workspace_id=$1 and id=$2`,
    [workspaceId, lead[0].company_id])).rows : [];
  const history = (await db.query<RawRow>(`select ${selectList("history")} from lead_activities where workspace_id=$1 and lead_id=$2 order by created_at,id`,
    [workspaceId, leadId])).rows;
  const audits = (await db.query<RawRow>(`select ${selectList("audits")} from audit_events where workspace_id=$1 and
    ((target_type='lead' and target_id=$2) or (target_type='identity_review' and target_id=any($3::uuid[]))) order by occurred_at,id`,
    [workspaceId, leadId, reviewIds])).rows;
  const outbox = (await db.query<RawRow>(`select ${selectList("outbox")} from outbox_messages where workspace_id=$1 order by created_at,id`,
    [workspaceId])).rows;
  const receipts = (await db.query<RawRow>(`select ${selectList("receipts")} from idempotency_records
    where operation=any($1::text[]) and outcome->>'leadId'=$2 order by created_at,id`,
    [["lead-inquiry-intake.v1", "lead-identity-review-decision.v1", "lead-operational-edit.v1", "lead-stage-transition.v1"], leadId])).rows;
  return { lead, intakes, reviews, candidates, decisions, heads, visibleTeams, lifecycle, stage, contacts, companies,
    history, audits, outbox, receipts };
}

export async function actorFixture(db: Pool | PoolClient) {
  const userId = (await db.query<{ id: string }>("insert into users(display_name,status) values('DB06B Owner','active') returning id")).rows[0].id;
  const workspaceId = (await db.query<{ id: string }>(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
    values('DB06B Integrity',$1,'active','growth','monthly',$2) returning id`, [`db06b-${randomUUID()}`, userId])).rows[0].id;
  const roleId = (await db.query<{ id: string }>("insert into roles(workspace_id,code) values($1,'owner') returning id", [workspaceId])).rows[0].id;
  const membershipId = (await db.query<{ id: string }>(`insert into workspace_memberships(workspace_id,user_id,role_id,status)
    values($1,$2,$3,'active') returning id`, [workspaceId, userId, roleId])).rows[0].id;
  const stages = (await db.query<{ id: string }>(`insert into pipeline_stages(workspace_id,name,position,status)
    values($1,'New',0,'active'),($1,'Working',1,'active') returning id`, [workspaceId])).rows;
  const sessionId = (await db.query<{ id: string }>(`insert into sessions(user_id,active_workspace_id,session_hash,
    idle_expires_at,absolute_expires_at,authenticated_at,auth_method) values($1,$2,$3,now()+interval '1 hour',
    now()+interval '1 day',now(),'password') returning id`, [userId, workspaceId, randomUUID()])).rows[0].id;
  const teamId = (await db.query<{ id: string }>(`insert into teams(workspace_id,name,name_normalized,status,created_by_membership_id)
    values($1,'DB06B Team','db06b team','active',$2) returning id`, [workspaceId, membershipId])).rows[0].id;
  return { userId, workspaceId, membershipId, sessionId, role: "owner" as const,
    stageId: stages[0].id, secondStageId: stages[1].id, teamId };
}

export function planNodes(plan: { "Node Type": string; Plans?: Array<{ "Node Type": string; Plans?: unknown[] }> }): string[] {
  return [plan["Node Type"], ...(plan.Plans ?? []).flatMap((child) => planNodes(child as typeof plan))];
}

export function planIndexes(plan: { "Index Name"?: string; Plans?: Array<{ "Index Name"?: string; Plans?: unknown[] }> }): string[] {
  return [...(plan["Index Name"] ? [plan["Index Name"]] : []),
    ...(plan.Plans ?? []).flatMap((child) => planIndexes(child as typeof plan))];
}
