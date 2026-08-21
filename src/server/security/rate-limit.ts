import type { Pool, PoolClient } from "pg";
import { keyedHash } from "./crypto";

export async function consumeRateLimit(
  database: Pool | PoolClient,
  input: { action: string; riskKey: string; limit: number; windowSeconds: number; secret: string; now?: Date },
): Promise<boolean> {
  const now = input.now ?? new Date();
  const windowMs = input.windowSeconds * 1000;
  const started = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const expires = new Date(started.getTime() + windowMs);
  const result = await database.query<{ attempts: number }>(
    `insert into rate_limit_windows (action, risk_key_hash, window_started_at, attempts, expires_at)
     values ($1, $2, $3, 1, $4)
     on conflict (action, risk_key_hash, window_started_at)
     do update set attempts = rate_limit_windows.attempts + 1, updated_at = now()
     returning attempts`,
    [input.action, keyedHash(input.riskKey, input.secret), started, expires],
  );
  return result.rows[0].attempts <= input.limit;
}

export async function consumeRateLimitDimensions(
  database: Pool | PoolClient,
  inputs: Array<{ action: string; riskKey: string; limit: number; windowSeconds: number; secret: string; now?: Date }>,
): Promise<boolean> {
  const results = await Promise.all(inputs.map((input) => consumeRateLimit(database, input)));
  return results.every(Boolean);
}
