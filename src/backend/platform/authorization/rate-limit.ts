import type { Pool } from "pg";
import { getServerEnv } from "@/server/env";
import { requestRiskContext } from "@/server/http";
import { consumeRateLimitDimensions } from "@/server/security/rate-limit";
import type { TrustedActor } from "./authorization-facts";

export async function enforceManualIntakeRate(pool: Pool, request: Request, actor: TrustedActor): Promise<void> {
  const env = getServerEnv();
  // P1A keeps its logical bucket isolated in the risk key while using an action identity supported by the frozen schema.
  const keys = [`p1a_lead_intake:actor:${actor.membershipId}`, `p1a_lead_intake:workspace:${actor.workspaceId}`,
    `p1a_lead_intake:network:${requestRiskContext(request).networkKey}`];
  const allowed = await consumeRateLimitDimensions(pool, keys.map(riskKey => ({ action: "member_change", riskKey,
    limit: 30, windowSeconds: 60, secret: env.SESSION_SECRET })));
  if (!allowed) throw Object.assign(new Error("rate_limited"), { code: "rate_limited", status: 429 });
}
