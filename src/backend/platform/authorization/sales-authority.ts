import type { ModuleTransaction } from "../database";
import type { TrustedActor } from "./authorization-facts";
export function salesAuthorityParticipant(tx: ModuleTransaction) {
  return {
    canCreate(actor: TrustedActor) {
      return actor.role === "owner" || actor.role === "admin";
    },
    canEdit(actor: TrustedActor) {
      return actor.role === "owner" || actor.role === "admin";
    },
    canTransition(
      actor: TrustedActor,
      deal: { responsibleMembershipId: string },
    ) {
      return (
        actor.role === "owner" ||
        actor.role === "admin" ||
        deal.responsibleMembershipId === actor.membershipId
      );
    },
    async options(actor: TrustedActor) {
      if (actor.role !== "owner" && actor.role !== "admin")
        return { responsibleMemberships: [], teams: [] };
      const [members, teams] = await Promise.all([
        tx.query<{ id: string; label: string }>(
          `select m.id,coalesce(nullif(btrim(u.display_name),''),'Workspace member') label from workspace_memberships m join users u on u.id=m.user_id and u.status='active' where m.workspace_id=$1 and m.status='active' order by lower(u.display_name),m.id limit 501`,
          [actor.workspaceId],
        ),
        tx.query<{ id: string; label: string }>(
          `select id,name label from teams where workspace_id=$1 and status='active' order by lower(name),id limit 101`,
          [actor.workspaceId],
        ),
      ]);
      return { responsibleMemberships: members.rows, teams: teams.rows };
    },
    async lockAndValidate(
      actor: TrustedActor,
      input: {
        responsibleMembershipId: string;
        responsibleTeamId: string | null;
        visibility: "workspace" | "teams";
        visibleTeamIds: string[];
      },
    ) {
      const membershipIds = [input.responsibleMembershipId],
        teamIds = [
          ...new Set([
            ...(input.responsibleTeamId ? [input.responsibleTeamId] : []),
            ...input.visibleTeamIds,
          ]),
        ].sort();
      const members = (
        await tx.query(
          `select m.id from workspace_memberships m join users u on u.id=m.user_id and u.status='active' where m.workspace_id=$1 and m.id=any($2::uuid[]) and m.status='active' order by m.id for no key update of m,u`,
          [actor.workspaceId, membershipIds],
        )
      ).rows;
      if (members.length !== membershipIds.length)
        throw Object.assign(new Error("assignment_unavailable"), {
          code: "assignment_unavailable",
          status: 409,
        });
      if (teamIds.length) {
        const teams = (
          await tx.query(
            `select id from teams where workspace_id=$1 and id=any($2::uuid[]) and status='active' order by id for no key update`,
            [actor.workspaceId, teamIds],
          )
        ).rows;
        if (teams.length !== teamIds.length)
          throw Object.assign(new Error("assignment_unavailable"), {
            code: "assignment_unavailable",
            status: 409,
          });
      }
      if (
        (input.visibility === "workspace" && input.visibleTeamIds.length) ||
        (input.visibility === "teams" && !input.visibleTeamIds.length)
      )
        throw Object.assign(new Error("assignment_unavailable"), {
          code: "assignment_unavailable",
          status: 409,
        });
    },
  };
}
