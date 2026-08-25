import { CrmShell } from "../../crm-shell";
import { crmPageContext } from "@/server/crm/page";
import { ManualLeadIntakePage } from "@/frontend/features/leads";
import { manualLeadIntakeBootstrap } from "@/frontend/features/leads/server";

export const dynamic="force-dynamic";export const metadata={title:"Add lead | NexaFlow"};
export default async function Page(){const{pool,workspace,context}=await crmPageContext("/crm/leads/new");try{return <CrmShell workspace={workspace.name} role={context.role}><ManualLeadIntakePage workspaceId={workspace.id} receivedAt={manualLeadIntakeBootstrap().receivedAt}/></CrmShell>}finally{await pool.end()}}
