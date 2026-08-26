import { CrmShell } from "../crm-shell";
import { CustomerGraphListPage } from "@/frontend/features/customer-graph";
import { crmPageContext } from "@/server/crm/page";
export const dynamic = "force-dynamic"; export const metadata = { title: "Companies | NexaFlow" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { const query = await searchParams, status = query.status === "archived" ? "archived" : "active", cursor = typeof query.cursor === "string" ? query.cursor : undefined, { pool, workspace, context } = await crmPageContext("/crm/companies"); try { return <CrmShell workspace={workspace.name} role={context.role}><section className="admin-content"><CustomerGraphListPage workspaceId={workspace.id} kind="company" initialStatus={status} initialCursor={cursor}/></section></CrmShell>; } finally { await pool.end(); } }
