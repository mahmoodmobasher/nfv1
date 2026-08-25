import type { Pool, PoolClient } from "pg";

export type ModuleTransaction = PoolClient;

export async function runModuleTransaction<T>(pool: Pool, work: (tx: ModuleTransaction) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
