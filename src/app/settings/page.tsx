import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getServerEnv } from "@/server/env";
import { localDatabase, sessionToken } from "@/server/http";
import { resolveIdentityContext } from "@/server/security/session";
import { accountPreferences } from "@/server/account/service";
import { AccountSettingsClient } from "./account-settings-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Personal settings | NexaFlow" };

export default async function Page() {
  const { pool } = localDatabase();
  const env = getServerEnv();

  try {
    const request = new Request(env.APP_ORIGIN, { headers: await headers() });
    const identity = await resolveIdentityContext(pool, sessionToken(request), env.SESSION_SECRET, new Date(), {
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
    return <AccountSettingsClient initialName={user.display_name} initialPreferences={{ theme: preferences.appearance, locale: preferences.locale ?? "en-CA", timezone: preferences.timeZone ?? "America/Toronto", version: preferences.version }} />;
  } finally {
    await pool.end();
  }
}
