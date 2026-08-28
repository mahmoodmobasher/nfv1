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
  const env = getServerEnv(),
    token = (await cookies()).get(env.SESSION_COOKIE_NAME)?.value,
    { pool } = createDb();
  try {
    const identity = await resolveIdentityContext(
      pool,
      token,
      env.SESSION_SECRET,
      new Date(),
      {
        idleMinutes: env.SESSION_IDLE_MINUTES,
        touchIntervalSeconds: env.SESSION_TOUCH_INTERVAL_SECONDS,
      },
    );
    if (!identity) redirect("/login?next=/workspace/switch");
    const items = await selectableWorkspaces(pool, {
      ...identity,
      activeWorkspaceId: identity.activeWorkspaceId ?? null,
    });
    if (items.length === 0) {
      const onboarding = (
        await pool.query<{ workspace_id: string | null }>(
          "select workspace_id from onboarding_progress where user_id=$1",
          [identity.userId],
        )
      ).rows[0];
      redirect(
        onboarding?.workspace_id
          ? "/login?error=workspace_access"
          : "/workspace/create",
      );
    }
    if (items.length === 1) redirect("/crm/home");
    return (
      <WebsiteShell action="help">
        <section
          className="min-h-[calc(100vh-68px)] bg-canvas px-5 py-10"
          aria-labelledby="workspace-switch-heading"
        >
          <div className="mx-auto grid max-w-3xl gap-5 rounded-panel border border-line bg-surface p-6 sm:p-8 [&_h1]:text-2xl [&_h1]:font-bold">
            <p className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-faint">
              Existing Memberships
            </p>
            <h1 id="workspace-switch-heading">
              Choose a Workspace you can access
            </h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-ink-muted">
              These are existing Workspace Memberships assigned to your account.
              Choosing one does not create or purchase another Workspace.
            </p>
            <SwitchClient initial={items} />
            <p className="rounded-control border border-line bg-surface-muted p-4 text-sm leading-6 text-ink-muted [&_a]:font-semibold [&_a]:text-accent-ink">
              Need a multi-Workspace company deployment?{" "}
              <a href="mailto:info@nexaflowsystems.com?subject=NexaFlow%20Enterprise">
                Contact Sales
              </a>{" "}
              for Enterprise capacity.
            </p>
          </div>
        </section>
      </WebsiteShell>
    );
  } finally {
    await pool.end();
  }
}
