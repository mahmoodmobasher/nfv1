import { NextResponse } from "next/server";
import { z } from "zod";
import { identityConfig, localDatabase, mutationGuard, requestRiskContext } from "@/server/http";
import { verifyEmailToken } from "@/server/identity/service";
const input = z.object({ token: z.string().min(20).max(200) });
export async function POST(request: Request) { const rejected = mutationGuard(request); if (rejected) return rejected; const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, code: "invalid_or_expired" }, { status: 400 }); const { pool } = localDatabase();
  try { const result = await verifyEmailToken(pool, parsed.data.token, identityConfig(), requestRiskContext(request)); return NextResponse.json(result, { status: result.ok ? 200 : 400 }); } finally { await pool.end(); } }
