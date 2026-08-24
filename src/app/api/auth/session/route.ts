import { getServerEnv } from "@/server/env";
import { localDatabase, sessionToken } from "@/server/http";
import { privateSessionJson } from "@/server/identity/http";
import { resolveIdentityContext } from "@/server/security/session";
export async function GET(request: Request) { const { pool } = localDatabase(); const env=getServerEnv(); try { const context = await resolveIdentityContext(pool, sessionToken(request), env.SESSION_SECRET,new Date(),{idleMinutes:env.SESSION_IDLE_MINUTES,touchIntervalSeconds:env.SESSION_TOUCH_INTERVAL_SECONDS}); return privateSessionJson(Boolean(context)); } finally { await pool.end(); } }
