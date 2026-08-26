import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { decideLeadIdentityReviewV1, editLeadOperationalV1, getIdentityReviewCandidatesV1,
  submitLeadInquiryV1, transitionLeadStageV1 } from "../src/backend/modules/leads";
import type { TrustedActor } from "../src/backend/platform/authorization";

const connectionString = process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow";
const parsedDatabaseUrl = new URL(connectionString);
const isIsolatedLocalDatabase = ["127.0.0.1", "localhost", "::1"].includes(parsedDatabaseUrl.hostname)
  && parsedDatabaseUrl.port === "54329" && /^\/nexaflow(?:_db0?6b|_test|$)/.test(parsedDatabaseUrl.pathname);
const integrationSuite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const boundedEvidenceSuite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString });
const CURRENT_IDENTITY_NORMALIZATION = "p1a-identity-v2" as const;

const STREAMS = ["lead_root", "intake", "identity_review", "visibility", "lead_history", "platform_evidence"] as const;
const LEAD_SOURCE_COLUMNS = [
  "id", "workspace_id", "display_name", "person_name_normalized", "first_name", "last_name", "email_display",
  "email_normalized", "company", "phone", "phone_normalized", "phone_country_code_used", "normalization_version",
  "source", "original_source_category", "original_source_platform", "original_source_medium", "original_source_detail",
  "original_campaign_context", "attribution_contract_version", "intake_channel", "received_at", "status",
  "lifecycle_definition_id", "identity_review_status", "contact_id", "company_id", "stage_id", "owner_membership_id",
  "responsible_team_id", "visibility", "version", "created_at", "updated_at",
] as const;
const INTAKE_SOURCE_COLUMNS = [
  "id", "workspace_id", "operation", "intake_channel", "idempotency_key", "actor_membership_id", "request_hash",
  "contract_version", "normalization_version", "attribution_contract_version", "source_category", "source_platform",
  "source_medium", "source_detail", "campaign_context", "state", "lead_id", "outcome", "version", "created_at", "updated_at",
] as const;
const ISSUE_SAFE_CODES: Record<string, readonly string[]> = {
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

type ScalarToken = { tag: "N" } | { tag: "B"; value: boolean } | { tag: "S"; value: string }
  | { tag: "U"; value: string } | { tag: "I"; value: string } | { tag: "T"; value: string };
type Canonical = ScalarToken | Canonical[] | { [key: string]: Canonical };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const N = (): ScalarToken => ({ tag: "N" });
const B = (value: unknown): ScalarToken => {
  if (typeof value !== "boolean") throw new Error("boolean_required");
  return { tag: "B", value };
};
const S = (value: unknown): ScalarToken => {
  if (typeof value !== "string") throw new Error("string_required");
  return { tag: "S", value };
};
const U = (value: unknown): ScalarToken => {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new Error("uuid_required");
  return { tag: "U", value: value.toLowerCase() };
};
const I = (value: unknown): ScalarToken => {
  const numeric = typeof value === "bigint" ? value : typeof value === "string" && /^-?\d+$/.test(value)
    ? BigInt(value) : typeof value === "number" && Number.isSafeInteger(value) ? BigInt(value) : null;
  if (numeric === null || numeric > BigInt(Number.MAX_SAFE_INTEGER) || numeric < BigInt(Number.MIN_SAFE_INTEGER))
    throw new Error("safe_integer_required");
  return { tag: "I", value: numeric.toString() };
};
const T = (value: unknown): ScalarToken => {
  const text = value instanceof Date ? value.toISOString() : typeof value === "string" ? new Date(value).toISOString() : "";
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(text)) throw new Error("timestamp_required");
  return { tag: "T", value: text };
};
type FieldKind = "string" | "uuid" | "integer" | "boolean" | "timestamp" | "json";
function jsonToken(value: unknown): Canonical {
  if (value === null) return N();
  if (typeof value === "boolean") return B(value);
  if (typeof value === "string") return S(value);
  if (typeof value === "number" || typeof value === "bigint") return I(value);
  if (Array.isArray(value)) return value.map((item) => jsonToken(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .map(([key, item]) => [key, jsonToken(item)]));
  throw new Error("unsupported_json_value");
}
function fieldToken(kind: FieldKind, value: unknown): Canonical {
  if (value === null || value === undefined) return N();
  if (kind === "string") return S(value);
  if (kind === "uuid") return U(value);
  if (kind === "integer") return I(value);
  if (kind === "boolean") return B(value);
  if (kind === "timestamp") return T(value);
  return jsonToken(value);
}
function codePointCompare(left: string, right: string) {
  const a = Array.from(left, (char) => char.codePointAt(0)!); const b = Array.from(right, (char) => char.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return a.length - b.length;
}
function encodeCanonical(value: Canonical): string {
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
function parityDigest(key: Buffer, value: Canonical) {
  return createHmac("sha256", key).update(encodeCanonical(value)).digest();
}
function parityEqual(key: Buffer, source: Canonical, projection: Canonical) {
  return timingSafeEqual(parityDigest(key, source), parityDigest(key, projection));
}
function encodeJsonDirect(value: unknown): string {
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
function encodeFieldDirect(kind: FieldKind, value: unknown): string {
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

type RawRow = Record<string, unknown>;
type RawInventory = Record<InventoryGroup, RawRow[]>;
type InventoryGroup = "lead" | "intakes" | "reviews" | "candidates" | "decisions" | "heads"
  | "visibleTeams" | "lifecycle" | "stage" | "contacts" | "companies" | "history" | "audits" | "outbox" | "receipts";
const GROUPS: readonly InventoryGroup[] = ["lead", "intakes", "reviews", "candidates", "decisions", "heads",
  "visibleTeams", "lifecycle", "stage", "contacts", "companies", "history", "audits", "outbox", "receipts"];
const emptyInventory = (): RawInventory => ({ lead: [], intakes: [], reviews: [], candidates: [], decisions: [], heads: [],
  visibleTeams: [], lifecycle: [], stage: [], contacts: [], companies: [], history: [], audits: [], outbox: [], receipts: [] });
const specs: Record<InventoryGroup, Record<string, FieldKind>> = {
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
const sortedGroups = [...GROUPS].sort(codePointCompare);
function sourceInventoryDigest(key: Buffer, inventory: RawInventory) {
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
function vnextInventoryDigest(key: Buffer, inventory: RawInventory) {
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
function sourceRecord(group: InventoryGroup, row: RawRow): Canonical {
  return Object.fromEntries(Object.entries(specs[group]).map(([column, kind]) => {
    try { return [column, fieldToken(kind, row[column])]; }
    catch (error) { throw new Error(`canonical_${group}_${column}_${error instanceof Error ? error.message : "invalid"}`); }
  }));
}
function projectionRecord(group: InventoryGroup, row: RawRow): Canonical {
  const result: Record<string, Canonical> = {};
  for (const column of Object.keys(specs[group]).reverse()) {
    try { result[column] = fieldToken(specs[group][column], row[column]); }
    catch (error) { throw new Error(`canonical_${group}_${column}_${error instanceof Error ? error.message : "invalid"}`); }
  }
  return result;
}
function sourceProjection(inventory: RawInventory): Canonical {
  return Object.fromEntries(GROUPS.map((group) => [group, inventory[group].map((row) => sourceRecord(group, row))]));
}
function vnextProjection(inventory: RawInventory, mutate?: InventoryGroup): Canonical {
  return Object.fromEntries([...GROUPS].reverse().map((group) => [group, inventory[group].map((sourceRow) => {
    const row = mutate === group && sourceRow === inventory[group][0] ? { ...sourceRow, __parity_defect: "forced" } : sourceRow;
    const projected = projectionRecord(group, row) as Record<string, Canonical>;
    if (mutate === group && row.__parity_defect) projected.__parity_defect = S(String(row.__parity_defect));
    return projected;
  })]));
}

const selectList = (group: InventoryGroup) => Object.keys(specs[group]).join(",");
async function loadInventory(db: Pool | PoolClient, workspaceId: string, leadId: string): Promise<RawInventory> {
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

async function actorFixture(db: Pool | PoolClient = pool) {
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
async function leadFixture(db: Pool | PoolClient, actor: Awaited<ReturnType<typeof actorFixture>>, updatedAt = new Date()) {
  const email = `db06b-${randomUUID()}@example.test`;
  return (await db.query<{ id: string; version: number; updated_at: Date }>(`insert into leads(workspace_id,display_name,
    person_name_normalized,email_display,email_normalized,source,original_source_category,original_source_medium,
    original_source_detail,original_campaign_context,attribution_contract_version,intake_channel,stage_id,status,
    visibility,updated_at) values($1,'Integrity Lead','integrity lead',$2,$2,'manual','manual','unknown','{}','{}',
    'p1a-attribution-v1','manual',$3,'open','workspace',$4) returning id,version,updated_at`,
  [actor.workspaceId, email, actor.stageId, updatedAt])).rows[0];
}
async function acceptedLeadFixture(db: Pool = pool) {
  const actor = await actorFixture(db), trusted: TrustedActor = actor;
  const email = `parity-${randomUUID()}@example.test`;
  const companyId = (await db.query<{ id: string }>(`insert into companies(workspace_id,display_name,name_normalized)
    values($1,'Parity Company','parity company') returning id`, [actor.workspaceId])).rows[0].id;
  const contactId = (await db.query<{ id: string }>(`insert into contacts(workspace_id,display_name,
    person_name_normalized,email_display,email_normalized,company_id) values($1,'Parity Person','parity person',$2,$2,$3)
    returning id`, [actor.workspaceId, email, companyId])).rows[0].id;
  const intakeKey = `db06b-intake-${randomUUID()}`;
  const submitted = await submitLeadInquiryV1(db, { actor: trusted, idempotencyKey: intakeKey, command: {
    contractVersion: "lead-inquiry-intake.v1", intakeChannel: "manual",
    person: { displayName: "Parity Person", email }, organization: { name: "Parity Company" },
    inquiry: { receivedAt: "2026-08-25T12:00:00.000Z" }, source: { sourceCategory: "manual",
      sourceMedium: "unknown", sourceDetail: {}, campaignContext: {}, attributionContractVersion: "p1a-attribution-v1" },
  } });
  const view = await getIdentityReviewCandidatesV1(db, trusted, submitted.leadId);
  const contactCandidate = view.candidates.find((candidate) => candidate.targetType === "contact" && candidate.targetId === contactId)!;
  const companyCandidate = view.candidates.find((candidate) => candidate.targetType === "company" && candidate.targetId === companyId)!;
  expect(contactCandidate).toBeTruthy(); expect(companyCandidate).toBeTruthy();
  const reviewKey = `db06b-review-${randomUUID()}`;
  const resolved = await decideLeadIdentityReviewV1(db, { actor: trusted, leadId: submitted.leadId,
    idempotencyKey: reviewKey, command: { contractVersion: "lead-identity-review-decision.v1", outcome: "resolve",
      expectedLeadVersion: view.leadVersion, expectedReviewVersion: view.reviewVersion,
      expectedIntakeVersion: view.intakeVersion, contact: { action: "link", candidateId: contactCandidate.candidateId,
        targetId: contactId, expectedTargetVersion: contactCandidate.expectedTargetVersion },
      company: { action: "link", candidateId: companyCandidate.candidateId, targetId: companyId,
        expectedTargetVersion: companyCandidate.expectedTargetVersion } } });
  const editKey = `db06b-edit-${randomUUID()}`;
  const edited = await editLeadOperationalV1(db, { actor: trusted, leadId: submitted.leadId,
    idempotencyKey: editKey, command: { contractVersion: "lead-operational-edit.v1", expectedVersion: resolved.leadVersion,
      responsibleMembershipId: actor.membershipId, responsibleTeamId: actor.teamId, visibility: "teams",
      visibleTeamIds: [actor.teamId] } });
  const stageKey = `db06b-stage-${randomUUID()}`;
  const staged = await transitionLeadStageV1(db, { actor: trusted, leadId: submitted.leadId,
    idempotencyKey: stageKey, command: { contractVersion: "lead-stage-transition.v1", expectedVersion: edited.leadVersion,
      targetStageId: actor.secondStageId } });
  const lead = (await db.query<{ id: string; version: number; updated_at: Date }>(`select id,version,updated_at from leads
    where workspace_id=$1 and id=$2`, [actor.workspaceId, submitted.leadId])).rows[0];
  return { actor, trusted, lead, contactId, companyId, intakeKey, reviewKey, editKey, stageKey, reviewId: view.reviewId,
    intakeId: (await db.query<{ id: string }>("select id from lead_intakes where workspace_id=$1 and lead_id=$2",
      [actor.workspaceId, submitted.leadId])).rows[0].id, staged };
}
async function reconciliationFixture(db: Pool | PoolClient, actor: Awaited<ReturnType<typeof actorFixture>>, lead: { id: string; version: number; updated_at: Date }) {
  const runId = (await db.query<{ id: string }>(`insert into lead_vnext_reconciliation_runs(workspace_id,source_cutoff_at,
    source_cutoff_id,operation_id,created_by_membership_id) select l.workspace_id,l.updated_at,l.id,$3,$4 from leads l
    where l.workspace_id=$1 and l.id=$2 returning id`,
  [actor.workspaceId, lead.id, randomUUID(), actor.membershipId])).rows[0].id;
  await db.query("update lead_vnext_reconciliation_runs set state='running',started_at=now(),version=2 where id=$1", [runId]);
  await db.query("insert into lead_authority_states(workspace_id,governing_operation_id) values($1,$2)", [actor.workspaceId, randomUUID()]);
  await db.query("update lead_authority_states set migration_state='shadow',version=2,governing_operation_id=$2 where workspace_id=$1", [actor.workspaceId, randomUUID()]);
  await db.query("update lead_authority_states set migration_state='reconciling',version=3,governing_operation_id=$2 where workspace_id=$1", [actor.workspaceId, randomUUID()]);
  for (const stream of STREAMS) await db.query(`insert into lead_vnext_reconciliation_checkpoints(workspace_id,run_id,
    stream,last_sort_at,last_id,processed_count) select l.workspace_id,$2,$3,l.updated_at,l.id,1 from leads l
    where l.workspace_id=$1 and l.id=$4`, [actor.workspaceId, runId, stream, lead.id]);
  await db.query(`insert into lead_vnext_mappings(workspace_id,lead_id,source_version,verified_source_version,state,
    reconciliation_run_id,verified_at,governing_operation_id) select l.workspace_id,l.id,l.version,l.version,
    'verified',$3,now(),$4 from leads l where l.workspace_id=$1 and l.id=$2`,
  [actor.workspaceId, lead.id, runId, randomUUID()]);
  await db.query(`update lead_vnext_reconciliation_runs set state='complete',leads_scanned=1,leads_verified=1,
    completed_at=now(),version=3 where id=$1`, [runId]);
  return runId;
}

async function readiness(db: Pool | PoolClient, workspaceId: string, runId: string,
  projectionMutation?: InventoryGroup): Promise<{ ready: boolean; reasons: string[] }> {
  const reasons = new Set<string>();
  const run = (await db.query(`select *,source_cutoff_at::text source_cutoff_at_exact from lead_vnext_reconciliation_runs
    where workspace_id=$1 and id=$2`, [workspaceId, runId])).rows[0];
  if (!run || run.contract_version !== "lead-vnext-reconciliation.v1" || run.state !== "complete" || !run.started_at || !run.completed_at)
    return { ready: false, reasons: ["run_incomplete"] };
  const authority = (await db.query(`select * from lead_authority_states where workspace_id=$1`, [workspaceId])).rows[0];
  if (!authority || authority.active_writer !== "p1a" || !["reconciling", "ready"].includes(authority.migration_state)
    || authority.switched_at || authority.switched_by_membership_id) reasons.add("authority_invalid");
  if (Number(run.leads_scanned) !== Number(run.leads_verified) || Number(run.leads_stale) !== 0 || Number(run.leads_blocked) !== 0
    || Number(run.issues_opened) !== Number(run.issues_resolved)) reasons.add("run_counts_invalid");
  const cutoff = (await db.query<{ count: number; max_updated_at: Date | null; max_id: string | null }>(`select count(*)::int count,
    (array_agg(updated_at order by updated_at desc,id desc))[1] max_updated_at,
    (array_agg(id order by updated_at desc,id desc))[1] max_id from leads where workspace_id=$1
    and (updated_at,id)<=($2,$3)`, [workspaceId, run.source_cutoff_at_exact, run.source_cutoff_id])).rows[0];
  const checkpoints = (await db.query(`select * from lead_vnext_reconciliation_checkpoints where workspace_id=$1 and run_id=$2`, [workspaceId, runId])).rows;
  if (checkpoints.length !== 6 || checkpoints.some((row) => Number(row.processed_count) !== cutoff.count
    || (cutoff.count === 0 ? row.last_sort_at || row.last_id : row.last_sort_at.getTime() !== cutoff.max_updated_at!.getTime() || row.last_id !== cutoff.max_id)))
    reasons.add("checkpoint_invalid");
  const issueByStream = new Map((await db.query<{ stream: string; count: number }>(`select stream,count(*)::int count
    from lead_vnext_reconciliation_issues where workspace_id=$1 and run_id=$2 group by stream`, [workspaceId, runId])).rows
    .map((row) => [row.stream, row.count]));
  if (checkpoints.some((row) => Number(row.issue_count) !== (issueByStream.get(row.stream) ?? 0))) reasons.add("checkpoint_issue_count_invalid");
  const mappings = (await db.query(`select m.*,l.version current_version from lead_vnext_mappings m join leads l
    on l.workspace_id=m.workspace_id and l.id=m.lead_id where m.workspace_id=$1 and m.reconciliation_run_id=$2`, [workspaceId, runId])).rows;
  if (mappings.length !== cutoff.count || mappings.some((row) => row.state !== "verified" || !row.verified_at || Number(row.issue_count) !== 0
    || row.source_version !== row.verified_source_version || row.source_version !== row.current_version)) reasons.add("mapping_invalid");
  const issueCounts = (await db.query<{ blocking: number; opened: number }>(`select count(*) filter(where state in ('open','waived'))::int blocking,
    count(*)::int opened from lead_vnext_reconciliation_issues where workspace_id=$1 and run_id=$2`, [workspaceId, runId])).rows[0];
  if (issueCounts.blocking > 0) reasons.add("blocking_issue");
  if (issueCounts.opened !== Number(run.issues_opened)) reasons.add("issue_counts_invalid");
  const missing = (await db.query<{ count: number }>(`select count(*)::int count from leads l left join lead_vnext_mappings m
    on m.workspace_id=l.workspace_id and m.lead_id=l.id and m.reconciliation_run_id=$4 where l.workspace_id=$1
    and (l.updated_at,l.id)<=($2,$3) and (m.lead_id is null or m.state<>'verified' or m.source_version<>l.version)`,
  [workspaceId, run.source_cutoff_at_exact, run.source_cutoff_id, runId])).rows[0].count;
  const drift = (await db.query<{ count: number }>(`select count(*)::int count from leads where workspace_id=$1
    and ((updated_at,id)>($2,$3) or authority_contract_version<>'p1a-lead-v1')`,
  [workspaceId, run.source_cutoff_at_exact, run.source_cutoff_id])).rows[0].count;
  if (missing !== 0) reasons.add("mapping_coverage_invalid");
  if (drift !== 0) reasons.add("source_drift");

  const cutoffLeads = (await db.query<{ id: string }>(`select id from leads where workspace_id=$1 and
    (updated_at,id)<=($2,$3) order by updated_at,id`, [workspaceId, run.source_cutoff_at_exact, run.source_cutoff_id])).rows;
  const parityKey = randomBytes(32);
  for (const item of cutoffLeads) {
    const inventory = await loadInventory(db, workspaceId, item.id), lead = inventory.lead[0];
    if (!lead || lead.authority_contract_version && lead.authority_contract_version !== "p1a-lead-v1") reasons.add("root_contract_invalid");
    if (inventory.intakes.length !== 1 || inventory.intakes[0].state !== "committed") reasons.add("intake_cardinality_invalid");
    if (inventory.intakes.some((row) => row.operation !== "lead-inquiry-intake.v1"
      || row.contract_version !== "lead-inquiry-intake.v1"))
      reasons.add("intake_registry_invalid");
    const lineageVersions = new Set([lead.normalization_version, ...inventory.intakes.map((row) => row.normalization_version),
      ...inventory.candidates.map((row) => row.normalization_version), ...inventory.decisions.map((row) => row.normalization_version)]
      .filter((value): value is string => typeof value === "string"));
    if (lineageVersions.size !== 1 || [...lineageVersions].some((version) => !["p1a-identity-v1", CURRENT_IDENTITY_NORMALIZATION].includes(version)))
      reasons.add("identity_normalization_invalid");
    const pendingReviews = inventory.reviews.filter((row) => row.state === "pending");
    if (pendingReviews.length > 1) reasons.add("review_lineage_invalid");
    if (inventory.reviews.some((row) => row.state === "pending" ? row.resolved_at || row.resolved_by_membership_id
      : row.state === "resolved" ? !row.resolved_at || !row.resolved_by_membership_id : false)) reasons.add("review_lineage_invalid");
    if (pendingReviews.some((review) => inventory.decisions.some((decision) => decision.review_id === review.id)))
      reasons.add("review_lineage_invalid");
    if (inventory.decisions.length > 0 && inventory.heads.length !== 1) reasons.add("review_lineage_invalid");
    if (inventory.heads.some((head) => !inventory.decisions.some((decision) => decision.id === head.decision_id)))
      reasons.add("review_lineage_invalid");
    for (const candidate of inventory.candidates) {
      const target = candidate.contact_id ? inventory.contacts.find((row) => row.id === candidate.contact_id)
        : inventory.companies.find((row) => row.id === candidate.company_id);
      if (!target || Number(target.version) !== Number(candidate.target_version)) reasons.add("candidate_version_invalid");
    }
    if (lead.visibility === "workspace" && inventory.visibleTeams.length !== 0) reasons.add("visibility_invalid");
    if (lead.visibility === "teams" && (inventory.visibleTeams.length < 1 || inventory.visibleTeams.length > 100
      || lead.responsible_team_id && !inventory.visibleTeams.some((row) => row.team_id === lead.responsible_team_id)))
      reasons.add("visibility_invalid");
    if (lead.owner_membership_id) {
      const assignment = (await db.query(`select m.id from workspace_memberships m join users u on u.id=m.user_id
        where m.workspace_id=$1 and m.id=$2 and m.status='active' and u.status='active'`, [workspaceId, lead.owner_membership_id])).rows;
      if (assignment.length !== 1) reasons.add("assignment_invalid");
    }
    if (lead.responsible_team_id && !(await db.query(`select 1 from teams where workspace_id=$1 and id=$2 and status='active'`,
      [workspaceId, lead.responsible_team_id])).rowCount) reasons.add("assignment_invalid");
    if (lead.lifecycle_definition_id && (inventory.lifecycle.length !== 1 || inventory.lifecycle[0].status !== "active"
      || inventory.lifecycle[0].contract_version !== "p1a-lifecycle-v1")) reasons.add("lifecycle_invalid");
    if (!lead.lifecycle_definition_id) reasons.add("lifecycle_invalid");
    if (inventory.stage.length !== 1 || inventory.stage[0].status !== "active") reasons.add("stage_invalid");
    if (lead.contact_id && (inventory.contacts.length !== 1 || inventory.contacts[0]?.status !== "active")
      || lead.company_id && (inventory.companies.length !== 1 || inventory.companies[0]?.status !== "active"))
      reasons.add("linked_record_invalid");
    if (!inventory.history.some((row) => row.kind === "created")) reasons.add("history_invalid");
    const evidence = [{ action: "crm.lead_operational_updated", topic: "crm.lead.operational_updated.v1", kind: "updated", operation: "lead-operational-edit.v1" },
      { action: "crm.lead_stage_transitioned", topic: "crm.lead.stage_transitioned.v1", kind: "stage_changed", operation: "lead-stage-transition.v1" }];
    for (const expected of evidence) {
      const audits = inventory.audits.filter((row) => row.action === expected.action && row.outcome === "success");
      const outbox = inventory.outbox.filter((row) => row.topic === expected.topic && row.aggregate_id === item.id);
      const activities = inventory.history.filter((row) => row.kind === expected.kind);
      const receipts = inventory.receipts.filter((row) => row.operation === expected.operation);
      if (audits.length !== 1 || outbox.length !== 1 || activities.length !== 1 || receipts.length !== 1)
        reasons.add("evidence_cardinality_invalid");
    }
    if (!parityEqual(parityKey, sourceProjection(inventory), vnextProjection(inventory, projectionMutation)))
      reasons.add(`parity_${projectionMutation ?? "unknown"}_invalid`);
  }
  return { ready: reasons.size === 0, reasons: [...reasons].sort() };
}

integrationSuite("DB-06B Lead vNext no-DDL integrity", () => {
  beforeAll(async () => { expect(isIsolatedLocalDatabase).toBe(true); await pool.query("select 1"); });
  beforeEach(async () => { if (!isIsolatedLocalDatabase) throw new Error("unsafe_database_target"); await pool.query("truncate users cascade"); });
  afterAll(async () => { await pool.end(); });

  it("freezes the source inventory and excludes only dormant DB-06A metadata from semantic parity", async () => {
    const leadColumns = (await pool.query<{ column_name: string }>(`select column_name from information_schema.columns
      where table_schema='public' and table_name='leads' order by ordinal_position`)).rows.map((row) => row.column_name);
    for (const column of LEAD_SOURCE_COLUMNS) expect(leadColumns).toContain(column);
    expect(leadColumns.filter((column) => !LEAD_SOURCE_COLUMNS.includes(column as typeof LEAD_SOURCE_COLUMNS[number]))).toEqual([
      "authority_contract_version", "governing_operation_id", "created_by_membership_id", "updated_by_membership_id",
    ]);
    const intakeColumns = (await pool.query<{ column_name: string }>(`select column_name from information_schema.columns
      where table_schema='public' and table_name='lead_intakes' order by ordinal_position`)).rows.map((row) => row.column_name);
    expect(intakeColumns).toEqual([...INTAKE_SOURCE_COLUMNS]);
    expect(Object.keys(ISSUE_SAFE_CODES).sort()).toEqual([
      "assignment_unavailable", "authority_conflict", "evidence_cardinality_mismatch", "history_gap",
      "identity_review_lineage_invalid", "lifecycle_definition_unavailable", "lifecycle_status_ambiguous",
      "linked_record_workspace_mismatch", "missing_intake", "multiple_intakes", "source_version_changed",
      "stage_unavailable", "unsupported_legacy_row", "visibility_invalid",
    ]);
  });

  it("uses typed collision-safe encoding and independently projects every frozen inventory group", async () => {
    const key = randomBytes(32), uuid = randomUUID();
    expect(encodeCanonical(S(uuid))).not.toBe(encodeCanonical(U(uuid)));
    expect(encodeCanonical(S("1"))).not.toBe(encodeCanonical(I(1)));
    expect(() => I(1.5)).toThrow("safe_integer_required");
    expect(() => encodeCanonical(1.5 as unknown as Canonical)).toThrow("untyped_canonical_value");
    expect(encodeCanonical({ b: I(1), a: S("é") })).toBe("O2{S1:aS2:éS1:bI1:1}");
    const fixture = await acceptedLeadFixture(), inventory = await loadInventory(pool, fixture.actor.workspaceId, fixture.lead.id);
    for (const group of GROUPS) expect(inventory[group].length, group).toBeGreaterThan(0);
    expect(inventory.intakes[0]).toMatchObject({ operation: "lead-inquiry-intake.v1",
      contract_version: "lead-inquiry-intake.v1", normalization_version: CURRENT_IDENTITY_NORMALIZATION });
    expect(inventory.lead[0].normalization_version).toBe(CURRENT_IDENTITY_NORMALIZATION);
    expect(parityEqual(key, sourceProjection(inventory), vnextProjection(inventory))).toBe(true);
    for (const group of GROUPS)
      expect(parityEqual(key, sourceProjection(inventory), vnextProjection(inventory, group)), group).toBe(false);
    const persisted = await pool.query(`select count(*)::int count from information_schema.columns where table_schema='public'
      and column_name ~ '(hmac|parity_hash|digest)'`); expect(persisted.rows[0].count).toBe(0);
  });

  it("uses the frozen Lead tuple barrier, bounded cursor and source-version re-read semantics", async () => {
    const actor = await actorFixture(), equalTime = new Date("2026-08-26T10:00:00.000Z");
    for (let index = 0; index < 100; index += 1) await leadFixture(pool, actor, equalTime);
    const cutoff = (await pool.query<{ id: string; updated_at: Date }>(`select id,updated_at from leads where workspace_id=$1
      order by updated_at desc,id desc limit 1`, [actor.workspaceId])).rows[0];
    const traversed = new Map<string, { id: string; updated_at: Date; version: number }>();
    let cursorTime = new Date(0), cursorId = "00000000-0000-0000-0000-000000000000";
    while (true) {
      const rows = (await pool.query<{ id: string; updated_at: Date; version: number }>(`select id,updated_at,version from leads
        where workspace_id=$1 and (updated_at,id)>($2,$3) and (updated_at,id)<=($4,$5)
        order by updated_at,id limit 18`, [actor.workspaceId, cursorTime, cursorId, cutoff.updated_at, cutoff.id])).rows;
      const page = rows.slice(0, 17); for (const row of page) { expect(traversed.has(row.id)).toBe(false); traversed.set(row.id, row); }
      if (rows.length <= 17) break; cursorTime = page.at(-1)!.updated_at; cursorId = page.at(-1)!.id;
    }
    expect(traversed.size).toBe(100);
    const raced = [...traversed.values()][0]; await pool.query("update leads set display_name='Changed',version=version+1 where id=$1", [raced.id]);
    const reread = (await pool.query<{ version: number }>("select version from leads where workspace_id=$1 and id=$2", [actor.workspaceId, raced.id])).rows[0];
    expect(reread.version).toBe(raced.version + 1);
  });

  it("derives readiness from persisted complete source and rejects independent persisted defects", async () => {
    const fixture = await acceptedLeadFixture(), runId = await reconciliationFixture(pool, fixture.actor, fixture.lead);
    expect(await readiness(pool, fixture.actor.workspaceId, runId)).toEqual({ ready: true, reasons: [] });
    const legacy = await pool.connect();
    try {
      await legacy.query("begin"); await legacy.query("set local session_replication_role=replica");
      await legacy.query("update leads set normalization_version='p1a-identity-v1' where id=$1", [fixture.lead.id]);
      await legacy.query("update lead_intakes set normalization_version='p1a-identity-v1' where lead_id=$1", [fixture.lead.id]);
      await legacy.query(`update lead_identity_candidates set normalization_version='p1a-identity-v1' where workspace_id=$1
        and review_id in(select id from lead_identity_reviews where lead_id=$2)`, [fixture.actor.workspaceId, fixture.lead.id]);
      await legacy.query(`update lead_identity_decisions set normalization_version='p1a-identity-v1' where workspace_id=$1
        and review_id in(select id from lead_identity_reviews where lead_id=$2)`, [fixture.actor.workspaceId, fixture.lead.id]);
      expect(await readiness(legacy, fixture.actor.workspaceId, runId)).toEqual({ ready: true, reasons: [] });
      await legacy.query("rollback");
    } finally { legacy.release(); }
    const defect = async (sql: string, params: unknown[], reason: string) => {
      const client = await pool.connect();
      try {
        await client.query("begin"); await client.query("set local session_replication_role=replica");
        await client.query(sql, params); const result = await readiness(client, fixture.actor.workspaceId, runId);
        expect(result.ready, `${reason}:${result.reasons.join(",")}`).toBe(false); expect(result.reasons).toContain(reason);
        await client.query("rollback");
      } finally { client.release(); }
    };
    await defect("update lead_vnext_reconciliation_runs set state='running',completed_at=null where id=$1", [runId], "run_incomplete");
    await defect("update lead_vnext_reconciliation_runs set leads_verified=0 where id=$1", [runId], "run_counts_invalid");
    await defect("delete from lead_vnext_reconciliation_checkpoints where run_id=$1 and stream='visibility'", [runId], "checkpoint_invalid");
    await defect("update lead_vnext_reconciliation_checkpoints set issue_count=1 where run_id=$1 and stream='lead_root'", [runId], "checkpoint_issue_count_invalid");
    await defect("delete from lead_vnext_mappings where workspace_id=$1 and lead_id=$2", [fixture.actor.workspaceId, fixture.lead.id], "mapping_coverage_invalid");
    await defect(`update lead_vnext_mappings set state='pending',verified_source_version=null,verified_at=null
      where workspace_id=$1 and lead_id=$2`, [fixture.actor.workspaceId, fixture.lead.id], "mapping_invalid");
    await defect(`update lead_vnext_mappings set state='stale',verified_source_version=null
      where workspace_id=$1 and lead_id=$2`, [fixture.actor.workspaceId, fixture.lead.id], "mapping_invalid");
    await defect(`update lead_vnext_mappings set state='blocked',issue_count=1
      where workspace_id=$1 and lead_id=$2`, [fixture.actor.workspaceId, fixture.lead.id], "mapping_invalid");
    await defect(`insert into lead_vnext_reconciliation_issues(workspace_id,run_id,stream,source_record_type,
      source_record_id,issue_code,observed_version,safe_code) values($1,$2,'lead_root','lead',$3,
      'source_version_changed',$4,'version_changed')`, [fixture.actor.workspaceId, runId, fixture.lead.id, fixture.lead.version], "blocking_issue");
    await defect(`insert into lead_vnext_reconciliation_issues(workspace_id,run_id,stream,source_record_type,
      source_record_id,issue_code,observed_version,safe_code,state,resolution_code,resolved_at,resolved_by_membership_id)
      values($1,$2,'lead_root','lead',$3,'missing_intake',$4,'missing','waived','operator_waiver',now(),$5)`,
    [fixture.actor.workspaceId, runId, fixture.lead.id, fixture.lead.version, fixture.actor.membershipId], "blocking_issue");
    await defect("delete from lead_authority_states where workspace_id=$1", [fixture.actor.workspaceId], "authority_invalid");
    await defect("update lead_authority_states set migration_state='dormant' where workspace_id=$1", [fixture.actor.workspaceId], "authority_invalid");
    await defect(`update lead_authority_states set active_writer='vnext',migration_state='observing',cutover_run_id=$2,
      switched_at=now(),switched_by_membership_id=$3 where workspace_id=$1`,
    [fixture.actor.workspaceId, runId, fixture.actor.membershipId], "authority_invalid");
    await defect("update leads set authority_contract_version='lead-vnext-v1',governing_operation_id=$2 where id=$1",
      [fixture.lead.id, randomUUID()], "source_drift");
    await defect("delete from lead_intakes where workspace_id=$1 and lead_id=$2", [fixture.actor.workspaceId, fixture.lead.id], "intake_cardinality_invalid");
    await defect("update lead_intakes set normalization_version='p1a-identity-v1' where lead_id=$1", [fixture.lead.id], "identity_normalization_invalid");
    await defect("update leads set normalization_version='p1a-identity-v3' where id=$1", [fixture.lead.id], "identity_normalization_invalid");
    await defect(`insert into lead_vnext_reconciliation_issues(workspace_id,run_id,stream,source_record_type,
      source_record_id,issue_code,observed_version,safe_code) values($1,$2,'lead_root','lead',$3,
      'unsupported_legacy_row',$4,'unsupported_identity_normalization_version')`,
    [fixture.actor.workspaceId, runId, fixture.lead.id, fixture.lead.version], "blocking_issue");
    await defect("delete from lead_identity_decision_heads where workspace_id=$1 and intake_id=$2", [fixture.actor.workspaceId, fixture.intakeId], "review_lineage_invalid");
    await defect("update lead_identity_reviews set state='pending',resolved_at=null,resolved_by_membership_id=null where workspace_id=$1 and id=$2",
      [fixture.actor.workspaceId, fixture.reviewId], "review_lineage_invalid");
    await defect("update lead_identity_candidates set target_version=target_version+1 where workspace_id=$1", [fixture.actor.workspaceId], "candidate_version_invalid");
    await defect("delete from lead_visible_teams where workspace_id=$1 and lead_id=$2", [fixture.actor.workspaceId, fixture.lead.id], "visibility_invalid");
    await defect("update workspace_memberships set status='suspended' where id=$1", [fixture.actor.membershipId], "assignment_invalid");
    await defect("update pipeline_stages set status='archived' where id=$1", [fixture.actor.secondStageId], "stage_invalid");
    await defect("delete from pipeline_stages where id=$1", [fixture.actor.secondStageId], "stage_invalid");
    await defect("update lead_lifecycle_definitions set status='archived' where id=(select lifecycle_definition_id from leads where id=$1)",
      [fixture.lead.id], "lifecycle_invalid");
    await defect("delete from lead_lifecycle_definitions where id=(select lifecycle_definition_id from leads where id=$1)",
      [fixture.lead.id], "lifecycle_invalid");
    await defect("update contacts set status='archived' where id=$1", [fixture.contactId], "linked_record_invalid");
    await defect(`with foreign_workspace as (insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
      values('Foreign DB06B',$2,'active','growth','monthly',$3) returning id)
      update contacts set workspace_id=(select id from foreign_workspace) where id=$1`,
    [fixture.contactId, `foreign-${randomUUID()}`, fixture.actor.userId], "linked_record_invalid");
    await defect("delete from lead_activities where workspace_id=$1 and lead_id=$2 and kind='created'", [fixture.actor.workspaceId, fixture.lead.id], "history_invalid");
    await defect("delete from audit_events where workspace_id=$1 and target_id=$2 and action='crm.lead_operational_updated'",
      [fixture.actor.workspaceId, fixture.lead.id], "evidence_cardinality_invalid");
    await defect("delete from outbox_messages where workspace_id=$1 and aggregate_id=$2 and topic='crm.lead.stage_transitioned.v1'",
      [fixture.actor.workspaceId, fixture.lead.id], "evidence_cardinality_invalid");
    await defect("delete from idempotency_records where operation='lead-operational-edit.v1'", [], "evidence_cardinality_invalid");
    await defect("update leads set updated_at=updated_at+interval '1 second' where id=$1", [fixture.lead.id], "source_drift");
    await defect(`insert into leads(workspace_id,display_name,person_name_normalized,email_display,email_normalized,source,
      original_source_category,original_source_medium,original_source_detail,original_campaign_context,
      attribution_contract_version,intake_channel,stage_id,status,visibility,updated_at)
      select workspace_id,'Post Cutoff','post cutoff',$2,$2,'manual','manual','unknown','{}','{}','p1a-attribution-v1',
      'manual',stage_id,'open','workspace',updated_at+interval '1 day' from leads where id=$1`,
    [fixture.lead.id, `post-${randomUUID()}@example.test`], "source_drift");
    for (const group of GROUPS) {
      const result = await readiness(pool, fixture.actor.workspaceId, runId, group);
      expect(result.ready).toBe(false); expect(result.reasons).toContain(`parity_${group}_invalid`);
    }
    const duplicate = await pool.query("select * from lead_intakes where workspace_id=$1 and lead_id=$2",
      [fixture.actor.workspaceId, fixture.lead.id]);
    await expect(pool.query(`insert into lead_intakes(${INTAKE_SOURCE_COLUMNS.join(",")}) select gen_random_uuid(),
      workspace_id,operation,intake_channel,$3,actor_membership_id,request_hash,contract_version,normalization_version,
      attribution_contract_version,source_category,source_platform,source_medium,source_detail,campaign_context,state,
      lead_id,outcome,version,created_at,updated_at from lead_intakes where workspace_id=$1 and lead_id=$2`,
    [fixture.actor.workspaceId, fixture.lead.id, `duplicate-${randomUUID()}`])).rejects.toThrow();
    expect(duplicate.rowCount).toBe(1);
  });

  it("serializes same-stream workers without locking the Lead and records one stale replay", async () => {
    const fixture = await acceptedLeadFixture(), { actor, lead } = fixture, runId = (await pool.query<{ id: string }>(
      `insert into lead_vnext_reconciliation_runs(workspace_id,source_cutoff_at,source_cutoff_id,operation_id,
       created_by_membership_id) values($1,$2,$3,$4,$5) returning id`,
      [actor.workspaceId, lead.updated_at, lead.id, randomUUID(), actor.membershipId])).rows[0].id;
    await pool.query("update lead_vnext_reconciliation_runs set state='running',started_at=now(),version=2 where id=$1", [runId]);
    await pool.query("insert into lead_vnext_reconciliation_checkpoints(workspace_id,run_id,stream) values($1,$2,'lead_root')", [actor.workspaceId, runId]);
    const worker = await pool.connect();
    try {
      await worker.query("begin"); await worker.query("select id from lead_vnext_reconciliation_runs where id=$1 for update", [runId]);
      await worker.query("select stream from lead_vnext_reconciliation_checkpoints where workspace_id=$1 and run_id=$2 and stream='lead_root' for update", [actor.workspaceId, runId]);
      const observed = (await worker.query<{ version: number }>("select version from leads where workspace_id=$1 and id=$2", [actor.workspaceId, lead.id])).rows[0].version;
      const commandStarted = performance.now(); await editLeadOperationalV1(pool, { actor: fixture.trusted, leadId: lead.id,
        idempotencyKey: `db06b-race-edit-${randomUUID()}`, command: { contractVersion: "lead-operational-edit.v1",
          expectedVersion: observed, responsibleMembershipId: null, responsibleTeamId: null, visibility: "workspace", visibleTeamIds: [] } });
      expect(performance.now() - commandStarted).toBeLessThan(2_000);
      const current = (await worker.query<{ version: number }>("select version from leads where workspace_id=$1 and id=$2", [actor.workspaceId, lead.id])).rows[0].version;
      await worker.query(`insert into lead_vnext_mappings(workspace_id,lead_id,source_version,state,reconciliation_run_id,
        governing_operation_id) values($1,$2,$3,'stale',$4,$5)`, [actor.workspaceId, lead.id, current, runId, randomUUID()]);
      await worker.query(`insert into lead_vnext_reconciliation_issues(workspace_id,run_id,stream,source_record_type,
        source_record_id,issue_code,expected_version,observed_version,safe_code)
        values($1,$2,'lead_root','lead',$3,'source_version_changed',$4,$5,'version_changed') on conflict do nothing`,
      [actor.workspaceId, runId, lead.id, observed, current]);
      await worker.query(`update lead_vnext_reconciliation_checkpoints set last_sort_at=$4,last_id=$3,processed_count=1,
        issue_count=1,version=2 where workspace_id=$1 and run_id=$2 and stream='lead_root'`, [actor.workspaceId, runId, lead.id, lead.updated_at]);
      await worker.query("update lead_vnext_reconciliation_runs set leads_scanned=1,leads_stale=1,issues_opened=1,version=3 where id=$1", [runId]);
      await worker.query("commit");
    } catch (error) { await worker.query("rollback"); throw error; } finally { worker.release(); }
    expect((await pool.query("select count(*)::int count from lead_vnext_reconciliation_issues where run_id=$1", [runId])).rows[0].count).toBe(1);
    expect((await pool.query("select owner_membership_id from leads where id=$1", [lead.id])).rows[0].owner_membership_id).toBeNull();
  });

  it("detects accepted intake, Identity Review, edit and stage command races plus same-stage replay", async () => {
    const waitForLock = async () => {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        if ((await pool.query(`select 1 from pg_stat_activity where datname=current_database() and
          pid<>pg_backend_pid() and wait_event_type='Lock' and query ilike '%leads%'`)).rowCount) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("accepted command did not reach the Lead lock");
    };
    const intakeActor = await actorFixture(), cutoff = new Date(Date.now() - 1000);
    await submitLeadInquiryV1(pool, { actor: intakeActor, idempotencyKey: `db06b-race-intake-${randomUUID()}`,
      command: { contractVersion: "lead-inquiry-intake.v1", intakeChannel: "manual",
        person: { displayName: "Post Cutoff", email: `post-${randomUUID()}@example.test` },
        organization: { name: "Post Cutoff Company" }, inquiry: { receivedAt: new Date().toISOString() },
        source: { sourceCategory: "manual", sourceMedium: "unknown", sourceDetail: {}, campaignContext: {},
          attributionContractVersion: "p1a-attribution-v1" } } });
    expect((await pool.query("select count(*)::int count from leads where workspace_id=$1 and updated_at>$2",
      [intakeActor.workspaceId, cutoff])).rows[0].count).toBe(1);

    for (const operation of ["stage", "review"] as const) {
      await pool.query("truncate users cascade");
      if (operation === "stage") {
        const fixture = await acceptedLeadFixture(), blocker = await pool.connect();
        try {
          await blocker.query("begin"); await blocker.query("select id from leads where id=$1 for update", [fixture.lead.id]);
          const observed = fixture.lead.version;
          const pending = transitionLeadStageV1(pool, { actor: fixture.trusted, leadId: fixture.lead.id,
            idempotencyKey: `db06b-race-stage-${randomUUID()}`, command: { contractVersion: "lead-stage-transition.v1",
              expectedVersion: observed, targetStageId: fixture.actor.stageId } });
          await waitForLock(); await blocker.query("commit"); await pending;
          expect((await pool.query("select version from leads where id=$1", [fixture.lead.id])).rows[0].version).toBe(observed + 1);
        } finally { await blocker.query("rollback").catch(() => undefined); blocker.release(); }
      } else {
        const actor = await actorFixture(), email = `review-race-${randomUUID()}@example.test`;
        await pool.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
          values($1,'Review Race','review race',$2,$2)`, [actor.workspaceId, email]);
        const held = await submitLeadInquiryV1(pool, { actor, idempotencyKey: `db06b-review-intake-${randomUUID()}`,
          command: { contractVersion: "lead-inquiry-intake.v1", intakeChannel: "manual",
            person: { displayName: "Review Race", email }, organization: { name: "Review Race" },
            inquiry: { receivedAt: new Date().toISOString() }, source: { sourceCategory: "manual", sourceMedium: "unknown",
              sourceDetail: {}, campaignContext: {}, attributionContractVersion: "p1a-attribution-v1" } } });
        const view = await getIdentityReviewCandidatesV1(pool, actor, held.leadId), blocker = await pool.connect();
        try {
          await blocker.query("begin"); await blocker.query("select id from leads where id=$1 for update", [held.leadId]);
          const pending = decideLeadIdentityReviewV1(pool, { actor, leadId: held.leadId,
            idempotencyKey: `db06b-race-review-${randomUUID()}`, command: { contractVersion: "lead-identity-review-decision.v1",
              outcome: "resolve", expectedLeadVersion: view.leadVersion, expectedReviewVersion: view.reviewVersion,
              expectedIntakeVersion: view.intakeVersion, contact: { action: "dismiss" }, company: { action: "dismiss" } } });
          await waitForLock(); await blocker.query("commit"); await pending;
          expect((await pool.query("select version from leads where id=$1", [held.leadId])).rows[0].version).toBe(view.leadVersion + 1);
        } finally { await blocker.query("rollback").catch(() => undefined); blocker.release(); }
      }
    }
    await pool.query("truncate users cascade");
    const same = await acceptedLeadFixture(), before = (await pool.query(`select version,
      (select count(*) from lead_activities where lead_id=$1) activities,
      (select count(*) from audit_events where target_id=$1) audits,
      (select count(*) from outbox_messages where aggregate_id=$1) outbox from leads where id=$1`, [same.lead.id])).rows[0];
    const receiptsBefore = Number((await pool.query(`select count(*) count from idempotency_records
      where operation='lead-stage-transition.v1' and outcome->>'leadId'=$1`, [same.lead.id])).rows[0].count);
    const key = `db06b-same-stage-${randomUUID()}`, command = { contractVersion: "lead-stage-transition.v1" as const,
      expectedVersion: same.lead.version, targetStageId: same.actor.secondStageId };
    const first = await transitionLeadStageV1(pool, { actor: same.trusted, leadId: same.lead.id, idempotencyKey: key, command });
    const replay = await transitionLeadStageV1(pool, { actor: same.trusted, leadId: same.lead.id, idempotencyKey: key, command });
    expect(first.changed).toBe(false); expect(replay.replayed).toBe(true);
    const after = (await pool.query(`select version,(select count(*) from lead_activities where lead_id=$1) activities,
      (select count(*) from audit_events where target_id=$1) audits,
      (select count(*) from outbox_messages where aggregate_id=$1) outbox from leads where id=$1`, [same.lead.id])).rows[0];
    expect(after).toEqual(before);
    expect(Number((await pool.query(`select count(*) count from idempotency_records where operation='lead-stage-transition.v1'
      and outcome->>'leadId'=$1`, [same.lead.id])).rows[0].count)).toBe(receiptsBefore + 1);
  });

  it("rolls back every batch boundary and retains old-run evidence during fall-forward", async () => {
    for (const failureAt of ["mapping", "issue", "checkpoint", "run"] as const) {
      await pool.query("truncate users cascade"); const actor = await actorFixture(), lead = await leadFixture(pool, actor);
      const runId = (await pool.query<{ id: string }>(`insert into lead_vnext_reconciliation_runs(workspace_id,source_cutoff_at,
        source_cutoff_id,operation_id,created_by_membership_id) values($1,$2,$3,$4,$5) returning id`,
      [actor.workspaceId, lead.updated_at, lead.id, randomUUID(), actor.membershipId])).rows[0].id;
      await pool.query("update lead_vnext_reconciliation_runs set state='running',started_at=now(),version=2 where id=$1", [runId]);
      await pool.query("insert into lead_vnext_reconciliation_checkpoints(workspace_id,run_id,stream) values($1,$2,'lead_root')", [actor.workspaceId, runId]);
      const beforeLead = (await pool.query("select * from leads where id=$1", [lead.id])).rows[0], client = await pool.connect();
      try {
        await client.query("begin"); await client.query("select id from lead_vnext_reconciliation_runs where id=$1 for update", [runId]);
        await client.query("select stream from lead_vnext_reconciliation_checkpoints where run_id=$1 for update", [runId]);
        await client.query(`insert into lead_vnext_mappings(workspace_id,lead_id,source_version,state,reconciliation_run_id,
          governing_operation_id) values($1,$2,1,'blocked',$3,$4)`, [actor.workspaceId, lead.id, runId, randomUUID()]);
        if (failureAt === "mapping") throw new Error("injected_mapping");
        await client.query(`insert into lead_vnext_reconciliation_issues(workspace_id,run_id,stream,source_record_type,
          source_record_id,issue_code,observed_version,safe_code) values($1,$2,'lead_root','lead',$3,'missing_intake',1,'missing')`,
        [actor.workspaceId, runId, lead.id]); if (failureAt === "issue") throw new Error("injected_issue");
        await client.query(`update lead_vnext_reconciliation_checkpoints set last_sort_at=$3,last_id=$4,processed_count=1,
          issue_count=1,version=2 where workspace_id=$1 and run_id=$2 and stream='lead_root'`, [actor.workspaceId, runId, lead.updated_at, lead.id]);
        if (failureAt === "checkpoint") throw new Error("injected_checkpoint");
        await client.query("update lead_vnext_reconciliation_runs set leads_scanned=1,leads_blocked=1,issues_opened=1,version=3 where id=$1", [runId]);
        throw new Error("injected_run");
      } catch { await client.query("rollback"); } finally { client.release(); }
      expect((await pool.query("select count(*)::int count from lead_vnext_mappings where lead_id=$1", [lead.id])).rows[0].count).toBe(0);
      expect((await pool.query("select count(*)::int count from lead_vnext_reconciliation_issues where run_id=$1", [runId])).rows[0].count).toBe(0);
      expect((await pool.query("select * from leads where id=$1", [lead.id])).rows[0]).toEqual(beforeLead);
    }
    await pool.query("truncate users cascade");
    const accepted = await acceptedLeadFixture(), { actor, lead } = accepted;
    const oldRun = (await pool.query<{ id: string }>(`insert into lead_vnext_reconciliation_runs(workspace_id,
      source_cutoff_at,source_cutoff_id,operation_id,created_by_membership_id) values($1,$2,$3,$4,$5) returning id`,
    [actor.workspaceId, lead.updated_at, lead.id, randomUUID(), actor.membershipId])).rows[0].id;
    await pool.query("update lead_vnext_reconciliation_runs set state='running',started_at=now(),version=2 where id=$1", [oldRun]);
    await pool.query("insert into lead_vnext_reconciliation_checkpoints(workspace_id,run_id,stream) values($1,$2,'lead_root')",
      [actor.workspaceId, oldRun]);
    const processBatch = async () => {
      const client = await pool.connect();
      try {
        await client.query("begin"); await client.query("select id from lead_vnext_reconciliation_runs where id=$1 for update", [oldRun]);
        const checkpoint = (await client.query<{ processed_count: number }>(`select processed_count from
          lead_vnext_reconciliation_checkpoints where workspace_id=$1 and run_id=$2 and stream='lead_root' for update`,
        [actor.workspaceId, oldRun])).rows[0];
        if (Number(checkpoint.processed_count) > 0) { await client.query("commit"); return false; }
        await client.query(`insert into lead_vnext_mappings(workspace_id,lead_id,source_version,verified_source_version,
          state,reconciliation_run_id,verified_at,governing_operation_id) values($1,$2,$3,$3,'verified',$4,now(),$5)`,
        [actor.workspaceId, lead.id, lead.version, oldRun, randomUUID()]);
        await client.query(`update lead_vnext_reconciliation_checkpoints set last_sort_at=$3,last_id=$4,processed_count=1,
          version=2 where workspace_id=$1 and run_id=$2 and stream='lead_root'`, [actor.workspaceId, oldRun, lead.updated_at, lead.id]);
        await client.query("update lead_vnext_reconciliation_runs set leads_scanned=1,leads_verified=1,version=3 where id=$1", [oldRun]);
        await client.query("commit"); return true;
      } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
    };
    expect(await processBatch()).toBe(true); expect(await processBatch()).toBe(false);
    expect((await pool.query("select count(*)::int count from lead_vnext_mappings where reconciliation_run_id=$1", [oldRun])).rows[0].count).toBe(1);
    const duplicateIssue = async () => {
      const inserted = await pool.query(`insert into lead_vnext_reconciliation_issues(workspace_id,run_id,stream,
        source_record_type,source_record_id,issue_code,observed_version,safe_code) values($1,$2,'lead_root','lead',$3,
        'source_version_changed',$4,'version_changed') on conflict do nothing`, [actor.workspaceId, oldRun, lead.id, lead.version]);
      if (inserted.rowCount) await pool.query(`update lead_vnext_reconciliation_checkpoints set issue_count=issue_count+1,
        version=version+1 where workspace_id=$1 and run_id=$2 and stream='lead_root'`, [actor.workspaceId, oldRun]);
    };
    await duplicateIssue(); await duplicateIssue();
    expect(Number((await pool.query("select issue_count from lead_vnext_reconciliation_checkpoints where run_id=$1", [oldRun])).rows[0].issue_count)).toBe(1);
    const newRun = (await pool.query<{ id: string }>(`insert into lead_vnext_reconciliation_runs(workspace_id,source_cutoff_at,
      source_cutoff_id,operation_id,created_by_membership_id) values($1,$2,$3,$4,$5) returning id`,
    [actor.workspaceId, lead.updated_at, lead.id, randomUUID(), actor.membershipId])).rows[0].id;
    expect(newRun).not.toBe(oldRun); expect((await pool.query("select count(*)::int count from lead_vnext_reconciliation_runs where workspace_id=$1", [actor.workspaceId])).rows[0].count).toBe(2);
    expect((await pool.query("select count(*)::int count from lead_vnext_mappings where reconciliation_run_id=$1", [oldRun])).rows[0].count).toBe(1);
  });

  it("serializes two same-stream workers and turns accepted source change into one retained stale issue", async () => {
    const fixture = await acceptedLeadFixture(), runId = (await pool.query<{ id: string }>(`insert into
      lead_vnext_reconciliation_runs(workspace_id,source_cutoff_at,source_cutoff_id,operation_id,created_by_membership_id)
      values($1,$2,$3,$4,$5) returning id`, [fixture.actor.workspaceId, fixture.lead.updated_at, fixture.lead.id,
      randomUUID(), fixture.actor.membershipId])).rows[0].id;
    await pool.query("update lead_vnext_reconciliation_runs set state='running',started_at=now(),version=2 where id=$1", [runId]);
    await pool.query("insert into lead_vnext_reconciliation_checkpoints(workspace_id,run_id,stream) values($1,$2,'lead_root')",
      [fixture.actor.workspaceId, runId]);
    const first = await pool.connect(), second = await pool.connect();
    try {
      await first.query("begin"); await first.query("select id from lead_vnext_reconciliation_runs where id=$1 for update", [runId]);
      await first.query("select stream from lead_vnext_reconciliation_checkpoints where run_id=$1 for update", [runId]);
      const secondPid = (await second.query<{ pid: number }>("select pg_backend_pid() pid")).rows[0].pid;
      await second.query("begin"); const waiting = second.query("select stream from lead_vnext_reconciliation_checkpoints where run_id=$1 for update", [runId]);
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const row = (await pool.query(`select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock'`, [secondPid])).rows[0];
        if (row) break; await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect((await pool.query(`select wait_event_type from pg_stat_activity where pid=$1`, [secondPid])).rows[0].wait_event_type).toBe("Lock");
      await first.query("commit"); await waiting; await second.query("commit");
    } finally { await first.query("rollback").catch(() => undefined); await second.query("rollback").catch(() => undefined); first.release(); second.release(); }
    const observed = fixture.lead.version;
    const changed = await editLeadOperationalV1(pool, { actor: fixture.trusted, leadId: fixture.lead.id,
      idempotencyKey: `db06b-stale-edit-${randomUUID()}`, command: { contractVersion: "lead-operational-edit.v1",
        expectedVersion: observed, responsibleMembershipId: null, responsibleTeamId: null, visibility: "workspace", visibleTeamIds: [] } });
    await pool.query(`insert into lead_vnext_mappings(workspace_id,lead_id,source_version,state,reconciliation_run_id,
      governing_operation_id) values($1,$2,$3,'stale',$4,$5)`, [fixture.actor.workspaceId, fixture.lead.id, changed.leadVersion, runId, randomUUID()]);
    for (let attempt = 0; attempt < 2; attempt += 1) await pool.query(`insert into lead_vnext_reconciliation_issues
      (workspace_id,run_id,stream,source_record_type,source_record_id,issue_code,expected_version,observed_version,safe_code)
      values($1,$2,'lead_root','lead',$3,'source_version_changed',$4,$5,'version_changed') on conflict do nothing`,
    [fixture.actor.workspaceId, runId, fixture.lead.id, observed, changed.leadVersion]);
    expect((await pool.query("select count(*)::int count from lead_vnext_reconciliation_issues where run_id=$1", [runId])).rows[0].count).toBe(1);
    expect((await pool.query("select state from lead_vnext_mappings where reconciliation_run_id=$1", [runId])).rows[0].state).toBe("stale");
  });

  it("uses the accepted Platform Audit target index for the frozen bounded lookup", async () => {
    const fixture = await acceptedLeadFixture();
    const catalog = (await pool.query<{ definition: string }>(`select pg_get_indexdef(indexrelid) definition from pg_index
      where indexrelid='audit_events_workspace_target_action_occurred_idx'::regclass`)).rows[0]?.definition;
    expect(catalog).toContain("workspace_id, target_type, target_id, action, occurred_at, id");
    expect(catalog).toContain("WHERE ((workspace_id IS NOT NULL) AND (target_id IS NOT NULL))");
    const client = await pool.connect();
    try {
      await client.query("begin"); await client.query("set local enable_seqscan=off");
      const explain = (await client.query(`explain (analyze,buffers,format json)
        select id,occurred_at,outcome,request_id,correlation_id,metadata_version,metadata from audit_events
        where workspace_id=$1 and target_type='lead' and target_id=$2 and action='crm.lead_operational_updated'
        and (occurred_at,id)>($3,$4) order by occurred_at,id limit 51`,
      [fixture.actor.workspaceId, fixture.lead.id, "1970-01-01", "00000000-0000-0000-0000-000000000000"])).rows[0]["QUERY PLAN"][0];
      expect(planNodes(explain.Plan)).not.toContain("Seq Scan");
      expect(planIndexes(explain.Plan)).toContain("audit_events_workspace_target_action_occurred_idx");
      await client.query("rollback");
    } finally { client.release(); }
  });
});

function planNodes(plan: { "Node Type": string; Plans?: Array<{ "Node Type": string; Plans?: unknown[] }> }): string[] {
  return [plan["Node Type"], ...(plan.Plans ?? []).flatMap((child) => planNodes(child as typeof plan))];
}
function planIndexes(plan: { "Index Name"?: string; Plans?: Array<{ "Index Name"?: string; Plans?: unknown[] }> }): string[] {
  return [...(plan["Index Name"] ? [plan["Index Name"]] : []),
    ...(plan.Plans ?? []).flatMap((child) => planIndexes(child as typeof plan))];
}

boundedEvidenceSuite("DB-06B bounded 100-row integrity evidence", () => {
  const performancePool = new Pool({ connectionString });
  beforeAll(async () => { expect(isIsolatedLocalDatabase).toBe(true); await performancePool.query("select 1"); });
  afterAll(async () => { await performancePool.end(); });

  it("traverses and HMAC-compares exactly 100 representative Leads with transparent bounded plans", async () => {
    if (!isIsolatedLocalDatabase) throw new Error("unsafe_database_target"); await performancePool.query("truncate users cascade");
    const actor = await actorFixture(performancePool), runId = randomUUID();
    await performancePool.query("begin");
    try {
      await performancePool.query("set local session_replication_role=replica");
      await performancePool.query("delete from pipeline_stages where workspace_id=$1", [actor.workspaceId]);
      await performancePool.query(`insert into companies(id,workspace_id,display_name,name_normalized,updated_at)
        select ('e1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,'Company '||g,'company '||g,
        timestamptz '2026-01-01'+((g%10)||' seconds')::interval from generate_series(1,100) g`, [actor.workspaceId]);
      await performancePool.query(`insert into contacts(id,workspace_id,display_name,person_name_normalized,company_id,updated_at)
        select ('e2000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,'Contact '||g,'contact '||g,
        ('e1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        timestamptz '2026-01-01'+((g%10)||' seconds')::interval from generate_series(1,100) g`, [actor.workspaceId]);
      await performancePool.query(`insert into pipeline_stages(id,workspace_id,name,position,status,updated_at)
        select ('e3000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,'Stage '||g,g+100,'active',
        timestamptz '2026-01-01'+((g%10)||' seconds')::interval from generate_series(1,100) g`, [actor.workspaceId]);
      await performancePool.query(`insert into leads(id,workspace_id,display_name,person_name_normalized,email_display,
        email_normalized,source,original_source_category,original_source_medium,original_source_detail,original_campaign_context,
        attribution_contract_version,intake_channel,stage_id,status,visibility,contact_id,company_id,lifecycle_definition_id,updated_at) select
        ('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,'Lead '||g,'lead '||g,
        'lead-'||g||'@example.test','lead-'||g||'@example.test','manual','manual','unknown','{}','{}','p1a-attribution-v1',
        'manual',('e3000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'open','workspace',
        ('e2000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        ('e1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        '00000000-0000-4000-8000-000000000001'::uuid,
        timestamptz '2026-01-01'+((g%10)||' seconds')::interval from generate_series(1,100) g`, [actor.workspaceId]);
      await performancePool.query(`insert into lead_intakes(id,workspace_id,intake_channel,idempotency_key,
        actor_membership_id,request_hash,contract_version,normalization_version,attribution_contract_version,source_category,
        source_medium,state,lead_id,outcome) select ('a2000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,'manual',
        'db06b-key-'||lpad(g::text,16,'0'),$2,repeat('a',64),'lead-inquiry-intake.v1','p1a-identity-v2','p1a-attribution-v1',
        'manual','unknown','committed',('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'{}'::jsonb
        from generate_series(1,100) g`, [actor.workspaceId, actor.membershipId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_runs(id,workspace_id,state,source_cutoff_at,
        source_cutoff_id,leads_scanned,leads_verified,issues_opened,operation_id,started_at,completed_at,
        created_by_membership_id) values($1,$2,'complete','2026-01-01 00:00:09+00',
        'a1000000-0000-0000-0000-000000000099',100,100,100,gen_random_uuid(),now(),now(),$3)`,
      [runId, actor.workspaceId, actor.membershipId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_runs(id,workspace_id,source_cutoff_at,
        source_cutoff_id,operation_id,created_by_membership_id,updated_at) select
        ('c1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
        timestamptz '2026-01-01'+((g%10)||' seconds')::interval,gen_random_uuid(),gen_random_uuid(),$2,
        timestamptz '2026-01-01'+((g%10)||' seconds')::interval from generate_series(1,99) g`,
      [actor.workspaceId, actor.membershipId]);
      await performancePool.query(`insert into lead_vnext_mappings(workspace_id,lead_id,source_version,
        verified_source_version,state,reconciliation_run_id,verified_at,governing_operation_id) select $1,
        ('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,1,1,'verified',$2,now(),gen_random_uuid()
        from generate_series(1,100) g`, [actor.workspaceId, runId]);
      await performancePool.query(`insert into lead_visible_teams(workspace_id,lead_id,team_id)
        select $1,('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$2 from generate_series(1,100) g`,
      [actor.workspaceId, actor.teamId]);
      await performancePool.query(`insert into lead_identity_reviews(id,workspace_id,intake_id,lead_id,state,version,
        resolved_at,resolved_by_membership_id,created_at,updated_at) select
        ('b1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
        ('a2000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        ('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        case when g%2=0 then 'resolved' else 'pending' end,1,
        case when g%2=0 then now() else null end,case when g%2=0 then $2::uuid else null end,
        timestamptz '2026-01-01'+((g%10)||' seconds')::interval,
        timestamptz '2026-01-01'+((g%10)||' seconds')::interval from generate_series(1,100) g`,
      [actor.workspaceId, actor.membershipId]);
      await performancePool.query(`insert into lead_identity_candidates(id,workspace_id,review_id,contact_id,
        evidence_kind,evidence_strength,normalization_version,target_version,evidence_metadata) select
        ('b2000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
        ('b1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        ('e2000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'email','strong','p1a-identity-v2',1,'{}'
        from generate_series(1,100) g`, [actor.workspaceId]);
      await performancePool.query(`insert into lead_identity_decisions(id,workspace_id,intake_id,review_id,operation,
        idempotency_key,request_hash,request_id,correlation_id,governing_outcome,actor_membership_id,
        expected_lead_version,expected_review_version,expected_intake_version,result_lead_version,result_review_version,
        contract_version,normalization_version) select ('b3000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
        ('a2000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        ('b1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'lead-identity-review-decision.v1',
        'db06b-decision-'||lpad(g::text,16,'0'),repeat('c',64),gen_random_uuid(),gen_random_uuid(),'hold',$2,
        1,1,1,1,1,'lead-identity-review-decision.v1','p1a-identity-v2' from generate_series(1,100) g`,
      [actor.workspaceId, actor.membershipId]);
      await performancePool.query(`insert into lead_identity_decision_heads(workspace_id,intake_id,decision_id)
        select $1,('a2000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        ('b3000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid from generate_series(1,100) g`, [actor.workspaceId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_issues(id,workspace_id,run_id,stream,
        source_record_type,source_record_id,issue_code,observed_version,safe_code) select
        ('a3000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,$2,'lead_root','lead',
        ('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'missing_intake',1,'missing'
        from generate_series(1,98) g`, [actor.workspaceId, runId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_issues(id,workspace_id,run_id,stream,
        source_record_type,source_record_id,issue_code,observed_version,safe_code) values
        ('a4000000-0000-0000-0000-000000000017',$1,$2,'lead_root','lead','a1000000-0000-0000-0000-000000000017','multiple_intakes',1,'multiple'),
        ('a5000000-0000-0000-0000-000000000017',$1,$2,'lead_root','lead','a1000000-0000-0000-0000-000000000017','authority_conflict',1,'writer_not_p1a')`, [actor.workspaceId, runId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_checkpoints(workspace_id,run_id,stream,
        last_sort_at,last_id,processed_count,issue_count) select $1,$2,stream,'2026-01-01 00:00:09+00',
        'a1000000-0000-0000-0000-000000000099',100,case when stream='lead_root' then 100 else 0 end
        from unnest(array['lead_root','intake','identity_review','visibility','lead_history','platform_evidence']) stream`,
      [actor.workspaceId, runId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_checkpoints(workspace_id,run_id,stream)
        select $1,('c1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'lead_root'
        from generate_series(1,99) g`, [actor.workspaceId]);
      await performancePool.query(`insert into lead_authority_states(workspace_id,governing_operation_id)
        select ('d1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,gen_random_uuid()
        from generate_series(1,99) g`);
      await performancePool.query(`insert into lead_authority_states(workspace_id,active_writer,migration_state,
        governing_operation_id) values($1,'p1a','reconciling',gen_random_uuid())`, [actor.workspaceId]);
      await performancePool.query(`insert into lead_activities(id,workspace_id,lead_id,kind,body,created_by_membership_id)
        select ('a6000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
        ('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'created','Created',$2
        from generate_series(1,100) g`, [actor.workspaceId, actor.membershipId]);
      await performancePool.query(`insert into audit_events(id,workspace_id,actor_type,action,target_type,target_id,outcome,
        request_id,correlation_id,metadata_version,metadata) select ('a7000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        $1,'system','crm.lead_operational_updated','lead',('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        'success',g::text,g::text,1,jsonb_build_object('operation','lead-operational-edit.v1','result_version',1)
        from generate_series(1,100) g`, [actor.workspaceId]);
      await performancePool.query(`insert into outbox_messages(id,workspace_id,topic,aggregate_type,aggregate_id,
        operation_id,result_version,payload) select ('a8000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
        'crm.lead.operational_updated.v1','lead',('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        ('a9000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,1,'{}'::jsonb from generate_series(1,100) g`, [actor.workspaceId]);
      await performancePool.query(`insert into idempotency_records(principal_key,operation,idempotency_key,request_hash,
        outcome,expires_at) select $1||g,'lead-operational-edit.v1','db06b-receipt-'||lpad(g::text,16,'0'),repeat('b',64),
        jsonb_build_object('leadId',('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'version',1),now()+interval '1 day'
        from generate_series(1,100) g`, [`workspace:${actor.workspaceId}:membership:${actor.membershipId}:lead:`]);
      await performancePool.query("commit");
    } catch (error) { await performancePool.query("rollback"); throw error; }
    await performancePool.query(`analyze leads,lead_intakes,lead_identity_reviews,lead_identity_candidates,
      lead_identity_decisions,lead_identity_decision_heads,lead_visible_teams,lead_vnext_mappings,
      lead_vnext_reconciliation_issues,lead_vnext_reconciliation_runs,lead_vnext_reconciliation_checkpoints,
      lead_authority_states,lead_activities,audit_events,outbox_messages,idempotency_records,contacts,companies,pipeline_stages`);
    await performancePool.query("set enable_seqscan=off");

    async function measure(name: string, sql: string, params: unknown[], allowSequential = false) {
      const explain = (await performancePool.query(`explain (analyze,buffers,format json) ${sql}`, params)).rows[0]["QUERY PLAN"][0];
      const nodes = planNodes(explain.Plan), indexes = planIndexes(explain.Plan);
      if (!allowSequential) expect(nodes, name).not.toContain("Seq Scan");
      const started = performance.now(); await performancePool.query(sql, params); const smokeMs = performance.now() - started;
      expect(smokeMs, name).toBeLessThan(200);
      return { executionMs: Number(explain["Execution Time"]), smokeMs, nodes, indexes, sharedRead: explain.Plan["Shared Read Blocks"] ?? 0,
        rowsRemoved: explain.Plan["Rows Removed by Filter"] ?? 0 };
    }
    const lowerTime = "1970-01-01", lowerId = "00000000-0000-0000-0000-000000000000";
    const upperTime = "9999-01-01", upperId = "ffffffff-ffff-ffff-ffff-ffffffffffff", sampleLead = "a1000000-0000-0000-0000-000000000050";
    const evidence = {
      root: await measure("root", `select ${LEAD_SOURCE_COLUMNS.join(",")} from leads where workspace_id=$1
        and (updated_at,id)>($2,$3) and (updated_at,id)<=($4,$5) order by updated_at,id limit 18`,
      [actor.workspaceId, lowerTime, lowerId, upperTime, upperId]),
      reread: await measure("reread", "select id,version from leads where workspace_id=$1 and id=$2", [actor.workspaceId, sampleLead]),
      intake: await measure("intake", "select id,version from lead_intakes where workspace_id=$1 and lead_id=$2", [actor.workspaceId, sampleLead]),
      reviewsPending: await measure("reviewsPending", `select id,lead_id,updated_at from lead_identity_reviews where
        workspace_id=$1 and state='pending' and (updated_at,id)>($2,$3) order by updated_at,id limit 18`,
      [actor.workspaceId, lowerTime, lowerId]),
      reviewsResolved: await measure("reviewsResolved", `select id,lead_id,updated_at from lead_identity_reviews where
        workspace_id=$1 and state='resolved' and (updated_at,id)>($2,$3) order by updated_at,id limit 18`,
      [actor.workspaceId, lowerTime, lowerId]),
      candidates: await measure("candidates", `select id,target_version from lead_identity_candidates where workspace_id=$1
        and review_id=$2 order by evidence_strength,evidence_kind,id`, [actor.workspaceId, "b1000000-0000-0000-0000-000000000050"]),
      decisions: await measure("decisions", `select id,result_lead_version from lead_identity_decisions where workspace_id=$1
        and review_id=$2 order by created_at,id`, [actor.workspaceId, "b1000000-0000-0000-0000-000000000050"]),
      head: await measure("head", `select decision_id,version from lead_identity_decision_heads where workspace_id=$1
        and intake_id=$2`, [actor.workspaceId, "a2000000-0000-0000-0000-000000000050"]),
      visibility: await measure("visibility", `select team_id,created_at from lead_visible_teams where lead_id=$1
        order by team_id`, [sampleLead]),
      history: await measure("history", `select id,kind,created_at from lead_activities where workspace_id=$1 and lead_id=$2
        order by created_at,id`, [actor.workspaceId, sampleLead]),
      lifecycle: await measure("lifecycle", `select id,code,is_terminal,status,contract_version,version
        from lead_lifecycle_definitions where id=$1`, ["00000000-0000-4000-8000-000000000001"], true),
      stage: await measure("stage", "select id,name,position,status from pipeline_stages where workspace_id=$1 and id=$2",
      [actor.workspaceId, "e3000000-0000-0000-0000-000000000050"]),
      contact: await measure("contact", "select id,status,version from contacts where workspace_id=$1 and id=$2",
      [actor.workspaceId, "e2000000-0000-0000-0000-000000000050"]),
      company: await measure("company", "select id,status,version from companies where workspace_id=$1 and id=$2",
      [actor.workspaceId, "e1000000-0000-0000-0000-000000000050"]),
      outbox: await measure("outbox", `select id,status from outbox_messages where workspace_id=$1 and topic=$2
        and aggregate_type='lead' and aggregate_id=$3 and operation_id=$4 and result_version=1`,
      [actor.workspaceId, "crm.lead.operational_updated.v1", sampleLead, "a9000000-0000-0000-0000-000000000050"]),
      mappings: await measure("mappings", `select lead_id,state from lead_vnext_mappings where workspace_id=$1
        and state='verified' and lead_id>$2 order by lead_id limit 18`, [actor.workspaceId, lowerId]),
      issues: await measure("issues", `select id,source_record_id from lead_vnext_reconciliation_issues where workspace_id=$1
        and run_id=$2 and state='open' and stream='lead_root' and (source_record_id,id)>($3,$4)
        order by source_record_id,id limit 18`, [actor.workspaceId, runId, lowerId, lowerId]),
      run: await measure("run", `select id,state,updated_at from lead_vnext_reconciliation_runs where workspace_id=$1
        and state='pending' and (updated_at,id)<($2,$3) order by updated_at desc nulls last,id desc nulls last limit 51`,
      [actor.workspaceId, upperTime, upperId]),
      checkpoint: await measure("checkpoint", `select * from lead_vnext_reconciliation_checkpoints where
        workspace_id=$1 and run_id=$2 and stream='lead_root'`, [actor.workspaceId, runId]),
      authority: await measure("authority", "select active_writer,migration_state,version from lead_authority_states where workspace_id=$1",
      [actor.workspaceId]),
      antiJoin: await measure("antiJoin", `with page as materialized (select id,workspace_id,version,updated_at
        from leads where workspace_id=$1 and (updated_at,id)>($2,$3) order by updated_at,id limit 18)
        select l.id from page l left join lead_vnext_mappings m on m.workspace_id=l.workspace_id and m.lead_id=l.id
        and m.reconciliation_run_id=$4 where m.lead_id is null or m.state<>'verified' or m.source_version<>l.version
        order by l.updated_at,l.id`, [actor.workspaceId, lowerTime, lowerId, runId]),
      audit: await measure("audit", `select id,occurred_at,outcome,request_id,correlation_id,metadata_version,metadata
        from audit_events where workspace_id=$1 and target_type='lead' and target_id=$2
        and action='crm.lead_operational_updated' and (occurred_at,id)>($3,$4) order by occurred_at,id limit 51`,
      [actor.workspaceId, sampleLead, lowerTime, lowerId]),
      receipts: await measure("receipts", `select id from idempotency_records where principal_key=$1
        and operation='lead-operational-edit.v1'`, [`workspace:${actor.workspaceId}:membership:${actor.membershipId}:lead:50`]),
    };
    expect(evidence.audit.indexes).toContain("audit_events_workspace_target_action_occurred_idx");

    const issueIds = new Set<string>(); let issueSource = lowerId, issueId = lowerId;
    while (true) {
      const rows = (await performancePool.query<{ id: string; source_record_id: string }>(`select id,source_record_id
        from lead_vnext_reconciliation_issues where workspace_id=$1 and run_id=$2 and state='open' and stream='lead_root'
        and (source_record_id,id)>($3,$4) order by source_record_id,id limit 18`, [actor.workspaceId, runId, issueSource, issueId])).rows;
      const page = rows.slice(0, 17); for (const row of page) { expect(issueIds.has(row.id)).toBe(false); issueIds.add(row.id); }
      if (rows.length <= 17) break; issueSource = page.at(-1)!.source_record_id; issueId = page.at(-1)!.id;
    }
    expect(issueIds.size).toBe(100);

    const mappingIds = new Set<string>(); let mappingCursor = lowerId;
    while (true) {
      const rows = (await performancePool.query<{ lead_id: string }>(`select lead_id from lead_vnext_mappings
        where workspace_id=$1 and state='verified' and lead_id>$2 order by lead_id limit 18`,
      [actor.workspaceId, mappingCursor])).rows;
      const page = rows.slice(0, 17); for (const row of page) { expect(mappingIds.has(row.lead_id)).toBe(false); mappingIds.add(row.lead_id); }
      if (rows.length <= 17) break; mappingCursor = page.at(-1)!.lead_id;
    }
    expect(mappingIds.size).toBe(100);

    const key = randomBytes(32), sweepStarted = performance.now();
    let cursorTime = new Date(0), cursorId = lowerId, swept = 0, hashMatches = 0;
    while (true) {
      const leads = (await performancePool.query<RawRow>(`select ${LEAD_SOURCE_COLUMNS.join(",")}
        from leads where workspace_id=$1
        and (updated_at,id)>($2,$3) order by updated_at,id limit 26`, [actor.workspaceId, cursorTime, cursorId])).rows.slice(0, 25);
      if (leads.length === 0) break;
      const ids = leads.map((row) => row.id as string);
      const intakes = (await performancePool.query<RawRow>(`select ${INTAKE_SOURCE_COLUMNS.join(",")}
        from lead_intakes where workspace_id=$1 and lead_id=any($2::uuid[]) order by lead_id,id`, [actor.workspaceId, ids])).rows;
      const reviews = (await performancePool.query<RawRow>(`select lead_id,${selectList("reviews")}
        from lead_identity_reviews where workspace_id=$1 and lead_id=any($2::uuid[]) order by lead_id,created_at,id`,
      [actor.workspaceId, ids])).rows;
      const reviewIds = reviews.map((row) => row.id as string), intakeIds = intakes.map((row) => row.id as string);
      const candidates = (await performancePool.query<RawRow>(`select ${selectList("candidates")}
        from lead_identity_candidates where workspace_id=$1 and review_id=any($2::uuid[]) order by review_id,created_at,id`,
      [actor.workspaceId, reviewIds])).rows;
      const decisions = (await performancePool.query<RawRow>(`select ${selectList("decisions")}
        from lead_identity_decisions where workspace_id=$1 and review_id=any($2::uuid[]) order by review_id,created_at,id`,
      [actor.workspaceId, reviewIds])).rows;
      const heads = (await performancePool.query<RawRow>(`select ${selectList("heads")}
        from lead_identity_decision_heads where workspace_id=$1 and intake_id=any($2::uuid[]) order by intake_id`,
      [actor.workspaceId, intakeIds])).rows;
      const visibleTeams = (await performancePool.query<RawRow>(`select lead_id,${selectList("visibleTeams")}
        from lead_visible_teams where workspace_id=$1 and lead_id=any($2::uuid[]) order by lead_id,team_id`,
      [actor.workspaceId, ids])).rows;
      const lifecycleIds = [...new Set(leads.flatMap((row) => row.lifecycle_definition_id ? [row.lifecycle_definition_id as string] : []))];
      const lifecycle = lifecycleIds.length ? (await performancePool.query<RawRow>(`select ${selectList("lifecycle")}
        from lead_lifecycle_definitions where id=any($1::uuid[])`, [lifecycleIds])).rows : [];
      const stages = (await performancePool.query<RawRow>(`select ${selectList("stage")} from pipeline_stages
        where workspace_id=$1 and id=any($2::uuid[])`, [actor.workspaceId, leads.map((row) => row.stage_id)])).rows;
      const contacts = (await performancePool.query<RawRow>(`select ${selectList("contacts")} from contacts
        where workspace_id=$1 and id=any($2::uuid[])`, [actor.workspaceId, leads.map((row) => row.contact_id)])).rows;
      const companies = (await performancePool.query<RawRow>(`select ${selectList("companies")} from companies
        where workspace_id=$1 and id=any($2::uuid[])`, [actor.workspaceId, leads.map((row) => row.company_id)])).rows;
      const history = (await performancePool.query<RawRow>(`select lead_id,${selectList("history")} from lead_activities
        where workspace_id=$1 and lead_id=any($2::uuid[]) order by lead_id,created_at,id`, [actor.workspaceId, ids])).rows;
      const audits = (await performancePool.query<RawRow>(`select ${selectList("audits")} from audit_events
        where workspace_id=$1 and target_type='lead' and target_id=any($2::uuid[]) order by target_id,occurred_at,id`,
      [actor.workspaceId, ids])).rows;
      const outbox = (await performancePool.query<RawRow>(`select ${selectList("outbox")} from outbox_messages
        where workspace_id=$1 and aggregate_type='lead' and aggregate_id=any($2::uuid[]) order by aggregate_id,created_at,id`,
      [actor.workspaceId, ids])).rows;
      const principalKeys = ids.map((id) => `workspace:${actor.workspaceId}:membership:${actor.membershipId}:lead:${Number(id.slice(-12))}`);
      const receipts = (await performancePool.query<RawRow>(`select ${selectList("receipts")},outcome->>'leadId' lead_id
        from idempotency_records where principal_key=any($1::text[]) and operation='lead-operational-edit.v1'
        order by principal_key,created_at,id`, [principalKeys])).rows;
      const groupBy = (rows: RawRow[], keyName: string) => {
        const map = new Map<string, RawRow[]>(); for (const row of rows) {
          const groupKey = row[keyName] as string; if (!map.has(groupKey)) map.set(groupKey, []); map.get(groupKey)!.push(row);
        } return map;
      };
      const byLead = groupBy(intakes, "lead_id"), reviewsByLead = groupBy(reviews, "lead_id");
      const reviewToLead = new Map(reviews.map((row) => [row.id as string, row.lead_id as string]));
      const intakeToLead = new Map(intakes.map((row) => [row.id as string, row.lead_id as string]));
      const byRelatedLead = (rows: RawRow[], relation: "review_id" | "intake_id") => {
        const mapped = rows.map((row) => ({ ...row, __lead_id: relation === "review_id"
          ? reviewToLead.get(row[relation] as string) : intakeToLead.get(row[relation] as string) }));
        return groupBy(mapped, "__lead_id");
      };
      const candidatesByLead = byRelatedLead(candidates, "review_id"), decisionsByLead = byRelatedLead(decisions, "review_id");
      const headsByLead = byRelatedLead(heads, "intake_id"), teamsByLead = groupBy(visibleTeams, "lead_id");
      const historyByLead = groupBy(history, "lead_id"), auditsByLead = groupBy(audits, "target_id");
      const outboxByLead = groupBy(outbox, "aggregate_id"), receiptsByLead = groupBy(receipts, "lead_id");
      const lifecycleById = groupBy(lifecycle, "id"), stageById = groupBy(stages, "id");
      const contactsById = groupBy(contacts, "id"), companiesById = groupBy(companies, "id");
      for (const lead of leads) {
        const leadId = lead.id as string, inventory = emptyInventory();
        inventory.lead = [lead]; inventory.intakes = byLead.get(leadId) ?? []; inventory.reviews = reviewsByLead.get(leadId) ?? [];
        inventory.candidates = candidatesByLead.get(leadId) ?? []; inventory.decisions = decisionsByLead.get(leadId) ?? [];
        inventory.heads = headsByLead.get(leadId) ?? []; inventory.visibleTeams = teamsByLead.get(leadId) ?? [];
        inventory.lifecycle = lifecycleById.get(lead.lifecycle_definition_id as string) ?? [];
        inventory.stage = stageById.get(lead.stage_id as string) ?? []; inventory.contacts = contactsById.get(lead.contact_id as string) ?? [];
        inventory.companies = companiesById.get(lead.company_id as string) ?? []; inventory.history = historyByLead.get(leadId) ?? [];
        inventory.audits = auditsByLead.get(leadId) ?? []; inventory.outbox = outboxByLead.get(leadId) ?? [];
        inventory.receipts = receiptsByLead.get(leadId) ?? [];
        for (const group of GROUPS) if (inventory[group].length === 0) throw new Error(`empty_${group}_at_${swept}`);
        const sourceDigest = sourceInventoryDigest(key, inventory);
        const projectionDigest = vnextInventoryDigest(key, inventory);
        if (timingSafeEqual(sourceDigest, projectionDigest)) hashMatches += 1; else throw new Error(`parity_mismatch_at_${swept}`);
        swept += 1;
      }
      const last = leads.at(-1)!; cursorTime = last.updated_at as Date; cursorId = last.id as string;
    }
    const sweepMs = performance.now() - sweepStarted;
    expect(swept).toBe(100); expect(hashMatches).toBe(100);
    const sizes = (await performancePool.query(`select relname,pg_relation_size(oid)::bigint heap_bytes,
      pg_indexes_size(oid)::bigint index_bytes,(select count(*)::int from pg_index where indrelid=pg_class.oid) index_count
      from pg_class where relkind='r' and relname in ('leads','lead_intakes','lead_identity_reviews',
      'lead_identity_candidates','lead_identity_decisions','lead_identity_decision_heads','lead_visible_teams',
      'lead_vnext_mappings','lead_vnext_reconciliation_issues','lead_vnext_reconciliation_runs',
      'lead_vnext_reconciliation_checkpoints','lead_authority_states','audit_events','outbox_messages',
      'idempotency_records') order by relname`)).rows;
    console.info("DB_06B_BOUNDED_INTEGRITY", JSON.stringify({ counts: { cutoffLeads: swept, intakes: 100,
      reviews: 100, candidates: 100, decisions: 100, heads: 100, visibleTeams: 100, historyRows: 100, audits: 100,
      outbox: 100, receipts: 100, verified: 100, stale: 0, blocked: 0, openIssues: 100,
      resolvedIssues: 0, waivedIssues: 0, hashMatches, hashMismatches: swept - hashMatches },
    sweep: { elapsedMs: sweepMs, pageSize: 25 }, evidence, sizes }));
  }, 60_000);
});
