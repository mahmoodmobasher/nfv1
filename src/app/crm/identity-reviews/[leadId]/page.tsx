import{notFound}from"next/navigation";
import{CrmShell}from"../../crm-shell";
import{crmPageContext}from"@/server/crm/page";
import{IdentityReviewDetail,loadIdentityReviewDetail}from"@/frontend/features/identity-review";
export const dynamic="force-dynamic";export const metadata={title:"Review identity matches | NexaFlow"};
export default async function Page({params}:{params:Promise<{leadId:string}>}){const{leadId}=await params,{pool,workspace,context}=await crmPageContext(`/crm/identity-reviews/${leadId}`);try{const detail=await loadIdentityReviewDetail(pool,context,leadId).catch(()=>notFound());return <CrmShell workspace={workspace.name} role={context.role}><IdentityReviewDetail workspaceId={workspace.id} initial={detail}/></CrmShell>}finally{await pool.end()}}
