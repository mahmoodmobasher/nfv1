import { CrmShell } from "../../crm-shell";
import { CustomerGraphFormPage } from "@/frontend/features/screen-forms";
import { crmPageContext } from "@/server/crm/page";
export const dynamic = "force-dynamic";
export const metadata = { title: "Add contact | NexaFlow" };
export default async function Page() {
  const { pool, workspace, context } =
    await crmPageContext("/crm/contacts/new");
  try {
    return (
      <CrmShell workspace={workspace.name} role={context.role}>
        <section className="mx-auto grid w-full max-w-4xl gap-5 py-5">
          <CustomerGraphFormPage workspaceId={workspace.id} kind="contact" />
        </section>
      </CrmShell>
    );
  } finally {
    await pool.end();
  }
}
