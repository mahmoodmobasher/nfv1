import { NextResponse } from "next/server";
import { z } from "zod";
import { localDatabase, mutationGuard } from "@/server/http";
import { identity } from "@/server/tenant-admin/http";
import { safeDenialAudit } from "@/server/tenant-admin/denial";
import { AccountError, accountPreferences, updateAccountPreferences } from "@/server/account/service";

const updateInput = z.object({
  appearance: z.enum(["system", "light", "dark"]).optional(),
  locale: z.string().trim().min(2).max(35).nullable().optional(),
  timeZone: z.string().trim().min(1).max(64).nullable().optional(),
  expectedVersion: z.number().int().nonnegative(),
}).refine((value) => value.appearance !== undefined || value.locale !== undefined || value.timeZone !== undefined, { message: "at least one preference is required" });

function failure(error: unknown) {
  const known = error instanceof AccountError ? error : new AccountError("validation_failed", 400);
  return NextResponse.json({ ok: false, code: known.code }, { status: known.status });
}

export async function GET(request: Request) {
  const { pool } = localDatabase();
  try {
    return NextResponse.json({ data: await accountPreferences(pool, await identity(pool, request)) });
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
    return NextResponse.json({ data: await updateAccountPreferences(pool, session, parsed.data) });
  } catch (error) {
    if (session) await safeDenialAudit(pool, { userId: session.userId, sessionId: session.sessionId, action: "identity.preferences_update_denied", targetType: "user_preference", error });
    return failure(error);
  } finally {
    await pool.end();
  }
}
