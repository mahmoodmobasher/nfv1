import "server-only";
import { leadActivityListV1Schema as authoritativeLeadActivityListV1Schema } from "@/backend/modules/activities";
import { leadActivityListEnvelopeV1Schema, type ActivityKindV1, type LeadActivityListV1 } from "../contracts/lead-activity.contracts";

export type LeadActivityServerQuery = { queryVersion: "activity-list-query.v1"; limit: number; kind?: ActivityKindV1; cursor?: string };
export type LeadActivityServerPort = (leadId: string, query: LeadActivityServerQuery) => Promise<unknown>;

export async function loadLeadActivityList(port: LeadActivityServerPort, leadId: string, query: Omit<LeadActivityServerQuery, "queryVersion">): Promise<LeadActivityListV1> {
  const envelope = leadActivityListEnvelopeV1Schema.parse(await port(leadId, { queryVersion: "activity-list-query.v1", ...query }));
  const parsed = authoritativeLeadActivityListV1Schema.parse(envelope.data);
  if (parsed.lead.leadId !== leadId) throw new Error("activity_lead_identity_mismatch");
  return parsed;
}
