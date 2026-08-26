import { CrmShell } from "../../../crm-shell";
import { CustomerGraphFormPage } from "@/frontend/features/screen-forms";
import { crmPageContext } from "@/server/crm/page";
export const dynamic = "force-dynamic";
export const metadata = { title: "Edit company | NexaFlow" };
export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params,
    { pool, workspace, context } = await crmPageContext(
      `/crm/companies/${companyId}/edit`,
    );
  try {
    return (
      <CrmShell workspace={workspace.name} role={context.role}>
        <section className="admin-content narrow-admin">
          <CustomerGraphFormPage
            workspaceId={workspace.id}
            kind="company"
            recordId={companyId}
          />
        </section>
      </CrmShell>
    );
  } finally {
    await pool.end();
  }
}
