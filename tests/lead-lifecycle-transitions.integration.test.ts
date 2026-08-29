import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { ALLOWED_LEAD_LIFECYCLE_TRANSITIONS, LEAD_LIFECYCLE_CODES, getLeadDetailV1, submitLeadInquiryV1,
  transitionLeadLifecycleV1, type LeadLifecycleCode } from "../src/backend/modules/leads";
import { getServerEnv } from "../src/server/env";
import { createSession } from "../src/server/security/session";

const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });
const env = getServerEnv();

type Actor = { userId: string; sessionId: string; workspaceId: string; membershipId: string;
  role: "owner" | "admin" | "member" };

async function actor(workspaceId: string, role: Actor["role"], label: string): Promise<Actor> {
  const user = (await pool.query<{ id: string }>(
    `insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)
     values($1,$1,$2,'active',now()) returning id`, [`${label}-${randomUUID()}@test.local`, label])).rows[0];
  let roleRow = (await pool.query<{ id: string }>("select id from roles where workspace_id=$1 and code=$2", [workspaceId, role])).rows[0];
  roleRow ??= (await pool.query<{ id: string }>(
    `insert into roles(workspace_id,code,permissions,is_system) values($1,$2,'{}',true) returning id`,
    [workspaceId, role])).rows[0];
  const membership = (await pool.query<{ id: string }>(
    `insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active') returning id`,
    [workspaceId, user.id, roleRow.id])).rows[0];
  const session = await createSession(pool, { userId: user.id, securityVersion: 1, secret: env.SESSION_SECRET,
    idleMinutes: 30, absoluteHours: 24 });
  await pool.query("update sessions set active_workspace_id=$2,authenticated_at=now(),auth_method='password' where id=$1",
    [session.id, workspaceId]);
  return { userId: user.id, sessionId: session.id, workspaceId, membershipId: membership.id, role };
}

async function workspaceWithActors(name: string) {
  const creator = (await pool.query<{ id: string }>(
    `insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)
     values($1,$1,'Creator','active',now()) returning id`, [`creator-${randomUUID()}@test.local`])).rows[0];
  const workspace = (await pool.query<{ id: string }>(
    `insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
     values($1,$2,'active','growth','monthly',$3) returning id`,
    [name, `${name}-${randomUUID()}`, creator.id])).rows[0];
  const stage = (await pool.query<{ id: string }>(
    `insert into pipeline_stages(workspace_id,name,position,status) values($1,'New',0,'active') returning id`,
    [workspace.id])).rows[0];
  return { workspace, stage,
    owner: await actor(workspace.id, "owner", "Owner"),
    admin: await actor(workspace.id, "admin", "Admin"),
    member: await actor(workspace.id, "member", "Member"),
    otherMember: await actor(workspace.id, "member", "OtherMember") };
}

async function fixture() {
  const a = await workspaceWithActors("Workspace A"), b = await workspaceWithActors("Workspace B");
  return { a, b };
}

/** Creates a Lead through real intake, then forces it to `code` so transitions can be exercised from any state. */
async function leadAt(space: Awaited<ReturnType<typeof workspaceWithActors>>, code: LeadLifecycleCode,
  ownerMembershipId: string | null) {
  const submitted = await submitLeadInquiryV1(pool, { actor: space.owner, idempotencyKey: `intake-${randomUUID()}`, command: {
    contractVersion: "lead-inquiry-intake.v1", intakeChannel: "manual",
    person: { displayName: "Lifecycle Subject", email: `lc-${randomUUID()}@example.test` },
    organization: { name: "Lifecycle Co" }, inquiry: { receivedAt: "2026-08-25T12:00:00.000Z" },
    source: { sourceCategory: "manual", sourceMedium: "unknown", sourceDetail: {}, campaignContext: {},
      attributionContractVersion: "p1a-attribution-v1" },
  } });
  const row = (await pool.query<{ version: number }>(
    `update leads set lifecycle_definition_id=(select id from lead_lifecycle_definitions where code=$3),
       owner_membership_id=$4,
       disqualification_reason=case when $3='disqualified' then 'not_a_fit' else null end,
       visibility='workspace',version=version+1
     where workspace_id=$1 and id=$2 returning version`,
    [space.workspace.id, submitted.leadId, code, ownerMembershipId])).rows[0];
  return { leadId: submitted.leadId, version: row.version };
}

