import type { ModuleTransaction } from "../database";

export type P1AEventTopic = "crm.inquiry.created.v1" | "crm.inquiry.review_required.v1" |
  "crm.inquiry.review_resolved.v1" | "crm.inquiry.linked.v1" | "crm.contact.created.v1" | "crm.company.created.v1" |
  "crm.lead.operational_updated.v1" | "crm.lead.stage_transitioned.v1";
export type DomainEventV1 = {
  topic: P1AEventTopic;
  aggregateType: "lead" | "contact" | "company";
  aggregateId: string;
  resultVersion: number;
  payload: Record<string, unknown>;
};

const topicContract: Record<P1AEventTopic, { aggregate: DomainEventV1["aggregateType"]; required: string[]; allowed: string[] }> = {
  "crm.inquiry.created.v1": { aggregate: "lead", required: ["schemaVersion", "workspaceId", "leadId", "leadVersion", "lifecycle",
    "disposition", "intakeChannel", "sourceCategory", "sourcePlatform", "sourceMedium", "candidateSummary", "requestId"], allowed: [] },
  "crm.inquiry.review_required.v1": { aggregate: "lead", required: ["schemaVersion", "workspaceId", "leadId", "leadVersion",
    "reviewId", "reviewVersion", "disposition", "requestId"], allowed: ["lifecycle", "intakeChannel", "sourceCategory", "sourcePlatform",
      "sourceMedium", "candidateSummary"] },
  "crm.inquiry.review_resolved.v1": { aggregate: "lead", required: ["schemaVersion", "workspaceId", "leadId", "reviewId",
    "leadVersion", "reviewVersion", "contactId", "companyId", "requestId"], allowed: [] },
  "crm.inquiry.linked.v1": { aggregate: "lead", required: ["schemaVersion", "workspaceId", "leadId", "reviewId", "leadVersion",
    "reviewVersion", "contactId", "companyId", "requestId"], allowed: [] },
  "crm.contact.created.v1": { aggregate: "contact", required: ["schemaVersion", "workspaceId", "contactId", "version", "requestId"], allowed: [] },
  "crm.company.created.v1": { aggregate: "company", required: ["schemaVersion", "workspaceId", "companyId", "version", "requestId"], allowed: [] },
  "crm.lead.operational_updated.v1": { aggregate: "lead", required: ["schemaVersion", "workspaceId", "leadId", "leadVersion",
    "changeFields", "requestId"], allowed: [] },
  "crm.lead.stage_transitioned.v1": { aggregate: "lead", required: ["schemaVersion", "workspaceId", "leadId", "leadVersion",
    "previousStageId", "stageId", "requestId"], allowed: [] },
};

