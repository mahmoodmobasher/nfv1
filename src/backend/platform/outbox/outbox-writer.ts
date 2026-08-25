import type { ModuleTransaction } from "../database";

export type DomainEventV1 = {
  topic: string;
  aggregateType: string;
  aggregateId: string;
  resultVersion: number;
  payload: Record<string, unknown>;
};

export async function writeDomainEventSet(tx: ModuleTransaction, input: {
  workspaceId: string;
  operationId: string;
  events: DomainEventV1[];
}): Promise<void> {
  for (const event of input.events) {
    await tx.query(
      `insert into outbox_messages(workspace_id,topic,aggregate_type,aggregate_id,operation_id,result_version,payload)
       values($1,$2,$3,$4,$5,$6,$7)`,
      [input.workspaceId, event.topic, event.aggregateType, event.aggregateId, input.operationId,
        event.resultVersion, JSON.stringify(event.payload)],
    );
  }
}
