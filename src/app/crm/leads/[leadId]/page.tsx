import { notFound } from "next/navigation";
import { CrmShell } from "../../crm-shell";
import { LeadDetailWithConversion, LeadPresentationUnavailable } from "@/frontend/features/leads";
import { isLeadNotFound, loadLeadDetail, loadLeadPipelineStages } from "@/frontend/features/leads/server";
import { crmPageContext } from "@/server/crm/page";
export const dynamic="force-dynamic";export const metadata={title:"Lead details | NexaFlow"};
export default async function Page({params}:{params:Promise<{leadId:string}>}){const{leadId}=await params,{pool,workspace,context}=await crmPageContext(`/crm/leads/${leadId}`);try{try{const[detail,registry]=await Promise.all([loadLeadDetail(pool,context,leadId),loadLeadPipelineStages(pool,context)]);return <CrmShell workspace={workspace.name} role={context.role}><section className="admin-content"><LeadDetailWithConversion lead={detail.lead} workspaceId={workspace.id} stages={registry.items}/></section></CrmShell>}catch(error){if(isLeadNotFound(error))notFound();return <CrmShell workspace={workspace.name} role={context.role}><section className="admin-content"><LeadPresentationUnavailable detail/></section></CrmShell>}}finally{await pool.end()}}
