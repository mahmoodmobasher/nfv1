import { createDb } from "@/server/db/client";
import { databaseIsReady } from "@/server/db/readiness";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { pool } = createDb();
  try {
    const ready = await databaseIsReady(pool);
    return Response.json(
      { status: ready ? "ready" : "not_ready" },
      { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } },
    );
  } finally {
    await pool.end();
  }
}
