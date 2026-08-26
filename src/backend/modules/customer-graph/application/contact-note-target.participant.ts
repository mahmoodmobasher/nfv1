import type { ModuleTransaction } from "@/backend/platform/database";
import type { TrustedActor } from "@/backend/platform/authorization";

export function contactNoteTargetParticipant(tx: ModuleTransaction) {
  return {
    async lockAndRequireEditable(actor: TrustedActor, contactId: string, expectedVersion?: number) {
      const row = (
        await tx.query<{ id: string; version: number }>(
          `select c.id,c.version from contacts c
            where c.workspace_id=$1 and c.id=$2 and c.status='active'
              and c.authority_contract_version='customer-graph-v1'
              and $3::text in ('owner','admin')
              and ($3::text<>'member' or c.visibility='workspace'
                or c.responsible_membership_id=$4
                or exists(select 1 from contact_visible_teams cvt
                  join team_memberships tm on tm.workspace_id=cvt.workspace_id and tm.team_id=cvt.team_id
                  join teams t on t.workspace_id=tm.workspace_id and t.id=tm.team_id and t.status='active'
                 where cvt.workspace_id=c.workspace_id and cvt.contact_id=c.id
                   and tm.workspace_membership_id=$4))
            for no key update of c`,
          [actor.workspaceId, contactId, actor.role, actor.membershipId],
        )
      ).rows[0];
      if (!row)
        throw Object.assign(new Error("resource_not_found"), {
          code: "resource_not_found",
          status: 404,
        });
      if (expectedVersion !== undefined && row.version !== expectedVersion)
        throw Object.assign(new Error("stale_version"), {
          code: "stale_version",
          status: 409,
        });
      return row;
    },
  };
}
