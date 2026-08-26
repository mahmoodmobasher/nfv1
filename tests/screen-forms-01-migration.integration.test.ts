import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { databaseHealth } from "../src/server/db/health";
import { runMigrations } from "../src/server/db/migrate";

const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const source = new URL(process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow");
const admin = new Pool({ connectionString: source.toString() });
const databases: string[] = [];
const head = "1787782332432";

async function database() {
  const name = `nexaflow_forms_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`create database ${name}`);
  databases.push(name);
  const url = new URL(source); url.pathname = `/${name}`;
  return url.toString();
}

async function migrate(url: string) {
  const prior = process.env.DATABASE_URL; process.env.DATABASE_URL = url;
  try { await runMigrations(); } finally { process.env.DATABASE_URL = prior; }
}

suite("SCREEN-FORMS-01 migration integrity", () => {
  afterAll(async () => {
    for (const name of databases) {
      await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname=$1", [name]);
      await admin.query(`drop database if exists ${name}`);
    }
    await admin.end();
  });

  it("migrates fresh through exact 25-entry head and reruns as a no-op", async () => {
    const url = await database();
    await migrate(url);
    const db = new Pool({ connectionString: url });
    expect(await databaseHealth(db)).toMatchObject({ ok: true });
    const ledger = (await db.query("select count(*)::int count,max(created_at)::text head from drizzle.__drizzle_migrations")).rows[0];
    expect(ledger).toEqual({ count: 25, head });
    await db.end();
    await migrate(url);
    const again = new Pool({ connectionString: url });
    expect((await again.query("select count(*)::int count,max(created_at)::text head from drizzle.__drizzle_migrations")).rows[0]).toEqual(ledger);
    await again.end();
  });
});
