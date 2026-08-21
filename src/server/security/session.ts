import type { Pool, PoolClient } from "pg";
import { keyedHash, randomOpaqueToken } from "./crypto";

export type IdentityContext = Readonly<{ userId: string; sessionId: string }>;

export async function createSession(
  database: Pool | PoolClient,
  input: { userId: string; securityVersion: number; secret: string; idleMinutes: number; absoluteHours: number; authMethod?: "password"|"google"|"fixture"; now?: Date },
): Promise<{ token: string; id: string }> {
  const token = randomOpaqueToken();
  const now = input.now ?? new Date();
  const idle = new Date(now.getTime() + input.idleMinutes * 60_000);
  const absolute = new Date(now.getTime() + input.absoluteHours * 3_600_000);
  const result = await database.query<{ id: string }>(
    `insert into sessions (user_id, session_hash, security_version, last_seen_at, idle_expires_at, absolute_expires_at, authenticated_at, auth_method)
     values ($1, $2, $3, $4, $5, $6, $4, $7) returning id`,
    [input.userId, keyedHash(token, input.secret), input.securityVersion, now, idle, absolute, input.authMethod ?? "password"],
  );
  return { token, id: result.rows[0].id };
}

export async function resolveIdentityContext(
  database: Pool | PoolClient,
  token: string | undefined,
  secret: string,
  now = new Date(),
  policy: { idleMinutes: number; touchIntervalSeconds: number } = { idleMinutes: 30, touchIntervalSeconds: 60 },
): Promise<IdentityContext | null> {
  if (!token) return null;
  const result = await database.query<{ session_id: string; user_id: string }>(
    `with valid as materialized (
       select s.id, s.user_id from sessions s join users u on u.id = s.user_id
        where s.session_hash = $1 and s.revoked_at is null and s.idle_expires_at > $2 and s.absolute_expires_at > $2
          and s.security_version = u.security_version and u.status = 'active'
     ), touched as (
       update sessions s set last_seen_at = $2,
         idle_expires_at = least(s.absolute_expires_at, $2 + ($3 * interval '1 minute')), updated_at = $2
       from valid v where s.id = v.id and s.last_seen_at <= $2 - ($4 * interval '1 second')
       returning s.id
     ) select v.id session_id, v.user_id from valid v`,
    [keyedHash(token, secret), now, policy.idleMinutes, policy.touchIntervalSeconds],
  );
  return result.rows[0] ? { userId: result.rows[0].user_id, sessionId: result.rows[0].session_id } : null;
}

export async function revokeCurrentSession(database: Pool | PoolClient, token: string | undefined, secret: string): Promise<void> {
  if (!token) return;
  await database.query("update sessions set revoked_at = coalesce(revoked_at, now()), updated_at = now() where session_hash = $1", [keyedHash(token, secret)]);
}

export async function revokeAllSessions(database: Pool | PoolClient, userId: string): Promise<void> {
  await database.query("update users set security_version = security_version + 1, updated_at = now() where id = $1", [userId]);
  await database.query("update sessions set revoked_at = coalesce(revoked_at, now()), updated_at = now() where user_id = $1", [userId]);
}
