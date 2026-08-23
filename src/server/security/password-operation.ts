import type { PoolClient } from "pg";

export async function lockPasswordOperation(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    "select pg_advisory_xact_lock(hashtext('identity.password_operation'), hashtext($1))",
    [userId],
  );
}
