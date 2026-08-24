import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getServerEnv } from "@/server/env";
import { createDb } from "@/server/db/client";
import { resolveIdentityContext } from "@/server/security/session";
import { accountPreferences } from "@/server/account/service";
import { AccountSettingsClient } from "./account-settings-client";
import { AccountShell } from "./account-shell";
import { AccountFallbackShell } from "./account-fallback-shell";
import { workspaceSummary } from "@/server/workspaces/provision";
import { selectableWorkspaces } from "@/server/workspaces/selection";

export const dynamic = "force-dynamic";
export const metadata = { title: "Personal settings | NexaFlow" };

export default async function Page() {
  const env = getServerEnv();
  const token = (await cookies()).get(env.SESSION_COOKIE_NAME)?.value;
  const { pool } = createDb();

  try {
    const identity = await resolveIdentityContext(pool, token, env.SESSION_SECRET, new Date(), {
      idleMinutes: env.SESSION_IDLE_MINUTES,
      touchIntervalSeconds: env.SESSION_TOUCH_INTERVAL_SECONDS,
    });
    if (!identity) redirect("/login?next=/settings");
    const user = (await pool.query<{ display_name: string; primary_email_display: string | null }>(
      "select display_name, primary_email_display from users where id = $1 and status = 'active'",
      [identity.userId],
    )).rows[0];
    if (!user) redirect("/login?next=/settings");
    const preferences = await accountPreferences(pool, identity);
    let workspace = await workspaceSummary(pool, identity.userId, identity.activeWorkspaceId);
    if (!workspace) {
      const selected = (await selectableWorkspaces(pool, {
        ...identity,
        activeWorkspaceId: identity.activeWorkspaceId ?? null,
      })).find(
        (option) => option.current,
      );
      if (selected) workspace = await workspaceSummary(pool, identity.userId, selected.id);
    }
    const settings = <AccountSettingsClient initialName={user.display_name} initialPreferences={{ theme: preferences.appearance, locale: preferences.locale ?? "en-CA", timezone: preferences.timeZone ?? "America/Toronto", version: preferences.version }} />;
    return workspace ? (
      <AccountShell workspace={workspace.name} role={workspace.role}>
        {settings}
      </AccountShell>
    ) : (
      <AccountFallbackShell>{settings}</AccountFallbackShell>
    );
  } finally {
    await pool.end();
  }
}
