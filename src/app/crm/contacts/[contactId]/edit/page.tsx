import { CrmShell } from "../../../crm-shell";
import { CustomerGraphFormPage } from "@/frontend/features/screen-forms";
import { crmPageContext } from "@/server/crm/page";
export const dynamic = "force-dynamic";
export const metadata = { title: "Edit contact | NexaFlow" };
export default async function Page({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const { contactId } = await params,
    { pool, workspace, context } = await crmPageContext(
      `/crm/contacts/${contactId}/edit`,
    );
  try {
    return (
      <CrmShell workspace={workspace.name} role={context.role}>
        <section className="admin-content narrow-admin">
          <CustomerGraphFormPage
            workspaceId={workspace.id}
            kind="contact"
            recordId={contactId}
          />
        </section>
      </CrmShell>
    );
  } finally {
    await pool.end();
  }
}
