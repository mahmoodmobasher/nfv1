import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const connectionString = process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow";
const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString });

async function fixture(db: Pool | PoolClient = pool) {
  const userId = (await db.query<{ id: string }>(
    "insert into users(display_name,status) values('Lead vNext Owner','active') returning id",
  )).rows[0].id;
  const workspaceId = (await db.query<{ id: string }>(
    `insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
     values('Lead vNext',$1,'active','growth','monthly',$2) returning id`, [`lead-vnext-${randomUUID()}`, userId],
  )).rows[0].id;
  const roleId = (await db.query<{ id: string }>(
    "insert into roles(workspace_id,code) values($1,'owner') returning id", [workspaceId],
  )).rows[0].id;
  const membershipId = (await db.query<{ id: string }>(
    "insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active') returning id",
    [workspaceId, userId, roleId],
  )).rows[0].id;
  const stageId = (await db.query<{ id: string }>(
    "insert into pipeline_stages(workspace_id,name,position,status) values($1,'New',0,'active') returning id", [workspaceId],
  )).rows[0].id;
  return { userId, workspaceId, membershipId, stageId };
}

async function createLead(db: Pool | PoolClient, actor: Awaited<ReturnType<typeof fixture>>) {
  return (await db.query<{ id: string; version: number; authority_contract_version: string }>(
    `insert into leads(workspace_id,display_name,person_name_normalized,email_display,email_normalized,source,
     original_source_category,original_source_medium,original_source_detail,original_campaign_context,
     attribution_contract_version,intake_channel,stage_id,status,visibility)
     values($1,'Dormant Lead','dormant lead',$2,$2,'manual','manual','unknown','{}','{}','p1a-attribution-v1',
     'manual',$3,'open','workspace') returning id,version,authority_contract_version`,
    [actor.workspaceId, `lead-${randomUUID()}@example.test`, actor.stageId],
  )).rows[0];
}

async function createRun(db: Pool | PoolClient, actor: Awaited<ReturnType<typeof fixture>>) {
  return (await db.query<{ id: string }>(
    `insert into lead_vnext_reconciliation_runs(workspace_id,source_cutoff_at,source_cutoff_id,operation_id,
     created_by_membership_id) values($1,now(),$2,$3,$4) returning id`,
    [actor.workspaceId, randomUUID(), randomUUID(), actor.membershipId],
  )).rows[0].id;
}

