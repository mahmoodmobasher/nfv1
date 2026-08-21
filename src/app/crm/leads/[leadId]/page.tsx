import { CrmShell } from "../../crm-shell";
import { LeadEditor } from "../lead-editor";
import { crmPageContext } from "@/server/crm/page";
import { getLead, leadOwners, leadTeams, pipelineStages } from "@/server/crm/leads";
import { notFound } from "next/navigation";

export const dynamic="force-dynamic";export const metadata={title:"Lead details | NexaFlow"};
export default async function Page({params}:{params:Promise<{leadId:string}>}){const{leadId}=await params,{pool,workspace,context}=await crmPageContext(`/crm/leads/${leadId}`);try{const[lead,stages,owners,teams]=await Promise.all([getLead(pool,context,leadId),pipelineStages(pool,context),leadOwners(pool,context),leadTeams(pool,context)]).catch(()=>notFound());return <CrmShell workspace={workspace.name} role={context.role}><section className="admin-content narrow-admin"><p className="eyebrow">Leads / Details</p><h1>{lead.first_name} {lead.last_name}</h1><p className="lead">Edit contact details, move the pipeline stage, assign ownership, or record an activity.</p><LeadEditor workspaceId={workspace.id} stages={stages} owners={owners} teams={teams} initial={lead}/></section></CrmShell>}finally{await pool.end()}}
