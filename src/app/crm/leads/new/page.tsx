import { CrmShell } from "../../crm-shell";
import { crmPageContext } from "@/server/crm/page";
import { ScreenProfileForm } from "@/frontend/features/screen-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add lead | NexaFlow" };
export default async function Page() {
  const { pool, workspace, context } = await crmPageContext("/crm/leads/new");
  try {
    return (
      <CrmShell workspace={workspace.name} role={context.role}>
        <section className="admin-content lead-form-page">
          <ScreenProfileForm workspaceId={workspace.id} kind="lead" />
        </section>
      </CrmShell>
    );
  } finally {
    await pool.end();
  }
}
