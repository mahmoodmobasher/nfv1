import { cookies } from "next/headers";
import { createDb } from "@/server/db/client";
import { getServerEnv } from "@/server/env";
import { resolveIdentityContext } from "@/server/security/session";
import { invitationRoleOptions, resolveTenantContext } from "@/server/tenant-admin/permissions";
import { WebsiteEnvironmentNotice, WebsiteShell } from "../onboarding/website-shell";
import { plans, type PlanKey } from "../onboarding/logic";
import { InvitationPreview } from "./preview-client";

export const metadata = { title: "Invitation preview | NexaFlow" };

async function canOpenOperationalInvitations(): Promise<boolean> {
  const env = getServerEnv(), session = (await cookies()).get(env.SESSION_COOKIE_NAME)?.value, { pool } = createDb();
  try {
    const identity = await resolveIdentityContext(pool, session, env.SESSION_SECRET);
    if (!identity?.activeWorkspaceId) return false;
    const tenant = await resolveTenantContext(pool, { userId: identity.userId, sessionId: identity.sessionId, workspaceId: identity.activeWorkspaceId });
    return Boolean(tenant && invitationRoleOptions(tenant).length);
  } finally {
    await pool.end();
  }
}

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const rawPlan = (await searchParams).plan, plan: PlanKey = rawPlan && rawPlan in plans ? rawPlan as PlanKey : "growth";
  return <WebsiteShell action="help"><WebsiteEnvironmentNotice>Invitation preview — no invitation, seat, Membership, email, or Audit event is saved or authorized.</WebsiteEnvironmentNotice><InvitationPreview plan={plan} canOpenOperationalInvitations={await canOpenOperationalInvitations()} /></WebsiteShell>;
}