const transition = (from: LeadLifecycleCode, to: LeadLifecycleCode) => ({
  contractVersion: "lead-lifecycle-transition.v1" as const,
  expectedVersion: 0, targetLifecycle: to,
  disqualificationReason: to === "disqualified" ? ("not_a_fit" as const) : null,
  disqualificationNote: null, from,
});

async function attempt(space: Awaited<ReturnType<typeof workspaceWithActors>>, who: Actor,
  from: LeadLifecycleCode, to: LeadLifecycleCode, ownerMembershipId: string | null) {
  const lead = await leadAt(space, from, ownerMembershipId);
  const { from: _ignored, ...command } = transition(from, to);
  return transitionLeadLifecycleV1(pool, { actor: who, leadId: lead.leadId,
    command: { ...command, expectedVersion: lead.version }, idempotencyKey: `lc-${randomUUID()}` });
}

suite("lead lifecycle transitions", () => {
  beforeAll(async () => { await pool.query("select 1"); });
  beforeEach(async () => { await pool.query("truncate users cascade"); });
  afterAll(async () => { await pool.end(); });

  it("seeds every lifecycle code the contract declares", async () => {
    const codes = (await pool.query<{ code: string }>(
      "select code from lead_lifecycle_definitions where status='active' order by display_order")).rows.map(r => r.code);
    for (const code of LEAD_LIFECYCLE_CODES) expect(codes).toContain(code);
  });

  // ---- the persona x transition matrix -------------------------------------
  // Owner/Admin may make any legal move. A Member may make legal moves only on a
  // Lead they own, and may never reopen a disqualified Lead. Workspace B's owner
  // may touch nothing in Workspace A.

  const legal: Array<[LeadLifecycleCode, LeadLifecycleCode]> = [];
  const illegal: Array<[LeadLifecycleCode, LeadLifecycleCode]> = [];
  for (const from of LEAD_LIFECYCLE_CODES) for (const to of LEAD_LIFECYCLE_CODES) {
    if (from === to || to === "converted") continue;
    (ALLOWED_LEAD_LIFECYCLE_TRANSITIONS[from].includes(to) ? legal : illegal).push([from, to]);
  }

  it("covers the whole matrix", () => {
    expect(legal.length + illegal.length).toBe(LEAD_LIFECYCLE_CODES.length * (LEAD_LIFECYCLE_CODES.length - 1) - 4);
    expect(legal).toHaveLength(7);
  });

  it.each(legal)("allows Owner %s -> %s", async (from, to) => {
    const f = await fixture();
    const result = await attempt(f.a, f.a.owner, from, to, f.a.member.membershipId);
    expect(result).toMatchObject({ changed: true, lifecycle: { code: to, previousCode: from } });
  });

  it.each(legal)("allows Admin %s -> %s", async (from, to) => {
    const f = await fixture();
    const result = await attempt(f.a, f.a.admin, from, to, f.a.member.membershipId);
    expect(result).toMatchObject({ changed: true, lifecycle: { code: to, previousCode: from } });
  });

  it.each(legal)("denies a Member who does not own the Lead %s -> %s", async (from, to) => {
    const f = await fixture();
    await expect(attempt(f.a, f.a.member, from, to, f.a.otherMember.membershipId))
      .rejects.toMatchObject({ code: "permission_required", status: 403 });
  });

  it.each(legal.filter(([from]) => from !== "disqualified"))("allows a Member on their own Lead %s -> %s",
    async (from, to) => {
      const f = await fixture();
      const result = await attempt(f.a, f.a.member, from, to, f.a.member.membershipId);
      expect(result).toMatchObject({ changed: true, lifecycle: { code: to, previousCode: from } });
    });

  it("denies a Member reopening a disqualified Lead even when they own it", async () => {
    const f = await fixture();
    await expect(attempt(f.a, f.a.member, "disqualified", "working", f.a.member.membershipId))
      .rejects.toMatchObject({ code: "permission_required", status: 403 });
  });

  it.each(illegal)("rejects the illegal transition %s -> %s", async (from, to) => {
    const f = await fixture();
    await expect(attempt(f.a, f.a.owner, from, to, f.a.owner.membershipId))
      .rejects.toMatchObject({ code: "lifecycle_transition_not_allowed", status: 409 });
  });

  it("refuses Workspace B's Owner on a Workspace A Lead", async () => {
    const f = await fixture();
    const lead = await leadAt(f.a, "new", f.a.member.membershipId);
    await expect(transitionLeadLifecycleV1(pool, { actor: f.b.owner, leadId: lead.leadId,
      command: { contractVersion: "lead-lifecycle-transition.v1", expectedVersion: lead.version,
        targetLifecycle: "working", disqualificationReason: null, disqualificationNote: null },
      idempotencyKey: `lc-${randomUUID()}` })).rejects.toMatchObject({ code: "resource_not_found", status: 404 });
  });

  // ---- preconditions and derived facts -------------------------------------

  it("requires an owner before a Lead may be worked or qualified", async () => {
    const f = await fixture();
    for (const to of ["working", "qualified"] as const) {
      const from = to === "working" ? "new" : "working";
      await expect(attempt(f.a, f.a.owner, from, to, null))
        .rejects.toMatchObject({ code: "assignment_unavailable", status: 409 });
    }
  });

  it("records disqualification reason, forces a system lost outcome, and stamps the timeline", async () => {
    const f = await fixture();
    const lead = await leadAt(f.a, "working", f.a.member.membershipId);
    await transitionLeadLifecycleV1(pool, { actor: f.a.owner, leadId: lead.leadId,
      command: { contractVersion: "lead-lifecycle-transition.v1", expectedVersion: lead.version,
        targetLifecycle: "disqualified", disqualificationReason: "no_budget", disqualificationNote: null },
      idempotencyKey: `lc-${randomUUID()}` });
    const row = (await pool.query(`select d.code lifecycle,l.status,l.status_source,l.disqualification_reason,
        l.lifecycle_changed_at is not null changed_at,
        (select count(*)::int from lead_activities where lead_id=l.id and kind='status_changed') activities,
        (select count(*)::int from audit_events where target_id=l.id and action='crm.lead_lifecycle_transitioned') audits,
        (select count(*)::int from outbox_messages where aggregate_id=l.id and topic='crm.lead.lifecycle_transitioned.v1') outbox
      from leads l join lead_lifecycle_definitions d on d.id=l.lifecycle_definition_id where l.id=$1`,
      [lead.leadId])).rows[0];
    expect(row).toMatchObject({ lifecycle: "disqualified", status: "lost", status_source: "system",
      disqualification_reason: "no_budget", changed_at: true, activities: 1, audits: 1, outbox: 1 });
  });

  it("never overwrites a manual outcome when the lifecycle moves", async () => {
    const f = await fixture();
    const lead = await leadAt(f.a, "working", f.a.member.membershipId);
    await pool.query("update leads set status='won',status_source='manual' where id=$1", [lead.leadId]);
    const current = (await pool.query<{ version: number }>("select version from leads where id=$1", [lead.leadId])).rows[0];
    await transitionLeadLifecycleV1(pool, { actor: f.a.owner, leadId: lead.leadId,
      command: { contractVersion: "lead-lifecycle-transition.v1", expectedVersion: current.version,
        targetLifecycle: "disqualified", disqualificationReason: "duplicate", disqualificationNote: null },
      idempotencyKey: `lc-${randomUUID()}` });
    expect((await pool.query("select status,status_source from leads where id=$1", [lead.leadId])).rows[0])
      .toMatchObject({ status: "won", status_source: "manual" });
  });

  it("counts reopens and clears the reason when a disqualified Lead returns to working", async () => {
    const f = await fixture();
    const lead = await leadAt(f.a, "disqualified", f.a.member.membershipId);
    const result = await transitionLeadLifecycleV1(pool, { actor: f.a.admin, leadId: lead.leadId,
      command: { contractVersion: "lead-lifecycle-transition.v1", expectedVersion: lead.version,
        targetLifecycle: "working", disqualificationReason: null, disqualificationNote: null },
      idempotencyKey: `lc-${randomUUID()}` });
    expect(result.lifecycle).toMatchObject({ code: "working", reopenCount: 1, disqualificationReason: null });
    expect((await pool.query("select disqualification_reason,status,status_source from leads where id=$1",
      [lead.leadId])).rows[0]).toMatchObject({ disqualification_reason: null, status: "open", status_source: "system" });
  });

  it("replays an identical request without writing twice and conflicts on a changed one", async () => {
    const f = await fixture();
    const lead = await leadAt(f.a, "new", f.a.member.membershipId);
    const key = `lc-${randomUUID()}`;
    const command = { contractVersion: "lead-lifecycle-transition.v1" as const, expectedVersion: lead.version,
      targetLifecycle: "working" as const, disqualificationReason: null, disqualificationNote: null };
    const first = await transitionLeadLifecycleV1(pool, { actor: f.a.owner, leadId: lead.leadId, command, idempotencyKey: key });
    const replay = await transitionLeadLifecycleV1(pool, { actor: f.a.owner, leadId: lead.leadId, command, idempotencyKey: key });
    expect(replay).toMatchObject({ replayed: true, leadVersion: first.leadVersion });
    expect((await pool.query<{ count: number }>(
      `select count(*)::int count from lead_activities where lead_id=$1 and kind='status_changed'`, [lead.leadId])).rows[0].count).toBe(1);
    await expect(transitionLeadLifecycleV1(pool, { actor: f.a.owner, leadId: lead.leadId,
      command: { ...command, targetLifecycle: "disqualified", disqualificationReason: "bad_data" }, idempotencyKey: key }))
      .rejects.toMatchObject({ code: "idempotency_conflict", status: 409 });
  });

  it("rejects a stale expected version and leaves the Lead untouched", async () => {
    const f = await fixture();
    const lead = await leadAt(f.a, "new", f.a.member.membershipId);
    await expect(transitionLeadLifecycleV1(pool, { actor: f.a.owner, leadId: lead.leadId,
      command: { contractVersion: "lead-lifecycle-transition.v1", expectedVersion: lead.version + 5,
        targetLifecycle: "working", disqualificationReason: null, disqualificationNote: null },
      idempotencyKey: `lc-${randomUUID()}` })).rejects.toMatchObject({ code: "stale_version", status: 409 });
    const row = (await pool.query(`select d.code lifecycle,l.version from leads l
      join lead_lifecycle_definitions d on d.id=l.lifecycle_definition_id where l.id=$1`, [lead.leadId])).rows[0];
    expect(row).toMatchObject({ lifecycle: "new", version: lead.version });
  });

  // A null lifecycle is only reachable for rows written before migration 0013, whose
  // BEFORE INSERT trigger now defaults every new Lead to `new`. Suspending that trigger
  // is the only faithful way to reproduce a pre-0013 row.
  it("refuses a legacy pre-0013 Lead that carries no lifecycle", async () => {
    const f = await fixture();
    await pool.query("alter table leads disable trigger leads_p1a_compatibility_defaults");
    let legacy: { id: string; version: number };
    try {
      legacy = (await pool.query<{ id: string; version: number }>(
      `insert into leads(workspace_id,display_name,person_name_normalized,email_normalized,email_display,source,
         original_source_category,original_source_medium,intake_channel,status,stage_id,visibility,owner_membership_id)
       values($1,'Legacy Lead','legacy lead',$2,$2,'manual','manual','unknown','manual','open',$3,'workspace',$4)
       returning id,version`,
        [f.a.workspace.id, `legacy-${randomUUID()}@example.test`, f.a.stage.id, f.a.member.membershipId])).rows[0];
    } finally { await pool.query("alter table leads enable trigger leads_p1a_compatibility_defaults"); }
    expect((await pool.query("select lifecycle_definition_id from leads where id=$1", [legacy.id])).rows[0])
      .toMatchObject({ lifecycle_definition_id: null });
    const lead = { leadId: legacy.id, version: legacy.version };
    await expect(transitionLeadLifecycleV1(pool, { actor: f.a.owner, leadId: lead.leadId,
      command: { contractVersion: "lead-lifecycle-transition.v1", expectedVersion: lead.version,
        targetLifecycle: "working", disqualificationReason: null, disqualificationNote: null },
      idempotencyKey: `lc-${randomUUID()}` })).rejects.toMatchObject({ code: "lifecycle_unavailable", status: 409 });
  });

  // ---- Phase 2: the transition set the detail view offers ------------------

  it("offers Owner and Admin every legal move from the current state", async () => {
    const f = await fixture();
    for (const who of [f.a.owner, f.a.admin]) {
      const lead = await leadAt(f.a, "working", f.a.member.membershipId);
      const view = await getLeadDetailV1(pool, who, lead.leadId);
      expect(view.lifecycleTransitions.map(option => option.to).sort())
        .toEqual([...ALLOWED_LEAD_LIFECYCLE_TRANSITIONS.working].sort());
      expect(view.lifecycleTransitions.find(option => option.to === "disqualified")?.requiresReason).toBe(true);
    }
  });

  it("offers a Member moves only on a Lead they own", async () => {
    const f = await fixture();
    const owned = await leadAt(f.a, "working", f.a.member.membershipId);
    expect((await getLeadDetailV1(pool, f.a.member, owned.leadId)).lifecycleTransitions.length).toBeGreaterThan(0);
    const foreign = await leadAt(f.a, "working", f.a.otherMember.membershipId);
    expect((await getLeadDetailV1(pool, f.a.member, foreign.leadId)).lifecycleTransitions).toEqual([]);
  });

  it("never offers a Member the reopen of a disqualified Lead", async () => {
    const f = await fixture();
    const lead = await leadAt(f.a, "disqualified", f.a.member.membershipId);
    expect((await getLeadDetailV1(pool, f.a.member, lead.leadId)).lifecycleTransitions).toEqual([]);
    expect((await getLeadDetailV1(pool, f.a.admin, lead.leadId)).lifecycleTransitions.map(o => o.to)).toEqual(["working"]);
  });

  it("withholds work and qualify while the Lead is unassigned", async () => {
    const f = await fixture();
    const lead = await leadAt(f.a, "new", null);
    expect((await getLeadDetailV1(pool, f.a.owner, lead.leadId)).lifecycleTransitions.map(o => o.to))
      .toEqual(["disqualified"]);
  });

  it("never offers converted, which belongs to the conversion orchestrator", async () => {
    const f = await fixture();
    for (const from of ["new", "working", "qualified"] as const) {
      const lead = await leadAt(f.a, from, f.a.member.membershipId);
      const view = await getLeadDetailV1(pool, f.a.owner, lead.leadId);
      expect(view.lifecycleTransitions.map(option => option.to)).not.toContain("converted");
    }
  });

  it("offers nothing for a Lead with no lifecycle", async () => {
    const f = await fixture();
    await pool.query("alter table leads disable trigger leads_p1a_compatibility_defaults");
    let legacyId: string;
    try {
      legacyId = (await pool.query<{ id: string }>(
        `insert into leads(workspace_id,display_name,person_name_normalized,email_normalized,email_display,source,
           original_source_category,original_source_medium,intake_channel,status,stage_id,visibility,owner_membership_id)
         values($1,'Legacy Lead','legacy lead',$2,$2,'manual','manual','unknown','manual','open',$3,'workspace',$4)
         returning id`,
        [f.a.workspace.id, `legacy-${randomUUID()}@example.test`, f.a.stage.id, f.a.member.membershipId])).rows[0].id;
    } finally { await pool.query("alter table leads enable trigger leads_p1a_compatibility_defaults"); }
    const view = await getLeadDetailV1(pool, f.a.owner, legacyId);
    expect(view.lifecycleTransitions).toEqual([]);
    expect(view.lead.lifecycle.code).toBeNull();
  });

  it("treats a same-state request as a durable no-op", async () => {
    const f = await fixture();
    const lead = await leadAt(f.a, "working", f.a.member.membershipId);
    const result = await transitionLeadLifecycleV1(pool, { actor: f.a.owner, leadId: lead.leadId,
      command: { contractVersion: "lead-lifecycle-transition.v1", expectedVersion: lead.version,
        targetLifecycle: "working", disqualificationReason: null, disqualificationNote: null },
      idempotencyKey: `lc-${randomUUID()}` });
    expect(result).toMatchObject({ changed: false, leadVersion: lead.version });
    expect((await pool.query<{ count: number }>(
      `select count(*)::int count from audit_events where target_id=$1 and action='crm.lead_lifecycle_transitioned'`,
      [lead.leadId])).rows[0].count).toBe(0);
  });
});
