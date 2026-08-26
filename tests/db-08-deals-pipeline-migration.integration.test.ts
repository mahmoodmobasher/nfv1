import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { Pool, type PoolClient } from "pg";
import { databaseHealth } from "../src/server/db/health";
import { runMigrations } from "../src/server/db/migrate";

const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const sourceUrl = new URL(process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow");
const admin = new Pool({ connectionString: sourceUrl.toString() });
const databases: string[] = [];
const migrationsFolder = "src/server/db/migrations";
const previousTag = "0021_db_00a_01_platform_audit_target_lookup";
const migrationTag = "0022_db_08_deals_pipeline_v1";
const migrationWhen = 1787768262741;
const salesTables = [
  "deal_party_refs",
  "deal_stage_definitions",
  "deal_stage_transitions",
  "deal_visible_teams",
  "deals",
  "lead_deal_conversion_lineage",
  "sales_pipelines",
];

function databaseUrl(name: string) {
  const url = new URL(sourceUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function createDatabase() {
  const name = `nexaflow_db08a_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`create database ${name}`);
  databases.push(name);
  return { name, url: databaseUrl(name) };
}

async function migrateAt(url: string) {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  try {
    await runMigrations();
  } finally {
    process.env.DATABASE_URL = previous;
  }
}

function journal() {
  return JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8")) as {
    entries: Array<{ idx: number; tag: string; when: number }>;
  };
}

async function applyThrough0021(client: PoolClient) {
  const cutoff = journal().entries.find((entry) => entry.tag === previousTag)?.when;
  if (!cutoff) throw new Error(`Missing migration checkpoint ${previousTag}`);
  const migrations = readMigrationFiles({ migrationsFolder });
  await client.query("begin");
  try {
    await client.query("create schema drizzle");
    await client.query(
      "create table drizzle.__drizzle_migrations(id serial primary key,hash text not null,created_at bigint)",
    );
    for (const migration of migrations) {
      if (migration.folderMillis > cutoff) continue;
      for (const statement of migration.sql) await client.query(statement);
      await client.query(
        "insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)",
        [migration.hash, migration.folderMillis],
      );
      if (migration.folderMillis === journal().entries.find((entry) => entry.tag === "0013_p1a_lead_intake_expand")?.when) {
        await client.query(
          `insert into p1a_migration_checkpoints(migration_key,completed_at)
           values('p1a-0013-leads',now())`,
        );
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

suite("DB-08A migration integrity", () => {
  afterAll(async () => {
    for (const name of databases) {
      await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname=$1", [name]);
      await admin.query(`drop database if exists ${name}`);
    }
    await admin.end();
  });

  it("migrates fresh to the exact 23-entry head, reports healthy, and reruns as a no-op", async () => {
    const database = await createDatabase();
    await migrateAt(database.url);
    const pool = new Pool({ connectionString: database.url });
    expect(await databaseHealth(pool)).toMatchObject({ ok: true });
    const ledger = (await pool.query<{ count: number; head: string }>(
      `select count(*)::int count,max(created_at)::text head from drizzle.__drizzle_migrations`,
    )).rows[0];
    expect(ledger).toEqual({ count: 23, head: String(migrationWhen) });
    const tables = (await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema='public' and table_name=any($1) order by table_name`,
      [salesTables],
    )).rows.map((row) => row.table_name);
    expect(tables).toEqual(salesTables);
    for (const table of salesTables) {
      expect(Number((await pool.query(`select count(*) from ${table}`)).rows[0].count)).toBe(0);
    }
    await pool.end();

    await migrateAt(database.url);
    const rerun = new Pool({ connectionString: database.url });
    expect((await rerun.query(
      `select count(*)::int count,max(created_at)::text head from drizzle.__drizzle_migrations`,
    )).rows[0]).toEqual(ledger);
    await rerun.end();
  });

  it("migrates forward from exact 0021 without changing retained facts or the legacy pipeline", async () => {
    const database = await createDatabase();
    const before = new Pool({ connectionString: database.url });
    const client = await before.connect();
    try {
      await applyThrough0021(client);
    } finally {
      client.release();
    }
    await before.query(
      `with u as (
        insert into users(primary_email_normalized,primary_email_display,display_name,status)
        values('db08a-forward@example.test','db08a-forward@example.test','Forward Owner','active') returning id
      ), w as (
        insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
        select 'DB-08A Forward','db08a-forward','active','growth','monthly',id from u returning id
      )
      insert into pipeline_stages(workspace_id,name,position)
      select id,'Retained legacy stage',7 from w`,
    );
    const baseline = (await before.query(
      `select count(*)::int count,
       md5(string_agg(workspace_id::text||':'||id::text||':'||name||':'||position,',' order by id)) digest
       from pipeline_stages`,
    )).rows[0];
    await before.end();

    await migrateAt(database.url);
    const after = new Pool({ connectionString: database.url });
    expect((await after.query(
      `select count(*)::int count,
       md5(string_agg(workspace_id::text||':'||id::text||':'||name||':'||position,',' order by id)) digest
       from pipeline_stages`,
    )).rows[0]).toEqual(baseline);
    expect((await after.query(
      `select count(*)::int count,max(created_at)::text head from drizzle.__drizzle_migrations`,
    )).rows[0]).toEqual({ count: 23, head: String(migrationWhen) });
    for (const table of salesTables) {
      expect(Number((await after.query(`select count(*) from ${table}`)).rows[0].count)).toBe(0);
    }
    await after.end();
  });

  it("rolls back every DB-08A object when a late migration statement fails", async () => {
    const database = await createDatabase();
    const pool = new Pool({ connectionString: database.url });
    const client = await pool.connect();
    try {
      await applyThrough0021(client);
      const migration = readMigrationFiles({ migrationsFolder })
        .find((entry) => entry.folderMillis === migrationWhen);
      if (!migration) throw new Error(`Missing ${migrationTag}`);
      await client.query("begin");
      try {
        for (const statement of migration.sql) await client.query(statement);
        await client.query("select 1/0");
        throw new Error("Expected deliberate late migration failure");
      } catch (error) {
        await client.query("rollback");
        expect(error).toMatchObject({ code: "22012" });
      }
    } finally {
      client.release();
    }
    const objects = await pool.query(
      `select count(*)::int count from pg_class where relnamespace='public'::regnamespace and relname=any($1)`,
      [salesTables],
    );
    expect(objects.rows[0].count).toBe(0);
    expect((await pool.query("select count(*)::int count from drizzle.__drizzle_migrations")).rows[0].count)
      .toBe(22);
    await pool.end();
  });

  it("keeps the generated journal and snapshot at the exact frozen file boundary", () => {
    const entries = journal().entries;
    expect(entries).toHaveLength(23);
    expect(entries.at(-1)).toMatchObject({ idx: 22, tag: migrationTag, when: migrationWhen });
    const snapshot = JSON.parse(
      readFileSync(`${migrationsFolder}/meta/0022_snapshot.json`, "utf8"),
    ) as { tables: Record<string, unknown> };
    for (const table of salesTables) expect(snapshot.tables).toHaveProperty(`public.${table}`);
    const sql = readFileSync(`${migrationsFolder}/0022_db_08_deals_pipeline_v1.sql`, "utf8");
    for (const trigger of [
      "sales_pipeline_code_immutable_v1",
      "deal_stage_identity_immutable_v1",
      "deal_stage_transition_insert_only_v1",
      "lead_deal_conversion_lineage_insert_only_v1",
    ]) expect(sql).toContain(trigger);
  });
});
