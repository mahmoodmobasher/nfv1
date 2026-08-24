import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createDb } from "@/server/db/client";
import { getServerEnv } from "@/server/env";
import { INVITATION_INTENT_COOKIE, openInvitationIntent } from "@/server/invitations/intent";
import { resolveIdentityContext } from "@/server/security/session";
import { invitationAcceptancePreview } from "@/server/tenant-admin/invitations";
import { WebsiteShell } from "../../../onboarding/website-shell";
import { AcceptInvitationClient } from "./accept-client";

export const metadata = { title: "Accept workspace invitation | NexaFlow" };

export default async function Page() {
  const env = getServerEnv(), cookieStore = await cookies(), intent = openInvitationIntent(cookieStore.get(INVITATION_INTENT_COOKIE)?.value, env.SESSION_SECRET), session = cookieStore.get(env.SESSION_COOKIE_NAME)?.value;
  if (!intent) return <WebsiteShell action="help"><div className="onboarding-page"><main className="onboarding-narrow"><section className="flow-card"><p className="eyebrow">Workspace invitation</p><h1>This invitation isn’t available</h1><p className="lead">The link may be invalid, expired, revoked, or already used.</p><a className="primary link-button" href="mailto:info@nexaflowsystems.com">Request a new invitation</a></section></main></div></WebsiteShell>;
  const { pool } = createDb();
  try {
    const [preview, identity] = await Promise.all([invitationAcceptancePreview(pool, intent, env.SESSION_SECRET), resolveIdentityContext(pool, session, env.SESSION_SECRET)]);
    if (!preview) redirect("/workspace/invitations/accept/terminal");
    return <WebsiteShell action="help"><AcceptInvitationClient preview={{ ...preview, expiresAt: preview.expiresAt.toISOString() }} authenticated={Boolean(identity)} /></WebsiteShell>;
  } finally {
    await pool.end();
  }
}
