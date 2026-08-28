import {AdminShell,WorkspaceAdminPage} from "../admin-shell";
import {AuthorityPeopleClient} from "./authority-people-client";
import {adminPageContext} from "@/server/tenant-admin/page";
import {peopleModel} from "@/server/tenant-admin/read-models";
export const dynamic="force-dynamic";
export const metadata={title:"People and roles | NexaFlow"};
export default async function Page(){const{pool,workspace,context}=await adminPageContext();try{return <AdminShell workspace={workspace.name} role={context.role}><WorkspaceAdminPage marker="PR" activeView="people" title="People and roles" description={<p>Control who can access this workspace and what they can manage.</p>}><AuthorityPeopleClient workspaceId={workspace.id} people={await peopleModel(pool,context)}/></WorkspaceAdminPage></AdminShell>}finally{await pool.end()}}
