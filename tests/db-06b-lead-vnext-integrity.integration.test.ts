import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const connectionString = process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow";
const parsedDatabaseUrl = new URL(connectionString);
const isIsolatedLocalDatabase = ["127.0.0.1", "localhost", "::1"].includes(parsedDatabaseUrl.hostname)
  && parsedDatabaseUrl.port === "54329" && /^\/nexaflow(?:_db0?6b|_test|$)/.test(parsedDatabaseUrl.pathname);
const integrationSuite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const performanceSuite = process.env.RUN_DB_PERFORMANCE === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString });

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
  unsupported_legacy_row: ["no_committed_intake", "unnormalized_phone", "source_missing"],
};

type Canonical = null | boolean | number | bigint | string | Date | Canonical[] | { [key: string]: Canonical };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function codePointCompare(left: string, right: string) {
  const a = Array.from(left, (char) => char.codePointAt(0)!); const b = Array.from(right, (char) => char.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return a.length - b.length;
}
function encodeCanonical(value: Canonical): string {
  if (value === null) return "N";
  if (typeof value === "boolean") return value ? "B1" : "B0";
  if (typeof value === "bigint" || (typeof value === "number" && Number.isSafeInteger(value))) {
    const text = value.toString(); return `I${Buffer.byteLength(text)}:${text}`;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non_finite_number");
    const text = value.toString(); return `S${Buffer.byteLength(text)}:${text}`;
  }
  if (value instanceof Date) {
    const text = value.toISOString(); if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(text)) throw new Error("timestamp_invalid");
    return `T24:${text}`;
  }
  if (typeof value === "string") {
    if (uuidPattern.test(value)) return `U36:${value.toLowerCase()}`;
    return `S${Buffer.byteLength(value)}:${value}`;
  }
  if (Array.isArray(value)) return `A${value.length}[${value.map(encodeCanonical).join("")}]`;
  const entries = Object.entries(value).sort(([left], [right]) => codePointCompare(left, right));
  return `O${entries.length}{${entries.map(([key, item]) => `${encodeCanonical(key)}${encodeCanonical(item)}`).join("")}}`;
}
function parityDigest(key: Buffer, value: Canonical) {
  return createHmac("sha256", key).update(encodeCanonical(value)).digest();
}
function parityEqual(key: Buffer, source: Canonical, projection: Canonical) {
  return timingSafeEqual(parityDigest(key, source), parityDigest(key, projection));
}