suite("DB-06A dormant Lead vNext persistence", () => {
  beforeAll(async () => { await pool.query("select 1"); });
  beforeEach(async () => { await pool.query("truncate users cascade"); });
  afterAll(async () => { await pool.end(); });

  it("installs exactly five dormant tables, four Lead columns and five local-row triggers", async () => {
    const tables = (await pool.query<{ table_name: string }>(`select table_name from information_schema.tables
      where table_schema='public' and table_name like 'lead_%' and table_name in
      ('lead_authority_states','lead_vnext_mappings','lead_vnext_reconciliation_runs',
       'lead_vnext_reconciliation_checkpoints','lead_vnext_reconciliation_issues') order by table_name`)).rows;
    expect(tables.map((row) => row.table_name)).toEqual([
      "lead_authority_states", "lead_vnext_mappings", "lead_vnext_reconciliation_checkpoints",
      "lead_vnext_reconciliation_issues", "lead_vnext_reconciliation_runs",
    ]);
    const columns = (await pool.query<{ column_name: string }>(`select column_name from information_schema.columns
      where table_schema='public' and table_name='leads' and column_name in
      ('authority_contract_version','governing_operation_id','created_by_membership_id','updated_by_membership_id')
      order by column_name`)).rows;
    expect(columns).toHaveLength(4);
    const triggers = (await pool.query<{ tgname: string; table_name: string; function_def: string }>(`select t.tgname,
      c.relname table_name,pg_get_functiondef(t.tgfoid) function_def
      from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and
      t.tgname in ('lead_authority_states_enforce_v1','lead_vnext_mappings_enforce_v1',
      'lead_vnext_reconciliation_runs_enforce_v1','lead_vnext_reconciliation_checkpoints_enforce_v1',
      'lead_vnext_reconciliation_issues_enforce_v1') order by t.tgname`)).rows;
    expect(triggers).toHaveLength(5);
    expect(triggers.some((row) => row.table_name === "leads")).toBe(false);
    for (const trigger of triggers) expect(trigger.function_def).not.toMatch(/\b(leads|lead_intakes|lead_identity_reviews|lead_activities|audit_events|outbox_messages)\b/i);
  });

  it("keeps the P1A writer compatible and rejects unfenced vNext authority", async () => {
    const actor = await fixture(), lead = await createLead(pool, actor);
    expect(lead.authority_contract_version).toBe("p1a-lead-v1");
    await pool.query("update leads set display_name='Still P1A',version=version+1 where workspace_id=$1 and id=$2", [actor.workspaceId, lead.id]);
    await expect(pool.query("update leads set authority_contract_version='lead-vnext-v1' where id=$1", [lead.id])).rejects.toThrow();
    await pool.query("update leads set authority_contract_version='lead-vnext-v1',governing_operation_id=$2 where id=$1", [lead.id, randomUUID()]);
    const foreignActor = await fixture();
    await expect(pool.query("update leads set created_by_membership_id=$2 where id=$1", [lead.id, foreignActor.membershipId])).rejects.toThrow();
  });

  it("enforces run lifecycle, monotonic counts, immutable source identity and deletion", async () => {
    const actor = await fixture(), runId = await createRun(pool, actor);
    await expect(pool.query(`update lead_vnext_reconciliation_runs set leads_scanned=1,version=2
      where id=$1`, [runId])).rejects.toThrow();
    await expect(pool.query(`update lead_vnext_reconciliation_runs set state='running',started_at=now(),
      leads_scanned=1,leads_verified=1,version=2 where id=$1`, [runId])).resolves.toBeDefined();
    await expect(pool.query("update lead_vnext_reconciliation_runs set leads_scanned=0,version=3 where id=$1", [runId])).rejects.toThrow();
    await expect(pool.query("update lead_vnext_reconciliation_runs set source_cutoff_id=$2,version=3 where id=$1", [runId, randomUUID()])).rejects.toThrow();
    await expect(pool.query("delete from lead_vnext_reconciliation_runs where id=$1", [runId])).rejects.toThrow();
  });

  it("enforces authority direction and Workspace-qualified run/Membership provenance", async () => {
    const actor = await fixture(), foreign = await fixture(), runId = await createRun(pool, actor);
    await pool.query("insert into lead_authority_states(workspace_id,governing_operation_id) values($1,$2)", [actor.workspaceId, randomUUID()]);
    await pool.query(`update lead_authority_states set migration_state='shadow',version=2,governing_operation_id=$2 where workspace_id=$1`,
      [actor.workspaceId, randomUUID()]);
    await expect(pool.query(`update lead_authority_states set active_writer='vnext',migration_state='observing',
      cutover_run_id=$2,switched_at=now(),switched_by_membership_id=$3,version=3,governing_operation_id=$4 where workspace_id=$1`,
      [actor.workspaceId, runId, actor.membershipId, randomUUID()])).rejects.toThrow();
    await expect(pool.query(`insert into lead_authority_states(workspace_id,governing_operation_id,cutover_run_id)
      values($1,$2,$3)`, [foreign.workspaceId, randomUUID(), runId])).rejects.toThrow();
  });

  it("enforces mapping shape, immutable identity, version fencing and NO ACTION retention", async () => {
    const actor = await fixture(), foreign = await fixture(), lead = await createLead(pool, actor);
    const foreignLead = await createLead(pool, foreign), runId = await createRun(pool, actor), foreignRunId = await createRun(pool, foreign);
    await expect(pool.query(`insert into lead_vnext_mappings(workspace_id,lead_id,source_version,reconciliation_run_id,
      governing_operation_id) values($1,$2,1,$3,$4)`, [actor.workspaceId, lead.id, foreignRunId, randomUUID()])).rejects.toThrow();
    await expect(pool.query(`insert into lead_vnext_mappings(workspace_id,lead_id,source_version,reconciliation_run_id,
      governing_operation_id) values($1,$2,1,$3,$4)`, [actor.workspaceId, foreignLead.id, runId, randomUUID()])).rejects.toThrow();
    await pool.query(`insert into lead_vnext_mappings(workspace_id,lead_id,source_version,reconciliation_run_id,
      governing_operation_id) values($1,$2,$3,$4,$5)`, [actor.workspaceId, lead.id, lead.version, runId, randomUUID()]);
    await pool.query(`update lead_vnext_mappings set state='verified',verified_source_version=source_version,
      verified_at=now(),version=2,governing_operation_id=$3 where workspace_id=$1 and lead_id=$2`,
      [actor.workspaceId, lead.id, randomUUID()]);
    await expect(pool.query("update lead_vnext_mappings set lead_id=$3,version=3,governing_operation_id=$4 where workspace_id=$1 and lead_id=$2",
      [actor.workspaceId, lead.id, randomUUID(), randomUUID()])).rejects.toThrow();
    await expect(pool.query("delete from leads where id=$1", [lead.id])).rejects.toThrow();
    await expect(pool.query("delete from lead_vnext_mappings where lead_id=$1", [lead.id])).rejects.toThrow();
  });

  it("enforces monotonic checkpoint cursors without querying source tables", async () => {
    const actor = await fixture(), runId = await createRun(pool, actor), firstId = randomUUID(), secondId = randomUUID();
    const [lowId, highId] = [firstId, secondId].sort();
    await pool.query(`insert into lead_vnext_reconciliation_checkpoints(workspace_id,run_id,stream,last_sort_at,last_id)
      values($1,$2,'lead_root','2026-01-01',$3)`, [actor.workspaceId, runId, lowId]);
    await pool.query(`update lead_vnext_reconciliation_checkpoints set last_id=$3,processed_count=1,version=2
      where workspace_id=$1 and run_id=$2 and stream='lead_root'`, [actor.workspaceId, runId, highId]);
    await expect(pool.query(`update lead_vnext_reconciliation_checkpoints set last_id=$3,version=3
      where workspace_id=$1 and run_id=$2 and stream='lead_root'`, [actor.workspaceId, runId, lowId])).rejects.toThrow();
  });

  it("keeps issue evidence typed, privacy-safe, immutable and terminal", async () => {
    const actor = await fixture(), runId = await createRun(pool, actor), sourceId = randomUUID(), relatedId = randomUUID();
    await expect(pool.query(`insert into lead_vnext_reconciliation_issues(workspace_id,run_id,stream,source_record_type,
      source_record_id,issue_code,safe_code) values($1,$2,'lead_root','lead',$3,'source_version_changed',$4)`,
      [actor.workspaceId, runId, sourceId, "raw@email.test"])).rejects.toThrow();
    const issueId = (await pool.query<{ id: string }>(`insert into lead_vnext_reconciliation_issues(workspace_id,run_id,
      stream,source_record_type,source_record_id,issue_code,expected_version,observed_version,related_record_id,safe_code)
      values($1,$2,'lead_root','lead',$3,'source_version_changed',1,2,$4,'version_changed') returning id`,
      [actor.workspaceId, runId, sourceId, relatedId])).rows[0].id;
    for (const evidenceMutation of [
      "expected_version=2", "observed_version=3", `related_record_id='${randomUUID()}'`, "safe_code='rewritten'",
    ]) await expect(pool.query(`update lead_vnext_reconciliation_issues set ${evidenceMutation},state='resolved',
      resolution_code='reconciled',resolved_at=now(),resolved_by_membership_id=$2,version=2 where id=$1`,
    [issueId, actor.membershipId])).rejects.toThrow();
    await pool.query(`update lead_vnext_reconciliation_issues set state='resolved',resolution_code='reconciled',
      resolved_at=now(),resolved_by_membership_id=$2,version=2 where id=$1`, [issueId, actor.membershipId]);
    await expect(pool.query("update lead_vnext_reconciliation_issues set version=3 where id=$1", [issueId])).rejects.toThrow();
    await expect(pool.query("delete from lead_vnext_reconciliation_issues where id=$1", [issueId])).rejects.toThrow();
  });

  it("detects a concurrent P1A version change without locking or mutating the Lead", async () => {
    const actor = await fixture(), lead = await createLead(pool, actor), runId = await createRun(pool, actor);
    await pool.query(`update lead_vnext_reconciliation_runs set state='running',started_at=now(),version=2 where id=$1`, [runId]);
    await pool.query(`insert into lead_vnext_reconciliation_checkpoints(workspace_id,run_id,stream)
      values($1,$2,'lead_root')`, [actor.workspaceId, runId]);
    const worker = await pool.connect();
    try {
      await worker.query("begin");
      const observed = (await worker.query<{ version: number }>(
        "select version from leads where workspace_id=$1 and id=$2", [actor.workspaceId, lead.id],
      )).rows[0].version;
      await pool.query("update leads set display_name='P1A changed',version=version+1 where workspace_id=$1 and id=$2",
        [actor.workspaceId, lead.id]);
      const current = (await worker.query<{ version: number }>(
        "select version from leads where workspace_id=$1 and id=$2", [actor.workspaceId, lead.id],
      )).rows[0].version;
      expect(current).toBe(observed + 1);
      await worker.query(`insert into lead_vnext_mappings(workspace_id,lead_id,source_version,state,
        reconciliation_run_id,governing_operation_id) values($1,$2,$3,'stale',$4,$5)`,
      [actor.workspaceId, lead.id, current, runId, randomUUID()]);
      await worker.query(`insert into lead_vnext_reconciliation_issues(workspace_id,run_id,stream,source_record_type,
        source_record_id,issue_code,expected_version,observed_version,safe_code)
        values($1,$2,'lead_root','lead',$3,'source_version_changed',$4,$5,'version_changed')`,
      [actor.workspaceId, runId, lead.id, observed, current]);
      await worker.query(`update lead_vnext_reconciliation_checkpoints set processed_count=1,issue_count=1,version=2
        where workspace_id=$1 and run_id=$2 and stream='lead_root'`, [actor.workspaceId, runId]);
      await worker.query(`update lead_vnext_reconciliation_runs set leads_scanned=1,leads_stale=1,issues_opened=1,
        version=3 where id=$1`, [runId]);
      await worker.query("commit");
    } catch (error) { await worker.query("rollback"); throw error; } finally { worker.release(); }
    expect((await pool.query("select display_name,version from leads where id=$1", [lead.id])).rows[0]).toEqual({
      display_name: "P1A changed", version: lead.version + 1,
    });
  });

  it("rolls back a late Workspace FK failure without Lead or evidence mutation", async () => {
    const actor = await fixture(), foreign = await fixture(), lead = await createLead(pool, actor), runId = await createRun(pool, actor);
    const before = (await pool.query("select version,authority_contract_version from leads where id=$1", [lead.id])).rows[0];
    await expect((async () => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(`insert into lead_vnext_mappings(workspace_id,lead_id,source_version,reconciliation_run_id,
          governing_operation_id) values($1,$2,1,$3,$4)`, [actor.workspaceId, lead.id, runId, randomUUID()]);
        const issueId = (await client.query<{ id: string }>(`insert into lead_vnext_reconciliation_issues(workspace_id,
          run_id,stream,source_record_type,source_record_id,issue_code)
          values($1,$2,'lead_root','lead',$3,'authority_conflict') returning id`,
        [actor.workspaceId, runId, lead.id])).rows[0].id;
        await client.query(`update lead_vnext_reconciliation_issues set state='resolved',resolution_code='reconciled',
          resolved_at=now(),resolved_by_membership_id=$2,version=2 where id=$1`, [issueId, foreign.membershipId]);
        await client.query("commit");
      } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
    })()).rejects.toThrow();
    expect((await pool.query("select count(*)::int count from lead_vnext_mappings where lead_id=$1", [lead.id])).rows[0].count).toBe(0);
    expect((await pool.query("select version,authority_contract_version from leads where id=$1", [lead.id])).rows[0]).toEqual(before);
  });
});