function assertEventContract(event: DomainEventV1, workspaceId: string) {
  const contract = topicContract[event.topic];
  if (!contract) throw new Error("invalid_p1a_event_topic");
  if (event.aggregateType !== contract.aggregate) throw new Error("invalid_p1a_event_aggregate");
  const allowed = new Set([...contract.required, ...contract.allowed]);
  if (contract.required.some(key => !(key in event.payload)) || Object.keys(event.payload).some(key => !allowed.has(key)))
    throw new Error("invalid_p1a_event_payload");
  if (event.payload.schemaVersion !== 1 || event.payload.workspaceId === undefined || event.payload.requestId === undefined)
    throw new Error("invalid_p1a_event_payload");
  const payload = event.payload, text = (value: unknown) => typeof value === "string" && value.length > 0;
  const version = (value: unknown) => Number.isInteger(value) && Number(value) > 0;
  if (payload.workspaceId !== workspaceId || !text(payload.requestId) || !version(event.resultVersion))
    throw new Error("invalid_p1a_event_payload");
  if (event.aggregateType === "lead" && payload.leadId !== event.aggregateId)
    throw new Error("invalid_p1a_event_payload");
  if (event.aggregateType === "contact" && payload.contactId !== event.aggregateId)
    throw new Error("invalid_p1a_event_payload");
  if (event.aggregateType === "company" && payload.companyId !== event.aggregateId)
    throw new Error("invalid_p1a_event_payload");
  if (event.topic === "crm.inquiry.created.v1" || event.topic === "crm.inquiry.review_required.v1") {
    if (!text(payload.leadId) || !version(payload.leadVersion) || !text(payload.disposition))
      throw new Error("invalid_p1a_event_payload");
    if ("reviewId" in payload && (!text(payload.reviewId) || !version(payload.reviewVersion)))
      throw new Error("invalid_p1a_event_payload");
    if ("candidateSummary" in payload) {
      const summary = payload.candidateSummary as Record<string, unknown> | null;
      if (!summary || Object.keys(summary).sort().join(",") !== "probable,strong,supplementary" ||
          Object.values(summary).some(value => !Number.isInteger(value) || Number(value) < 0 || Number(value) > 10))
        throw new Error("invalid_p1a_event_payload");
    }
  }
  if (event.topic === "crm.inquiry.review_resolved.v1" || event.topic === "crm.inquiry.linked.v1") {
    if (!text(payload.leadId) || !text(payload.reviewId) || !version(payload.leadVersion) || !version(payload.reviewVersion) ||
        (payload.contactId !== null && payload.contactId !== undefined && !text(payload.contactId)) ||
        (payload.companyId !== null && payload.companyId !== undefined && !text(payload.companyId)) ||
        (event.topic === "crm.inquiry.linked.v1" && !payload.contactId && !payload.companyId))
      throw new Error("invalid_p1a_event_payload");
  }
  if ((event.topic === "crm.contact.created.v1" && !version(payload.version)) ||
      (event.topic === "crm.company.created.v1" && !version(payload.version)))
    throw new Error("invalid_p1a_event_payload");
  if (event.topic === "crm.lead.operational_updated.v1" &&
      (!version(payload.leadVersion) || !Array.isArray(payload.changeFields) || payload.changeFields.length < 1 ||
       payload.changeFields.length > 4 || payload.changeFields.some(field => typeof field !== "string" ||
         !["responsibleMembershipId", "responsibleTeamId", "visibility", "visibleTeamIds"].includes(field))))
    throw new Error("invalid_p1a_event_payload");
  if (event.topic === "crm.lead.stage_transitioned.v1" &&
      (!version(payload.leadVersion) || !text(payload.previousStageId) || !text(payload.stageId) ||
       payload.previousStageId === payload.stageId))
    throw new Error("invalid_p1a_event_payload");
}

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
    assertEventContract(event, input.workspaceId);
  }
  const topicSet = [...new Set(input.events.map(event => event.topic))].sort().join(",");
  const allowedSets = new Set([
    "crm.inquiry.created.v1",
    "crm.inquiry.created.v1,crm.inquiry.review_required.v1",
    "crm.inquiry.review_required.v1",
    "crm.inquiry.review_resolved.v1",
    "crm.inquiry.linked.v1,crm.inquiry.review_resolved.v1",
    "crm.contact.created.v1,crm.inquiry.linked.v1,crm.inquiry.review_resolved.v1",
    "crm.company.created.v1,crm.inquiry.linked.v1,crm.inquiry.review_resolved.v1",
    "crm.company.created.v1,crm.contact.created.v1,crm.inquiry.linked.v1,crm.inquiry.review_resolved.v1",
    "crm.lead.operational_updated.v1",
    "crm.lead.stage_transitioned.v1",
  ]);
  if (!allowedSets.has(topicSet)) throw new Error("invalid_p1a_event_set");
  for (const event of input.events) {
    await tx.query(
      `insert into outbox_messages(workspace_id,topic,aggregate_type,aggregate_id,operation_id,result_version,payload)
       values($1,$2,$3,$4,$5,$6,$7)`,
      [input.workspaceId, event.topic, event.aggregateType, event.aggregateId, input.operationId,
        event.resultVersion, JSON.stringify(event.payload)],
    );
  }
}
