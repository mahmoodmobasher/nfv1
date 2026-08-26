import type { ModuleTransaction } from "../database";
export async function writeCustomerGraphEvent(tx:ModuleTransaction,input:{workspaceId:string;topic:string;kind:"company"|"contact";id:string;operationId:string;version:number;payload:Record<string,unknown>}){
  const allowed=new Set(["crm.company.created.v1","crm.company.updated.v1","crm.company.archived.v1","crm.company.restored.v1","crm.contact.created.v1","crm.contact.updated.v1","crm.contact.archived.v1","crm.contact.restored.v1","crm.contact.affiliation_replaced.v1"]);
  if(!allowed.has(input.topic)||!input.topic.startsWith(`crm.${input.kind}.`)||input.payload.workspaceId!==input.workspaceId||input.payload[`${input.kind}Id`]!==input.id)throw new Error("invalid_customer_graph_event");
  await tx.query(`insert into outbox_messages(workspace_id,topic,aggregate_type,aggregate_id,operation_id,result_version,payload) values($1,$2,$3,$4,$5,$6,$7)`,[input.workspaceId,input.topic,input.kind,input.id,input.operationId,input.version,JSON.stringify(input.payload)]);
}
