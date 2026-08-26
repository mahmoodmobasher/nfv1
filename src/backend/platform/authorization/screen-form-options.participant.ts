import type { PoolClient } from "pg";
import type { TrustedActor } from "./authorization-facts";

export async function listAuthorityScreenOptions(
  tx: PoolClient,
  actor: TrustedActor,
  input: {
    optionKind: "assignment_membership" | "assignment_team";
    search: string;
    cursor: { label: string; id: string } | null;
    limit: number;
  },
) {
  const args = [
    actor.workspaceId,
    input.search,
    input.cursor?.label ?? null,
    input.cursor?.id ?? null,
    input.limit + 1,
  ];
  if (input.optionKind === "assignment_membership") {
    const rows = (
      await tx.query<{ id: string; label: string; version: number }>(
        `select m.id,coalesce(nullif(btrim(u.display_name),''),'Workspace member') label,m.version from workspace_memberships m join users u on u.id=m.user_id and u.status='active' where m.workspace_id=$1 and m.status='active' and lower(coalesce(nullif(btrim(u.display_name),''),'Workspace member')) like $2 escape '\\' and ($3::text is null or (lower(coalesce(nullif(btrim(u.display_name),''),'Workspace member')),m.id)>($3,$4::uuid)) order by lower(coalesce(nullif(btrim(u.display_name),''),'Workspace member')),m.id limit $5 for no key update of m,u`,
        args,
      )
    ).rows;
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      target: { kind: "version" as const, version: row.version },
    }));
  }
  const rows = (
    await tx.query<{ id: string; label: string; version: number }>(
      `select t.id,t.name label,t.version from teams t where t.workspace_id=$1 and t.status='active' and lower(t.name) like $2 escape '\\' and ($3::text is null or (lower(t.name),t.id)>($3,$4::uuid)) order by lower(t.name),t.id limit $5 for no key update of t`,
      args,
    )
  ).rows;
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    target: { kind: "version" as const, version: row.version },
  }));
}

export async function assertScreenAssignmentTargetVersions(
  tx: PoolClient,
  actor: TrustedActor,
  value: {
    responsibleMembershipId: string | null;
    responsibleMembershipVersion: number | null;
    responsibleTeamId: string | null;
    responsibleTeamVersion: number | null;
    visibleTeamIds: string[];
    visibleTeamVersions: Record<string, number>;
  },
) {
  const membership = value.responsibleMembershipId
      ? (
          await tx.query<{ version: number }>(
            `select version from workspace_memberships where workspace_id=$1 and id=$2 and status='active' for no key update`,
            [actor.workspaceId, value.responsibleMembershipId],
          )
        ).rows[0]
      : null,
    ids = [
      ...new Set(
        [value.responsibleTeamId, ...value.visibleTeamIds].filter(
          (id): id is string => id !== null,
        ),
      ),
    ].sort(),
    teams = ids.length
      ? (
          await tx.query<{ id: string; version: number }>(
            `select id,version from teams where workspace_id=$1 and id=any($2::uuid[]) and status='active' order by id for no key update`,
            [actor.workspaceId, ids],
          )
        ).rows
      : [],
    versions = new Map(teams.map((row) => [row.id, row.version]));
  if (
    (value.responsibleMembershipId !== null &&
      membership?.version !== value.responsibleMembershipVersion) ||
    teams.length !== ids.length ||
    (value.responsibleTeamId &&
      versions.get(value.responsibleTeamId) !== value.responsibleTeamVersion) ||
    value.visibleTeamIds.some(
      (id) => versions.get(id) !== value.visibleTeamVersions[id],
    )
  )
    throw Object.assign(new Error("selection_unavailable"), {
      code: "selection_unavailable",
      status: 409,
    });
}

export async function readLeadScreenAssignmentFacts(
  tx: PoolClient,
  actor: TrustedActor,
  input: {
    leadId: string;
    ownerMembershipId: string | null;
    responsibleTeamId: string | null;
    visibility: "workspace" | "teams";
  },
) {
  const membership = input.ownerMembershipId
      ? (
          await tx.query<{ version: number }>(
            `select version from workspace_memberships where workspace_id=$1 and id=$2 and status='active'`,
            [actor.workspaceId, input.ownerMembershipId],
          )
        ).rows[0]
      : null,
    team = input.responsibleTeamId
      ? (
          await tx.query<{ version: number }>(
            `select version from teams where workspace_id=$1 and id=$2 and status='active'`,
            [actor.workspaceId, input.responsibleTeamId],
          )
        ).rows[0]
      : null,
    visibleTeams = (
      await tx.query<{ id: string; version: number }>(
        `select t.id,t.version from lead_visible_teams v join teams t on t.workspace_id=v.workspace_id and t.id=v.team_id and t.status='active' where v.workspace_id=$1 and v.lead_id=$2 order by t.id`,
        [actor.workspaceId, input.leadId],
      )
    ).rows;
  if (
    (input.ownerMembershipId && !membership) ||
    (input.responsibleTeamId && !team)
  )
    throw Object.assign(new Error("resource_not_found"), {
      code: "resource_not_found",
      status: 404,
    });
  return {
    responsibleMembershipId: input.ownerMembershipId,
    responsibleMembershipVersion: membership?.version ?? null,
    responsibleTeamId: input.responsibleTeamId,
    responsibleTeamVersion: team?.version ?? null,
    visibility: input.visibility,
    visibleTeams,
  };
}
