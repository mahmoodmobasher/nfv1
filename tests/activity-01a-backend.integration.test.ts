import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createLeadActivityV1, listLeadActivitiesV1, type ActivityCreateCommandV1 }
  from "../src/backend/modules/activities";
import { createSession } from "../src/server/security/session";
import { getServerEnv } from "../src/server/env";
import { GET as activityGet, POST as activityPost }
  from "../src/app/api/workspaces/[workspaceId]/leads/[leadId]/activities/route";

const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString: process.env.DATABASE_URL ??
  "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });
const env = getServerEnv();
type Actor = { userId: string; sessionId: string; workspaceId: string; membershipId: string;
  role: "owner" | "admin" | "member"; token: string };

async function makeActor(workspaceId: string, role: Actor["role"], label: string): Promise<Actor> {
  const user = (await pool.query<{ id: string }>(`insert into users(primary_email_normalized,primary_email_display,
    display_name,status,email_verified_at) values($1,$1,$2,'active',now()) returning id`,
  [`activity-${randomUUID()}@test.local`, label])).rows[0];
  const roleId = (await pool.query<{ id: string }>(`insert into roles(workspace_id,code,permissions,is_system)
    values($1,$2,'{}',true) on conflict(workspace_id,code) do update set code=excluded.code returning id`,
  [workspaceId, role])).rows[0].id;
  const membership = (await pool.query<{ id: string }>(`insert into workspace_memberships(workspace_id,user_id,role_id,status)
    values($1,$2,$3,'active') returning id`, [workspaceId, user.id, roleId])).rows[0];
  const session = await createSession(pool, { userId: user.id, securityVersion: 1, secret: env.SESSION_SECRET,
    idleMinutes: 30, absoluteHours: 24 });
  await pool.query("update sessions set active_workspace_id=$2 where id=$1", [session.id, workspaceId]);
  return { userId: user.id, sessionId: session.id, workspaceId, membershipId: membership.id, role, token: session.token };
}
async function makeWorkspace(label: string) {
  const creator = (await pool.query<{ id: string }>(`insert into users(primary_email_normalized,primary_email_display,
    display_name,status,email_verified_at) values($1,$1,$2,'active',now()) returning id`,
  [`creator-${randomUUID()}@test.local`, label])).rows[0];
  return (await pool.query<{ id: string }>(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
    values($1,$2,'active','growth','monthly',$3) returning id`, [label, `activity-${randomUUID()}`, creator.id])).rows[0];
}
async function fixture() {
  const workspace = await makeWorkspace("Activity Workspace"), owner = await makeActor(workspace.id, "owner", "Owner"),
    member = await makeActor(workspace.id, "member", "Member"), otherWorkspace = await makeWorkspace("Other Workspace"),
    foreign = await makeActor(otherWorkspace.id, "owner", "Foreign Owner");
  const stage = (await pool.query<{ id: string }>(`insert into pipeline_stages(workspace_id,name,position,status)
    values($1,'New',0,'active') returning id`, [workspace.id])).rows[0];
  const lead = (await pool.query<{ id: string; version: number }>(`insert into leads(workspace_id,display_name,
    person_name_normalized,email_normalized,email_display,source,original_source_category,stage_id,
    owner_membership_id,created_by_membership_id,updated_by_membership_id)
    values($1,'Donor Activity Lead','donor activity lead',$2,$2,'manual','manual',$3,$4,$4,$4) returning id,version`,
  [workspace.id, `lead-${randomUUID()}@test.local`, stage.id, owner.membershipId])).rows[0];
  return { workspace, owner, member, foreign, lead };
}
function command(overrides: Partial<ActivityCreateCommandV1> = {}): ActivityCreateCommandV1 {
  return { contractVersion: "activity-create.v1", expectedLeadVersion: 1, kind: "call", direction: "outbound",
    outcome: "connected", occurredAt: "2026-08-27T12:00:00.000Z", durationMinutes: 25,
    subject: "Sensitive donor-adapted call", details: "Protected discussion details", ...overrides };
}
async function counts() {
  return (await pool.query(`select (select count(*)::int from activity_records) roots,
    (select count(*)::int from activity_record_references) refs,
    (select count(*)::int from audit_events where action='crm.activity_created') audits,
    (select count(*)::int from outbox_messages where topic='crm.activity.created.v1') outbox,
    (select count(*)::int from idempotency_records where operation='activity-create.v1') receipts`)).rows[0];
}

suite("ACTIVITY-01A backend", () => {
  beforeAll(() => pool.query("select 1"));
  beforeEach(async () => {
    await pool.query("truncate idempotency_records");
    await pool.query("truncate users cascade");
  });
  afterAll(() => pool.end());

  it("commits one root/reference/Audit/Outbox/safe receipt and replays without duplicates", async () => {
    const f = await fixture(), key = `activity-create-${randomUUID()}`;
    const first = await createLeadActivityV1(pool, { actor: f.owner, leadId: f.lead.id, command: command(),
      idempotencyKey: key });
    expect(first).toMatchObject({ replayed: false, leadVersion: 1, activity: { version: 1, origin: "manual",
      target: { recordType: "crm.lead", recordId: f.lead.id } } });
    expect(await counts()).toEqual({ roots: 1, refs: 1, audits: 1, outbox: 1, receipts: 1 });
    const evidence = JSON.stringify((await pool.query(`select
      (select metadata from audit_events where target_id=$1) audit,
      (select payload from outbox_messages where aggregate_id=$1) event,
      (select outcome from idempotency_records where operation='activity-create.v1') receipt`,
    [first.activity.activityId])).rows[0]);
    expect(evidence).not.toContain(command().subject);
    expect(evidence).not.toContain(command().details!);
    const replay = await createLeadActivityV1(pool, { actor: f.owner, leadId: f.lead.id, command: command(),
      idempotencyKey: key });
    expect(replay).toMatchObject({ replayed: true, activity: { activityId: first.activity.activityId } });
    await expect(createLeadActivityV1(pool, { actor: f.owner, leadId: f.lead.id,
      command: command({ subject: "Changed protected subject" }), idempotencyKey: key }))
      .rejects.toMatchObject({ code: "idempotency_conflict", status: 409 });
    expect(await counts()).toEqual({ roots: 1, refs: 1, audits: 1, outbox: 1, receipts: 1 });
  });

  it("serves strict private/no-store POST and GET route contracts", async () => {
    const f = await fixture(), csrf = randomUUID(), cookie = `nexaflow_session=${encodeURIComponent(f.owner.token)}; nexaflow_csrf=${csrf}`;
    const post = await activityPost(new Request(`http://127.0.0.1:3000/api/workspaces/${f.workspace.id}/leads/${f.lead.id}/activities`, {
      method: "POST", headers: { origin: "http://127.0.0.1:3000", cookie, "x-csrf-token": csrf,
        "idempotency-key": `activity-create-${randomUUID()}`, "content-type": "application/json" },
      body: JSON.stringify(command()),
    }), { params: Promise.resolve({ workspaceId: f.workspace.id, leadId: f.lead.id }) });
    expect(post.status).toBe(201);
    expect(post.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    const get = await activityGet(new Request(
      `http://127.0.0.1:3000/api/workspaces/${f.workspace.id}/leads/${f.lead.id}/activities?queryVersion=activity-list-query.v1&limit=20`,
      { headers: { cookie } }), { params: Promise.resolve({ workspaceId: f.workspace.id, leadId: f.lead.id }) });
    expect(get.status).toBe(200);
    expect(get.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(await get.json()).toMatchObject({ data: { contractVersion: "lead-activity-list.v1", hasMore: false,
      items: [{ subject: command().subject }] } });
  });

  it("enforces create authority, tenant-safe not-found, version, and future-time validation with zero mutation", async () => {
    const f = await fixture();
    await expect(createLeadActivityV1(pool, { actor: f.member, leadId: f.lead.id, command: command(),
      idempotencyKey: `activity-create-${randomUUID()}` })).rejects.toMatchObject({ code: "permission_required" });
    await expect(createLeadActivityV1(pool, { actor: f.foreign, leadId: f.lead.id, command: command(),
      idempotencyKey: `activity-create-${randomUUID()}` })).rejects.toMatchObject({ code: "resource_not_found" });
    await expect(createLeadActivityV1(pool, { actor: f.owner, leadId: f.lead.id,
      command: command({ expectedLeadVersion: 2 }), idempotencyKey: `activity-create-${randomUUID()}` }))
      .rejects.toMatchObject({ code: "stale_version" });
    await expect(createLeadActivityV1(pool, { actor: f.owner, leadId: f.lead.id,
      command: command({ occurredAt: new Date(Date.now() + 360_000).toISOString() }),
      idempotencyKey: `activity-create-${randomUUID()}` })).rejects.toMatchObject({ code: "validation_failed" });
    expect(await counts()).toEqual({ roots: 0, refs: 0, audits: 0, outbox: 0, receipts: 0 });
  });

  it("rolls back all durable effects at every injected boundary", async () => {
    for (const failurePoint of ["root_and_reference", "audit", "outbox", "receipt"] as const) {
      const f = await fixture();
      await expect(createLeadActivityV1(pool, { actor: f.owner, leadId: f.lead.id, command: command(),
        idempotencyKey: `activity-create-${randomUUID()}`, failurePoint })).rejects.toThrow(`injected_activity_failure:${failurePoint}`);
      expect(await counts()).toEqual({ roots: 0, refs: 0, audits: 0, outbox: 0, receipts: 0 });
      await pool.query("truncate idempotency_records");
      await pool.query("truncate users cascade");
    }
  });

  it("serializes concurrent same-key creates into one effect and one replay", async () => {
    const f = await fixture(), key = `activity-create-${randomUUID()}`;
    const results = await Promise.all([1, 2].map(() => createLeadActivityV1(pool, { actor: f.owner,
      leadId: f.lead.id, command: command(), idempotencyKey: key })));
    expect(results.map(result => result.replayed).sort()).toEqual([false, true]);
    expect(new Set(results.map(result => result.activity.activityId)).size).toBe(1);
    expect(await counts()).toEqual({ roots: 1, refs: 1, audits: 1, outbox: 1, receipts: 1 });
  });

  it("uses bound reference keysets across equal-time ties without omissions", async () => {
    const f = await fixture(), occurredAt = "2026-08-27T10:00:00.000Z";
    for (const [kind, subject] of [["call", "Tie call one"], ["note", "Tie note"], ["call", "Tie call two"]] as const)
      await createLeadActivityV1(pool, { actor: f.owner, leadId: f.lead.id, command: command({ kind, subject, occurredAt }),
        idempotencyKey: `activity-create-${randomUUID()}` });
    const first = await listLeadActivitiesV1(pool, f.owner, f.lead.id,
      { queryVersion: "activity-list-query.v1", kind: "call", limit: 1 });
    expect(first).toMatchObject({ hasMore: true, items: [{ kind: "call" }] });
    const second = await listLeadActivitiesV1(pool, f.owner, f.lead.id,
      { queryVersion: "activity-list-query.v1", kind: "call", limit: 1, cursor: first.nextCursor! });
    expect(second).toMatchObject({ hasMore: false, nextCursor: null, items: [{ kind: "call" }] });
    expect(new Set([...first.items, ...second.items].map(item => item.activityId)).size).toBe(2);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local enable_seqscan=off");
      const plan = (await client.query(`explain (costs off) select a.id
        from activity_record_references r
        join activity_records a on a.workspace_id=r.workspace_id and a.id=r.activity_id
        where r.workspace_id=$1 and r.record_type='crm.lead' and r.record_id=$2
          and ($3::text is null or a.kind=$3)
          and ($4::timestamptz is null or (r.occurred_at,r.activity_id)<($4::timestamptz,$5::uuid))
        order by r.occurred_at desc nulls last,r.activity_id desc nulls last limit $6`,
      [f.workspace.id, f.lead.id, "call", null, null, 2])).rows.map(row => row["QUERY PLAN"]).join("\n");
      expect(plan).toContain("activity_record_references_target_timeline_idx");
    } finally {
      await client.query("rollback");
      client.release();
    }
    const foreignCursor = Buffer.from(JSON.stringify({ v: 1, queryVersion: "activity-list-query.v1",
      workspaceId: f.foreign.workspaceId, leadId: f.lead.id, kind: "call", occurredAt,
      activityId: first.items[0].activityId })).toString("base64url");
    await expect(listLeadActivitiesV1(pool, f.owner, f.lead.id,
      { queryVersion: "activity-list-query.v1", kind: "call", limit: 1, cursor: foreignCursor }))
      .rejects.toMatchObject({ code: "validation_failed" });
  });
});
