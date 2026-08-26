import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { Pool, type PoolClient } from "pg";
import { databaseHealth } from "../src/server/db/health";
import { runMigrations } from "../src/server/db/migrate";

const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const source = new URL(process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow");
const admin = new Pool({ connectionString: source.toString() });
const names: string[] = [], folder = "src/server/db/migrations", priorTag = "0023_screen_forms_01_profiles", head = "1787782332432";
const journal = () => JSON.parse(readFileSync(`${folder}/meta/_journal.json`, "utf8")) as { entries: Array<{ tag: string; when: number }> };

async function database() { const name = `nexaflow_db01a_${randomUUID().replaceAll("-", "")}`; await admin.query(`create database ${name}`); names.push(name); const url = new URL(source); url.pathname = `/${name}`; return url.toString(); }
async function migrate(url: string) { const before = process.env.DATABASE_URL; process.env.DATABASE_URL = url; try { await runMigrations(); } finally { process.env.DATABASE_URL = before; } }
async function through0023(client: PoolClient) {
  const cutoff = journal().entries.find((entry) => entry.tag === priorTag)!.when;
  await client.query("begin");
  try {
    await client.query("create schema drizzle"); await client.query("create table drizzle.__drizzle_migrations(id serial primary key,hash text not null,created_at bigint)");
    for (const migration of readMigrationFiles({ migrationsFolder: folder })) {
      if (migration.folderMillis > cutoff) continue;
      for (const statement of migration.sql) await client.query(statement);
      await client.query("insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)", [migration.hash, migration.folderMillis]);
      if (migration.folderMillis === journal().entries.find((entry) => entry.tag === "0013_p1a_lead_intake_expand")?.when) await client.query("insert into p1a_migration_checkpoints(migration_key,completed_at) values('p1a-0013-leads',now())");
    }
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; }
}

suite("DB-01A migration integrity", () => {
  afterAll(async () => { for (const name of names) { await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname=$1", [name]); await admin.query(`drop database if exists ${name}`); } await admin.end(); });

  it("migrates fresh and forward-empty to exact 25-entry head, then no-ops", async () => {
    for (const mode of ["fresh", "forward"] as const) {
      const url = await database();
      if (mode === "forward") { const db = new Pool({ connectionString: url }); const client = await db.connect(); try { await through0023(client); } finally { client.release(); await db.end(); } }
      await migrate(url); const db = new Pool({ connectionString: url });
      expect(await databaseHealth(db)).toMatchObject({ ok: true });
      const ledger = (await db.query("select count(*)::int count,max(created_at)::text head from drizzle.__drizzle_migrations")).rows[0];
      expect(ledger).toEqual({ count: 25, head }); await db.end();
      await migrate(url); const again = new Pool({ connectionString: url }); expect((await again.query("select count(*)::int count,max(created_at)::text head from drizzle.__drizzle_migrations")).rows[0]).toEqual(ledger); await again.end();
    }
  });

  it("rejects nonempty root-only or referenced state without ledger/schema/data drift", async () => {
    for (const withReference of [false, true]) {
      const url = await database(), db = new Pool({ connectionString: url }), client = await db.connect();
      try { await through0023(client); await client.query("set session_replication_role=replica"); await client.query(`insert into activity_records(id,workspace_id,kind,occurred_at,subject,created_by_membership_id) values('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002','call',now(),'Residue','71000000-0000-0000-0000-000000000003')`); if (withReference) await client.query(`insert into activity_record_references(workspace_id,activity_id,record_type,record_id) values('71000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000001','crm.lead','71000000-0000-0000-0000-000000000004')`); await client.query("set session_replication_role=origin"); }
      finally { client.release(); }
      await expect(migrate(url)).rejects.toThrow(/db_01a_activity_tables_must_be_empty/);
      expect((await db.query("select count(*)::int count from drizzle.__drizzle_migrations")).rows[0].count).toBe(24);
      expect((await db.query("select count(*)::int count from information_schema.columns where table_name='activity_record_references' and column_name='occurred_at'")).rows[0].count).toBe(0);
      expect((await db.query("select count(*)::int count from activity_records")).rows[0].count).toBe(1); await db.end();
    }
  });

  it("rolls back an empty-table late failure after the column statement", async () => {
    const url = await database(), db = new Pool({ connectionString: url }), client = await db.connect(); try { await through0023(client); } finally { client.release(); }
    await db.query("create index activity_record_references_target_timeline_idx on activity_record_references(activity_id)");
    await expect(migrate(url)).rejects.toThrow();
    expect((await db.query("select count(*)::int count from drizzle.__drizzle_migrations")).rows[0].count).toBe(24);
    expect((await db.query("select count(*)::int count from information_schema.columns where table_name='activity_record_references' and column_name='occurred_at'")).rows[0].count).toBe(0);
    expect((await db.query("select indexdef from pg_indexes where indexname='activity_record_references_target_timeline_idx'")).rows[0].indexdef).toContain("activity_id"); await db.end();
  });
});
