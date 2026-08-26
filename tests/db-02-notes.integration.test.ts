import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString: process.env.DATABASE_URL ??
  "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });

async function actorFixture() {
  const user = (await pool.query<{ id: string }>(
    "insert into users(display_name,status) values('Notes Owner','active') returning id",
  )).rows[0];
  const workspace = (await pool.query<{ id: string }>(
    `insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
     values('Notes Workspace',$1,'active','essentials','monthly',$2) returning id`,
    [`notes-${randomUUID()}`, user.id],
  )).rows[0];
  const role = (await pool.query<{ id: string }>(
    "insert into roles(workspace_id,code) values($1,'owner') returning id", [workspace.id],
  )).rows[0];
  const membership = (await pool.query<{ id: string }>(
    "insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active') returning id",
    [workspace.id, user.id, role.id],
  )).rows[0];
  return { userId: user.id, workspaceId: workspace.id, membershipId: membership.id };
}

async function createNote(client: PoolClient, actor: Awaited<ReturnType<typeof actorFixture>>, input?: {
  subject?: string | null; body?: string; references?: Array<{ type: string; id: string }>;
}) {
  const references = input?.references ?? [{ type: "crm.lead", id: randomUUID() }];
  if (references.length < 1 || references.length > 20) throw new Error("note_reference_count_invalid");
  const noteId = randomUUID(), operationId = randomUUID();
  await client.query("begin");
  try {
    await client.query(
      `insert into note_records(id,workspace_id,governing_operation_id,created_by_membership_id,updated_by_membership_id)
       values($1,$2,$3,$4,$4)`, [noteId, actor.workspaceId, operationId, actor.membershipId],
    );
    await client.query(
      `insert into note_revisions(workspace_id,note_id,revision_number,subject,body,governing_operation_id,created_by_membership_id)
       values($1,$2,1,$3,$4,$5,$6)`,
      [actor.workspaceId, noteId, input?.subject ?? null, input?.body ?? "Initial note body", operationId, actor.membershipId],
    );
    for (const reference of references) await client.query(
      `insert into note_record_references(workspace_id,note_id,record_type,record_id,created_by_membership_id)
       values($1,$2,$3,$4,$5)`,
      [actor.workspaceId, noteId, reference.type, reference.id, actor.membershipId],
    );
    await client.query("commit");
    return { noteId, operationId, references };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

suite("DB-02 Notes persistence", () => {
  beforeAll(async () => { await pool.query("select 1"); });
  beforeEach(async () => { await pool.query("truncate users cascade"); });
  afterAll(async () => { await pool.end(); });

  it("commits one root, append-only revision, and 1..20 distinct neutral references", async () => {
    const actor = await actorFixture(), client = await pool.connect();
    try {
      const references = Array.from({ length: 20 }, (_, index) => ({
        type: ["crm.lead", "crm.contact", "crm.company", "sales.deal", "delivery.project"][index % 5],
        id: randomUUID(),
      }));
      const note = await createNote(client, actor, { subject: "A bounded subject", references });
      const row = (await pool.query(
        `select n.lifecycle,n.version,n.current_revision_number,
          (select count(*)::int from note_revisions where note_id=n.id) revisions,
          (select count(*)::int from note_record_references where note_id=n.id) refs
         from note_records n where n.id=$1`, [note.noteId],
      )).rows[0];
      expect(row).toEqual({ lifecycle: "active", version: 1, current_revision_number: 1, revisions: 1, refs: 20 });
    } finally { client.release(); }
  });

  it("rejects unknown types, arbitrary roles, duplicates, cross-Workspace provenance, and invalid bounds", async () => {
    const actor = await actorFixture(), other = await actorFixture(), client = await pool.connect();
    try {
      const note = await createNote(client, actor);
      await expect(pool.query(
        `insert into note_record_references(workspace_id,note_id,record_type,record_id,created_by_membership_id)
         values($1,$2,'crm.unknown',$3,$4)`, [actor.workspaceId, note.noteId, randomUUID(), actor.membershipId],
      )).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query(
        `insert into note_record_references(workspace_id,note_id,record_type,record_id,relationship_role,created_by_membership_id)
         values($1,$2,'crm.lead',$3,'primary',$4)`, [actor.workspaceId, note.noteId, randomUUID(), actor.membershipId],
      )).rejects.toMatchObject({ code: "23514" });
      const reference = note.references[0];
      await expect(pool.query(
        `insert into note_record_references(workspace_id,note_id,record_type,record_id,created_by_membership_id)
         values($1,$2,$3,$4,$5)`, [actor.workspaceId, note.noteId, reference.type, reference.id, actor.membershipId],
      )).rejects.toMatchObject({ code: "23505" });
      await expect(pool.query(
        `insert into note_record_references(workspace_id,note_id,record_type,record_id,created_by_membership_id)
         values($1,$2,'crm.lead',$3,$4)`, [actor.workspaceId, note.noteId, randomUUID(), other.membershipId],
      )).rejects.toMatchObject({ code: "23503" });
      await expect(pool.query(
        `insert into note_revisions(workspace_id,note_id,revision_number,subject,body,governing_operation_id,created_by_membership_id)
         values($1,$2,2,$3,'body',$4,$5)`,
        [actor.workspaceId, note.noteId, "s".repeat(201), randomUUID(), actor.membershipId],
      )).rejects.toMatchObject({ code: "23514" });
      await expect(createNote(client, actor, { body: "b".repeat(20001) })).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query(
        `insert into note_records(workspace_id,version,current_revision_number,governing_operation_id,
          created_by_membership_id,updated_by_membership_id) values($1,2,2,$2,$3,$3)`,
        [actor.workspaceId, randomUUID(), actor.membershipId],
      )).rejects.toMatchObject({ code: "P0001" });
    } finally { client.release(); }
  });

  it("enforces append-only content and exact root/revision version progression", async () => {
    const actor = await actorFixture(), client = await pool.connect();
    try {
      const note = await createNote(client, actor);
      await expect(pool.query("update note_revisions set body='changed' where note_id=$1", [note.noteId]))
        .rejects.toMatchObject({ code: "P0001" });
      await expect(pool.query("delete from note_revisions where note_id=$1", [note.noteId]))
        .rejects.toMatchObject({ code: "P0001" });
      await client.query("begin");
      await client.query(
        `update note_records set version=2,current_revision_number=2,governing_operation_id=$2,
          updated_by_membership_id=$3,updated_at=now() where id=$1`,
        [note.noteId, randomUUID(), actor.membershipId],
      );
      await expect(client.query("commit")).rejects.toMatchObject({ code: "P0001" });
      await client.query("rollback");

      const operationId = randomUUID();
      await client.query("begin");
      await client.query(
        `insert into note_revisions(workspace_id,note_id,revision_number,subject,body,governing_operation_id,created_by_membership_id)
         values($1,$2,2,null,'Revised body',$3,$4)`, [actor.workspaceId, note.noteId, operationId, actor.membershipId],
      );
      await client.query(
        `update note_records set version=2,current_revision_number=2,governing_operation_id=$2,
          updated_by_membership_id=$3,updated_at=now() where id=$1`, [note.noteId, operationId, actor.membershipId],
      );
      await client.query("commit");
      expect((await pool.query("select version,current_revision_number from note_records where id=$1", [note.noteId])).rows[0])
        .toEqual({ version: 2, current_revision_number: 2 });
    } finally { client.release(); }
  });

  it("requires a redaction revision and retains all prior content revisions", async () => {
    const actor = await actorFixture(), client = await pool.connect();
    try {
      const note = await createNote(client, actor, { subject: "Sensitive", body: "Personal content" });
      const operationId = randomUUID();
      await client.query("begin");
      await client.query(
        `insert into note_revisions(workspace_id,note_id,revision_number,redaction_marker,governing_operation_id,created_by_membership_id)
         values($1,$2,2,'content_redacted',$3,$4)`, [actor.workspaceId, note.noteId, operationId, actor.membershipId],
      );
      await client.query(
        `update note_records set lifecycle='redacted',version=2,current_revision_number=2,governing_operation_id=$2,
          updated_by_membership_id=$3,redacted_at=now(),redacted_by_membership_id=$3,updated_at=now() where id=$1`,
        [note.noteId, operationId, actor.membershipId],
      );
      await client.query("commit");
      const rows = (await pool.query(
        "select revision_number,body,redaction_marker from note_revisions where note_id=$1 order by revision_number", [note.noteId],
      )).rows;
      expect(rows).toEqual([
        { revision_number: 1, body: "Personal content", redaction_marker: null },
        { revision_number: 2, body: null, redaction_marker: "content_redacted" },
      ]);
    } finally { client.release(); }
  });

  it("blocks Workspace, Membership, and Note deletion without partial effects", async () => {
    const actor = await actorFixture(), client = await pool.connect();
    try {
      const note = await createNote(client, actor);
      await expect(pool.query("delete from workspaces where id=$1", [actor.workspaceId])).rejects.toMatchObject({ code: "23503" });
      await expect(pool.query("delete from workspace_memberships where id=$1", [actor.membershipId])).rejects.toMatchObject({ code: "23503" });
      await expect(pool.query("delete from note_records where id=$1", [note.noteId])).rejects.toMatchObject({ code: "23503" });
      expect((await pool.query(
        `select (select count(*)::int from workspaces where id=$1) workspaces,
          (select count(*)::int from workspace_memberships where id=$2) memberships,
          (select count(*)::int from note_records where id=$3) notes,
          (select count(*)::int from note_revisions where note_id=$3) revisions,
          (select count(*)::int from note_record_references where note_id=$3) refs`,
        [actor.workspaceId, actor.membershipId, note.noteId],
      )).rows[0]).toEqual({ workspaces: 1, memberships: 1, notes: 1, revisions: 1, refs: 1 });
    } finally { client.release(); }
  });

  it("rolls back root, revision, and reference together on a late fixture failure", async () => {
    const actor = await actorFixture(), client = await pool.connect();
    try {
      await expect(createNote(client, actor, { references: [
        { type: "crm.lead", id: randomUUID() }, { type: "crm.invalid", id: randomUUID() },
      ] })).rejects.toMatchObject({ code: "23514" });
      expect((await pool.query(
        `select (select count(*)::int from note_records) notes,
          (select count(*)::int from note_revisions) revisions,
          (select count(*)::int from note_record_references) refs`,
      )).rows[0]).toEqual({ notes: 0, revisions: 0, refs: 0 });
      await expect(createNote(client, actor, { references: [] })).rejects.toThrow("note_reference_count_invalid");
      await expect(createNote(client, actor, { references: Array.from({ length: 21 }, () => ({
        type: "crm.lead", id: randomUUID(),
      })) })).rejects.toThrow("note_reference_count_invalid");
    } finally { client.release(); }
  });
});
