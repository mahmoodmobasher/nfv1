import { CrmShell } from "../../crm-shell";
import { DealBoardPage } from "@/frontend/features/deals";
import { crmPageContext } from "@/server/crm/page";
export const dynamic = "force-dynamic"; export const metadata = { title: "Deal board | NexaFlow" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { const query = await searchParams, pipelineId = typeof query.pipelineId === "string" ? query.pipelineId : undefined, raw = query.stageCursor, stageCursorParams = (Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : []).slice(0, 101), { pool, workspace, context } = await crmPageContext("/crm/deals/board"); try { return <CrmShell workspace={workspace.name} role={context.role}><section className="mx-auto grid w-full max-w-[1400px] gap-5 py-5"><DealBoardPage workspaceId={workspace.id} pipelineId={pipelineId} stageCursorParams={stageCursorParams}/></section></CrmShell>; } finally { await pool.end(); } }
