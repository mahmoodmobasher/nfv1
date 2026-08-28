import { CrmShell } from "../crm-shell";
import { CustomerGraphListPage } from "@/frontend/features/customer-graph";
import { crmPageContext } from "@/server/crm/page";
export const dynamic = "force-dynamic"; export const metadata = { title: "Companies | NexaFlow" };
export default async function Page() { const { pool, workspace, context } = await crmPageContext("/crm/companies"); try { return <CrmShell workspace={workspace.name} role={context.role}><section className="mx-auto grid w-full max-w-[1400px] gap-5 py-5"><CustomerGraphListPage workspaceId={workspace.id} kind="company"/></section></CrmShell>; } finally { await pool.end(); } }
