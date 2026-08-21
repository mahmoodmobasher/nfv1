import type { Pool } from "pg";
export async function databaseHealth(pool: Pool): Promise<{ ok: boolean; latencyMs: number }> { const started = Date.now(); try { await pool.query("select 1"); return { ok: true, latencyMs: Date.now() - started }; } catch { return { ok: false, latencyMs: Date.now() - started }; } }
