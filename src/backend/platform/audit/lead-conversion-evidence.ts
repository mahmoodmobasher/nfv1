import type { ModuleTransaction } from "../database";
import type { TrustedActor } from "../authorization";
import { writeLeadConversionEvents } from "../outbox/lead-conversion-event";

export async function writeLeadConversionEvidence(
  tx: ModuleTransaction,
  input: {
    actor: TrustedActor;
    leadId: string;
    dealId: string;
    leadVersion: number;
    dealVersion: number;
    requestId: string;
    operationId: string;
  },
) {
  const metadata = {
    operation: "lead-convert-to-deal.v1",
    result_version: input.leadVersion,
    change_fields: ["lifecycle", "deal_lineage"],
  };
  await tx.query(
    `insert into audit_events(workspace_id,actor_user_id,actor_membership_id,actor_type,session_id,action,target_type,target_id,outcome,
    request_id,correlation_id,source_ip_policy,before,after,metadata_version,metadata) values($1,$2,$3,'user',$4,'crm.lead_converted','lead',$5,'success',$6,$7,'omitted','{}',$8,1,$9)`,
    [
      input.actor.workspaceId,
      input.actor.userId,
      input.actor.membershipId,
      input.actor.sessionId,
      input.leadId,
      input.requestId,
      input.operationId,
      JSON.stringify({ version: input.leadVersion }),
      JSON.stringify(metadata),
    ],
  );
  await writeLeadConversionEvents(tx, input);
}
