import Link from "next/link";
import { Check } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Shell } from "../../onboarding/components";
import { WebsiteShell } from "../../onboarding/website-shell";
import { createDb } from "@/server/db/client";
import { getServerEnv } from "@/server/env";
import { resolveIdentityContext } from "@/server/security/session";
import { workspaceSummary } from "@/server/workspaces/provision";
import { selectableWorkspaces } from "@/server/workspaces/selection";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workspace ready | NexaFlow" };

type ReadyFacts = { plan_name: string; active_seats: number };

export default async function Ready() {
  const env = getServerEnv(), token = (await cookies()).get(env.SESSION_COOKIE_NAME)?.value, { pool } = createDb();
  let workspace: Awaited<ReturnType<typeof workspaceSummary>>;
  let facts: ReadyFacts | undefined;
  try {
    const identity = await resolveIdentityContext(pool, token, env.SESSION_SECRET);
    if (!identity) redirect("/login?next=/workspace/ready");
    const state = (await pool.query<{ workspace_id: string | null }>("select workspace_id from onboarding_progress where user_id=$1", [identity.userId])).rows[0];

    if (!identity.activeWorkspaceId) {
      const options = await selectableWorkspaces(pool, { ...identity, activeWorkspaceId: null });
      if (options.length > 1) redirect("/workspace/switch");
      if (options.length === 1) redirect("/crm/home");
      redirect(state?.workspace_id ? "/login?error=workspace_access" : "/workspace/create");
    }

    workspace = await workspaceSummary(pool, identity.userId, identity.activeWorkspaceId);
    if (!workspace) redirect(state?.workspace_id ? "/login?error=workspace_access" : "/workspace/create");
    if (!state?.workspace_id || state.workspace_id !== workspace.id) redirect("/crm/home");
    if (workspace.role !== "owner") redirect("/crm/home");

    facts = (await pool.query<ReadyFacts>(`select coalesce(c.name,w.plan_code) plan_name,coalesce((e.effective_limits->>'activeSeats')::int,1) active_seats from workspaces w left join workspace_entitlement_snapshots e on e.workspace_id=w.id left join plan_catalog_entries c on c.code=e.plan_code and c.catalog_version=e.catalog_version where w.id=$1 order by e.effective_at desc limit 1`, [workspace.id])).rows[0];
  } finally { await pool.end(); }

  if (!workspace || !facts) redirect("/workspace/create");
  const additionalSeats = Math.max(0, facts.active_seats - 1);
  return <WebsiteShell action="help"><Shell step={4} authLink={false}><div className="icon-orb success"><Check aria-hidden="true" /></div><p className="eyebrow">Workspace ready</p><h1>Your company Workspace is ready</h1><p className="lead">{workspace.name} is active and selected for this session.</p><div className="ready-summary"><p><span>Workspace</span><b>{workspace.name}</b></p><p><span>Plan</span><b>{facts.plan_name}</b></p><p><span>Total active seats</span><b>{facts.active_seats} (Owner included)</b></p><p><span>Your role</span><b>Owner</b></p></div><p className="reassurance">You are the sole initial Owner. You control subscription, ownership and Workspace governance. Invitations are optional; accepted active Admins or Members use {additionalSeats ? `one of the ${additionalSeats} remaining seats` : "an available plan seat"}.</p><Link className="primary link-button" href="/crm/leads/new">Add your first lead</Link><Link className="secondary link-button" href="/workspace/settings/invite">Invite Admins or Members</Link></Shell></WebsiteShell>;
}
