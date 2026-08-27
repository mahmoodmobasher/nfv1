import { CrmShell } from "../../../crm-shell";
import { ScreenProfileForm } from "@/frontend/features/screen-forms";
import { crmPageContext } from "@/server/crm/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit lead | NexaFlow" };

export default async function Page({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params,
    { pool, workspace, context } = await crmPageContext(
      `/crm/leads/${leadId}/edit`,
    );
  try {
    return (
      <CrmShell workspace={workspace.name} role={context.role}>
        <section className="admin-content lead-form-page">
          <ScreenProfileForm
            workspaceId={workspace.id}
            kind="lead"
            recordId={leadId}
          />
        </section>
      </CrmShell>
    );
  } finally {
    await pool.end();
  }
}
