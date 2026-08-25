import type { ModuleTransaction } from "../database";

export type ActorRole = "owner" | "admin" | "member";
export type TrustedActor = {
  userId: string;
  sessionId: string;
  workspaceId: string;
  membershipId: string;
  role: ActorRole;
};

export async function revalidateActiveActor(tx: ModuleTransaction, actor: TrustedActor): Promise<TrustedActor> {
  const result = await tx.query<TrustedActor>(
    `select m.user_id "userId",s.id "sessionId",m.workspace_id "workspaceId",m.id "membershipId",r.code role
       from workspace_memberships m
       join roles r on r.workspace_id=m.workspace_id and r.id=m.role_id
       join workspaces w on w.id=m.workspace_id and w.status='active'
       join users u on u.id=m.user_id and u.status='active'
       join sessions s on s.id=$2 and s.user_id=m.user_id and s.revoked_at is null
      where m.workspace_id=$1 and m.id=$3 and m.user_id=$4 and m.status='active'
        and s.idle_expires_at>now() and s.absolute_expires_at>now()
      for update of m`,
    [actor.workspaceId, actor.sessionId, actor.membershipId, actor.userId],
  );
  const current = result.rows[0];
  if (!current) throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
  return current;
}
