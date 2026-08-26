import type { ModuleTransaction } from "../database";
export type SalesEventTopic =
  | "sales.deal.created.v1"
  | "sales.deal.updated.v1"
  | "sales.deal.stage_transitioned.v1"
  | "sales.deal.archived.v1"
  | "sales.deal.restored.v1";
export async function writeSalesEvent(
  tx: ModuleTransaction,
  input: {
    workspaceId: string;
    topic: SalesEventTopic;
    dealId: string;
    operationId: string;
    version: number;
    requestId: string;
    changeFields: string[];
  },
) {
  const allowed = new Set([
    "created",
    "profile",
    "value",
    "expectedCloseOn",
    "parties",
    "assignment",
    "stage",
    "lifecycle",
  ]);
  if (input.changeFields.some((f) => !allowed.has(f)))
    throw new Error("invalid_sales_event");
  const payload = {
    schemaVersion: 1,
    workspaceId: input.workspaceId,
    dealId: input.dealId,
    dealVersion: input.version,
    requestId: input.requestId,
    changeFields: [...new Set(input.changeFields)].slice(0, 8),
  };
  await tx.query(
    `insert into outbox_messages(workspace_id,topic,aggregate_type,aggregate_id,operation_id,result_version,payload) values($1,$2,'deal',$3,$4,$5,$6)`,
    [
      input.workspaceId,
      input.topic,
      input.dealId,
      input.operationId,
      input.version,
      JSON.stringify(payload),
    ],
  );
}
