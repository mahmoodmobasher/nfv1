import { NextResponse } from "next/server";
import { getServerEnv } from "@/server/env";
import { localDatabase, sessionToken } from "@/server/http";
import { resolveIdentityContext } from "@/server/security/session";
export async function GET(request: Request) { const { pool } = localDatabase(); const env=getServerEnv(); try { const context = await resolveIdentityContext(pool, sessionToken(request), env.SESSION_SECRET,new Date(),{idleMinutes:env.SESSION_IDLE_MINUTES,touchIntervalSeconds:env.SESSION_TOUCH_INTERVAL_SECONDS}); return NextResponse.json(context ? { authenticated: true, userId: context.userId } : { authenticated: false }); } finally { await pool.end(); } }
