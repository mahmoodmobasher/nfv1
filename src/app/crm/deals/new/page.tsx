import { CrmShell } from "../../crm-shell";
import { DealFormPage } from "@/frontend/features/deals";
import { crmPageContext } from "@/server/crm/page";
export const dynamic = "force-dynamic"; export const metadata = { title: "Add Deal | NexaFlow" };
export default async function Page() { const { pool, workspace, context } = await crmPageContext("/crm/deals/new"); try { return <CrmShell workspace={workspace.name} role={context.role}><section className="admin-content narrow-admin"><DealFormPage workspaceId={workspace.id}/></section></CrmShell>; } finally { await pool.end(); } }
