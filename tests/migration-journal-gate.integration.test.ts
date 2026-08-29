import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

/**
 * THE canonical schema gate.
 *
 * Every other migration suite asserts only its OWN migration's effects at its own
 * journal index, so adding a migration does not turn them red. This file is the one
 * place that pins the schema as a whole, and it is expected to be updated -- once,
 * deliberately -- in the same commit as any new migration.
 *
 * If this file fails and you did not just add a migration, something changed the
 * schema that nobody intended. Investigate before updating the constants.
 */

const migrationsFolder = "src/server/db/migrations";
const connectionString = process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow";
const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString });

// ---- update these three constants when you add a migration -------------------
const EXPECTED_JOURNAL_LENGTH = 27;
const EXPECTED_HEAD_TAG = "0026_remarkable_young_avengers";
const EXPECTED_HEAD_IDX = 26;
// -----------------------------------------------------------------------------

const journal = () => JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8")) as {
  entries: Array<{ idx: number; tag: string; when: number }>;
};

const columnsOf = async (table: string) => (await pool.query<{ column_name: string }>(
  `select column_name from information_schema.columns
    where table_schema='public' and table_name=$1 order by ordinal_position`,
  [table],
)).rows.map((row) => row.column_name);

/** Columns that must exist on leads. Adding one here is a deliberate act, not a side effect. */
const LEADS_COLUMNS = [
  "authority_contract_version", "governing_operation_id", "created_by_membership_id", "updated_by_membership_id",
  "salutation", "job_title", "secondary_email_normalized", "secondary_email_display",
  "mobile_phone_display", "mobile_phone_normalized", "mobile_phone_country_code_used",
  "fax_display", "fax_normalized", "fax_country_code_used",
  "website_url", "twitter_handle",
  "promotional_email_opt_out", "promotional_email_opt_out_recorded_at", "promotional_email_opt_out_source",
  "rating", "industry",
  "annual_revenue_minor", "annual_revenue_currency_code", "annual_revenue_currency_exponent", "employee_count",
  "street", "city", "state_province", "postal_code", "country",
  "source_platform",
  "status_source", "lifecycle_changed_at", "working_started_at", "qualified_at",
  "disqualification_reason", "disqualification_note", "lifecycle_reopen_count",
] as const;

suite("migration journal gate", () => {
  beforeAll(async () => { await pool.query("select 1"); });
  afterAll(async () => { await pool.end(); });

  it("pins the journal length and head to the frozen expectation", () => {
    const entries = journal().entries;
    expect(entries).toHaveLength(EXPECTED_JOURNAL_LENGTH);
    expect(entries.at(-1)).toMatchObject({ idx: EXPECTED_HEAD_IDX, tag: EXPECTED_HEAD_TAG });
  });

  it("keeps journal indexes contiguous, ordered, and uniquely tagged", () => {
    const entries = journal().entries;
    entries.forEach((entry, position) => expect(entry.idx).toBe(position));
    expect(new Set(entries.map((entry) => entry.tag)).size).toBe(entries.length);
    for (let position = 1; position < entries.length; position += 1) {
      expect(entries[position].when).toBeGreaterThan(entries[position - 1].when);
    }
  });

  it("has applied every journal entry to the database exactly once", async () => {
    const entries = journal().entries;
    const applied = (await pool.query<{ created_at: string }>(
      "select created_at::text from drizzle.__drizzle_migrations order by created_at",
    )).rows.map((row) => row.created_at);
    expect(applied).toEqual(entries.map((entry) => String(entry.when)));
  });

  it("pins the column inventory of leads", async () => {
    const present = await columnsOf("leads");
    expect(LEADS_COLUMNS.filter((column) => !present.includes(column))).toEqual([]);
  });
});
