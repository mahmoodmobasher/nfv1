import type { ModuleTransaction } from "@/backend/platform/database";
import { revalidateActiveActor, workspaceAuthorityParticipant, type TrustedActor } from "@/backend/platform/authorization";

type LeadActivityRow = { id: string; version: number; owner_membership_id: string | null; visibility: string };

export function leadActivityTargetParticipant(tx: ModuleTransaction) {
  async function resolve(actorInput: TrustedActor, leadId: string, expectedVersion?: number) {
    const lead = (await tx.query<LeadActivityRow>(
      `select id,version,owner_membership_id,visibility from leads
        where workspace_id=$1 and id=$2 for no key update`, [actorInput.workspaceId, leadId])).rows[0];
    if (!lead) throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
    const authority = workspaceAuthorityParticipant(tx);
    await authority.lockReferences({ workspaceId: actorInput.workspaceId, leadId,
      membershipIds: [actorInput.membershipId, lead.owner_membership_id] });
    const actor = await revalidateActiveActor(tx, actorInput);
    const visible = await authority.visibleLeadIds(actor, [{ id: lead.id, visibility: lead.visibility,
      ownerMembershipId: lead.owner_membership_id }]);
    if (!visible.has(lead.id))
      throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
    if (expectedVersion !== undefined && lead.version !== expectedVersion)
      throw Object.assign(new Error("stale_version"), { code: "stale_version", status: 409 });
    const canCreateActivity = actor.role === "owner" || actor.role === "admin" ||
      lead.owner_membership_id === actor.membershipId;
    return { actor, lead, capabilities: { canViewActivities: true as const, canCreateActivity } };
  }
  return {
    authorizeView(actor: TrustedActor, leadId: string) { return resolve(actor, leadId); },
    async authorizeCreate(actor: TrustedActor, leadId: string, expectedVersion: number) {
      const result = await resolve(actor, leadId, expectedVersion);
      if (!result.capabilities.canCreateActivity)
        throw Object.assign(new Error("permission_required"), { code: "permission_required", status: 403 });
      return result;
    },
  };
}
