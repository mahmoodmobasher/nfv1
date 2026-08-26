import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow";
const integrationSuite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const performanceSuite = process.env.RUN_DB_PERFORMANCE === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString });

const indexName = "audit_events_workspace_target_action_occurred_idx";
const action = "crm.lead_operational_updated";
const targetId = "a0000000-0000-4000-8000-000000000001";
const zeroId = "00000000-0000-0000-0000-000000000000";
const lowerTime = "2025-12-31T23:59:59.000Z";

type Fixture = { subjectWorkspaceId: string; noiseWorkspaceId: string; thirdWorkspaceId: string };

async function assertIsolatedTarget() {
  const url = new URL(connectionString);
  const database = url.pathname.slice(1);
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname) || !/^nexaflow_db00a01(?:_|$)/.test(database)) {
    throw new Error("DB-00A-01 requires an isolated loopback database named nexaflow_db00a01*");
  }
}

async function createFixture(): Promise<Fixture> {
  await pool.query("truncate users cascade");
  const userId = (await pool.query<{ id: string }>(
    "insert into users(display_name,status) values('Platform Audit Fixture','active') returning id",
  )).rows[0].id;
  const workspaces = (await pool.query<{ id: string }>(`insert into workspaces
    (name,slug,status,plan_code,billing_cadence,created_by_user_id)
    select 'Audit Workspace '||g,'db00a01-'||g||'-'||replace(gen_random_uuid()::text,'-',''),
      'active','growth','monthly',$1 from generate_series(1,3) g returning id`, [userId])).rows;
  return {
    subjectWorkspaceId: workspaces[0].id,
    noiseWorkspaceId: workspaces[1].id,
    thirdWorkspaceId: workspaces[2].id,
  };
}

type PlanNode = {
  "Node Type": string;
  "Index Name"?: string;
  Plans?: PlanNode[];
  "Rows Removed by Filter"?: number;
  "Shared Hit Blocks"?: number;
  "Shared Read Blocks"?: number;
};

function flatten(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(flatten)];
}

async function explain(sql: string, params: unknown[]) {
  const result = await pool.query(`explain (analyze,buffers,format json) ${sql}`, params);
  const root = result.rows[0]["QUERY PLAN"][0];
  const nodes = flatten(root.Plan as PlanNode);
  return {
    executionMs: Number(root["Execution Time"]),
    nodes: nodes.map((node) => node["Node Type"]),
    indexNames: nodes.flatMap((node) => node["Index Name"] ? [node["Index Name"]] : []),
    rowsRemoved: nodes.reduce((sum, node) => sum + Number(node["Rows Removed by Filter"] ?? 0), 0),
    sharedBuffers: nodes.reduce((sum, node) => sum + Number(node["Shared Hit Blocks"] ?? 0)
      + Number(node["Shared Read Blocks"] ?? 0), 0),
  };
}

async function p95(sql: string, params: unknown[]) {
  const samples: number[] = [];
  for (let sample = 0; sample < 30; sample += 1) {
    const started = performance.now();
    await pool.query(sql, params);
    samples.push(performance.now() - started);
  }
  return samples.sort((left, right) => left - right)[Math.ceil(samples.length * 0.95) - 1];
}

integrationSuite("DB-00A-01 Platform Audit target lookup", () => {
  beforeAll(async () => { await assertIsolatedTarget(); await pool.query("select 1"); });
  afterAll(async () => { if (process.env.RUN_DB_PERFORMANCE !== "1") await pool.end(); });

  it("installs exactly the frozen nonunique partial index", async () => {
    const indexes = (await pool.query<{ indexname: string; indexdef: string }>(`select indexname,indexdef
      from pg_indexes where schemaname='public' and tablename='audit_events' order by indexname`)).rows;
    expect(indexes.map((row) => row.indexname)).toEqual(["audit_events_pkey", indexName]);
    const definition = indexes.find((row) => row.indexname === indexName)!.indexdef
      .replaceAll('"', "").replace(/\s+/g, " ").toLowerCase();
    expect(definition).toContain(`create index ${indexName} on public.audit_events using btree
      (workspace_id, target_type, target_id, action, occurred_at, id)`.replace(/\s+/g, " "));
    expect(definition).toContain("where ((workspace_id is not null) and (target_id is not null))");
    expect(definition).not.toContain("unique index");
  });
});

