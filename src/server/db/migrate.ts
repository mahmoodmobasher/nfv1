import { readFileSync } from "node:fs";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { Pool, PoolClient } from "pg";
import { createDb } from "./client";

const migrationsFolder = "./src/server/db/migrations";
const expandTag = "0013_p1a_lead_intake_expand";
const checkpointKey = "p1a-0013-leads";
type Journal = { entries: Array<{ tag: string; when: number }> };

async function applyThroughExpand(pool: Pool) {
  const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8")) as Journal;
  const expandWhen = journal.entries.find((entry) => entry.tag === expandTag)?.when;
  if (!expandWhen) throw new Error(`Missing migration journal entry: ${expandTag}`);
  const migrations = readMigrationFiles({ migrationsFolder });
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("create schema if not exists drizzle");
    await client.query(`create table if not exists drizzle.__drizzle_migrations (
      id serial primary key, hash text not null, created_at bigint
    )`);
    const latest = await client.query<{ created_at: string }>(
      "select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1",
    );
    const lastApplied = Number(latest.rows[0]?.created_at ?? 0);
    for (const migration of migrations) {
      if (migration.folderMillis <= lastApplied || migration.folderMillis > expandWhen) continue;
      for (const statement of migration.sql) await client.query(statement);
      await client.query("insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)", [migration.hash, migration.folderMillis]);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function backfillLeadCompatibility(pool: Pool) {
  for (;;) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into p1a_migration_checkpoints(migration_key) values($1)
         on conflict(migration_key) do nothing`,
        [checkpointKey],
      );
      const batch = await client.query<{ id: string }>(
        `with selected as (
           select id from leads
           where display_name is null or person_name_normalized is null
              or original_source_category is null or received_at is null
           order by id limit 500 for update skip locked
         )
         update leads l set
           display_name=coalesce(l.display_name,nullif(btrim(concat_ws(' ',l.first_name,l.last_name)),'')),
           person_name_normalized=coalesce(l.person_name_normalized,lower(nullif(btrim(concat_ws(' ',l.first_name,l.last_name)),''))),
           original_source_category=coalesce(l.original_source_category,l.source),
           received_at=coalesce(l.received_at,l.created_at)
         from selected where l.id=selected.id returning l.id`,
      );
      if (batch.rowCount === 0) {
        await client.query(
          "update p1a_migration_checkpoints set completed_at=now(),updated_at=now() where migration_key=$1",
          [checkpointKey],
        );
        await client.query("commit");
        return;
      }
      await updateCheckpoint(client, batch.rows.map((row) => row.id));
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

async function updateCheckpoint(client: PoolClient, ids: string[]) {
  const lastLeadId = [...ids].sort().at(-1);
  await client.query(
    `update p1a_migration_checkpoints
     set last_lead_id=$2,rows_processed=rows_processed+$3,batches_committed=batches_committed+1,completed_at=null,updated_at=now()
     where migration_key=$1`,
    [checkpointKey, lastLeadId, ids.length],
  );
}

export async function runMigrations() {
  const { db, pool } = createDb();
  try {
    await applyThroughExpand(pool);
    await backfillLeadCompatibility(pool);
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  runMigrations().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