const performanceSuite = process.env.RUN_DB_PERFORMANCE === "1" ? describe : describe.skip;
const performancePool = new Pool({ connectionString });
function percentile(values: number[], quantile: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
}
function planNodes(plan: { "Node Type": string; Plans?: Array<{ "Node Type": string; Plans?: unknown[] }> }): string[] {
  return [plan["Node Type"], ...(plan.Plans ?? []).flatMap((child) => planNodes(child as typeof plan))];
}

performanceSuite("DB-06A Lead vNext representative performance", () => {
  beforeAll(async () => { await performancePool.query("select 1"); });
  afterAll(async () => { await performancePool.end(); });

  it("keeps source, mapping, issue, run, checkpoint and authority plans bounded", async () => {
    await performancePool.query("truncate users cascade");
    const actor = await fixture(performancePool), runId = randomUUID();
    await performancePool.query("begin");
    try {
      await performancePool.query("set local session_replication_role=replica");
      await performancePool.query(`insert into leads(id,workspace_id,display_name,person_name_normalized,email_display,
        email_normalized,source,original_source_category,original_source_medium,original_source_detail,
        original_campaign_context,attribution_contract_version,intake_channel,stage_id,status,visibility,updated_at)
        select ('91000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,'Lead '||g,'lead '||g,
        'lead-'||g||'@example.test','lead-'||g||'@example.test','manual','manual','unknown','{}','{}',
        'p1a-attribution-v1','manual',$2,'open','workspace',timestamptz '2026-01-01'+((g%1000)||' seconds')::interval
        from generate_series(1,100001) g`, [actor.workspaceId, actor.stageId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_runs(id,workspace_id,state,source_cutoff_at,
        source_cutoff_id,leads_scanned,operation_id,started_at,created_by_membership_id,updated_at)
        values($1,$2,'running',now(),gen_random_uuid(),100001,gen_random_uuid(),now(),$3,'2026-01-01')`,
      [runId, actor.workspaceId, actor.membershipId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_runs(id,workspace_id,source_cutoff_at,
        source_cutoff_id,operation_id,created_by_membership_id,updated_at) select
        ('95000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
        timestamptz '2026-01-01'+((g%1000)||' seconds')::interval,gen_random_uuid(),gen_random_uuid(),$2,
        timestamptz '2026-01-01'+((g%1000)||' seconds')::interval from generate_series(1,100001) g`,
      [actor.workspaceId, actor.membershipId]);
      await performancePool.query(`insert into lead_vnext_mappings(workspace_id,lead_id,source_version,state,
        reconciliation_run_id,governing_operation_id) select $1,
        ('91000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,1,'pending',$2,gen_random_uuid()
        from generate_series(1,100001) g`, [actor.workspaceId, runId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_issues(id,workspace_id,run_id,stream,
        source_record_type,source_record_id,issue_code) select
        ('92000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,$2,'lead_root','lead',
        ('91000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'missing_intake'
        from generate_series(1,100001) g`, [actor.workspaceId, runId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_issues(id,workspace_id,run_id,stream,
        source_record_type,source_record_id,issue_code) values
        ('93000000-0000-0000-0000-000000000050',$1,$2,'lead_root','lead',
         '91000000-0000-0000-0000-000000000050','multiple_intakes'),
        ('94000000-0000-0000-0000-000000000050',$1,$2,'lead_root','lead',
         '91000000-0000-0000-0000-000000000050','authority_conflict')`, [actor.workspaceId, runId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_checkpoints(workspace_id,run_id,stream)
        values($1,$2,'lead_root')`, [actor.workspaceId, runId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_checkpoints(workspace_id,run_id,stream)
        select $1,('95000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'lead_root'
        from generate_series(1,100001) g`, [actor.workspaceId]);
      await performancePool.query(`insert into lead_authority_states(workspace_id,governing_operation_id)
        select ('96000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,gen_random_uuid()
        from generate_series(1,100001) g`);
      await performancePool.query(`insert into lead_authority_states(workspace_id,governing_operation_id)
        values($1,gen_random_uuid())`, [actor.workspaceId]);
      await performancePool.query("commit");
    } catch (error) { await performancePool.query("rollback"); throw error; }
    await performancePool.query("analyze leads,lead_vnext_mappings,lead_vnext_reconciliation_issues,lead_vnext_reconciliation_runs,lead_vnext_reconciliation_checkpoints,lead_authority_states");

    async function measure(name: string, sql: string, params: unknown[]) {
      const explain = (await performancePool.query(`explain (analyze,buffers,format json) ${sql}`, params)).rows[0]["QUERY PLAN"][0];
      const nodes = planNodes(explain.Plan);
      expect(nodes, name).not.toContain("Seq Scan");
      const samples: number[] = [];
      for (let index = 0; index < 30; index += 1) {
        const started = performance.now(); await performancePool.query(sql, params); samples.push(performance.now() - started);
      }
      const p95 = percentile(samples, .95); expect(p95, name).toBeLessThan(200);
      return { executionMs: Number(explain["Execution Time"]), p95, nodes };
    }
    const evidence = {
      mappings: await measure("mappings", `select lead_id,source_version,verified_source_version,state,issue_count
        from lead_vnext_mappings where workspace_id=$1 and state=$2 and lead_id>$3
        order by lead_id limit 51`, [actor.workspaceId, "pending", "00000000-0000-0000-0000-000000000000"]),
      issues: await measure("issues", `select id,source_record_type,source_record_id,issue_code,state
        from lead_vnext_reconciliation_issues where workspace_id=$1 and run_id=$2 and state=$3 and stream=$4
        and (source_record_id,id)>($5,$6) order by source_record_id,id limit 51`,
      [actor.workspaceId, runId, "open", "lead_root", "00000000-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000000"]),
      runs: await measure("runs", `select id,state,updated_at from lead_vnext_reconciliation_runs where
        workspace_id=$1 and state=$2 and (updated_at,id)<($3,$4) order by updated_at desc nulls last,id desc nulls last limit 51`,
      [actor.workspaceId, "pending", "9999-01-01", "ffffffff-ffff-ffff-ffff-ffffffffffff"]),
      checkpoint: await measure("checkpoint", `select * from lead_vnext_reconciliation_checkpoints where
        workspace_id=$1 and run_id=$2 and stream=$3`, [actor.workspaceId, runId, "lead_root"]),
      source: await measure("source", `select id,version,updated_at,authority_contract_version from leads where
        workspace_id=$1 and (updated_at,id)>($2,$3) and (updated_at,id)<=($4,$5)
        order by updated_at,id limit 500`, [actor.workspaceId, "2000-01-01", "00000000-0000-0000-0000-000000000000", "9999-01-01", "ffffffff-ffff-ffff-ffff-ffffffffffff"]),
      authority: await measure("authority", `select active_writer,migration_state,version from lead_authority_states
        where workspace_id=$1`, [actor.workspaceId]),
    };

    const mapped = new Set<string>(); let mappingCursor = "00000000-0000-0000-0000-000000000000";
    while (true) {
      const rows = (await performancePool.query<{ lead_id: string }>(`select lead_id from lead_vnext_mappings
        where workspace_id=$1 and state='pending' and lead_id>$2 order by lead_id limit 51`,
      [actor.workspaceId, mappingCursor])).rows;
      const page = rows.slice(0, 50); for (const row of page) { expect(mapped.has(row.lead_id)).toBe(false); mapped.add(row.lead_id); }
      if (rows.length <= 50) break; mappingCursor = page.at(-1)!.lead_id;
    }
    expect(mapped.size).toBe(100001);

    const issues = new Set<string>(); let sourceCursor = "00000000-0000-0000-0000-000000000000", issueCursor = sourceCursor;
    while (true) {
      const rows = (await performancePool.query<{ id: string; source_record_id: string }>(`select id,source_record_id
        from lead_vnext_reconciliation_issues where workspace_id=$1 and run_id=$2 and state='open' and stream='lead_root'
        and (source_record_id,id)>($3,$4) order by source_record_id,id limit 51`,
      [actor.workspaceId, runId, sourceCursor, issueCursor])).rows;
      const page = rows.slice(0, 50); for (const row of page) { expect(issues.has(row.id)).toBe(false); issues.add(row.id); }
      if (rows.length <= 50) break; sourceCursor = page.at(-1)!.source_record_id; issueCursor = page.at(-1)!.id;
    }
    expect(issues.size).toBe(100003);
    for (const id of ["92000000-0000-0000-0000-000000000050", "93000000-0000-0000-0000-000000000050", "94000000-0000-0000-0000-000000000050"])
      expect(issues.has(id)).toBe(true);

    const sizes = (await performancePool.query(`select relname,pg_relation_size(oid)::bigint heap_bytes,
      pg_indexes_size(oid)::bigint index_bytes,
      (select count(*)::int from pg_index where indrelid=pg_class.oid) index_count
      from pg_class where relkind='r' and relname in
      ('leads','lead_vnext_mappings','lead_vnext_reconciliation_issues','lead_vnext_reconciliation_runs',
       'lead_vnext_reconciliation_checkpoints','lead_authority_states') order by relname`)).rows.map((row) =>
      ({ ...row, indexToHeapRatio: Number(row.index_bytes) / Math.max(1, Number(row.heap_bytes)) }));
    console.info("DB_06A_LEAD_VNEXT_PERFORMANCE_EVIDENCE", JSON.stringify({ rows: 100001, issues: 100003, evidence, sizes }));
  }, 240_000);
});
