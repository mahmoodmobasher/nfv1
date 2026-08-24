import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WebsiteShell } from "../../onboarding/website-shell";
import { createDb } from "@/server/db/client";
import { getServerEnv } from "@/server/env";
import { resolveIdentityContext } from "@/server/security/session";
import { selectableWorkspaces } from "@/server/workspaces/selection";
import { SwitchClient } from "./switch-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose a Workspace | NexaFlow" };

export default async function Page() {
  const env = getServerEnv(), token = (await cookies()).get(env.SESSION_COOKIE_NAME)?.value, { pool } = createDb();
  try {
    const identity = await resolveIdentityContext(pool, token, env.SESSION_SECRET, new Date(), { idleMinutes: env.SESSION_IDLE_MINUTES, touchIntervalSeconds: env.SESSION_TOUCH_INTERVAL_SECONDS });
    if (!identity) redirect("/login?next=/workspace/switch");
    const items = await selectableWorkspaces(pool, { ...identity, activeWorkspaceId: identity.activeWorkspaceId ?? null });
    if (items.length === 0) {
      const onboarding = (await pool.query<{ workspace_id: string | null }>("select workspace_id from onboarding_progress where user_id=$1", [identity.userId])).rows[0];
      redirect(onboarding?.workspace_id ? "/login?error=workspace_access" : "/workspace/create");
    }
    if (items.length === 1) redirect("/crm/home");
    return <WebsiteShell action="help"><section className="switch-page" aria-labelledby="workspace-switch-heading"><div className="admin-content narrow-admin"><p className="eyebrow">Existing Memberships</p><h1 id="workspace-switch-heading">Choose a Workspace you can access</h1><p className="lead">These are existing Workspace Memberships assigned to your account. Choosing one does not create or purchase another Workspace.</p><SwitchClient initial={items} /><p className="reassurance">Need a multi-Workspace company deployment? <a href="mailto:info@nexaflowsystems.com?subject=NexaFlow%20Enterprise">Contact Sales</a> for Enterprise capacity.</p></div></section></WebsiteShell>;
  } finally { await pool.end(); }
}
