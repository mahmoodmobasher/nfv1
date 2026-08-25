import type { Pool } from "pg";
import { getServerEnv } from "@/server/env";
import { requestRiskContext } from "@/server/http";
import { consumeRateLimitDimensions } from "@/server/security/rate-limit";
import type { TrustedActor } from "./authorization-facts";

export async function enforceManualIntakeRate(pool: Pool, request: Request, actor: TrustedActor): Promise<void> {
  const env = getServerEnv();
  const keys = [`actor:${actor.membershipId}`, `workspace:${actor.workspaceId}`, `network:${requestRiskContext(request).networkKey}`];
  const allowed = await consumeRateLimitDimensions(pool, keys.map(riskKey => ({ action: "lead_intake", riskKey,
    limit: 30, windowSeconds: 60, secret: env.SESSION_SECRET })));
  if (!allowed) throw Object.assign(new Error("rate_limited"), { code: "rate_limited", status: 429 });
}
