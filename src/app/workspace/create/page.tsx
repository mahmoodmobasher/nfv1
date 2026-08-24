import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WebsiteShell } from "../../onboarding/website-shell";
import { WorkspaceForm } from "./workspace-form";
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
    const catalog=(await pool.query<{code:"essentials"|"growth"|"scale";name:string;included_active_seats:number;trial_days:number;monthly_price_cents:number;annual_monthly_equivalent_price_cents:number}>(`select code,name,included_active_seats,trial_days,monthly_price_cents,annual_monthly_equivalent_price_cents from plan_catalog_entries where code=$1 and catalog_version='2026-08-commercial-v1' and status='active' and effective_from<=now() and (effective_to is null or effective_to>now()) and allowed_cadences?$2 order by effective_from desc limit 1`,[state.selected_plan_code,state.billing_cadence])).rows[0];
    if (!catalog) redirect("/select-plan?resume=workspace&error=selection");
    return <WebsiteShell action="help"><Suspense fallback={<p role="status">Loading your saved plan…</p>}><WorkspaceForm plan={{code:catalog.code,name:catalog.name,cadence:state.billing_cadence as "monthly"|"annual",seats:catalog.included_active_seats,trialDays:catalog.trial_days,priceCents:state.billing_cadence==="annual"?catalog.annual_monthly_equivalent_price_cents:catalog.monthly_price_cents}} /></Suspense></WebsiteShell>;
  } finally { await pool.end(); }
}
