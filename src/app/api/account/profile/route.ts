import { z } from "zod";
import { getServerEnv } from "@/server/env";
import { localDatabase, mutationGuard } from "@/server/http";
import { identity } from "@/server/tenant-admin/http";
import { safeDenialAudit } from "@/server/tenant-admin/denial";
import { AccountError, accountProfile, updateDisplayName } from "@/server/account/service";
import { accountFailure, privateAccountJson, privateAccountResponse } from "@/server/account/http";

const updateInput = z.object({ displayName: z.string().min(1).max(240) });

export async function GET(request: Request) {
  const { pool } = localDatabase();
  try {
    const session = await identity(pool, request);
    return privateAccountJson({ data: await accountProfile(pool, session, getServerEnv().RECENT_AUTH_MINUTES) });
  } catch (error) {
    return accountFailure(error);
  } finally {
    await pool.end();
  }
}

export async function PATCH(request: Request) {
  const rejected = mutationGuard(request);
  if (rejected) return privateAccountResponse(rejected);
  const { pool } = localDatabase();
  let session: { userId: string; sessionId: string } | undefined;
  try {
    const parsed = updateInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AccountError("validation_failed", 400);
    session = await identity(pool, request);
    return privateAccountJson({ data: await updateDisplayName(pool, session, parsed.data.displayName) });
  } catch (error) {
    if (session) await safeDenialAudit(pool, { userId: session.userId, sessionId: session.sessionId, action: "identity.profile_update_denied", targetType: "user", error });
    return accountFailure(error);
  } finally {
    await pool.end();
  }
}
