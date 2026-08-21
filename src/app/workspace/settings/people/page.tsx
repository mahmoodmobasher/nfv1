import {AdminShell} from "../admin-shell";
import {AuthorityPeopleClient} from "./authority-people-client";
import {adminPageContext} from "@/server/tenant-admin/page";
import {peopleModel} from "@/server/tenant-admin/read-models";
export const dynamic="force-dynamic";
export const metadata={title:"People and roles | NexaFlow"};
export default async function Page(){const{pool,workspace,context}=await adminPageContext();try{return <AdminShell workspace={workspace.name} role={context.role}><section className="admin-content"><p className="eyebrow">Workspace settings / People and roles</p><h1>People and roles</h1><p className="lead">Control who can access this workspace and what they can manage.</p><AuthorityPeopleClient workspaceId={workspace.id} people={await peopleModel(pool,context)}/></section></AdminShell>}finally{await pool.end()}}
