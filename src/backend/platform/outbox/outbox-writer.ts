import type { ModuleTransaction } from "../database";

export type P1AEventTopic = "crm.inquiry.created.v1" | "crm.inquiry.review_required.v1" |
  "crm.inquiry.review_resolved.v1" | "crm.inquiry.linked.v1" | "crm.contact.created.v1" | "crm.company.created.v1";
export type DomainEventV1 = {
  topic: P1AEventTopic;
  aggregateType: "lead" | "contact" | "company";
  aggregateId: string;
  resultVersion: number;
  payload: Record<string, unknown>;
};

export async function writeDomainEventSet(tx: ModuleTransaction, input: {
  workspaceId: string;
  operationId: string;
  events: DomainEventV1[];
}): Promise<void> {
  const identities = new Set<string>();
  for (const event of input.events) {
    const identity = `${event.topic}:${event.aggregateType}:${event.aggregateId}:${event.resultVersion}`;
    if (identities.has(identity)) throw new Error("duplicate_p1a_event_identity");
    identities.add(identity);
    const serialized = JSON.stringify(event.payload);
    if (/"(?:email|phone|displayName|sourceDetail|campaignContext|message|subject)"\s*:/.test(serialized))
      throw new Error("p1a_event_privacy_violation");
    await tx.query(
      `insert into outbox_messages(workspace_id,topic,aggregate_type,aggregate_id,operation_id,result_version,payload)
       values($1,$2,$3,$4,$5,$6,$7)`,
      [input.workspaceId, event.topic, event.aggregateType, event.aggregateId, input.operationId,
        event.resultVersion, JSON.stringify(event.payload)],
    );
  }
}
