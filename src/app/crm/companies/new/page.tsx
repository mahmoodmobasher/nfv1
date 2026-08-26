import { CrmShell } from "../../crm-shell";
import { CustomerGraphFormPage } from "@/frontend/features/screen-forms";
import { crmPageContext } from "@/server/crm/page";
export const dynamic = "force-dynamic";
export const metadata = { title: "Add company | NexaFlow" };
export default async function Page() {
  const { pool, workspace, context } =
    await crmPageContext("/crm/companies/new");
  try {
    return (
      <CrmShell workspace={workspace.name} role={context.role}>
        <section className="admin-content narrow-admin">
          <CustomerGraphFormPage workspaceId={workspace.id} kind="company" />
        </section>
      </CrmShell>
    );
  } finally {
    await pool.end();
  }
}
