import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/server/env";
import { localDatabase, mutationGuard } from "@/server/http";
import { identity } from "@/server/tenant-admin/http";
import { safeDenialAudit } from "@/server/tenant-admin/denial";
import { AccountError, accountProfile, updateDisplayName } from "@/server/account/service";

const updateInput = z.object({ displayName: z.string().min(1).max(240) });

function failure(error: unknown) {
  const known = error instanceof AccountError ? error : new AccountError("validation_failed", 400);
  return NextResponse.json({ ok: false, code: known.code }, { status: known.status });
}

export async function GET(request: Request) {
  const { pool } = localDatabase();
  try {
    const session = await identity(pool, request);
    return NextResponse.json({ data: await accountProfile(pool, session, getServerEnv().RECENT_AUTH_MINUTES) });
  } catch (error) {
    return failure(error);
  } finally {
    await pool.end();
  }
}

export async function PATCH(request: Request) {
  const rejected = mutationGuard(request);
  if (rejected) return rejected;
  const { pool } = localDatabase();
  let session: { userId: string; sessionId: string } | undefined;
  try {
    const parsed = updateInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AccountError("validation_failed", 400);
    session = await identity(pool, request);
    return NextResponse.json({ data: await updateDisplayName(pool, session, parsed.data.displayName) });
  } catch (error) {
    if (session) await safeDenialAudit(pool, { userId: session.userId, sessionId: session.sessionId, action: "identity.profile_update_denied", targetType: "user", error });
    return failure(error);
  } finally {
    await pool.end();
  }
}
