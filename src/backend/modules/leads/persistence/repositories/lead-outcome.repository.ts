import type { ModuleTransaction } from "@/backend/platform/database";

/**
 * The Leads module owns the `leads` table, so every write to it goes through here -
 * tests/p1a-modular-boundaries.test.ts enforces that no other module writes it directly.
 * Sales owns the conversion lineage and Deals, so IT decides which Lead is affected and
 * what the derived outcome is; this participant only applies the decision.
 */
export function leadOutcomeParticipant(tx: ModuleTransaction) {
  return {
    /**
     * Applies a Deal-derived outcome to a converted Lead.
     *
     * Only while `status_source='system'`: an owner/admin manual override opts that Lead
     * out of derivation permanently, and the reconciliation report surfaces any resulting
     * disagreement rather than silently overwriting the human. Returns true when a row
     * actually changed, so the caller can record evidence only for real changes.
     */
    async applyDerivedOutcome(input: { workspaceId: string; leadId: string;
      status: "won" | "lost" }): Promise<boolean> {
      const updated = (await tx.query<{ id: string }>(
        `update leads set status=$3,updated_at=now()
          where workspace_id=$1 and id=$2 and status_source='system' and status<>$3
          returning id`,
        [input.workspaceId, input.leadId, input.status],
      )).rows[0];
      return Boolean(updated);
    },

    /** Lead outcomes for the reconciliation report; the caller supplies the Lead ids. */
    async outcomesForLeads(workspaceId: string, leadIds: string[]) {
      if (!leadIds.length) return [];
      return (await tx.query<{ leadId: string; displayName: string; status: "open" | "won" | "lost";
        statusSource: "system" | "manual" }>(
        `select id "leadId",display_name "displayName",status,status_source "statusSource"
           from leads where workspace_id=$1 and id=any($2::uuid[]) order by display_name,id`,
        [workspaceId, [...new Set(leadIds)].sort()],
      )).rows;
    },
  };
}
