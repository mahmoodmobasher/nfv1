import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";
import { getServerEnv } from "../env";

export function createDb(config: PoolConfig = { connectionString: getServerEnv().DATABASE_URL }) { const pool = new Pool(config); return { db: drizzle(pool, { schema }), pool }; }
export type AppDatabase = ReturnType<typeof createDb>["db"];