performanceSuite("DB-00A-01 representative Platform Audit plans", () => {
  let fixture: Fixture;

  beforeAll(async () => {
    await assertIsolatedTarget();
    fixture = await createFixture();
    await pool.query(`insert into audit_events
      (id,occurred_at,workspace_id,actor_type,action,target_type,target_id,outcome,request_id,
       correlation_id,before,after,metadata_version,metadata)
      select ('10000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,
       '2026-01-01T00:00:00Z'::timestamptz + ((g-1)/1000)*interval '1 second',$1,'system',$2,
       'lead',case when g<=101 then $3::uuid else
         ('30000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid end,
       case when g%10=0 then 'failure' else 'success' end,'request-'||g,'correlation-'||g,
       jsonb_build_object('version',g),jsonb_build_object('version',g+1),1,
       jsonb_build_object('operation','lead-operational-edit.v1','result_version',g)
      from generate_series(1,100001) g`, [fixture.subjectWorkspaceId, action, targetId]);
    await pool.query(`insert into audit_events
      (id,occurred_at,workspace_id,actor_type,action,target_type,target_id,outcome,request_id,
       correlation_id,before,after,metadata_version,metadata)
      select ('20000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,
       '2026-01-01T00:00:00Z'::timestamptz + ((g-1)/1000)*interval '1 second',$1,'system',$2,
       'lead',case when g<=101 then $3::uuid else
         ('40000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid end,
       'success','noise-request-'||g,'noise-correlation-'||g,
       jsonb_build_object('version',g),jsonb_build_object('version',g+1),1,
       jsonb_build_object('operation','lead-operational-edit.v1','result_version',g)
      from generate_series(1,100001) g`,
    [fixture.noiseWorkspaceId, action, targetId]);
    await pool.query(`insert into audit_events
      (occurred_at,workspace_id,actor_type,action,target_type,target_id,outcome,metadata)
      select '2026-01-01T00:00:00Z'::timestamptz,$1,'system','crm.lead_stage_transitioned','lead',$2,
       'success','{}'::jsonb from generate_series(1,1001)`, [fixture.subjectWorkspaceId, targetId]);
    await pool.query(`insert into audit_events(workspace_id,actor_type,action,target_type,target_id,outcome,metadata)
      values (null,'system','platform.global','platform',null,'success','{}'),
       ($1,'system','platform.workspace','workspace',null,'success','{}'),
       ($2,'system','crm.lead_operational_updated','lead',null,'success','{}')`,
    [fixture.thirdWorkspaceId, fixture.subjectWorkspaceId]);
    await pool.query("analyze audit_events");
  }, 120_000);

  afterAll(async () => { await pool.end(); });

  it("keeps target/action evidence tenant-bounded and keyset-stable", async () => {
    const populations = await pool.query<{ subject: number; cross_workspace: number; action_noise: number; excluded: number }>(`select
      count(*) filter (where workspace_id=$1 and target_id is not null and target_type='lead')::int subject,
      count(*) filter (where workspace_id=$2 and target_id is not null)::int cross_workspace,
      count(*) filter (where workspace_id=$1 and action='crm.lead_stage_transitioned')::int action_noise,
      count(*) filter (where workspace_id is null or target_id is null)::int excluded from audit_events`,
    [fixture.subjectWorkspaceId, fixture.noiseWorkspaceId]);
    expect(populations.rows[0]).toEqual({ subject: 101002, cross_workspace: 100001, action_noise: 1001, excluded: 3 });

    const lookupSql = `select id,occurred_at,outcome,request_id,correlation_id,metadata_version,metadata
      from audit_events where workspace_id=$1 and target_type=$2 and target_id=$3 and action=$4
      and (occurred_at,id)>($5,$6) order by occurred_at,id limit 51`;
    const params = [fixture.subjectWorkspaceId, "lead", targetId, action, lowerTime, zeroId];
    const lookupPlan = await explain(lookupSql, params);
    expect(lookupPlan.nodes).not.toContain("Seq Scan");
    expect(lookupPlan.indexNames).toContain(indexName);
    const lookupP95 = await p95(lookupSql, params);
    expect(lookupP95).toBeLessThan(200);

    const exactSql = `select id from audit_events where workspace_id=$1 and target_type='lead'
      and target_id=$2 and action='crm.lead_operational_updated'`;
    const exactPlan = await explain(exactSql, [fixture.subjectWorkspaceId, targetId]);
    expect(exactPlan.nodes).not.toContain("Seq Scan");
    expect(exactPlan.indexNames).toContain(indexName);
    expect((await pool.query(exactSql, [fixture.subjectWorkspaceId, targetId])).rowCount).toBe(101);
    expect(await p95(exactSql, [fixture.subjectWorkspaceId, targetId])).toBeLessThan(200);

    const successSql = `select count(*)::int count from audit_events where workspace_id=$1 and target_type=$2
      and target_id=$3 and action=$4 and outcome='success'`;
    const successPlan = await explain(successSql, params.slice(0, 4));
    expect(successPlan.nodes).not.toContain("Seq Scan");
    expect(successPlan.indexNames).toContain(indexName);
    const success = await pool.query<{ count: number }>(successSql, params.slice(0, 4));
    expect(success.rows[0].count).toBe(91);
    const successP95 = await p95(successSql, params.slice(0, 4));
    expect(successP95).toBeLessThan(200);

    const ids = new Set<string>();
    let cursorTime = lowerTime, cursorId = zeroId;
    while (true) {
      const rows = (await pool.query<{ id: string; occurred_at: Date }>(lookupSql,
        [fixture.subjectWorkspaceId, "lead", targetId, action, cursorTime, cursorId])).rows;
      for (const row of rows) {
        expect(ids.has(row.id)).toBe(false);
        ids.add(row.id);
      }
      if (rows.length < 51) break;
      cursorTime = rows.at(-1)!.occurred_at.toISOString();
      cursorId = rows.at(-1)!.id;
    }
    expect(ids.size).toBe(101);

    const sizes = (await pool.query<{ heap_bytes: string; index_bytes: string }>(`select
      pg_relation_size('audit_events')::text heap_bytes,
      pg_relation_size($1::regclass)::text index_bytes`, [indexName])).rows[0];
    const ratio = Number(sizes.index_bytes) / Number(sizes.heap_bytes);
    expect(ratio).toBeLessThanOrEqual(0.75);

    const appendSamples: number[] = [];
    for (let sample = 0; sample < 30; sample += 1) {
      const started = performance.now();
      await pool.query(`insert into audit_events(workspace_id,actor_type,action,target_type,target_id,outcome,metadata)
        values($1,'system',$2,'lead',$3,'success','{}')`, [fixture.subjectWorkspaceId, action, targetId]);
      appendSamples.push(performance.now() - started);
    }
    const appendP95 = appendSamples.sort((left, right) => left - right)[28];
    expect(appendP95).toBeLessThan(200);

    const bulkStarted = performance.now();
    await pool.query(`insert into audit_events(workspace_id,actor_type,action,target_type,target_id,outcome,metadata)
      select $1,'system',$2,'lead',$3,'success','{}'::jsonb from generate_series(1,10000)`,
    [fixture.subjectWorkspaceId, action, targetId]);
    const bulkAppendMs = performance.now() - bulkStarted;

    console.info("DB_00A_01_AUDIT_INDEX_EVIDENCE", JSON.stringify({
      rows: { subject: 100001, crossWorkspaceNoise: 100001, actionNoise: 1001, globalOrNontarget: 3 },
      lookup: { ...lookupPlan, p95: lookupP95 }, exact: exactPlan,
      success: { ...successPlan, p95: successP95 },
      storage: { heapBytes: Number(sizes.heap_bytes), indexBytes: Number(sizes.index_bytes), ratio },
      writes: { appendP95, bulkRows: 10000, bulkAppendMs },
    }));
  }, 120_000);
});
