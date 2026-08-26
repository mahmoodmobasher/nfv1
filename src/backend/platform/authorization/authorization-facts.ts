import type { ModuleTransaction } from "../database";

export type ActorRole = "owner" | "admin" | "member";
export type TrustedActor = {
  userId: string;
  sessionId: string;
  workspaceId: string;
  membershipId: string;
  role: ActorRole;
};

export const WORKSPACE_VISIBLE_LEAD_IDS_SQL_V1=`select distinct lvt.lead_id "leadId" from lead_visible_teams lvt
  join team_memberships tm on tm.workspace_id=lvt.workspace_id and tm.team_id=lvt.team_id
  join teams t on t.workspace_id=tm.workspace_id and t.id=tm.team_id and t.status='active'
 where lvt.workspace_id=$1 and lvt.lead_id=any($2::uuid[]) and tm.workspace_membership_id=$3`;
/**
 * Reviewed read-model predicate used only by the Leads public presentation query.
 * Platform remains the owner of Team membership/visibility reads; the enclosing
 * query must bind Workspace, role, and Membership as parameters 1, 7, and 8.
 */
export const WORKSPACE_LEAD_DISCLOSURE_SQL_PREDICATE_V1=`(
  $7::text<>'member' or l.visibility='workspace' or l.owner_membership_id=$8::uuid or exists(
    select 1 from lead_visible_teams disclosure_lvt
    join team_memberships disclosure_tm on disclosure_tm.workspace_id=disclosure_lvt.workspace_id
      and disclosure_tm.team_id=disclosure_lvt.team_id and disclosure_tm.workspace_membership_id=$8::uuid
    join teams disclosure_team on disclosure_team.workspace_id=disclosure_tm.workspace_id
      and disclosure_team.id=disclosure_tm.team_id and disclosure_team.status='active'
    where disclosure_lvt.workspace_id=$1 and disclosure_lvt.lead_id=l.id
  ))`;
export const WORKSPACE_MEMBERSHIP_PRESENTATION_SQL_V1=`select m.id,u.display_name label from workspace_memberships m join users u on u.id=m.user_id
  where m.workspace_id=$1 and m.id=any($2::uuid[]) and m.status='active' and u.status='active'`;
export const WORKSPACE_TEAM_PRESENTATION_SQL_V1=`select id,name label from teams
  where workspace_id=$1 and id=any($2::uuid[]) and status='active'`;

async function actorFacts(tx: ModuleTransaction, actor: TrustedActor, lock: boolean): Promise<TrustedActor> {
  const result = await tx.query<TrustedActor>(
    `select m.user_id "userId",s.id "sessionId",m.workspace_id "workspaceId",m.id "membershipId",r.code role
       from workspace_memberships m
       join roles r on r.workspace_id=m.workspace_id and r.id=m.role_id
       join workspaces w on w.id=m.workspace_id and w.status='active'
       join users u on u.id=m.user_id and u.status='active'
       join sessions s on s.id=$2 and s.user_id=m.user_id and s.revoked_at is null
      where m.workspace_id=$1 and m.id=$3 and m.user_id=$4 and m.status='active'
        and s.idle_expires_at>now() and s.absolute_expires_at>now()
      ${lock ? "for no key update of m,r,w,u,s" : ""}`,
    [actor.workspaceId, actor.sessionId, actor.membershipId, actor.userId],
  );
  const current = result.rows[0];
  if (!current) throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
  return current;
}

export async function lookupActiveActor(tx: ModuleTransaction, actor: TrustedActor): Promise<TrustedActor> {
  return actorFacts(tx, actor, false);
}

export async function revalidateActiveActor(tx: ModuleTransaction, actor: TrustedActor): Promise<TrustedActor> {
  return actorFacts(tx, actor, true);
}

