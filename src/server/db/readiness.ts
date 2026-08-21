import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Pool } from "pg";

type MigrationJournal = { entries: Array<{ when: number }> };
type MigrationState = { applied_count: string; migration_head: string | null };

export function expectedMigrationState(root = process.cwd()): { count: number; head: number } {
  const journal = JSON.parse(readFileSync(join(root, "src/server/db/migrations/meta/_journal.json"), "utf8")) as MigrationJournal;
  const head = journal.entries.at(-1)?.when;
  if (!journal.entries.length || !head) throw new Error("migration_manifest_invalid");
  return { count: journal.entries.length, head };
}

export async function databaseIsReady(database: Pool): Promise<boolean> {
  try {
    const expected = expectedMigrationState();
    const result = await database.query<MigrationState>(
      `select count(*)::text as applied_count, max(created_at)::text as migration_head
         from drizzle.__drizzle_migrations`,
    );
    const actual = result.rows[0];
    return Number(actual?.applied_count) === expected.count && Number(actual?.migration_head) === expected.head;
  } catch {
    return false;
  }
}
