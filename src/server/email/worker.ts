import { createDb } from "../db/client";
import { getServerEnv } from "../env";
import { createEmailAdapter } from "./factory";
import { processOneOutbox } from "./outbox";

export async function runWorkerBatch(limit = 25): Promise<number> {
  const env = getServerEnv();
  const { pool } = createDb();
  const adapter = createEmailAdapter(env);
  let processed = 0;
  try {
    while (processed < limit && await processOneOutbox(pool, adapter, env.SESSION_SECRET, `email-${process.pid}`)) processed += 1;
    return processed;
  } finally { await pool.end(); }
}

export async function runWorkerContinuous(): Promise<void> {
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    while (!stopping) {
      const processed = await runWorkerBatch();
      if (!processed) await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

if (process.argv[1]?.endsWith("worker.ts")) {
  const task = process.argv.includes("--continuous") ? runWorkerContinuous() : runWorkerBatch().then((processed) => console.log({ processed }));
  task.catch((error) => { console.error(error instanceof Error ? error.message : "email_worker_failed"); process.exitCode = 1; });
}
