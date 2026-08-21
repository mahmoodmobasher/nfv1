import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/server/env";
import { identityConfig, localDatabase, mutationGuard, requestRiskContext, sessionToken } from "@/server/http";
import { loginPassword } from "@/server/identity/service";
import { cookie } from "@/server/security/request";

const input = z.object({ email: z.string().email(), password: z.string().min(1).max(256) });
export async function POST(request: Request) {
  const rejected = mutationGuard(request); if (rejected) return rejected;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, code: "invalid_credentials", message: "The email or password is incorrect." }, { status: 401 });
  const { pool } = localDatabase(); const env = getServerEnv();
  try {
    const result = await loginPassword(pool, { ...parsed.data, riskKey: requestRiskContext(request), existingSession: sessionToken(request) }, identityConfig());
    if (!result.ok) return NextResponse.json(result, { status: 401 });
    const response = NextResponse.json({ ok: true, next: "/workspace/create" });
    response.headers.set("Set-Cookie", cookie(env.SESSION_COOKIE_NAME, result.sessionToken, { secure: env.APP_ORIGIN.startsWith("https://"), maxAge: env.SESSION_ABSOLUTE_HOURS * 3600 }));
    return response;
  } finally { await pool.end(); }
}
