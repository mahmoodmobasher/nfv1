import { z } from "zod";

export const LEAD_OUTCOME_RECONCILIATION_QUERY_V1 = "getLeadOutcomeReconciliation.v1" as const;

/**
 * Leads and Deals track won/lost independently by product decision, which risks the two
 * drifting apart. This report is the guardrail: it lists every converted Lead whose
 * recorded outcome disagrees with its Deals, so the disagreement is visible rather than
 * silently resolved in one direction.
 */
export const LEAD_OUTCOME_DISAGREEMENTS = [
  "won_without_a_won_deal",
  "lost_despite_a_won_deal",
  "open_despite_a_closed_deal",
] as const;
export type LeadOutcomeDisagreement = (typeof LEAD_OUTCOME_DISAGREEMENTS)[number];

const uuid = z.string().uuid();

export const leadOutcomeReconciliationItemV1Schema = z.object({
  leadId: uuid,
  displayName: z.string().min(1).max(200),
  leadStatus: z.enum(["open", "won", "lost"]),
  statusSource: z.enum(["system", "manual"]),
  deals: z.object({ won: z.number().int().min(0), lost: z.number().int().min(0),
    open: z.number().int().min(0) }).strict(),
  disagreement: z.enum(LEAD_OUTCOME_DISAGREEMENTS),
}).strict();

export const leadOutcomeReconciliationViewV1Schema = z.object({
  contractVersion: z.literal(LEAD_OUTCOME_RECONCILIATION_QUERY_V1),
  requestId: uuid,
  items: z.array(leadOutcomeReconciliationItemV1Schema).max(500),
}).strict();

export type LeadOutcomeReconciliationItemV1 = z.infer<typeof leadOutcomeReconciliationItemV1Schema>;
export type LeadOutcomeReconciliationViewV1 = z.infer<typeof leadOutcomeReconciliationViewV1Schema>;

/**
 * The single definition of "these disagree". A Lead is expected to be `won` when any of
 * its Deals was won, `lost` when every Deal closed and none was won, and `open` while any
 * Deal is still open. Anything else is reported.
 */
export function outcomeDisagreement(
  leadStatus: "open" | "won" | "lost",
  deals: { won: number; lost: number; open: number },
): LeadOutcomeDisagreement | null {
  if (leadStatus === "won" && deals.won === 0) return "won_without_a_won_deal";
  if (leadStatus === "lost" && deals.won > 0) return "lost_despite_a_won_deal";
  if (leadStatus === "open" && deals.open === 0 && deals.won + deals.lost > 0)
    return "open_despite_a_closed_deal";
  return null;
}
