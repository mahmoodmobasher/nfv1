import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { Pool, type PoolClient } from "pg";
import { runMigrations } from "../src/server/db/migrate";

const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const sourceUrl = new URL(process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow");
const admin = new Pool({ connectionString: sourceUrl.toString() });
const databases: string[] = [];

function databaseUrl(name: string) {
  const url = new URL(sourceUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function createDatabase() {
  const name = `p1a_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`create database ${name}`);
  databases.push(name);
  return { name, url: databaseUrl(name) };
}

async function migrateAt(url: string) {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  try { await runMigrations(); } finally { process.env.DATABASE_URL = previous; }
}

async function applyThrough0012(client: PoolClient) {
  const journal = JSON.parse(readFileSync("src/server/db/migrations/meta/_journal.json", "utf8")) as {
    entries: Array<{ tag: string; when: number }>;
  };
  const cutoff = journal.entries.find((entry) => entry.tag === "0012_commercial_catalog_authority")?.when;
  if (!cutoff) throw new Error("Missing 0012 migration checkpoint");
  const migrations = readMigrationFiles({ migrationsFolder: "src/server/db/migrations" });
  await client.query("begin");
  try {
    await client.query("create schema drizzle");
    await client.query("create table drizzle.__drizzle_migrations(id serial primary key,hash text not null,created_at bigint)");
    for (const migration of migrations) {
      if (migration.folderMillis > cutoff) continue;
      for (const statement of migration.sql) await client.query(statement);
      await client.query("insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)",
        [migration.hash, migration.folderMillis]);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

suite("P1A phased migration", () => {
  afterAll(async () => {
    for (const name of databases) {
      await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname=$1", [name]);
      await admin.query(`drop database if exists ${name}`);
    }
    await admin.end();
  });

  it("migrates fresh, reports healthy, and reruns as a ledger no-op", async () => {
    const database = await createDatabase();
    await migrateAt(database.url);
    const pool = new Pool({ connectionString: database.url });
    const firstLedgerCount = Number((await pool.query("select count(*)::int count from drizzle.__drizzle_migrations")).rows[0].count);
    expect((await pool.query("select 1 ok")).rows[0].ok).toBe(1);
    await pool.end();
    await migrateAt(database.url);
    const rerun = new Pool({ connectionString: database.url });
    expect(Number((await rerun.query("select count(*)::int count from drizzle.__drizzle_migrations")).rows[0].count)).toBe(firstLedgerCount);
    expect((await rerun.query("select completed_at is not null complete from p1a_migration_checkpoints where migration_key='p1a-0013-leads'")).rows[0].complete).toBe(true);
    await rerun.end();
  });

  it("rehearses 0012 forward with three committed batches and preserves every legacy fact", async () => {
    const database = await createDatabase();
    const before = new Pool({ connectionString: database.url });
    const client = await before.connect();
    await applyThrough0012(client);
    client.release();
    await before.query(`with u as (
      insert into users(primary_email_normalized,primary_email_display,display_name)
      values('legacy@example.test','legacy@example.test','Legacy') returning id
    ), w as (
      insert into workspaces(name,slug,plan_code,billing_cadence,created_by_user_id)
      select 'Legacy','legacy-forward','essentials','monthly',id from u returning id
    ), r as (
      insert into roles(workspace_id,code) select id,'owner' from w returning id,workspace_id
    ), m as (
      insert into workspace_memberships(workspace_id,user_id,role_id)
      select r.workspace_id,u.id,r.id from r cross join u returning id,workspace_id
    ), s as (
      insert into pipeline_stages(workspace_id,name,position) select workspace_id,'Legacy',0 from m returning id,workspace_id
    )
    insert into leads(workspace_id,first_name,last_name,email_normalized,email_display,company,phone,source,status,stage_id,owner_membership_id,visibility)
    select s.workspace_id,'Legacy',g::text,'legacy-'||g||'@example.test','legacy-'||g||'@example.test','Legacy Co',
      'original-'||g,'website',(array['open','won','lost'])[1+(g%3)],s.id,m.id,'workspace'
    from s cross join m cross join generate_series(1,1203) g`);
    const baseline = (await before.query(`select count(*)::int total,count(distinct workspace_id)::int workspaces,
      count(*) filter(where status='open')::int open_count,count(*) filter(where status='won')::int won_count,
      count(*) filter(where status='lost')::int lost_count,
      md5(string_agg(id::text||':'||status||':'||phone||':'||source,',' order by id)) digest from leads`)).rows[0];
    await before.end();

    await migrateAt(database.url);
    const after = new Pool({ connectionString: database.url });
    const retained = (await after.query(`select count(*)::int total,count(distinct workspace_id)::int workspaces,
      count(*) filter(where status='open')::int open_count,count(*) filter(where status='won')::int won_count,
      count(*) filter(where status='lost')::int lost_count,
      md5(string_agg(id::text||':'||status||':'||phone||':'||source,',' order by id)) digest,
      count(*) filter(where lifecycle_definition_id is not null)::int mapped,
      count(*) filter(where display_name is null or person_name_normalized is null or original_source_category is null or received_at is null)::int incomplete
      from leads`)).rows[0];
    expect(retained).toMatchObject({ ...baseline, mapped: 0, incomplete: 0 });
    const checkpoint = (await after.query(`select rows_processed::int,batches_committed from p1a_migration_checkpoints
      where migration_key='p1a-0013-leads'`)).rows[0];
    expect(checkpoint).toEqual({ rows_processed: 1203, batches_committed: 3 });
    expect(Number((await after.query("select count(*)::int count from leads l join lead_lifecycle_definitions d on d.id=l.lifecycle_definition_id where d.code='converted'")).rows[0].count)).toBe(0);
    await after.end();
  });
});
