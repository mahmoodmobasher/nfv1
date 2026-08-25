import { notFound } from "next/navigation";
import { CrmShell } from "../../crm-shell";
import { LeadPresentationUnavailable, LeadReadOnlyDetail } from "@/frontend/features/leads";
import { isLeadNotFound, loadLeadDetail } from "@/frontend/features/leads/server";
import { crmPageContext } from "@/server/crm/page";
export const dynamic="force-dynamic";export const metadata={title:"Lead details | NexaFlow"};
export default async function Page({params}:{params:Promise<{leadId:string}>}){const{leadId}=await params,{pool,workspace,context}=await crmPageContext(`/crm/leads/${leadId}`);try{try{return <CrmShell workspace={workspace.name} role={context.role}><section className="admin-content narrow-admin"><LeadReadOnlyDetail lead={(await loadLeadDetail(pool,context,leadId)).lead}/></section></CrmShell>}catch(error){if(isLeadNotFound(error))notFound();return <CrmShell workspace={workspace.name} role={context.role}><section className="admin-content narrow-admin"><LeadPresentationUnavailable detail/></section></CrmShell>}}finally{await pool.end()}}
