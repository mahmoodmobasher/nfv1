import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { contactNoteTargetParticipant } from "@/backend/modules/customer-graph";
import { lookupActiveActor, revalidateActiveActor, type TrustedActor } from "@/backend/platform/authorization";
import { runModuleTransaction } from "@/backend/platform/database";
import { canonicalRequestHash, idempotencyReceiptParticipant, lockIdempotencyAuthority } from "@/backend/platform/idempotency";
import { writeContactNoteEvidence } from "@/backend/platform/audit";
import { contactInternalNoteListQueryV1Schema, contactInternalNoteListV1Schema, contactInternalNoteResultV1Schema, type ContactInternalNoteAddCommandV1, type ContactInternalNoteListQueryV1, type ContactInternalNoteResultV1 } from "../contracts/contact-note.contract";

const operation = "contact-internal-note-add.v1" as const;
const fail = (code: string, status: number) => {
  throw Object.assign(new Error(code), { code, status });
};
const principal = (actor: TrustedActor) =>
  `workspace:${actor.workspaceId}:membership:${actor.membershipId}`;

export async function addContactInternalNoteV1(pool: Pool, input: {
  actor: TrustedActor;
  contactId: string;
  command: ContactInternalNoteAddCommandV1;
  key: string;
  requestId: string;
}) {
  return runModuleTransaction(pool, async (tx) => {
    if (input.key.length < 16 || input.key.length > 128 || !/^[\x20-\x7e]+$/.test(input.key))
      fail("validation_failed", 400);
    const actor = await lookupActiveActor(tx, input.actor), principalKey = principal(actor),
      hash = canonicalRequestHash({ contactId: input.contactId, command: input.command });
    await lockIdempotencyAuthority(tx, `${principalKey}:${operation}:${input.key}`);
    const receipts = idempotencyReceiptParticipant(tx),
      prior = await receipts.find<ContactInternalNoteResultV1>(principalKey, operation, input.key),
      target = contactNoteTargetParticipant(tx);
    if (prior) {
      if (prior.requestHash !== hash) fail("idempotency_conflict", 409);
      const finalActor = await revalidateActiveActor(tx, actor);
      await target.lockAndRequireEditable(finalActor, input.contactId, input.command.expectedContactVersion);
      return contactInternalNoteResultV1Schema.parse({ ...prior.outcome, replayed: true });
    }
    await target.lockAndRequireEditable(actor, input.contactId, input.command.expectedContactVersion);
    const operationId = randomUUID(), noteId = randomUUID();
    await tx.query(
      `insert into note_records(id,workspace_id,governing_operation_id,created_by_membership_id,updated_by_membership_id)
       values($1,$2,$3,$4,$4)`,
      [noteId, actor.workspaceId, operationId, actor.membershipId],
    );
    await tx.query(
      `insert into note_revisions(workspace_id,note_id,revision_number,subject,body,governing_operation_id,created_by_membership_id)
       values($1,$2,1,null,$3,$4,$5)`,
      [actor.workspaceId, noteId, input.command.body, operationId, actor.membershipId],
    );
    await tx.query(
      `insert into note_record_references(workspace_id,note_id,record_type,record_id,created_by_membership_id)
       values($1,$2,'crm.contact',$3,$4)`,
      [actor.workspaceId, noteId, input.contactId, actor.membershipId],
    );
    const finalActor = await revalidateActiveActor(tx, actor);
    const contact = await target.lockAndRequireEditable(finalActor, input.contactId, input.command.expectedContactVersion);
    await writeContactNoteEvidence(tx, {
      actor: finalActor, contactId: input.contactId, contactVersion: contact.version,
      noteId, noteVersion: 1, requestId: input.requestId, operationId,
    });
    const outcome = contactInternalNoteResultV1Schema.parse({
      contractVersion: "contact-internal-note-result.v1", contactId: input.contactId,
      noteId, noteVersion: 1, replayed: false, requestId: input.requestId,
    });
    await receipts.save({ principalKey, operation, idempotencyKey: input.key, requestHash: hash, outcome });
    return outcome;
  });
}

type NoteCursor = { updatedAt: string; noteId: string };
function decodeCursor(value: string | undefined): NoteCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<NoteCursor>;
    if (typeof parsed.updatedAt !== "string" || Number.isNaN(Date.parse(parsed.updatedAt)) ||
        typeof parsed.noteId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.noteId))
      fail("validation_failed", 400);
    return parsed as NoteCursor;
  } catch (error) {
    if ((error as { code?: string }).code === "validation_failed") throw error;
    return fail("validation_failed", 400) as never;
  }
}
const encodeCursor = (row: NoteCursor) => Buffer.from(JSON.stringify(row)).toString("base64url");

export async function listContactInternalNotesV1(pool: Pool, actorInput: TrustedActor, contactId: string,
  rawQuery: ContactInternalNoteListQueryV1, requestId: string) {
  return runModuleTransaction(pool, async (tx) => {
    const query = contactInternalNoteListQueryV1Schema.parse(rawQuery), cursor = decodeCursor(query.cursor),
      actor = await lookupActiveActor(tx, actorInput), target = contactNoteTargetParticipant(tx);
    await target.lockAndRequireEditable(actor, contactId);
    const rows = (await tx.query<{ noteId: string; version: number; body: string; createdAt: Date; updatedAt: Date }>(
      `select n.id "noteId",n.version,r.body,n.created_at "createdAt",n.updated_at "updatedAt"
         from note_record_references ref
         join note_records n on n.workspace_id=ref.workspace_id and n.id=ref.note_id and n.lifecycle='active'
         join note_revisions r on r.workspace_id=n.workspace_id and r.note_id=n.id and r.revision_number=n.current_revision_number
        where ref.workspace_id=$1 and ref.record_type='crm.contact' and ref.record_id=$2
          and ($3::timestamptz is null or (n.updated_at,n.id)<($3::timestamptz,$4::uuid))
        order by n.updated_at desc,n.id desc limit $5`,
      [actor.workspaceId, contactId, cursor?.updatedAt ?? null, cursor?.noteId ?? null, query.limit + 1],
    )).rows;
    const more = rows.length > query.limit, page = rows.slice(0, query.limit), boundary = page.at(-1);
    const finalActor = await revalidateActiveActor(tx, actor);
    await target.lockAndRequireEditable(finalActor, contactId);
    return contactInternalNoteListV1Schema.parse({
      contractVersion: "contact-internal-note-list.v1", contactId,
      items: page.map((row) => ({ noteId: row.noteId, version: row.version, body: row.body,
        createdAt: row.createdAt.toISOString() })),
      nextCursor: more && boundary ? encodeCursor({ updatedAt: boundary.updatedAt.toISOString(), noteId: boundary.noteId }) : null,
      requestId,
    });
  });
}
