import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { addContactInternalNoteV1, listContactInternalNotesV1 } from "../src/backend/modules/notes";
import { createSession } from "../src/server/security/session";
import { getServerEnv } from "../src/server/env";

const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString: process.env.DATABASE_URL ??
  "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });
const env = getServerEnv();

async function fixture() {
  const user = (await pool.query<{ id: string }>(
    `insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)
     values($1,$1,'Notes Owner','active',now()) returning id`,
    [`notes-${randomUUID()}@test.local`],
  )).rows[0];
  const workspace = (await pool.query<{ id: string }>(
    `insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
     values('Notes',$1,'active','growth','monthly',$2) returning id`,
    [`notes-${randomUUID()}`, user.id],
  )).rows[0];
  const roles = (await pool.query<{ id: string; code: string }>(
    `insert into roles(workspace_id,code,permissions,is_system)
     values($1,'owner','{}',true),($1,'member','{}',true) returning id,code`,
    [workspace.id],
  )).rows;
  const role = Object.fromEntries(roles.map((row) => [row.code, row.id]));
  const membership = (await pool.query<{ id: string; version: number }>(
    `insert into workspace_memberships(workspace_id,user_id,role_id,status)
     values($1,$2,$3,'active') returning id,version`,
    [workspace.id, user.id, role.owner],
  )).rows[0];
  const session = await createSession(pool, { userId: user.id, securityVersion: 1,
    secret: env.SESSION_SECRET, idleMinutes: 30, absoluteHours: 24 });
  async function contact(label: string) {
    return (await pool.query<{ id: string; version: number }>(
      `insert into contacts(workspace_id,display_name,person_name_normalized,normalization_version,status,visibility,
        governing_operation_id,created_by_membership_id,updated_by_membership_id,authority_contract_version)
       values($1,$2,$3,'customer-graph-v1','active','workspace',$4,$5,$5,'customer-graph-v1') returning id,version`,
      [workspace.id, label, label.toLowerCase(), randomUUID(), membership.id],
    )).rows[0];
  }
  return {
    actor: { userId: user.id, sessionId: session.id, workspaceId: workspace.id,
      membershipId: membership.id, role: "owner" as const },
    membership, role, contactA: await contact("Contact A"), contactB: await contact("Contact B"),
  };
}

const command = (body = "Sensitive internal context", expectedContactVersion = 1) => ({
  contractVersion: "contact-internal-note-add.v1" as const, expectedContactVersion, body,
});

