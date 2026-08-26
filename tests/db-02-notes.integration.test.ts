import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
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

  it("archives through an append-only revision and paired root operation", async () => {
    const actor = await actorFixture(), client = await pool.connect();
    try {
      const note = await createNote(client, actor, { subject: "Completed", body: "Final content" });
      const operationId = randomUUID();
      await client.query("begin");
      await client.query(
        `insert into note_revisions(workspace_id,note_id,revision_number,subject,body,governing_operation_id,created_by_membership_id)
         values($1,$2,2,'Completed','Final content',$3,$4)`, [actor.workspaceId, note.noteId, operationId, actor.membershipId],
      );
      await client.query(
        `update note_records set lifecycle='archived',version=2,current_revision_number=2,governing_operation_id=$2,
          updated_by_membership_id=$3,archived_at=now(),archived_by_membership_id=$3,updated_at=now() where id=$1`,
        [note.noteId, operationId, actor.membershipId],
      );
      await client.query("commit");
      const rows = (await pool.query(
        "select revision_number,subject,body from note_revisions where note_id=$1 order by revision_number", [note.noteId],
      )).rows;
      expect(rows).toEqual([
        { revision_number: 1, subject: "Completed", body: "Final content" },
        { revision_number: 2, subject: "Completed", body: "Final content" },
      ]);
      expect((await pool.query(
        "select lifecycle,version,current_revision_number from note_records where id=$1", [note.noteId],
      )).rows[0]).toEqual({ lifecycle: "archived", version: 2, current_revision_number: 2 });
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

const performanceSuite = process.env.RUN_DB_PERFORMANCE === "1" ? describe : describe.skip;
const performancePool = new Pool({ connectionString: process.env.DATABASE_URL ??
  "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });

function percentile(values: number[], quantile: number) {
  return [...values].sort((left, right) => left - right)[Math.ceil(values.length * quantile) - 1];
}

function planNodeTypes(plan: unknown): string[] {
  if (!plan || typeof plan !== "object") return [];
  const node = plan as { [key: string]: unknown; Plans?: unknown[] };
  return [typeof node["Node Type"] === "string" ? node["Node Type"] : "",
    ...(node.Plans ?? []).flatMap(planNodeTypes)].filter(Boolean);
}

type NotePageRow = {
  id: string;
  updated_at: Date;
  current_revision_number: number;
  subject: string | null;
  body: string;
};

performanceSuite("DB-02 Notes representative public query", () => {
  afterAll(async () => { await performancePool.end(); });

  it("paginates a 100,001-Note hot target through roots and current revisions with a bounded plan", async () => {
    await performancePool.query("truncate users cascade");
    const user = (await performancePool.query<{ id: string }>(
      "insert into users(display_name,status) values('Notes Performance Owner','active') returning id",
    )).rows[0];
    const workspace = (await performancePool.query<{ id: string }>(
      `insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
       values('Notes Performance Workspace',$1,'active','essentials','monthly',$2) returning id`,
      [`notes-performance-${randomUUID()}`, user.id],
    )).rows[0];
    const role = (await performancePool.query<{ id: string }>(
      "insert into roles(workspace_id,code) values($1,'owner') returning id", [workspace.id],
    )).rows[0];
    const membership = (await performancePool.query<{ id: string }>(
      "insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active') returning id",
      [workspace.id, user.id, role.id],
    )).rows[0];
    const targetId = "40000000-0000-0000-0000-000000000021";

    await performancePool.query("begin");
    try {
      // The integrity suite proves the row triggers separately; keep representative plan setup bounded.
      await performancePool.query("set local session_replication_role=replica");
      await performancePool.query(
        `insert into note_records(id,workspace_id,governing_operation_id,created_by_membership_id,
           updated_by_membership_id,created_at,updated_at)
         select ('41000000-0000-0000-0000-' || lpad(g::text,12,'0'))::uuid,$1,
           ('42000000-0000-0000-0000-' || lpad(g::text,12,'0'))::uuid,$2,$2,
           timestamptz '2026-01-01 00:00:00+00' + ((g % 1000) || ' seconds')::interval,
           timestamptz '2026-01-01 00:00:00+00' + ((g % 1000) || ' seconds')::interval
         from generate_series(1,100001) g`, [workspace.id, membership.id],
      );
      await performancePool.query(
        `insert into note_revisions(workspace_id,note_id,revision_number,subject,body,
           governing_operation_id,created_by_membership_id,created_at)
         select $1,('41000000-0000-0000-0000-' || lpad(g::text,12,'0'))::uuid,1,
           'Subject ' || g,'Body ' || g,('42000000-0000-0000-0000-' || lpad(g::text,12,'0'))::uuid,$2,
           timestamptz '2026-01-01 00:00:00+00' + ((g % 1000) || ' seconds')::interval
         from generate_series(1,100001) g`, [workspace.id, membership.id],
      );
      await performancePool.query(
        `insert into note_record_references(workspace_id,note_id,record_type,record_id,created_by_membership_id)
         select $1,('41000000-0000-0000-0000-' || lpad(g::text,12,'0'))::uuid,'crm.lead',$2,$3
         from generate_series(1,100001) g`, [workspace.id, targetId, membership.id],
      );
      await performancePool.query("commit");
    } catch (error) {
      await performancePool.query("rollback");
      throw error;
    }

    const revisedNoteId = "41000000-0000-0000-0000-000000000001";
    const revisionOperationId = randomUUID();
    await performancePool.query("begin");
    try {
      await performancePool.query(
        `insert into note_revisions(workspace_id,note_id,revision_number,subject,body,
           governing_operation_id,created_by_membership_id)
         values($1,$2,2,'Current revision','Current body',$3,$4)`,
        [workspace.id, revisedNoteId, revisionOperationId, membership.id],
      );
      await performancePool.query(
        `update note_records set version=2,current_revision_number=2,governing_operation_id=$3,
           updated_by_membership_id=$4,updated_at=timestamptz '2030-01-01 00:00:00+00'
         where workspace_id=$1 and id=$2`,
        [workspace.id, revisedNoteId, revisionOperationId, membership.id],
      );
      await performancePool.query("commit");
    } catch (error) {
      await performancePool.query("rollback");
      throw error;
    }

    const pageSql = `select n.id,n.updated_at,n.current_revision_number,r.subject,r.body
      from note_record_references ref
      join note_records n on n.workspace_id=ref.workspace_id and n.id=ref.note_id
      join note_revisions r on r.workspace_id=n.workspace_id and r.note_id=n.id
        and r.revision_number=n.current_revision_number
      where ref.workspace_id=$1 and ref.record_type='crm.lead' and ref.record_id=$2
        and n.lifecycle='active'
        and ($3::timestamptz is null or (n.updated_at,n.id)<($3::timestamptz,$4::uuid))
      order by n.updated_at desc nulls last,n.id desc nulls last limit 51`;
    const firstPage = (await performancePool.query<NotePageRow>(
      pageSql, [workspace.id, targetId, null, null],
    )).rows;
    expect(firstPage).toHaveLength(51);
    expect(firstPage[0]).toMatchObject({ id: revisedNoteId, current_revision_number: 2,
      subject: "Current revision", body: "Current body" });

    const paginatedRows: Array<Pick<NotePageRow, "id" | "updated_at">> = [];
    let cursorTime: Date | null = null, cursorId: string | null = null;
    while (true) {
      const rows: NotePageRow[] = (await performancePool.query<NotePageRow>(
        pageSql, [workspace.id, targetId, cursorTime, cursorId],
      )).rows;
      const visibleRows = rows.slice(0, 50);
      paginatedRows.push(...visibleRows.map(({ id, updated_at }) => ({ id, updated_at })));
      if (rows.length <= 50) break;
      const cursor = visibleRows[visibleRows.length - 1];
      cursorTime = cursor.updated_at;
      cursorId = cursor.id;
    }
    expect(paginatedRows).toHaveLength(100001);
    expect(new Set(paginatedRows.map((row) => row.id)).size).toBe(100001);
    expect(paginatedRows.some((row, index) => index > 0 &&
      row.updated_at.getTime() === paginatedRows[index - 1].updated_at.getTime())).toBe(true);
    for (let index = 1; index < paginatedRows.length; index += 1) {
      const previous = paginatedRows[index - 1], current = paginatedRows[index];
      expect(previous.updated_at.getTime()).toBeGreaterThanOrEqual(current.updated_at.getTime());
      if (previous.updated_at.getTime() === current.updated_at.getTime()) {
        expect(previous.id.localeCompare(current.id)).toBeGreaterThan(0);
      }
    }

    const boundary = firstPage[49];
    const explain = (await performancePool.query(
      `explain (analyze,buffers,format json) ${pageSql}`,
      [workspace.id, targetId, boundary.updated_at, boundary.id],
    )).rows[0]["QUERY PLAN"][0];
    const nodeTypes = planNodeTypes(explain.Plan);
    expect(nodeTypes).not.toContain("Seq Scan");
    expect(Number(explain["Execution Time"])).toBeLessThan(200);

    const samples: number[] = [];
    for (let sample = 0; sample < 30; sample += 1) {
      const startedAt = performance.now();
      await performancePool.query(pageSql, [workspace.id, targetId, boundary.updated_at, boundary.id]);
      samples.push(performance.now() - startedAt);
    }
    const sizes = (await performancePool.query(
      `select relname,pg_relation_size(oid)::bigint heap_bytes,
         pg_indexes_size(oid)::bigint index_bytes
       from pg_class where relname in ('note_records','note_revisions','note_record_references')
       order by relname`,
    )).rows.map((row) => ({ ...row,
      indexToHeapRatio: Number(row.index_bytes) / Number(row.heap_bytes) }));
    const p95Ms = percentile(samples, .95);
    console.info("DB_02_NOTES_PUBLIC_QUERY_EVIDENCE", JSON.stringify({
      rows: paginatedRows.length, pageSizeWithSentinel: 51, samples: samples.length, p95Ms,
      executionTimeMs: Number(explain["Execution Time"]), nodeTypes, sizes,
    }));
    expect(p95Ms).toBeLessThan(200);
  }, 180_000);
});
