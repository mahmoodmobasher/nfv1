import { CrmShell } from "../../crm-shell";
import { DealDetailPage } from "@/frontend/features/deals";
import { crmPageContext } from "@/server/crm/page";
export const dynamic = "force-dynamic"; export const metadata = { title: "Deal details | NexaFlow" };
export default async function Page({ params }: { params: Promise<{ dealId: string }> }) { const { dealId } = await params, { pool, workspace, context } = await crmPageContext(`/crm/deals/${dealId}`); try { return <CrmShell workspace={workspace.name} role={context.role}><section className="mx-auto grid w-full max-w-4xl gap-5 py-5"><DealDetailPage workspaceId={workspace.id} dealId={dealId}/></section></CrmShell>; } finally { await pool.end(); } }
