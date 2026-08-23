import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/server/env";
import { localDatabase, mutationGuard } from "@/server/http";
import { identity, enforceTenantRate } from "@/server/tenant-admin/http";
import { safeDenialAudit } from "@/server/tenant-admin/denial";
import { AccountError, changePassword } from "@/server/account/service";

const input = z.object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(1).max(256) });

function failure(error: unknown) {
  const known = error instanceof AccountError ? error : new AccountError("validation_failed", 400);
  return NextResponse.json({ ok: false, code: known.code }, { status: known.status });
}

export async function POST(request: Request) {
  const rejected = mutationGuard(request);
  if (rejected) return rejected;
  const { pool } = localDatabase();
  let session: { userId: string; sessionId: string } | undefined;
  try {
    const parsed = input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AccountError("validation_failed", 400);
    session = await identity(pool, request);
    await enforceTenantRate(pool, request, "recent_auth", session);
    return NextResponse.json({ data: await changePassword(pool, { ...session, ...parsed.data, recentMinutes: getServerEnv().RECENT_AUTH_MINUTES }) });
  } catch (error) {
    if (session) await safeDenialAudit(pool, { userId: session.userId, sessionId: session.sessionId, action: "identity.password_change_denied", targetType: "user", error });
    return failure(error);
  } finally {
    await pool.end();
  }
}
