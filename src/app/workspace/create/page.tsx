import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WorkspaceForm } from "../../onboarding/forms";
import { createDb } from "@/server/db/client";
import { getServerEnv } from "@/server/env";
import { resolveIdentityContext } from "@/server/security/session";

export const dynamic = "force-dynamic";

export default async function Page() {
  const env = getServerEnv();
  const token = (await cookies()).get(env.SESSION_COOKIE_NAME)?.value;
  const { pool } = createDb();
  try {
    const identity=await resolveIdentityContext(pool, token, env.SESSION_SECRET, new Date(), { idleMinutes: env.SESSION_IDLE_MINUTES, touchIntervalSeconds: env.SESSION_TOUCH_INTERVAL_SECONDS });
    if (!identity) redirect("/login?next=/workspace/create");
    const state=(await pool.query("select selected_plan_code,billing_cadence,current_step,workspace_id from onboarding_progress where user_id=$1",[identity.userId])).rows[0];
    if (state?.workspace_id) redirect("/workspace/ready");
    if (!state?.selected_plan_code||!state?.billing_cadence) redirect("/select-plan?resume=workspace");
    if (!["essentials","growth","scale"].includes(state.selected_plan_code)||!["monthly","annual"].includes(state.billing_cadence)) redirect("/select-plan?resume=workspace&error=selection");
    return <Suspense fallback={<p role="status">Loading your saved plan…</p>}><WorkspaceForm persisted={{plan:state.selected_plan_code as "essentials"|"growth"|"scale",cadence:state.billing_cadence as "monthly"|"annual"}} /></Suspense>;
  } finally { await pool.end(); }
}
