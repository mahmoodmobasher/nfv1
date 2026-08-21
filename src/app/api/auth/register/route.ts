import { NextResponse } from "next/server";
import { z } from "zod";
import { identityConfig, localDatabase, mutationGuard, requestRiskContext } from "@/server/http";
import { registerPasswordUser } from "@/server/identity/service";
import { meetsPasswordPolicy } from "@/shared/password-policy";

const input = z.object({ email: z.string().email(), displayName: z.string().trim().min(1).max(120), password: z.string().refine(meetsPasswordPolicy),
  planCode: z.enum(["essentials", "growth", "scale"]).optional(), cadence: z.enum(["monthly", "annual"]).optional() });
export async function POST(request: Request) {
  const rejected = mutationGuard(request); if (rejected) return rejected;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, code: "invalid_request", message: "Check the submitted account details." }, { status: 400 });
  const { pool } = localDatabase();
  try { return NextResponse.json(await registerPasswordUser(pool, { ...parsed.data, riskKey: requestRiskContext(request), requestId: crypto.randomUUID() }, identityConfig()), { status: 202 }); }
  finally { await pool.end(); }
}
