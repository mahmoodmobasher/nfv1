import { CrmShell } from "../../crm-shell";
import { CustomerGraphFormPage } from "@/frontend/features/customer-graph";
import { crmPageContext } from "@/server/crm/page";
export const dynamic = "force-dynamic"; export const metadata = { title: "Add contact | NexaFlow" };
export default async function Page() { const { pool, workspace, context } = await crmPageContext("/crm/contacts/new"); try { return <CrmShell workspace={workspace.name} role={context.role}><section className="admin-content narrow-admin"><CustomerGraphFormPage workspaceId={workspace.id} kind="contact"/></section></CrmShell>; } finally { await pool.end(); } }
