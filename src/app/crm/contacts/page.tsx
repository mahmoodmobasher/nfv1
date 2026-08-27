import { CrmShell } from "../crm-shell";
import { CustomerGraphListPage } from "@/frontend/features/customer-graph";
import { crmPageContext } from "@/server/crm/page";
export const dynamic = "force-dynamic"; export const metadata = { title: "Contacts | NexaFlow" };
export default async function Page() { const { pool, workspace, context } = await crmPageContext("/crm/contacts"); try { return <CrmShell workspace={workspace.name} role={context.role}><section className="admin-content"><CustomerGraphListPage workspaceId={workspace.id} kind="contact"/></section></CrmShell>; } finally { await pool.end(); } }
