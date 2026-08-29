import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { lookupActiveActor, type TrustedActor } from "@/backend/platform/authorization";
import { runModuleTransaction } from "@/backend/platform/database";
import { dealOutcomesByLeadParticipant } from "@/backend/modules/sales";
import { LeadIntakeError } from "../../contracts/lead-inquiry-intake.contract";
import {
  LEAD_OUTCOME_RECONCILIATION_QUERY_V1, leadOutcomeReconciliationViewV1Schema, outcomeDisagreement,
  type LeadOutcomeReconciliationViewV1,
} from "../../contracts/lead-reconciliation.contract";
import { leadOutcomeParticipant } from "../../persistence/repositories/lead-outcome.repository";

/**
 * Owner and Admin only: it reports across every Lead in the workspace, including ones a
 * Member cannot see, so it is not a Member-visible surface.
 */
export async function getLeadOutcomeReconciliationV1(pool: Pool, actor: TrustedActor,
  requestId: string = randomUUID()): Promise<LeadOutcomeReconciliationViewV1> {
  return runModuleTransaction(pool, async tx => {
    const current = await lookupActiveActor(tx, actor);
    if (current.role !== "owner" && current.role !== "admin")
      throw new LeadIntakeError("permission_required", 403);
    const dealOutcomes = await dealOutcomesByLeadParticipant(tx).forWorkspace(current.workspaceId);
    const leads = await leadOutcomeParticipant(tx)
      .outcomesForLeads(current.workspaceId, dealOutcomes.map(row => row.leadId));
    const byLead = new Map(dealOutcomes.map(row => [row.leadId, row]));
    const items = leads.flatMap(lead => {
      const deals = byLead.get(lead.leadId);
      if (!deals) return [];
      const disagreement = outcomeDisagreement(lead.status, deals);
      if (!disagreement) return [];
      return [{ leadId: lead.leadId, displayName: lead.displayName, leadStatus: lead.status,
        statusSource: lead.statusSource,
        deals: { won: deals.won, lost: deals.lost, open: deals.open }, disagreement }];
    });
    return leadOutcomeReconciliationViewV1Schema.parse({
      contractVersion: LEAD_OUTCOME_RECONCILIATION_QUERY_V1, requestId, items: items.slice(0, 500) });
  });
}
