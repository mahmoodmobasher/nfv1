import type { Pool, PoolClient } from "pg";
import { writeAudit } from "../security/audit";

export type OwnerActor = { userId: string; membershipId: string; workspaceId: string; role?: string; sessionId?: string };
type Operation = "owner_change" | "owner_transfer";
class OwnerMutationError extends Error { constructor(public code: string) { super(code); } }

async function safeDenialAudit(pool: Pool, actor: OwnerActor, operation: Operation, reason: string) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const derived = await client.query<{ workspace_id: string; membership_id: string; user_id: string }>(
      `select m.workspace_id, m.id membership_id, m.user_id
       from workspace_memberships m join roles r on r.id=m.role_id and r.workspace_id=m.workspace_id
       where m.id=$1 and m.user_id=$2 and r.code='owner'`, [actor.membershipId, actor.userId],
    );
    const userExists = derived.rows[0] || (await client.query("select id from users where id=$1", [actor.userId])).rows[0];
    await writeAudit(client, {
      workspaceId: derived.rows[0]?.workspace_id,
      actorMembershipId: derived.rows[0]?.membership_id,
      actorUserId: userExists ? actor.userId : undefined,
      action: operation === "owner_transfer" ? "workspace.ownership_transfer_denied" : "workspace.owner_change_denied",
      targetType: "membership", outcome: "denied", reasonCode: reason,
      metadata: { operation },
    });
    await client.query("commit");
  } catch { await client.query("rollback"); }
  finally { client.release(); }
}

async function authorizedActor(client: PoolClient, actor: OwnerActor) {
  return (await client.query<{ id: string; user_id: string; workspace_id: string; role_id: string }>(
    `select m.id,m.user_id,m.workspace_id,m.role_id from workspace_memberships m
     join roles r on r.id=m.role_id and r.workspace_id=m.workspace_id
     where m.id=$1 and m.user_id=$2 and m.workspace_id=$3 and m.status='active' and r.code='owner' for update`,
    [actor.membershipId, actor.userId, actor.workspaceId],
  )).rows[0];
}

async function runOwnerMutation<T>(pool: Pool, actor: OwnerActor, operation: Operation, work: (client: PoolClient, verified: NonNullable<Awaited<ReturnType<typeof authorizedActor>>>) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await client.query("select id from workspaces where id=$1 for update", [actor.workspaceId])).rows[0]) throw new OwnerMutationError("workspace_not_found");
    const verified = await authorizedActor(client, actor);
    if (!verified) throw new OwnerMutationError("owner_permission_required");
    const result = await work(client, verified);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    const reason = error instanceof OwnerMutationError ? error.code : "mutation_failed";
    await safeDenialAudit(pool, actor, operation, reason);
    throw error;
  } finally { client.release(); }
}

export async function changeOwnerMembership(pool: Pool, actor: OwnerActor, targetId: string, status: "active" | "removed", roleId?: string) {
  return runOwnerMutation(pool, actor, "owner_change", async (client, verified) => {
    const target = (await client.query<{ role_id: string; code: string }>(
      `select m.role_id,r.code from workspace_memberships m join roles r on r.id=m.role_id and r.workspace_id=m.workspace_id
       where m.id=$1 and m.workspace_id=$2 and m.status='active' for update`, [targetId, verified.workspace_id],
    )).rows[0];
    if (!target) throw new OwnerMutationError("invalid_target");
    if (target.code === "owner" && (status !== "active" || (roleId && roleId !== target.role_id))) {
      const count = (await client.query<{ count: number }>(`select count(*)::int count from workspace_memberships m join roles r on r.id=m.role_id and r.workspace_id=m.workspace_id where m.workspace_id=$1 and m.status='active' and r.code='owner'`, [verified.workspace_id])).rows[0].count;
      if (count <= 1) throw new OwnerMutationError("last_owner_required");
    }
    const changed = await client.query(`update workspace_memberships set status=$3,role_id=coalesce($4,role_id),removed_at=case when $3='removed' then now() else null end,updated_at=now() where id=$1 and workspace_id=$2 and status='active'`, [targetId, verified.workspace_id, status, roleId ?? null]);
    if (changed.rowCount !== 1) throw new OwnerMutationError("row_count_mismatch");
    await writeAudit(client, { workspaceId: verified.workspace_id, actorUserId: verified.user_id, actorMembershipId: verified.id, sessionId: actor.sessionId, action: "workspace.owner_membership_changed", targetType: "membership", targetId, outcome: "success", metadata: { operation: "owner_change" } });
    return true;
  });
}

export async function transferOwnership(pool: Pool, actor: OwnerActor, successorId: string) {
  return runOwnerMutation(pool, actor, "owner_transfer", async (client, verified) => {
    if (successorId === verified.id) throw new OwnerMutationError("self_transfer");
    const successor = (await client.query<{ id: string }>(`select id from workspace_memberships where id=$1 and workspace_id=$2 and status='active' for update`, [successorId, verified.workspace_id])).rows[0];
    if (!successor) throw new OwnerMutationError("invalid_successor");
    const ownerRole = (await client.query<{ id: string }>(`select id from roles where workspace_id=$1 and code='owner'`, [verified.workspace_id])).rows[0];
    if (!ownerRole) throw new OwnerMutationError("owner_role_missing");
    const promoted = await client.query(`update workspace_memberships set role_id=$3,updated_at=now() where id=$1 and workspace_id=$2 and status='active'`, [successor.id, verified.workspace_id, ownerRole.id]);
    if (promoted.rowCount !== 1) throw new OwnerMutationError("successor_row_count_mismatch");
    const removed = await client.query(`update workspace_memberships set status='removed',removed_at=now(),updated_at=now() where id=$1 and user_id=$2 and workspace_id=$3 and status='active' and role_id=$4`, [verified.id, verified.user_id, verified.workspace_id, verified.role_id]);
    if (removed.rowCount !== 1) throw new OwnerMutationError("actor_row_count_mismatch");
    await writeAudit(client, { workspaceId: verified.workspace_id, actorUserId: verified.user_id, actorMembershipId: verified.id, sessionId: actor.sessionId, action: "workspace.ownership_transferred", targetType: "membership", targetId: successor.id, outcome: "success", metadata: { operation: "owner_transfer" } });
    return true;
  });
}