suite("Contact Internal Notes backend", () => {
  beforeAll(() => pool.query("select 1"));
  beforeEach(() => pool.query("truncate users cascade"));
  afterAll(() => pool.end());

  it("atomically commits root, revision, reference, minimized evidence and receipt, then replays", async () => {
    const f = await fixture(), key = `contact-note-${randomUUID()}`;
    const first = await addContactInternalNoteV1(pool, { actor: f.actor, contactId: f.contactA.id,
      command: command(), key, requestId: randomUUID() });
    expect(first).toMatchObject({ contactId: f.contactA.id, noteVersion: 1, replayed: false });
    const state = (await pool.query(
      `select
        (select count(*)::int from note_records where id=$1) roots,
        (select count(*)::int from note_revisions where note_id=$1 and revision_number=1) revisions,
        (select count(*)::int from note_record_references where note_id=$1 and record_type='crm.contact' and record_id=$2) refs,
        (select count(*)::int from audit_events where target_id=$1 and action='crm.contact.internal_note_added') audits,
        (select count(*)::int from outbox_messages where aggregate_id=$1 and topic='crm.contact.internal_note_added.v1') outbox,
        (select count(*)::int from idempotency_records where principal_key=$3 and operation='contact-internal-note-add.v1' and idempotency_key=$4) receipts,
        (select outcome::text from idempotency_records where principal_key=$3 and operation='contact-internal-note-add.v1' and idempotency_key=$4) outcome,
        (select metadata::text from audit_events where target_id=$1 and action='crm.contact.internal_note_added') audit_metadata,
        (select payload::text from outbox_messages where aggregate_id=$1 and topic='crm.contact.internal_note_added.v1') event_payload`,
      [first.noteId, f.contactA.id, `workspace:${f.actor.workspaceId}:membership:${f.actor.membershipId}`, key],
    )).rows[0];
    expect(state).toMatchObject({ roots: 1, revisions: 1, refs: 1, audits: 1, outbox: 1, receipts: 1 });
    expect(`${state.outcome}${state.audit_metadata}${state.event_payload}`).not.toContain(command().body);
    await expect(addContactInternalNoteV1(pool, { actor: f.actor, contactId: f.contactA.id,
      command: command(), key, requestId: randomUUID() })).resolves.toMatchObject({ noteId: first.noteId, replayed: true });
    expect((await pool.query("select count(*)::int count from note_records")).rows[0].count).toBe(1);
    expect((await pool.query("select count(*)::int count from audit_events where action='crm.contact.internal_note_added'")).rows[0].count).toBe(1);
  });

  it("rejects changed bodies and cross-Contact same-key requests before creating evidence", async () => {
    const f = await fixture(), key = `contact-note-${randomUUID()}`;
    await addContactInternalNoteV1(pool, { actor: f.actor, contactId: f.contactA.id, command: command(), key, requestId: randomUUID() });
    await expect(addContactInternalNoteV1(pool, { actor: f.actor, contactId: f.contactA.id,
      command: command("Changed sensitive context"), key, requestId: randomUUID() })).rejects.toMatchObject({ code: "idempotency_conflict" });
    await expect(addContactInternalNoteV1(pool, { actor: f.actor, contactId: f.contactB.id,
      command: command(), key, requestId: randomUUID() })).rejects.toMatchObject({ code: "idempotency_conflict" });
    await expect(addContactInternalNoteV1(pool, { actor: f.actor, contactId: f.contactA.id,
      command: command(undefined, 2), key, requestId: randomUUID() })).rejects.toMatchObject({ code: "idempotency_conflict" });
    expect((await pool.query("select count(*)::int count from note_records")).rows[0].count).toBe(1);
  });

  it("rejects initial and final Contact version drift with zero partial effects", async () => {
    const f = await fixture(), initialKey = `contact-note-${randomUUID()}`,
      finalKey = `contact-note-${randomUUID()}`;
    await pool.query("update contacts set version=version+1,updated_at=now() where id=$1", [f.contactA.id]);
    await expect(addContactInternalNoteV1(pool, { actor: f.actor, contactId: f.contactA.id,
      command: command(), key: initialKey, requestId: randomUUID() }))
      .rejects.toMatchObject({ code: "stale_version", status: 409 });
    expect((await pool.query("select count(*)::int count from note_records")).rows[0].count).toBe(0);

    await pool.query(`create function drift_contact_during_note_add() returns trigger language plpgsql as $$
      begin update contacts set version=version+1,updated_at=now() where workspace_id=new.workspace_id and id=new.record_id; return new; end $$`);
    await pool.query(`create trigger drift_contact_during_note_add after insert on note_record_references
      for each row when (new.record_type='crm.contact') execute function drift_contact_during_note_add()`);
    try {
      await expect(addContactInternalNoteV1(pool, { actor: f.actor, contactId: f.contactB.id,
        command: command(), key: finalKey, requestId: randomUUID() }))
        .rejects.toMatchObject({ code: "stale_version", status: 409 });
    } finally {
      await pool.query("drop trigger drift_contact_during_note_add on note_record_references");
      await pool.query("drop function drift_contact_during_note_add()");
    }
    for (const table of ["note_records", "note_revisions", "note_record_references"])
      expect((await pool.query(`select count(*)::int count from ${table}`)).rows[0].count).toBe(0);
    expect((await pool.query("select version from contacts where id=$1", [f.contactB.id])).rows[0].version).toBe(1);
    expect((await pool.query("select count(*)::int count from audit_events where action='crm.contact.internal_note_added'")).rows[0].count).toBe(0);
    expect((await pool.query("select count(*)::int count from outbox_messages where topic='crm.contact.internal_note_added.v1'")).rows[0].count).toBe(0);
    expect((await pool.query(
      "select count(*)::int count from idempotency_records where operation='contact-internal-note-add.v1' and idempotency_key=any($1::text[])",
      [[initialKey, finalKey]],
    )).rows[0].count).toBe(0);
  });

  it("does not release a stored result after current authority is downgraded", async () => {
    const f = await fixture(), key = `contact-note-${randomUUID()}`;
    await addContactInternalNoteV1(pool, { actor: f.actor, contactId: f.contactA.id, command: command(), key, requestId: randomUUID() });
    await pool.query(
      `update workspace_memberships set role_id=$3,version=version+1,updated_at=now() where workspace_id=$1 and id=$2`,
      [f.actor.workspaceId, f.actor.membershipId, f.role.member],
    );
    const error = await addContactInternalNoteV1(pool, { actor: f.actor, contactId: f.contactA.id,
      command: command(), key, requestId: randomUUID() }).catch((value: unknown) => value);
    expect(error).toMatchObject({ code: "resource_not_found", status: 404 });
    expect(String((error as Error).message)).not.toContain(command().body);
    expect((await pool.query("select count(*)::int count from note_records")).rows[0].count).toBe(1);
  });

  it("rolls back every Notes and evidence write on a late Outbox failure", async () => {
    const f = await fixture(), key = `contact-note-${randomUUID()}`;
    await pool.query(`create function fail_contact_note_outbox() returns trigger language plpgsql as $$
      begin if new.topic='crm.contact.internal_note_added.v1' then raise exception 'injected note outbox failure'; end if; return new; end $$`);
    await pool.query(`create trigger fail_contact_note_outbox before insert on outbox_messages
      for each row execute function fail_contact_note_outbox()`);
    try {
      await expect(addContactInternalNoteV1(pool, { actor: f.actor, contactId: f.contactA.id,
        command: command(), key, requestId: randomUUID() })).rejects.toThrow("injected note outbox failure");
    } finally {
      await pool.query("drop trigger fail_contact_note_outbox on outbox_messages");
      await pool.query("drop function fail_contact_note_outbox()");
    }
    for (const table of ["note_records", "note_revisions", "note_record_references"])
      expect((await pool.query(`select count(*)::int count from ${table}`)).rows[0].count).toBe(0);
    expect((await pool.query("select count(*)::int count from audit_events where action='crm.contact.internal_note_added'")).rows[0].count).toBe(0);
    expect((await pool.query(
      "select count(*)::int count from idempotency_records where principal_key=$1 and operation='contact-internal-note-add.v1' and idempotency_key=$2",
      [`workspace:${f.actor.workspaceId}:membership:${f.actor.membershipId}`, key],
    )).rows[0].count).toBe(0);
  });

  it("paginates a tied authorized stream and returns a terminal empty page", async () => {
    const f = await fixture();
    await pool.query(`create function tie_contact_note_updated_at() returns trigger language plpgsql as $$
      begin new.updated_at='2026-08-26T12:00:00Z'::timestamptz; return new; end $$`);
    await pool.query(`create trigger tie_contact_note_updated_at before insert on note_records
      for each row execute function tie_contact_note_updated_at()`);
    try {
      for (const body of ["Tie one", "Tie two", "Tie three"])
        await addContactInternalNoteV1(pool, { actor: f.actor, contactId: f.contactA.id,
          command: command(body), key: `contact-note-${randomUUID()}`, requestId: randomUUID() });
    } finally {
      await pool.query("drop trigger tie_contact_note_updated_at on note_records");
      await pool.query("drop function tie_contact_note_updated_at()");
    }
    const first = await listContactInternalNotesV1(pool, f.actor, f.contactA.id, { limit: 2 }, randomUUID());
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(first.items[0].noteId > first.items[1].noteId).toBe(true);
    const second = await listContactInternalNotesV1(pool, f.actor, f.contactA.id,
      { limit: 2, cursor: first.nextCursor! }, randomUUID());
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const terminalCursor = Buffer.from(JSON.stringify({ updatedAt: "2026-08-26T12:00:00.000Z",
      noteId: second.items[0].noteId })).toString("base64url");
    const terminal = await listContactInternalNotesV1(pool, f.actor, f.contactA.id,
      { limit: 2, cursor: terminalCursor }, randomUUID());
    expect(terminal).toMatchObject({ items: [], nextCursor: null });
    expect(new Set([...first.items, ...second.items].map((item) => item.noteId)).size).toBe(3);
  });
});
