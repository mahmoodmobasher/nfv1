import { AdminShell, WorkspaceAdminPage } from "../admin-shell";
import { InvitationsClient } from "../admin-client";
import { ActionLink } from "@/frontend/design-system";
import { adminPageContext } from "@/server/tenant-admin/page";
import { invitationsModel } from "@/server/tenant-admin/read-models";
export const dynamic = "force-dynamic";
export const metadata = { title: "Invitations | NexaFlow" };
export default async function Page() {
  const { pool, workspace, context } = await adminPageContext();
  try {
    return (
      <AdminShell workspace={workspace.name} role={context.role}>
        <WorkspaceAdminPage
          marker="IN"
          activeView="invitations"
          title="Invitations"
          description={
            <p>
              Review invitations, resend a message, or revoke access before it
              is accepted.
            </p>
          }
          action={
            <ActionLink variant="primary" href="/workspace/settings/invite">
              Invite your team
            </ActionLink>
          }
        >
          <InvitationsClient
            workspaceId={workspace.id}
            initial={await invitationsModel(pool, context)}
          />
        </WorkspaceAdminPage>
      </AdminShell>
    );
  } finally {
    await pool.end();
  }
}
