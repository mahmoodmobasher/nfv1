import { CrmShell } from "../../crm-shell";
import { LeadEditor } from "../lead-editor";
import { crmPageContext } from "@/server/crm/page";
import { leadOwners, leadTeams, pipelineStages } from "@/server/crm/leads";

export const dynamic="force-dynamic";export const metadata={title:"Add lead | NexaFlow"};
export default async function Page(){const{pool,workspace,context}=await crmPageContext("/crm/leads/new");try{const[stages,owners,teams]=await Promise.all([pipelineStages(pool,context),leadOwners(pool,context),leadTeams(pool,context)]);return <CrmShell workspace={workspace.name} role={context.role}><section className="admin-content narrow-admin"><p className="eyebrow">Leads / New</p><h1>Add a lead</h1><p className="lead">Create a persistent customer record for your workspace.</p><LeadEditor workspaceId={workspace.id} stages={stages} owners={owners} teams={teams}/></section></CrmShell>}finally{await pool.end()}}