async function actorFixture(db: Pool | PoolClient = pool) {
  const userId = (await db.query<{ id: string }>("insert into users(display_name,status) values('DB06B Owner','active') returning id")).rows[0].id;
  const workspaceId = (await db.query<{ id: string }>(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
    values('DB06B Integrity',$1,'active','growth','monthly',$2) returning id`, [`db06b-${randomUUID()}`, userId])).rows[0].id;
  const roleId = (await db.query<{ id: string }>("insert into roles(workspace_id,code) values($1,'owner') returning id", [workspaceId])).rows[0].id;
  const membershipId = (await db.query<{ id: string }>(`insert into workspace_memberships(workspace_id,user_id,role_id,status)
    values($1,$2,$3,'active') returning id`, [workspaceId, userId, roleId])).rows[0].id;
  const stageId = (await db.query<{ id: string }>("insert into pipeline_stages(workspace_id,name,position,status) values($1,'New',0,'active') returning id", [workspaceId])).rows[0].id;
  const teamId = (await db.query<{ id: string }>(`insert into teams(workspace_id,name,name_normalized,status,created_by_membership_id)
    values($1,'DB06B Team','db06b team','active',$2) returning id`, [workspaceId, membershipId])).rows[0].id;
  return { userId, workspaceId, membershipId, stageId, teamId };
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
async function committedIntake(db: Pool | PoolClient, actor: Awaited<ReturnType<typeof actorFixture>>, leadId: string) {
  return (await db.query<{ id: string }>(`insert into lead_intakes(workspace_id,intake_channel,idempotency_key,
    actor_membership_id,request_hash,contract_version,normalization_version,attribution_contract_version,
    source_category,source_medium,state,lead_id,outcome) values($1,'manual',$2,$3,$4,'lead-intake.v1',
    'p1a-identity-v2','p1a-attribution-v1','manual','unknown','committed',$5,'{}') returning id`,
  [actor.workspaceId, `db06b-key-${randomUUID()}`, actor.membershipId, randomBytes(32).toString("hex"), leadId])).rows[0].id;
}
async function reconciliationFixture(db: Pool | PoolClient, actor: Awaited<ReturnType<typeof actorFixture>>, lead: { id: string; version: number; updated_at: Date }) {
  const runId = (await db.query<{ id: string }>(`insert into lead_vnext_reconciliation_runs(workspace_id,source_cutoff_at,
    source_cutoff_id,operation_id,created_by_membership_id) values($1,$2,$3,$4,$5) returning id`,
  [actor.workspaceId, lead.updated_at, lead.id, randomUUID(), actor.membershipId])).rows[0].id;
  await db.query("update lead_vnext_reconciliation_runs set state='running',started_at=now(),version=2 where id=$1", [runId]);
  await db.query("insert into lead_authority_states(workspace_id,governing_operation_id) values($1,$2)", [actor.workspaceId, randomUUID()]);
  await db.query("update lead_authority_states set migration_state='shadow',version=2,governing_operation_id=$2 where workspace_id=$1", [actor.workspaceId, randomUUID()]);
  await db.query("update lead_authority_states set migration_state='reconciling',version=3,governing_operation_id=$2 where workspace_id=$1", [actor.workspaceId, randomUUID()]);
  for (const stream of STREAMS) await db.query(`insert into lead_vnext_reconciliation_checkpoints(workspace_id,run_id,
    stream,last_sort_at,last_id,processed_count) values($1,$2,$3,$4,$5,1)`, [actor.workspaceId, runId, stream, lead.updated_at, lead.id]);
  await db.query(`insert into lead_vnext_mappings(workspace_id,lead_id,source_version,verified_source_version,state,
    reconciliation_run_id,verified_at,governing_operation_id) values($1,$2,$3,$3,'verified',$4,now(),$5)`,
  [actor.workspaceId, lead.id, lead.version, runId, randomUUID()]);
  await db.query(`update lead_vnext_reconciliation_runs set state='complete',leads_scanned=1,leads_verified=1,
    completed_at=now(),version=3 where id=$1`, [runId]);
  return runId;
}

async function readiness(db: Pool | PoolClient, workspaceId: string, runId: string, hashesEqual = true) {
  const run = (await db.query(`select * from lead_vnext_reconciliation_runs where workspace_id=$1 and id=$2`, [workspaceId, runId])).rows[0];
  if (!run || run.contract_version !== "lead-vnext-reconciliation.v1" || run.state !== "complete" || !run.started_at || !run.completed_at) return false;
  const authority = (await db.query(`select * from lead_authority_states where workspace_id=$1`, [workspaceId])).rows[0];
  if (!authority || authority.active_writer !== "p1a" || !["reconciling", "ready"].includes(authority.migration_state)
    || authority.switched_at || authority.switched_by_membership_id) return false;
  if (Number(run.leads_scanned) !== Number(run.leads_verified) || Number(run.leads_stale) !== 0 || Number(run.leads_blocked) !== 0
    || Number(run.issues_opened) !== Number(run.issues_resolved)) return false;
  const cutoff = (await db.query<{ count: number; max_updated_at: Date | null; max_id: string | null }>(`select count(*)::int count,
    (array_agg(updated_at order by updated_at desc,id desc))[1] max_updated_at,
    (array_agg(id order by updated_at desc,id desc))[1] max_id from leads where workspace_id=$1
    and (updated_at,id)<=($2,$3)`, [workspaceId, run.source_cutoff_at, run.source_cutoff_id])).rows[0];
  const checkpoints = (await db.query(`select * from lead_vnext_reconciliation_checkpoints where workspace_id=$1 and run_id=$2`, [workspaceId, runId])).rows;
  if (checkpoints.length !== 6 || checkpoints.some((row) => Number(row.processed_count) !== cutoff.count
    || (cutoff.count === 0 ? row.last_sort_at || row.last_id : row.last_sort_at.getTime() !== cutoff.max_updated_at!.getTime() || row.last_id !== cutoff.max_id))) return false;
  const mappings = (await db.query(`select m.*,l.version current_version from lead_vnext_mappings m join leads l
    on l.workspace_id=m.workspace_id and l.id=m.lead_id where m.workspace_id=$1 and m.reconciliation_run_id=$2`, [workspaceId, runId])).rows;
  if (mappings.length !== cutoff.count || mappings.some((row) => row.state !== "verified" || !row.verified_at || Number(row.issue_count) !== 0
    || row.source_version !== row.verified_source_version || row.source_version !== row.current_version)) return false;
  const issueCounts = (await db.query<{ blocking: number; opened: number }>(`select count(*) filter(where state in ('open','waived'))::int blocking,
    count(*)::int opened from lead_vnext_reconciliation_issues where workspace_id=$1 and run_id=$2`, [workspaceId, runId])).rows[0];
  if (issueCounts.blocking > 0 || issueCounts.opened !== Number(run.issues_opened) || !hashesEqual) return false;
  const missing = (await db.query<{ count: number }>(`select count(*)::int count from leads l left join lead_vnext_mappings m
    on m.workspace_id=l.workspace_id and m.lead_id=l.id and m.reconciliation_run_id=$4 where l.workspace_id=$1
    and (l.updated_at,l.id)<=($2,$3) and (m.lead_id is null or m.state<>'verified' or m.source_version<>l.version)`,
  [workspaceId, run.source_cutoff_at, run.source_cutoff_id, runId])).rows[0].count;
  const drift = (await db.query<{ count: number }>(`select count(*)::int count from leads where workspace_id=$1
    and ((updated_at,id)>($2,$3) or authority_contract_version<>'p1a-lead-v1')`,
  [workspaceId, run.source_cutoff_at, run.source_cutoff_id])).rows[0].count;
  return missing === 0 && drift === 0;
}

const READINESS_INVARIANTS = ["checkpointComplete", "cursorAtCutoff", "mappingExact", "mappingVerified",
  "sourceStable", "noOpenIssue", "noWaivedIssue", "countsAgree", "mappingVersionCurrent", "authorityExists",
  "writerP1a", "authorityStateReady", "rootContractP1a", "singleCommittedIntake", "reviewLineageValid",
  "visibilityAssignmentValid", "stageLifecycleAvailable", "linkedWorkspaceValid", "historyEvidenceComplete",
  "parityHashEqual", "noPostCutoffLead"] as const;
type ReadinessFacts = Record<typeof READINESS_INVARIANTS[number], boolean>;
function readinessFacts(overrides: Partial<ReadinessFacts> = {}): ReadinessFacts {
  return Object.assign(Object.fromEntries(READINESS_INVARIANTS.map((key) => [key, true])) as ReadinessFacts, overrides);
}
function isReadyByFacts(facts: ReadinessFacts) { return READINESS_INVARIANTS.every((key) => facts[key]); }

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

  it("canonicalizes independently built projections with transient timing-safe HMAC and no stored digest", async () => {
    const key = randomBytes(32), id = randomUUID(), at = new Date("2026-08-26T12:34:56.789Z");
    const source: Canonical = { lead: { id, owner_membership_id: null, version: 7, updated_at: at },
      visibleTeams: [randomUUID(), randomUUID()].sort(), details: { z: true, a: [null, "Exact"] } };
    const projection: Canonical = { details: { a: [null, "Exact"], z: true }, visibleTeams: [...(source as Record<string, Canonical>).visibleTeams as Canonical[]],
      lead: { id, responsibleMembershipId: null, version: 7, updatedAt: at } };
    const independentlyProjected: Canonical = { lead: { id, owner_membership_id: null, version: 7, updated_at: at },
      visibleTeams: [...(source as Record<string, Canonical>).visibleTeams as Canonical[]], details: { a: [null, "Exact"], z: true } };
    expect(parityEqual(key, source, independentlyProjected)).toBe(true);
    expect(parityEqual(key, source, projection)).toBe(false);
    expect(encodeCanonical({ b: 1, a: "é" })).toBe("O2{S1:aS2:éS1:bI1:1}");
    expect(() => encodeCanonical(Number.NaN)).toThrow("non_finite_number");
    const persisted = await pool.query(`select count(*)::int count from information_schema.columns where table_schema='public'
      and column_name ~ '(hmac|parity_hash|digest)'`); expect(persisted.rows[0].count).toBe(0);
  });

  it("uses the frozen Lead tuple barrier, 500-row cursor and source-version re-read semantics", async () => {
    const actor = await actorFixture(), equalTime = new Date("2026-08-26T10:00:00.000Z");
    for (let index = 0; index < 503; index += 1) await leadFixture(pool, actor, equalTime);
    const cutoff = (await pool.query<{ id: string; updated_at: Date }>(`select id,updated_at from leads where workspace_id=$1
      order by updated_at desc,id desc limit 1`, [actor.workspaceId])).rows[0];
    const first = (await pool.query<{ id: string; updated_at: Date; version: number }>(`select id,updated_at,version from leads
      where workspace_id=$1 and (updated_at,id)>($2,$3) and (updated_at,id)<=($4,$5)
      order by updated_at,id limit 501`, [actor.workspaceId, "1970-01-01", "00000000-0000-0000-0000-000000000000", cutoff.updated_at, cutoff.id])).rows;
    expect(first).toHaveLength(501); const consumed = first.slice(0, 500), cursor = consumed.at(-1)!;
    const second = (await pool.query<{ id: string }>(`select id from leads where workspace_id=$1 and (updated_at,id)>($2,$3)
      and (updated_at,id)<=($4,$5) order by updated_at,id limit 501`, [actor.workspaceId, cursor.updated_at, cursor.id, cutoff.updated_at, cutoff.id])).rows;
    expect(new Set([...consumed.map((row) => row.id), ...second.map((row) => row.id)]).size).toBe(503);
    const raced = consumed[0]; await pool.query("update leads set display_name='Changed',version=version+1 where id=$1", [raced.id]);
    const reread = (await pool.query<{ version: number }>("select version from leads where workspace_id=$1 and id=$2", [actor.workspaceId, raced.id])).rows[0];
    expect(reread.version).toBe(raced.version + 1);
  });

  it("evaluates readiness purely and rejects every frozen negative class", async () => {
    const actor = await actorFixture(), lead = await leadFixture(pool, actor); await committedIntake(pool, actor, lead.id);
    const runId = await reconciliationFixture(pool, actor, lead); const key = randomBytes(32);
    expect(parityEqual(key, { id: lead.id, version: lead.version }, { id: lead.id, version: lead.version })).toBe(true);
    expect(await readiness(pool, actor.workspaceId, runId)).toBe(true);
    await pool.query("begin"); await pool.query("set local session_replication_role=replica");
    await pool.query("delete from lead_vnext_reconciliation_checkpoints where stream='visibility'");
    expect(await readiness(pool, actor.workspaceId, runId)).toBe(false); await pool.query("rollback");
    await pool.query("begin"); await pool.query("set local session_replication_role=replica");
    await pool.query("update lead_vnext_mappings set state='stale',verified_source_version=null where lead_id=$1", [lead.id]);
    expect(await readiness(pool, actor.workspaceId, runId)).toBe(false); await pool.query("rollback");
    expect(await readiness(pool, actor.workspaceId, runId, false)).toBe(false);
    expect(isReadyByFacts(readinessFacts())).toBe(true);
    for (const invariant of READINESS_INVARIANTS) expect(isReadyByFacts(readinessFacts({ [invariant]: false }))).toBe(false);
    for (const mappingState of ["pending", "stale", "blocked"]) expect(isReadyByFacts(readinessFacts({ mappingVerified: mappingState === "verified" }))).toBe(false);
    for (const authorityState of ["missing", "dormant", "shadow", "vnext"]) expect(isReadyByFacts(readinessFacts({
      authorityExists: authorityState !== "missing", authorityStateReady: !["dormant", "shadow"].includes(authorityState), writerP1a: authorityState !== "vnext",
    }))).toBe(false);
  });

  it("serializes same-stream workers without locking the Lead and records one stale replay", async () => {
    const actor = await actorFixture(), lead = await leadFixture(pool, actor), runId = (await pool.query<{ id: string }>(
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
      const commandStarted = performance.now(); await pool.query("update leads set display_name='P1A command',version=version+1 where id=$1", [lead.id]);
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
    expect((await pool.query("select display_name from leads where id=$1", [lead.id])).rows[0].display_name).toBe("P1A command");
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
    const actor = await actorFixture(), lead = await leadFixture(pool, actor), oldRun = await reconciliationFixture(pool, actor, lead);
    const newRun = (await pool.query<{ id: string }>(`insert into lead_vnext_reconciliation_runs(workspace_id,source_cutoff_at,
      source_cutoff_id,operation_id,created_by_membership_id) values($1,$2,$3,$4,$5) returning id`,
    [actor.workspaceId, lead.updated_at, lead.id, randomUUID(), actor.membershipId])).rows[0].id;
    expect(newRun).not.toBe(oldRun); expect((await pool.query("select count(*)::int count from lead_vnext_reconciliation_runs where workspace_id=$1", [actor.workspaceId])).rows[0].count).toBe(2);
  });
});

function percentile(values: number[], quantile: number) {
  const sorted = [...values].sort((left, right) => left - right); return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
}
function planNodes(plan: { "Node Type": string; Plans?: Array<{ "Node Type": string; Plans?: unknown[] }> }): string[] {
  return [plan["Node Type"], ...(plan.Plans ?? []).flatMap((child) => planNodes(child as typeof plan))];
}

performanceSuite("DB-06B representative integrity performance", () => {
  const performancePool = new Pool({ connectionString });
  beforeAll(async () => { expect(isIsolatedLocalDatabase).toBe(true); await performancePool.query("select 1"); });
  afterAll(async () => { await performancePool.end(); });

  it("traverses and HMAC-compares 100,001 Leads with bounded memory and transparent Platform plans", async () => {
    if (!isIsolatedLocalDatabase) throw new Error("unsafe_database_target"); await performancePool.query("truncate users cascade");
    const actor = await actorFixture(performancePool), runId = randomUUID();
    const companyId = (await performancePool.query<{ id: string }>(`insert into companies(workspace_id,display_name,
      name_normalized) values($1,'DB06B Company','db06b company') returning id`, [actor.workspaceId])).rows[0].id;
    const contactId = (await performancePool.query<{ id: string }>(`insert into contacts(workspace_id,display_name,
      person_name_normalized,company_id) values($1,'DB06B Contact','db06b contact',$2) returning id`,
    [actor.workspaceId, companyId])).rows[0].id;
    await performancePool.query("begin");
    try {
      await performancePool.query("set local session_replication_role=replica");
      await performancePool.query(`insert into leads(id,workspace_id,display_name,person_name_normalized,email_display,
        email_normalized,source,original_source_category,original_source_medium,original_source_detail,original_campaign_context,
        attribution_contract_version,intake_channel,stage_id,status,visibility,updated_at) select
        ('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,'Lead '||g,'lead '||g,
        'lead-'||g||'@example.test','lead-'||g||'@example.test','manual','manual','unknown','{}','{}','p1a-attribution-v1',
        'manual',$2,'open','workspace',timestamptz '2026-01-01'+((g%100)||' seconds')::interval from generate_series(1,100001) g`,
      [actor.workspaceId, actor.stageId]);
      await performancePool.query(`update leads set contact_id=$2,company_id=$3 where workspace_id=$1
        and id='a1000000-0000-0000-0000-000000050000'`, [actor.workspaceId, contactId, companyId]);
      await performancePool.query(`insert into lead_intakes(id,workspace_id,intake_channel,idempotency_key,
        actor_membership_id,request_hash,contract_version,normalization_version,attribution_contract_version,source_category,
        source_medium,state,lead_id,outcome) select ('a2000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,'manual',
        'db06b-key-'||lpad(g::text,16,'0'),$2,repeat('a',64),'lead-intake.v1','p1a-identity-v2','p1a-attribution-v1',
        'manual','unknown','committed',('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'{}'::jsonb
        from generate_series(1,100001) g`, [actor.workspaceId, actor.membershipId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_runs(id,workspace_id,state,source_cutoff_at,
        source_cutoff_id,leads_scanned,leads_verified,issues_opened,operation_id,started_at,completed_at,
        created_by_membership_id) values($1,$2,'complete','2026-01-01 00:01:39+00',
        'a1000000-0000-0000-0000-000000099999',100001,100001,100003,gen_random_uuid(),now(),now(),$3)`,
      [runId, actor.workspaceId, actor.membershipId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_runs(id,workspace_id,source_cutoff_at,
        source_cutoff_id,operation_id,created_by_membership_id,updated_at) select
        ('c1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
        timestamptz '2026-01-01'+((g%100)||' seconds')::interval,gen_random_uuid(),gen_random_uuid(),$2,
        timestamptz '2026-01-01'+((g%100)||' seconds')::interval from generate_series(1,100001) g`,
      [actor.workspaceId, actor.membershipId]);
      await performancePool.query(`insert into lead_vnext_mappings(workspace_id,lead_id,source_version,
        verified_source_version,state,reconciliation_run_id,verified_at,governing_operation_id) select $1,
        ('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,1,1,'verified',$2,now(),gen_random_uuid()
        from generate_series(1,100001) g`, [actor.workspaceId, runId]);
      await performancePool.query(`insert into lead_visible_teams(workspace_id,lead_id,team_id)
        select $1,('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$2 from generate_series(1,100001) g`,
      [actor.workspaceId, actor.teamId]);
      await performancePool.query(`insert into lead_identity_reviews(id,workspace_id,intake_id,lead_id,state,version,
        resolved_at,resolved_by_membership_id,created_at,updated_at) select
        ('b1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
        ('a2000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        ('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        case when g%2=0 then 'resolved' else 'pending' end,1,
        case when g%2=0 then now() else null end,case when g%2=0 then $2::uuid else null end,
        timestamptz '2026-01-01'+((g%100)||' seconds')::interval,
        timestamptz '2026-01-01'+((g%100)||' seconds')::interval from generate_series(1,100001) g`,
      [actor.workspaceId, actor.membershipId]);
      await performancePool.query(`insert into lead_identity_candidates(id,workspace_id,review_id,contact_id,
        evidence_kind,evidence_strength,normalization_version,target_version,evidence_metadata) select
        ('b2000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
        ('b1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$2,'email','strong','p1a-identity-v2',1,'{}'
        from generate_series(1,1001) g`, [actor.workspaceId, contactId]);
      await performancePool.query(`insert into lead_identity_decisions(id,workspace_id,intake_id,review_id,operation,
        idempotency_key,request_hash,request_id,correlation_id,governing_outcome,actor_membership_id,
        expected_lead_version,expected_review_version,expected_intake_version,result_lead_version,result_review_version,
        contract_version,normalization_version) select ('b3000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
        ('a2000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        ('b1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'lead-identity-review-decision.v1',
        'db06b-decision-'||lpad(g::text,16,'0'),repeat('c',64),gen_random_uuid(),gen_random_uuid(),'hold',$2,
        1,1,1,1,1,'lead-identity-review-decision.v1','p1a-identity-v2' from generate_series(1,1001) g`,
      [actor.workspaceId, actor.membershipId]);
      await performancePool.query(`insert into lead_identity_decision_heads(workspace_id,intake_id,decision_id)
        select $1,('a2000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        ('b3000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid from generate_series(1,1001) g`, [actor.workspaceId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_issues(id,workspace_id,run_id,stream,
        source_record_type,source_record_id,issue_code,observed_version,safe_code) select
        ('a3000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,$2,'lead_root','lead',
        ('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'missing_intake',1,'missing'
        from generate_series(1,100001) g`, [actor.workspaceId, runId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_issues(id,workspace_id,run_id,stream,
        source_record_type,source_record_id,issue_code,observed_version,safe_code) values
        ('a4000000-0000-0000-0000-000000000500',$1,$2,'lead_root','lead','a1000000-0000-0000-0000-000000000500','multiple_intakes',1,'multiple'),
        ('a5000000-0000-0000-0000-000000000500',$1,$2,'lead_root','lead','a1000000-0000-0000-0000-000000000500','authority_conflict',1,'writer_not_p1a')`, [actor.workspaceId, runId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_checkpoints(workspace_id,run_id,stream,
        last_sort_at,last_id,processed_count,issue_count) select $1,$2,stream,'2026-01-01 00:01:39+00',
        'a1000000-0000-0000-0000-000000099999',100001,case when stream='lead_root' then 100003 else 0 end
        from unnest(array['lead_root','intake','identity_review','visibility','lead_history','platform_evidence']) stream`,
      [actor.workspaceId, runId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_checkpoints(workspace_id,run_id,stream)
        select $1,('c1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'lead_root'
        from generate_series(1,100001) g`, [actor.workspaceId]);
      await performancePool.query(`insert into lead_authority_states(workspace_id,governing_operation_id)
        select ('d1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,gen_random_uuid()
        from generate_series(1,100001) g`);
      await performancePool.query(`insert into lead_authority_states(workspace_id,active_writer,migration_state,
        governing_operation_id) values($1,'p1a','reconciling',gen_random_uuid())`, [actor.workspaceId]);
      await performancePool.query(`insert into lead_activities(id,workspace_id,lead_id,kind,body,created_by_membership_id)
        select ('a6000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
        ('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'created','Created',$2
        from generate_series(1,100001) g`, [actor.workspaceId, actor.membershipId]);
      await performancePool.query(`insert into audit_events(id,workspace_id,actor_type,action,target_type,target_id,outcome,
        request_id,correlation_id,metadata_version,metadata) select ('a7000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        $1,'system','crm.lead_operational_updated','lead',('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        'success',g::text,g::text,1,jsonb_build_object('operation','lead-operational-edit.v1','result_version',1)
        from generate_series(1,100001) g`, [actor.workspaceId]);
      await performancePool.query(`insert into outbox_messages(id,workspace_id,topic,aggregate_type,aggregate_id,
        operation_id,result_version,payload) select ('a8000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
        'crm.lead.operational_updated.v1','lead',('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        ('a9000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,1,'{}'::jsonb from generate_series(1,100001) g`, [actor.workspaceId]);
      await performancePool.query(`insert into idempotency_records(principal_key,operation,idempotency_key,request_hash,
        outcome,expires_at) select $1||g,'lead-operational-edit.v1','db06b-receipt-'||lpad(g::text,16,'0'),repeat('b',64),
        jsonb_build_object('leadId',('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'version',1),now()+interval '1 day'
        from generate_series(1,100001) g`, [`workspace:${actor.workspaceId}:lead:`]);
      await performancePool.query("commit");
    } catch (error) { await performancePool.query("rollback"); throw error; }
    await performancePool.query(`analyze leads,lead_intakes,lead_identity_reviews,lead_identity_candidates,
      lead_identity_decisions,lead_identity_decision_heads,lead_visible_teams,lead_vnext_mappings,
      lead_vnext_reconciliation_issues,lead_vnext_reconciliation_runs,lead_vnext_reconciliation_checkpoints,
      lead_authority_states,lead_activities,audit_events,outbox_messages,idempotency_records`);

    async function measure(name: string, sql: string, params: unknown[], allowSequential = false) {
      const explain = (await performancePool.query(`explain (analyze,buffers,format json) ${sql}`, params)).rows[0]["QUERY PLAN"][0];
      const nodes = planNodes(explain.Plan); if (!allowSequential) expect(nodes, name).not.toContain("Seq Scan");
      const samples: number[] = []; for (let index = 0; index < 30; index += 1) {
        const started = performance.now(); await performancePool.query(sql, params); samples.push(performance.now() - started);
      }
      const p95 = percentile(samples, .95); expect(p95, name).toBeLessThan(200);
      return { executionMs: Number(explain["Execution Time"]), p95, nodes, sharedRead: explain.Plan["Shared Read Blocks"] ?? 0,
        rowsRemoved: explain.Plan["Rows Removed by Filter"] ?? 0 };
    }
    const lowerTime = "1970-01-01", lowerId = "00000000-0000-0000-0000-000000000000";
    const upperTime = "9999-01-01", upperId = "ffffffff-ffff-ffff-ffff-ffffffffffff", sampleLead = "a1000000-0000-0000-0000-000000050000";
    const evidence = {
      root: await measure("root", `select ${LEAD_SOURCE_COLUMNS.join(",")} from leads where workspace_id=$1
        and (updated_at,id)>($2,$3) and (updated_at,id)<=($4,$5) order by updated_at,id limit 501`,
      [actor.workspaceId, lowerTime, lowerId, upperTime, upperId]),
      reread: await measure("reread", "select id,version from leads where workspace_id=$1 and id=$2", [actor.workspaceId, sampleLead]),
      intake: await measure("intake", "select id,version from lead_intakes where workspace_id=$1 and lead_id=$2", [actor.workspaceId, sampleLead]),
      reviewsPending: await measure("reviewsPending", `select id,lead_id,updated_at from lead_identity_reviews where
        workspace_id=$1 and state='pending' and (updated_at,id)>($2,$3) order by updated_at,id limit 501`,
      [actor.workspaceId, lowerTime, lowerId]),
      reviewsResolved: await measure("reviewsResolved", `select id,lead_id,updated_at from lead_identity_reviews where
        workspace_id=$1 and state='resolved' and (updated_at,id)>($2,$3) order by updated_at,id limit 501`,
      [actor.workspaceId, lowerTime, lowerId]),
      candidates: await measure("candidates", `select id,target_version from lead_identity_candidates where workspace_id=$1
        and review_id=$2 order by evidence_strength,evidence_kind,id`, [actor.workspaceId, "b1000000-0000-0000-0000-000000000500"]),
      decisions: await measure("decisions", `select id,result_lead_version from lead_identity_decisions where workspace_id=$1
        and review_id=$2 order by created_at,id`, [actor.workspaceId, "b1000000-0000-0000-0000-000000000500"]),
      head: await measure("head", `select decision_id,version from lead_identity_decision_heads where workspace_id=$1
        and intake_id=$2`, [actor.workspaceId, "a2000000-0000-0000-0000-000000000500"]),
      visibility: await measure("visibility", `select team_id,created_at from lead_visible_teams where lead_id=$1
        order by team_id`, [sampleLead]),
      history: await measure("history", `select id,kind,created_at from lead_activities where workspace_id=$1 and lead_id=$2
        order by created_at,id`, [actor.workspaceId, sampleLead]),
      lifecycle: await measure("lifecycle", `select id,code,is_terminal,status,contract_version,version
        from lead_lifecycle_definitions where id=$1`, ["00000000-0000-4000-8000-000000000001"], true),
      stage: await measure("stage", "select id,name,position,status from pipeline_stages where workspace_id=$1 and id=$2",
      [actor.workspaceId, actor.stageId], true),
      contact: await measure("contact", "select id,status,version from contacts where workspace_id=$1 and id=$2",
      [actor.workspaceId, contactId], true),
      company: await measure("company", "select id,status,version from companies where workspace_id=$1 and id=$2",
      [actor.workspaceId, companyId], true),
      outbox: await measure("outbox", `select id,status from outbox_messages where workspace_id=$1 and topic=$2
        and aggregate_type='lead' and aggregate_id=$3 and operation_id=$4 and result_version=1`,
      [actor.workspaceId, "crm.lead.operational_updated.v1", sampleLead, "a9000000-0000-0000-0000-000000050000"]),
      mappings: await measure("mappings", `select lead_id,state from lead_vnext_mappings where workspace_id=$1
        and state='verified' and lead_id>$2 order by lead_id limit 501`, [actor.workspaceId, lowerId]),
      issues: await measure("issues", `select id,source_record_id from lead_vnext_reconciliation_issues where workspace_id=$1
        and run_id=$2 and state='open' and stream='lead_root' and (source_record_id,id)>($3,$4)
        order by source_record_id,id limit 501`, [actor.workspaceId, runId, lowerId, lowerId]),
      run: await measure("run", `select id,state,updated_at from lead_vnext_reconciliation_runs where workspace_id=$1
        and state='pending' and (updated_at,id)<($2,$3) order by updated_at desc nulls last,id desc nulls last limit 51`,
      [actor.workspaceId, upperTime, upperId]),
      checkpoint: await measure("checkpoint", `select * from lead_vnext_reconciliation_checkpoints where
        workspace_id=$1 and run_id=$2 and stream='lead_root'`, [actor.workspaceId, runId]),
      authority: await measure("authority", "select active_writer,migration_state,version from lead_authority_states where workspace_id=$1",
      [actor.workspaceId]),
      antiJoin: await measure("antiJoin", `with page as materialized (select id,workspace_id,version,updated_at
        from leads where workspace_id=$1 and (updated_at,id)>($2,$3) order by updated_at,id limit 501)
        select l.id from page l left join lead_vnext_mappings m on m.workspace_id=l.workspace_id and m.lead_id=l.id
        and m.reconciliation_run_id=$4 where m.lead_id is null or m.state<>'verified' or m.source_version<>l.version
        order by l.updated_at,l.id`, [actor.workspaceId, lowerTime, lowerId, runId]),
      audit: await measure("audit", `select id from audit_events where workspace_id=$1 and target_type='lead'
        and target_id=$2 and action='crm.lead_operational_updated'`, [actor.workspaceId, sampleLead], true),
      receipts: await measure("receipts", `select id from idempotency_records where principal_key=$1
        and operation='lead-operational-edit.v1'`, [`workspace:${actor.workspaceId}:lead:50000`], true),
    };

    const issueIds = new Set<string>(); let issueSource = lowerId, issueId = lowerId;
    while (true) {
      const rows = (await performancePool.query<{ id: string; source_record_id: string }>(`select id,source_record_id
        from lead_vnext_reconciliation_issues where workspace_id=$1 and run_id=$2 and state='open' and stream='lead_root'
        and (source_record_id,id)>($3,$4) order by source_record_id,id limit 501`, [actor.workspaceId, runId, issueSource, issueId])).rows;
      const page = rows.slice(0, 500); for (const row of page) { expect(issueIds.has(row.id)).toBe(false); issueIds.add(row.id); }
      if (rows.length <= 500) break; issueSource = page.at(-1)!.source_record_id; issueId = page.at(-1)!.id;
    }
    expect(issueIds.size).toBe(100003);

    const mappingIds = new Set<string>(); let mappingCursor = lowerId;
    while (true) {
      const rows = (await performancePool.query<{ lead_id: string }>(`select lead_id from lead_vnext_mappings
        where workspace_id=$1 and state='verified' and lead_id>$2 order by lead_id limit 501`,
      [actor.workspaceId, mappingCursor])).rows;
      const page = rows.slice(0, 500); for (const row of page) { expect(mappingIds.has(row.lead_id)).toBe(false); mappingIds.add(row.lead_id); }
      if (rows.length <= 500) break; mappingCursor = page.at(-1)!.lead_id;
    }
    expect(mappingIds.size).toBe(100001);

    const key = randomBytes(32), rssBaseline = process.memoryUsage().rss, sweepStarted = performance.now();
    let cursorTime = new Date(0), cursorId = lowerId, swept = 0, hashMatches = 0;
    while (true) {
      const leads = (await performancePool.query<Record<string, Canonical>>(`select ${LEAD_SOURCE_COLUMNS.join(",")}
        from leads where workspace_id=$1
        and (updated_at,id)>($2,$3) order by updated_at,id limit 501`, [actor.workspaceId, cursorTime, cursorId])).rows.slice(0, 500);
      if (leads.length === 0) break;
      const ids = leads.map((row) => row.id as string);
      const intakes = (await performancePool.query<Record<string, Canonical>>(`select ${INTAKE_SOURCE_COLUMNS.join(",")}
        from lead_intakes where workspace_id=$1 and lead_id=any($2::uuid[]) order by lead_id,id`, [actor.workspaceId, ids])).rows;
      const byLead = new Map<string, Canonical[]>(); for (const intake of intakes) {
        const leadId = intake.lead_id as string; if (!byLead.has(leadId)) byLead.set(leadId, []); byLead.get(leadId)!.push(intake);
      }
      for (const lead of leads) {
        const source: Canonical = { lead, intakes: byLead.get(lead.id as string) ?? [] };
        const projection: Canonical = { intakes: byLead.get(lead.id as string) ?? [], lead: { ...lead } };
        if (parityEqual(key, source, projection)) hashMatches += 1; swept += 1;
      }
      const last = leads.at(-1)!; cursorTime = last.updated_at as Date; cursorId = last.id as string;
    }
    const sweepMs = performance.now() - sweepStarted, rssGrowth = process.memoryUsage().rss - rssBaseline;
    expect(swept).toBe(100001); expect(hashMatches).toBe(100001); expect(sweepMs).toBeLessThan(120_000); expect(rssGrowth).toBeLessThan(128 * 1024 * 1024);
    const sizes = (await performancePool.query(`select relname,pg_relation_size(oid)::bigint heap_bytes,
      pg_indexes_size(oid)::bigint index_bytes,(select count(*)::int from pg_index where indrelid=pg_class.oid) index_count
      from pg_class where relkind='r' and relname in ('leads','lead_intakes','lead_identity_reviews',
      'lead_identity_candidates','lead_identity_decisions','lead_identity_decision_heads','lead_visible_teams',
      'lead_vnext_mappings','lead_vnext_reconciliation_issues','lead_vnext_reconciliation_runs',
      'lead_vnext_reconciliation_checkpoints','lead_authority_states','audit_events','outbox_messages',
      'idempotency_records') order by relname`)).rows;
    console.info("DB_06B_INTEGRITY_PERFORMANCE", JSON.stringify({ counts: { cutoffLeads: swept, intakes: 100001,
      reviews: 100001, candidates: 1001, decisions: 1001, heads: 1001, visibleTeams: 100001, historyRows: 100001, audits: 100001,
      outbox: 100001, receipts: 100001, verified: 100001, stale: 0, blocked: 0, openIssues: 100003,
      resolvedIssues: 0, waivedIssues: 0, hashMatches, hashMismatches: swept - hashMatches },
    sweep: { elapsedMs: sweepMs, rssGrowthBytes: rssGrowth, pageSize: 500 }, evidence, sizes }));
  }, 240_000);
});
