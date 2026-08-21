import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client";
export async function runMigrations() { const { db, pool } = createDb(); try { await migrate(db, { migrationsFolder: "./src/server/db/migrations" }); } finally { await pool.end(); } }
if (process.argv[1]?.endsWith("migrate.ts")) runMigrations().catch((error) => { console.error(error); process.exitCode = 1; });
