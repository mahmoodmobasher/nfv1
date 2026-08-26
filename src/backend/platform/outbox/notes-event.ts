import type { ModuleTransaction } from "../database";

export async function writeContactNoteEvent(tx: ModuleTransaction, input: {
  actor: { workspaceId: string }; contactId: string; contactVersion: number;
  noteId: string; noteVersion: number; requestId: string; operationId: string;
}) {
  if (!Number.isInteger(input.noteVersion) || input.noteVersion < 1 || !Number.isInteger(input.contactVersion) || input.contactVersion < 1)
    throw new Error("invalid_contact_note_event");
  const payload = { schemaVersion: 1, workspaceId: input.actor.workspaceId, contactId: input.contactId,
    contactVersion: input.contactVersion, noteId: input.noteId, noteVersion: input.noteVersion, requestId: input.requestId };
  await tx.query(
    `insert into outbox_messages(workspace_id,topic,aggregate_type,aggregate_id,operation_id,result_version,payload)
     values($1,'crm.contact.internal_note_added.v1','note',$2,$3,$4,$5)`,
    [input.actor.workspaceId, input.noteId, input.operationId, input.noteVersion, JSON.stringify(payload)],
  );
}
