import { CrmShell } from "../../crm-shell";
import { CustomerGraphDetailPage } from "@/frontend/features/customer-graph";
import { crmPageContext } from "@/server/crm/page";
export const dynamic = "force-dynamic"; export const metadata = { title: "Company details | NexaFlow" };
export default async function Page({ params }: { params: Promise<{ companyId: string }> }) { const { companyId } = await params, { pool, workspace, context } = await crmPageContext(`/crm/companies/${companyId}`); try { return <CrmShell workspace={workspace.name} role={context.role}><section className="mx-auto grid w-full max-w-[1400px] gap-5 py-5"><CustomerGraphDetailPage workspaceId={workspace.id} kind="company" id={companyId}/></section></CrmShell>; } finally { await pool.end(); } }
