import{CrmShell}from"../crm-shell";
import{crmPageContext}from"@/server/crm/page";
import{IdentityReviewQueue,loadIdentityReviewQueue}from"@/frontend/features/identity-review";
export const dynamic="force-dynamic";export const metadata={title:"Identity review | NexaFlow"};
export default async function Page(){const{pool,workspace,context}=await crmPageContext("/crm/identity-reviews");try{const initial=await loadIdentityReviewQueue(pool,context,{assignment:"all",evidence:"any",limit:25});return <CrmShell workspace={workspace.name} role={context.role}><IdentityReviewQueue workspaceId={workspace.id} initial={initial}/></CrmShell>}finally{await pool.end()}}
