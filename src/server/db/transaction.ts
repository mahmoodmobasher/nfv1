import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "./schema";
export async function withTransaction<T>(db: NodePgDatabase<typeof schema>, work: (tx: NodePgDatabase<typeof schema>) => Promise<T>): Promise<T> { return db.transaction(async (tx) => work(tx as NodePgDatabase<typeof schema>)); }
