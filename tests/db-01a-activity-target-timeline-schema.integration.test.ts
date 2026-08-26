import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });

async function actor(db: Pool | PoolClient = pool) {
  const user = (await db.query<{ id: string }>("insert into users(display_name,status) values('Activity Owner','active') returning id")).rows[0].id;
  const workspace = (await db.query<{ id: string }>(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id) values('Activity',$1,'active','growth','monthly',$2) returning id`, [`activity-${randomUUID()}`, user])).rows[0].id;
  const role = (await db.query<{ id: string }>("insert into roles(workspace_id,code) values($1,'owner') returning id", [workspace])).rows[0].id;
  const membership = (await db.query<{ id: string }>("insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active') returning id", [workspace, user, role])).rows[0].id;
  return { workspace, membership };
}

async function activity(db: Pool | PoolClient, workspace: string, membership: string, occurredAt = new Date("2026-01-01T12:00:00Z")) {
  return (await db.query<{ id: string }>(`insert into activity_records(workspace_id,kind,occurred_at,subject,created_by_membership_id) values($1,'call',$2,'Manual call',$3) returning id`, [workspace, occurredAt, membership])).rows[0].id;
}

suite("DB-01A Activity target timeline projection", () => {
  beforeAll(async () => { await pool.query("select 1"); });
  beforeEach(async () => { await pool.query("truncate users cascade"); });
  afterAll(async () => { await pool.query("truncate activity_records cascade"); await pool.end(); });

  it("derives the projection, rejects caller mismatch/cross-Workspace roots, and freezes referenced chronology", async () => {
    const owner = await actor(), other = await actor();
    const occurredAt = new Date("2026-05-04T03:02:01Z");
    const id = await activity(pool, owner.workspace, owner.membership, occurredAt);
    await pool.query(`insert into activity_record_references(workspace_id,activity_id,record_type,record_id) values($1,$2,'crm.lead',$3)`, [owner.workspace, id, randomUUID()]);
    expect((await pool.query("select occurred_at from activity_record_references where activity_id=$1", [id])).rows[0].occurred_at).toEqual(occurredAt);
    const exactId = await activity(pool, owner.workspace, owner.membership, occurredAt);
    await pool.query(`insert into activity_record_references(workspace_id,activity_id,record_type,record_id,occurred_at) values($1,$2,'crm.lead',$3,$4)`, [owner.workspace, exactId, randomUUID(), occurredAt]);
    const mismatchId = await activity(pool, owner.workspace, owner.membership, occurredAt);
    await expect(pool.query(`insert into activity_record_references(workspace_id,activity_id,record_type,record_id,occurred_at) values($1,$2,'crm.lead',$3,$4)`, [owner.workspace, mismatchId, randomUUID(), new Date("2026-05-04T03:02:02Z")])).rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query("update activity_record_references set occurred_at=occurred_at+interval '1 second' where activity_id=$1", [id])).rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query("update activity_records set occurred_at=occurred_at+interval '1 second' where id=$1", [id])).rejects.toMatchObject({ code: "P0001" });
    const otherId = await activity(pool, other.workspace, other.membership);
    await expect(pool.query(`insert into activity_record_references(workspace_id,activity_id,record_type,record_id) values($1,$2,'crm.lead',$3)`, [owner.workspace, otherId, randomUUID()])).rejects.toMatchObject({ code: "23503" });
  });

  it("traverses a bounded target amid newer noise with tuple ties, sentinel, and exact index structure", async () => {
    const client = await pool.connect();
    const workspace = "60000000-0000-0000-0000-000000000001", member = "60000000-0000-0000-0000-000000000002";
    const target = "60000000-0000-0000-0000-000000000003", noise = "60000000-0000-0000-0000-000000000004";
    try {
      await client.query("begin");
      await client.query("set local session_replication_role=replica");
      for (const [prefix, recordId, year] of [["61", target, 2026], ["62", noise, 2030]] as const) {
        await client.query(`insert into activity_records(id,workspace_id,kind,occurred_at,subject,created_by_membership_id) select ($1 || '000000-0000-0000-0000-' || lpad(g::text,12,'0'))::uuid,$2,'call',make_timestamptz($3,1,1,0,0,0,'UTC')+((g%10)||' seconds')::interval,'Activity '||g,$4 from generate_series(1,100) g`, [prefix, workspace, year, member]);
        await client.query(`insert into activity_record_references(workspace_id,activity_id,record_type,record_id,occurred_at) select $2,($1 || '000000-0000-0000-0000-' || lpad(g::text,12,'0'))::uuid,'crm.lead',$3,make_timestamptz($4,1,1,0,0,0,'UTC')+((g%10)||' seconds')::interval from generate_series(1,100) g`, [prefix, workspace, recordId, year]);
      }
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
    type PageRow = { id: string; occurred_at: Date };
    const sql = `select a.id,ref.occurred_at from activity_record_references ref join activity_records a on a.workspace_id=ref.workspace_id and a.id=ref.activity_id where ref.workspace_id=$1 and ref.record_type='crm.lead' and ref.record_id=$2 and ($3::timestamptz is null or (ref.occurred_at,ref.activity_id)<($3::timestamptz,$4::uuid)) order by ref.occurred_at desc nulls last,ref.activity_id desc nulls last limit 18`;
    const seen = new Set<string>(); let cursorTime: Date | null = null, cursorId: string | null = null;
    let ties = false, tieCrossedBoundary = false, terminal = false, sentinelSeen = false;
    for (;;) {
      const page: PageRow[] = (await pool.query<PageRow>(sql, [workspace, target, cursorTime, cursorId])).rows;
      if (page.length === 0) { terminal = true; break; }
      if (cursorTime && page[0]?.occurred_at.getTime() === cursorTime.getTime()) tieCrossedBoundary = true;
      sentinelSeen ||= page.length === 18;
      const visible: PageRow[] = page.slice(0, 17);
      for (const row of visible) { expect(seen.has(row.id)).toBe(false); seen.add(row.id); }
      ties ||= visible.some((row, i) => i > 0 && row.occurred_at.getTime() === visible[i - 1].occurred_at.getTime());
      const cursor: PageRow = visible.at(-1)!; cursorTime = cursor.occurred_at; cursorId = cursor.id;
      if (page.length <= 17) { const empty = (await pool.query(sql, [workspace, target, cursorTime, cursorId])).rows; expect(empty).toHaveLength(0); terminal = true; break; }
    }
    expect({ rows: seen.size, ties, tieCrossedBoundary, sentinelSeen, terminal })
      .toEqual({ rows: 100, ties: true, tieCrossedBoundary: true, sentinelSeen: true, terminal: true });
    const catalog = (await pool.query<{ indexdef: string }>(`select indexdef from pg_indexes where schemaname='public' and indexname='activity_record_references_target_timeline_idx'`)).rows[0].indexdef;
    expect(catalog).toContain("(workspace_id, record_type, record_id, occurred_at DESC NULLS LAST, activity_id DESC NULLS LAST)");
    expect((await pool.query(`select is_nullable from information_schema.columns where table_schema='public' and table_name='activity_record_references' and column_name='occurred_at'`)).rows[0].is_nullable).toBe("NO");
  });
});
