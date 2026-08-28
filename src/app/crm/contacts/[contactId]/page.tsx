import { CrmShell } from "../../crm-shell";
import { CustomerGraphDetailPage } from "@/frontend/features/customer-graph";
import { crmPageContext } from "@/server/crm/page";
export const dynamic = "force-dynamic"; export const metadata = { title: "Contact details | NexaFlow" };
export default async function Page({ params }: { params: Promise<{ contactId: string }> }) { const { contactId } = await params, { pool, workspace, context } = await crmPageContext(`/crm/contacts/${contactId}`); try { return <CrmShell workspace={workspace.name} role={context.role}><section className="admin-content"><CustomerGraphDetailPage workspaceId={workspace.id} kind="contact" id={contactId}/></section></CrmShell>; } finally { await pool.end(); } }
