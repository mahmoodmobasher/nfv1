import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { lookupActiveActor, workspaceAuthorityParticipant, type TrustedActor } from "@/backend/platform/authorization";
import { runModuleTransaction } from "@/backend/platform/database";
import { LeadManagementError, leadOperationalEditViewV1Schema, type LeadOperationalEditViewV1 } from
  "../../contracts/lead-management.contract";
import { leadTransactionParticipant } from "../../persistence/repositories/lead.repository";

const uuid = z.string().uuid();

async function readCurrentOperationalEdit(tx: Parameters<typeof leadTransactionParticipant>[0], actor: TrustedActor,
  leadId: string, requestId: string): Promise<LeadOperationalEditViewV1> {
  const current = await lookupActiveActor(tx, actor);
  const leads = leadTransactionParticipant(tx), authority = workspaceAuthorityParticipant(tx);
  const lead = await leads.readOperational(current.workspaceId, leadId);
  const visible = await authority.visibleLeadIds(current, [{ id: lead.id, visibility: lead.visibility,
    ownerMembershipId: lead.owner_membership_id }]);
  if (!visible.has(lead.id)) throw new LeadManagementError("resource_not_found", 404);
  const canEditLead = authority.canEditLead(current);
  const visibleTeamIds = await leads.visibleTeamIds(current.workspaceId, lead.id);
  const options = canEditLead ? await authority.operationalEditOptions(current.workspaceId) : { memberships: [], teams: [] };
  if (options.memberships.length > 500 || options.teams.length > 100)
    throw new LeadManagementError("lead_mutation_unavailable", 503);
  return leadOperationalEditViewV1Schema.parse({
    contractVersion: "getLeadOperationalEdit.v1", requestId, leadId: lead.id, version: lead.version,
    operational: { responsibleMembershipId: lead.owner_membership_id, responsibleTeamId: lead.responsible_team_id,
      visibility: lead.visibility, visibleTeamIds },
    options: { responsibleMemberships: options.memberships, teams: options.teams },
    capabilities: { canEditLead }, nextView: canEditLead ? { kind: "lead_edit", leadId: lead.id } : { kind: "lead_detail", leadId: lead.id },
  });
}

export async function getLeadOperationalEditV1(pool: Pool, actor: TrustedActor, leadId: string,
  requestId: string = randomUUID(), beforeCurrentAuthorityRead?: () => Promise<void>): Promise<LeadOperationalEditViewV1> {
  if (!uuid.safeParse(leadId).success) throw new LeadManagementError("resource_not_found", 404);
  try {
    await runModuleTransaction(pool, async tx => {
      await tx.query("set transaction isolation level repeatable read read only");
      await readCurrentOperationalEdit(tx, actor, leadId, requestId);
    });
    await beforeCurrentAuthorityRead?.();
    // Never serialize the repeatable-read preview. Rebuild every disclosed fact from
    // a new READ COMMITTED authority snapshot after the preview transaction closes.
    return await runModuleTransaction(pool, tx => readCurrentOperationalEdit(tx, actor, leadId, requestId));
  } catch (error) {
    if (error instanceof LeadManagementError) throw error;
    if (error && typeof error === "object" && "code" in error && "status" in error) {
      const value = error as { code: string; status: number };
      throw new LeadManagementError(value.code as never, value.status);
    }
    throw error;
  }
}
