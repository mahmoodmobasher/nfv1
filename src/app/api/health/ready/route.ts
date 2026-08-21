import { createDb } from "@/server/db/client";
import { databaseIsReady } from "@/server/db/readiness";
import { getServerEnv } from "@/server/env";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let pool: ReturnType<typeof createDb>["pool"] | undefined;
  try {
    const env = getServerEnv();
    ({ pool } = createDb({ connectionString: env.DATABASE_URL }));
    const ready = await databaseIsReady(pool);
    return Response.json(
      { status: ready ? "ready" : "not_ready" },
      { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } },
    );
  } catch { return Response.json({ status: "not_ready" }, { status: 503, headers: { "cache-control": "no-store" } }); }
  finally { await pool?.end(); }
}
