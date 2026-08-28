import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createDb } from "@/server/db/client";
import { getServerEnv } from "@/server/env";
import {
  INVITATION_INTENT_COOKIE,
  openInvitationIntent,
} from "@/server/invitations/intent";
import { resolveIdentityContext } from "@/server/security/session";
import { invitationAcceptancePreview } from "@/server/tenant-admin/invitations";
import { WebsiteShell } from "../../../onboarding/website-shell";
import { AcceptInvitationClient } from "./accept-client";

export const metadata = { title: "Accept workspace invitation | NexaFlow" };

export default async function Page() {
  const env = getServerEnv(),
    cookieStore = await cookies(),
    intent = openInvitationIntent(
      cookieStore.get(INVITATION_INTENT_COOKIE)?.value,
      env.SESSION_SECRET,
    ),
    session = cookieStore.get(env.SESSION_COOKIE_NAME)?.value;
  if (!intent)
    return (
      <WebsiteShell action="help">
        <div className="min-h-screen bg-canvas text-ink">
          <main className="mx-auto max-w-xl px-5 py-10">
            <section className="rounded-panel border border-line bg-surface p-6 sm:p-8">
              <p className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-faint">
                Workspace invitation
              </p>
              <h1>This invitation isn’t available</h1>
              <p className="mt-2 max-w-3xl text-[13px] leading-6 text-ink-muted">
                The link may be invalid, expired, revoked, or already used.
              </p>
              <a
                className="inline-flex min-h-11 items-center justify-center rounded-control border border-accent bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-ink"
                href="mailto:info@nexaflowsystems.com"
              >
                Request a new invitation
              </a>
            </section>
          </main>
        </div>
      </WebsiteShell>
    );
  const { pool } = createDb();
  try {
    const [preview, identity] = await Promise.all([
      invitationAcceptancePreview(pool, intent, env.SESSION_SECRET),
      resolveIdentityContext(pool, session, env.SESSION_SECRET),
    ]);
    if (!preview) redirect("/workspace/invitations/accept/terminal");
    return (
      <WebsiteShell action="help">
        <AcceptInvitationClient
          preview={{ ...preview, expiresAt: preview.expiresAt.toISOString() }}
          authenticated={Boolean(identity)}
        />
      </WebsiteShell>
    );
  } finally {
    await pool.end();
  }
}
