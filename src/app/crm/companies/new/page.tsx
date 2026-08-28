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
        <section className="mx-auto grid w-full max-w-4xl gap-5 py-5">
          <CustomerGraphFormPage workspaceId={workspace.id} kind="company" />
        </section>
      </CrmShell>
    );
  } finally {
    await pool.end();
  }
}