export function workspaceAuthorityParticipant(tx: ModuleTransaction) {
  return {
    canEditLead(actor: TrustedActor) {
      return actor.role === "owner" || actor.role === "admin";
    },
    canMoveLeadStage(actor: TrustedActor, lead: { owner_membership_id: string | null }) {
      return actor.role === "owner" || actor.role === "admin" || lead.owner_membership_id === actor.membershipId;
    },
    async visibleLeadIds(actor: TrustedActor, leads: Array<{ id: string; visibility: string; ownerMembershipId: string | null }>) {
      if (actor.role !== "member") return new Set(leads.map(lead => lead.id));
      if (!leads.length) return new Set<string>();
      const teamVisible = new Set((await tx.query<{ leadId: string }>(WORKSPACE_VISIBLE_LEAD_IDS_SQL_V1,
        [actor.workspaceId, leads.map(lead => lead.id), actor.membershipId])).rows.map(row => row.leadId));
      return new Set(leads.filter(lead => lead.visibility === "workspace" || lead.ownerMembershipId === actor.membershipId || teamVisible.has(lead.id))
        .map(lead => lead.id));
    },
    async presentAssignments(workspaceId: string, membershipIds: string[], teamIds: string[]) {
      const memberships = membershipIds.length ? (await tx.query<{ id: string; label: string }>(
        WORKSPACE_MEMBERSHIP_PRESENTATION_SQL_V1, [workspaceId, [...new Set(membershipIds)].sort()])).rows : [];
      const teams = teamIds.length ? (await tx.query<{ id: string; label: string }>(
        WORKSPACE_TEAM_PRESENTATION_SQL_V1,
        [workspaceId, [...new Set(teamIds)].sort()])).rows : [];
      return { memberships: new Map(memberships.map(value => [value.id, value.label])),
        teams: new Map(teams.map(value => [value.id, value.label])) };
    },
    async operationalEditOptions(workspaceId: string) {
      const memberships = (await tx.query<{ id: string; label: string }>(
        `select m.id,coalesce(nullif(btrim(u.display_name),''),'Workspace member') label
           from workspace_memberships m join users u on u.id=m.user_id and u.status='active'
          where m.workspace_id=$1 and m.status='active' order by lower(coalesce(nullif(btrim(u.display_name),''),'Workspace member')),m.id limit 501`,
        [workspaceId],
      )).rows;
      const teams = (await tx.query<{ id: string; label: string }>(
        `select id,name label from teams where workspace_id=$1 and status='active' order by lower(name),id limit 101`,
        [workspaceId],
      )).rows;
      return { memberships, teams };
    },
    async lockReferences(input: { workspaceId: string; leadId?: string; leadIds?: string[];
      membershipIds?: Array<string | null>; teamIds?: Array<string | null> }) {
      const membershipIds = [...new Set((input.membershipIds ?? []).filter((id): id is string => Boolean(id)))].sort();
      const teamIds = [...new Set((input.teamIds ?? []).filter((id): id is string => Boolean(id)))].sort();
      if (membershipIds.length) await tx.query(
        `select id from workspace_memberships where workspace_id=$1 and id=any($2::uuid[]) order by id for no key update`, [input.workspaceId, membershipIds]);
      if (teamIds.length) await tx.query(
        `select id from teams where workspace_id=$1 and id=any($2::uuid[]) order by id for no key update`, [input.workspaceId, teamIds]);
      const leadIds = [...new Set([...(input.leadIds ?? []), ...(input.leadId ? [input.leadId] : [])])].sort();
      if (leadIds.length) {
        await tx.query(`select lead_id,team_id from lead_visible_teams where workspace_id=$1 and lead_id=any($2::uuid[])
          order by lead_id,team_id for update`, [input.workspaceId, leadIds]);
        await tx.query(
          `select lvt.lead_id,tm.team_id from team_memberships tm join lead_visible_teams lvt
             on lvt.workspace_id=tm.workspace_id and lvt.team_id=tm.team_id
            where tm.workspace_id=$1 and lvt.lead_id=any($2::uuid[])
            order by lvt.lead_id,tm.team_id,tm.workspace_membership_id for no key update of tm`,
          [input.workspaceId, leadIds]);
      }
    },
    async validateAssignment(workspaceId: string, membershipId: string | null, teamId: string | null) {
      if (membershipId && !(await tx.query(
        `select 1 from workspace_memberships m join users u on u.id=m.user_id and u.status='active'
          where m.workspace_id=$1 and m.id=$2 and m.status='active'`, [workspaceId, membershipId])).rows[0])
        throw Object.assign(new Error("assignment_unavailable"), { code: "assignment_unavailable", status: 409 });
      if (teamId && !(await tx.query(
        `select 1 from teams where workspace_id=$1 and id=$2 and status='active'`, [workspaceId, teamId])).rows[0])
        throw Object.assign(new Error("assignment_unavailable"), { code: "assignment_unavailable", status: 409 });
    },
    async validateVisibleTeams(workspaceId: string, teamIds: string[]) {
      if (!teamIds.length) return;
      const count = Number((await tx.query<{ count: number }>(
        `select count(*)::int count from teams where workspace_id=$1 and id=any($2::uuid[]) and status='active'`,
        [workspaceId, [...new Set(teamIds)].sort()],
      )).rows[0]?.count ?? 0);
      if (count !== new Set(teamIds).size)
        throw Object.assign(new Error("assignment_unavailable"), { code: "assignment_unavailable", status: 409 });
    },
    async canDiscloseLead(actor: TrustedActor, lead: { id: string; owner_membership_id: string | null; visibility: string }) {
      if (actor.role !== "member") return true;
      if (lead.owner_membership_id !== actor.membershipId) return false;
      if (lead.visibility === "workspace") return true;
      return Boolean((await tx.query(
        `select 1 from lead_visible_teams lvt join team_memberships tm on tm.workspace_id=lvt.workspace_id and tm.team_id=lvt.team_id
          where lvt.workspace_id=$1 and lvt.lead_id=$2 and tm.workspace_membership_id=$3`,
        [actor.workspaceId, lead.id, actor.membershipId])).rows[0]);
    },
  };
}
