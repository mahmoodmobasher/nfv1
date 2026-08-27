import type { ModuleTransaction } from "../database";

export async function writeActivityCreatedEvent(tx: ModuleTransaction, input: {
  workspaceId: string; activityId: string; activityVersion: number; leadId: string; leadVersion: number;
  kind: string; occurredAt: string; requestId: string; operationId: string;
}) {
  if (input.activityVersion !== 1 || !Number.isInteger(input.leadVersion) || input.leadVersion < 1)
    throw new Error("invalid_activity_event");
  const payload = { schemaVersion: 1, workspaceId: input.workspaceId, activityId: input.activityId,
    activityVersion: input.activityVersion, recordType: "crm.lead", recordId: input.leadId,
    recordVersion: input.leadVersion, kind: input.kind, occurredAt: input.occurredAt, requestId: input.requestId };
  await tx.query(
    `insert into outbox_messages(workspace_id,topic,aggregate_type,aggregate_id,operation_id,result_version,payload)
     values($1,'crm.activity.created.v1','activity',$2,$3,$4,$5)`,
    [input.workspaceId, input.activityId, input.operationId, input.activityVersion, JSON.stringify(payload)],
  );
}
