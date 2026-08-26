import type { TrustedActor } from "../authorization";
import type { ModuleTransaction } from "../database";

const topics = ["crm.lead.converted.v1", "sales.deal.created.v1"] as const;

export async function writeLeadConversionEvents(
  tx: ModuleTransaction,
  input: {
    actor: TrustedActor;
    leadId: string;
    leadVersion: number;
    dealId: string;
    dealVersion: number;
    requestId: string;
    operationId: string;
  },
) {
  const events = [
    {
      topic: topics[0],
      aggregateType: "lead",
      aggregateId: input.leadId,
      resultVersion: input.leadVersion,
      payload: {
        schemaVersion: 1,
        workspaceId: input.actor.workspaceId,
        leadId: input.leadId,
        leadVersion: input.leadVersion,
        dealId: input.dealId,
        dealVersion: input.dealVersion,
        requestId: input.requestId,
      },
    },
    {
      topic: topics[1],
      aggregateType: "deal",
      aggregateId: input.dealId,
      resultVersion: input.dealVersion,
      payload: {
        schemaVersion: 1,
        workspaceId: input.actor.workspaceId,
        dealId: input.dealId,
        dealVersion: input.dealVersion,
        source: "lead_conversion",
        leadId: input.leadId,
        requestId: input.requestId,
      },
    },
  ];
  for (const event of events)
    await tx.query(
      `insert into outbox_messages(workspace_id,topic,aggregate_type,aggregate_id,operation_id,result_version,payload)
       values($1,$2,$3,$4,$5,$6,$7)`,
      [
        input.actor.workspaceId,
        event.topic,
        event.aggregateType,
        event.aggregateId,
        input.operationId,
        event.resultVersion,
        JSON.stringify(event.payload),
      ],
    );
}
