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
const names: string[] = [], folder = "src/server/db/migrations", priorTag = "0024_db_01a_activity_target_timeline", head = "1787793528579";
const journal = () => JSON.parse(readFileSync(`${folder}/meta/_journal.json`, "utf8")) as { entries: Array<{ tag: string; when: number }> };

async function database() { const name = `nexaflow_db01b_${randomUUID().replaceAll("-", "")}`; await admin.query(`create database ${name}`); names.push(name); const url = new URL(source); url.pathname = `/${name}`; return url.toString(); }
async function migrate(url: string) { const before = process.env.DATABASE_URL; process.env.DATABASE_URL = url; try { await runMigrations(); } finally { process.env.DATABASE_URL = before; } }
async function through0024(client: PoolClient) {
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
async function seedLead(client: PoolClient, sourceValue: "manual" | "social_media") {
  await client.query("set session_replication_role=replica");
  await client.query(`insert into leads(id,workspace_id,display_name,person_name_normalized,email_display,email_normalized,source,original_source_category,stage_id) values('81000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000002','Forward','forward','forward@example.test','forward@example.test',$1,'manual','81000000-0000-0000-0000-000000000003')`, [sourceValue]);
  await client.query("set session_replication_role=origin");
}

suite("DB-01B migration integrity", () => {
  afterAll(async () => { for (const name of names) { await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname=$1", [name]); await admin.query(`drop database if exists ${name}`); } await admin.end(); });

  it("applies its own migration once with retained non-social rows, then no-ops", async () => {
    for (const mode of ["fresh", "forward"] as const) {
      const url = await database();
      if (mode === "forward") { const db = new Pool({ connectionString: url }), client = await db.connect(); try { await through0024(client); await seedLead(client, "manual"); } finally { client.release(); await db.end(); } }
      await migrate(url); const db = new Pool({ connectionString: url });
      expect(await databaseHealth(db)).toMatchObject({ ok: true });
      const ledger = (await db.query("select count(*)::int count,max(created_at)::text head from drizzle.__drizzle_migrations")).rows[0]; expect((await db.query("select count(*)::int count from drizzle.__drizzle_migrations where created_at=$1",[head])).rows[0]).toEqual({ count: 1 });
      if (mode === "forward") expect((await db.query("select source,source_platform from leads")).rows[0]).toEqual({ source: "manual", source_platform: null });
      await db.end(); await migrate(url); const again = new Pool({ connectionString: url }); expect((await again.query("select count(*)::int count,max(created_at)::text head from drizzle.__drizzle_migrations")).rows[0]).toEqual(ledger); await again.end();
    }
  });

  it("rejects pre-existing current social residue with complete rollback and no inference", async () => {
    const url = await database(), db = new Pool({ connectionString: url }), client = await db.connect(); try { await through0024(client); await seedLead(client, "social_media"); } finally { client.release(); }
    await expect(migrate(url)).rejects.toThrow(/db_01b_current_social_platform_required/);
    expect((await db.query("select count(*)::int count from drizzle.__drizzle_migrations")).rows[0].count).toBe(25);
    expect((await db.query("select count(*)::int count from information_schema.columns where table_name='leads' and column_name='source_platform'")).rows[0].count).toBe(0);
    expect((await db.query("select source,original_source_category from leads")).rows[0]).toEqual({ source: "social_media", original_source_category: "manual" }); await db.end();
  });

  it("rolls back a late constraint-name conflict after adding the column", async () => {
    const url = await database(), db = new Pool({ connectionString: url }), client = await db.connect(); try { await through0024(client); } finally { client.release(); }
    await db.query("alter table leads add constraint leads_current_source_platform_check check (true)");
    await expect(migrate(url)).rejects.toThrow();
    expect((await db.query("select count(*)::int count from drizzle.__drizzle_migrations")).rows[0].count).toBe(25);
    expect((await db.query("select count(*)::int count from information_schema.columns where table_name='leads' and column_name='source_platform'")).rows[0].count).toBe(0); await db.end();
  });
});
