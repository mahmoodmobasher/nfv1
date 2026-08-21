import {AdminShell} from "../admin-shell";
import {AuthorityInviteClient} from "./authority-invite-client";
import {adminPageContext} from "@/server/tenant-admin/page";
import {settingsModel,teamsModel} from "@/server/tenant-admin/read-models";
import {invitationRoleOptions} from "@/server/tenant-admin/permissions";
export const dynamic="force-dynamic";export const metadata={title:"Invite your team | NexaFlow"};
export default async function Page(){const{pool,workspace,context}=await adminPageContext();try{const settings=await settingsModel(pool,context);return <AdminShell workspace={workspace.name} role={context.role}><section className="admin-content narrow-admin"><p className="eyebrow">Workspace settings / Invitations</p><h1>Invite your team</h1><p className="lead">Invite people to this workspace. Invitations expire after 7 days, and pending invitations don’t use a seat.</p><AuthorityInviteClient workspaceId={workspace.id} teams={await teamsModel(pool,context)} seatRemaining={Math.max(0,settings.seat_limit-settings.active_members)} roleOptions={invitationRoleOptions(context)}/></section></AdminShell>}finally{await pool.end()}}
