import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { decideLeadIdentityReviewV1, editLeadOperationalV1, getIdentityReviewCandidatesV1, getLeadOperationalEditV1,
  leadManagementErrorEnvelopeV1Schema, submitLeadInquiryV1, transitionLeadStageV1 } from "../src/backend/modules/leads";
import { getServerEnv } from "../src/server/env";
import { createSession } from "../src/server/security/session";
import { GET as operationalEditGet } from "../src/app/api/workspaces/[workspaceId]/leads/[leadId]/operational-edit/route";
import { POST as operationalEditPost } from "../src/app/api/workspaces/[workspaceId]/leads/[leadId]/operational-edits/route";
import { POST as stageTransitionPost } from "../src/app/api/workspaces/[workspaceId]/leads/[leadId]/stage-transitions/route";

const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });
const env = getServerEnv();

type Actor = { userId: string; sessionId: string; workspaceId: string; membershipId: string;
  role: "owner" | "admin" | "member"; token: string };

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
  return { userId: user.id, sessionId: session.id, workspaceId, membershipId: membership.id, role, token: session.token };
}

async function fixture(withIdentityCandidate = false) {
  const creator = (await pool.query<{ id: string }>(
    `insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)
     values($1,$1,'Workspace Creator','active',now()) returning id`, [`creator-${randomUUID()}@test.local`])).rows[0];
  const workspace = (await pool.query<{ id: string }>(
    `insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
     values('Lead Management',$1,'active','growth','monthly',$2) returning id`, [`lead-management-${randomUUID()}`, creator.id])).rows[0];
  await pool.query("delete from users where id=$1", [creator.id]).catch(() => undefined);
  const owner = await actor(workspace.id, "owner", "Management Owner");
  const admin = await actor(workspace.id, "admin", "Management Admin");
  const member = await actor(workspace.id, "member", "Management Member");
  const otherMember = await actor(workspace.id, "member", "Other Member");
  const stages = (await pool.query<{ id: string; name: string; position: number }>(
    `insert into pipeline_stages(workspace_id,name,position,status)
     values($1,'New',0,'active'),($1,'Working',1,'active'),($1,'Archived',2,'archived') returning id,name,position`,
    [workspace.id])).rows;
  const teams = (await pool.query<{ id: string; name: string }>(
    `insert into teams(workspace_id,name,name_normalized,status,created_by_membership_id)
     values($1,'Alpha','alpha','active',$2),($1,'Beta','beta','active',$2) returning id,name`,
    [workspace.id, owner.membershipId])).rows;
  await pool.query(`insert into team_memberships(workspace_id,team_id,workspace_membership_id,created_by_membership_id)
    values($1,$2,$3,$4)`, [workspace.id, teams[0].id, member.membershipId, owner.membershipId]);
  const identityEmail = `identity-${randomUUID()}@example.test`;
  if (withIdentityCandidate) await pool.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
    values($1,'Existing Identity','existing identity',$2,$2)`, [workspace.id, identityEmail]);
  const submitted = await submitLeadInquiryV1(pool, { actor: owner, idempotencyKey: `intake-${randomUUID()}`, command: {
    contractVersion: "lead-inquiry-intake.v1", intakeChannel: "manual",
    person: { displayName: "Frozen Identity", email: identityEmail },
    organization: { name: "Immutable Company" }, inquiry: { receivedAt: "2026-08-25T12:00:00.000Z" },
    source: { sourceCategory: "manual", sourceMedium: "unknown", sourceDetail: {}, campaignContext: {},
      attributionContractVersion: "p1a-attribution-v1" },
  } });
  return { workspace, owner, admin, member, otherMember, stages, teams, submitted,
    leadId: submitted.leadId, version: submitted.leadVersion };
}

async function evidence(workspaceId: string, leadId: string) {
  return (await pool.query(
    `select l.version,l.stage_id,l.owner_membership_id,l.responsible_team_id,l.visibility,l.display_name,l.email_display,l.company,l.status,
      (select count(*)::int from lead_visible_teams where workspace_id=$1 and lead_id=$2) visible_teams,
      (select count(*)::int from lead_activities where workspace_id=$1 and lead_id=$2 and kind in ('updated','stage_changed')) activities,
      (select count(*)::int from audit_events where workspace_id=$1 and target_id=$2 and action in ('crm.lead_operational_updated','crm.lead_stage_transitioned')) audits,
      (select count(*)::int from outbox_messages where workspace_id=$1 and aggregate_id=$2 and topic in ('crm.lead.operational_updated.v1','crm.lead.stage_transitioned.v1')) outbox,
      (select count(*)::int from idempotency_records where principal_key like $3) receipts
     from leads l where l.workspace_id=$1 and l.id=$2`,
    [workspaceId, leadId, `%:lead:${leadId}`],
  )).rows[0];
}

suite("P1A canonical Lead management", () => {
  beforeAll(async () => { await pool.query("select 1"); });
  beforeEach(async () => { await pool.query("truncate users cascade"); });
  afterAll(async () => { await pool.end(); });

  it("returns a safe authority-derived operational bootstrap without identity disclosure", async () => {
    const f = await fixture();
    const ownerView = await getLeadOperationalEditV1(pool, f.owner, f.leadId);
    expect(ownerView).toMatchObject({ contractVersion: "getLeadOperationalEdit.v1", leadId: f.leadId, version: f.version,
      operational: { responsibleMembershipId: null, responsibleTeamId: null, visibility: "workspace", visibleTeamIds: [] },
      capabilities: { canEditLead: true }, nextView: { kind: "lead_edit", leadId: f.leadId } });
    expect(ownerView.options.responsibleMemberships.map(option => option.id)).toEqual(expect.arrayContaining(
      [f.owner.membershipId, f.admin.membershipId, f.member.membershipId, f.otherMember.membershipId]));
    const memberView = await getLeadOperationalEditV1(pool, f.member, f.leadId);
    expect(memberView).toMatchObject({ capabilities: { canEditLead: false }, options: { responsibleMemberships: [], teams: [] },
      nextView: { kind: "lead_detail" } });
    expect(JSON.stringify(ownerView)).not.toMatch(/Frozen Identity|identity-.*@example\.test|Immutable Company/);
  });

  it("serves strict private route envelopes and authenticates before contract validation", async () => {
    const f = await fixture(), csrf = "lead-management-csrf";
    const params = { params: Promise.resolve({ workspaceId: f.workspace.id, leadId: f.leadId }) };
    const cookie = `${env.SESSION_COOKIE_NAME}=${f.owner.token}; nexaflow_csrf=${csrf}`;
    const bootstrap = await operationalEditGet(new Request(
      `${env.APP_ORIGIN}/api/workspaces/${f.workspace.id}/leads/${f.leadId}/operational-edit`, { headers: { cookie } }), params);
    expect(bootstrap.status).toBe(200);
    expect(bootstrap.headers.get("cache-control")).toContain("private");
    expect(await bootstrap.json()).toMatchObject({ data: { contractVersion: "getLeadOperationalEdit.v1", leadId: f.leadId,
      capabilities: { canEditLead: true } } });
    const identityRewrite = await operationalEditPost(new Request(
      `${env.APP_ORIGIN}/api/workspaces/${f.workspace.id}/leads/${f.leadId}/operational-edits`, { method: "POST",
        headers: { cookie, origin: env.APP_ORIGIN, "x-csrf-token": csrf, "content-type": "application/json",
          "idempotency-key": `route-edit-${randomUUID()}` }, body: JSON.stringify({ contractVersion: "lead-operational-edit.v1",
          expectedVersion: f.version, responsibleMembershipId: null, responsibleTeamId: null, visibility: "workspace",
          visibleTeamIds: [], email: "rewrite@example.test" }) }), params);
    expect(identityRewrite.status).toBe(400);
    expect(identityRewrite.headers.get("cache-control")).toContain("no-store");
    expect(leadManagementErrorEnvelopeV1Schema.parse(await identityRewrite.json())).toMatchObject({
      error: { code: "validation_failed", retryable: false, reconciliation: { required: false, action: "none" } } });
    const unauthenticated = await stageTransitionPost(new Request(
      `${env.APP_ORIGIN}/api/workspaces/${f.workspace.id}/leads/${f.leadId}/stage-transitions`, { method: "POST",
        headers: { origin: env.APP_ORIGIN, "x-csrf-token": csrf, "content-type": "application/json" },
        body: JSON.stringify({ contractVersion: "wrong", expectedVersion: f.version, targetStageId: f.stages[1].id }) }), params);
    expect(unauthenticated.status).toBe(403);
    expect(leadManagementErrorEnvelopeV1Schema.parse(await unauthenticated.json()))
      .toMatchObject({ error: { code: "permission_required" } });
  });

  it("edits only operational fields with one atomic version/activity/Audit/Outbox/receipt and stable replay", async () => {
    const f = await fixture(), key = `operational-${randomUUID()}`;
    const command = { contractVersion: "lead-operational-edit.v1" as const, expectedVersion: f.version,
      responsibleMembershipId: f.member.membershipId, responsibleTeamId: f.teams[0].id,
      visibility: "teams" as const, visibleTeamIds: [f.teams[0].id] };
    const before = await evidence(f.workspace.id, f.leadId);
    const changed = await editLeadOperationalV1(pool, { actor: f.owner, leadId: f.leadId, command, idempotencyKey: key });
    expect(changed).toMatchObject({ changed: true, replayed: false, leadVersion: f.version + 1, operational: {
      responsibleMembershipId: command.responsibleMembershipId, responsibleTeamId: command.responsibleTeamId,
      visibility: command.visibility, visibleTeamIds: command.visibleTeamIds } });
    const after = await evidence(f.workspace.id, f.leadId);
    expect(after).toMatchObject({ version: f.version + 1, owner_membership_id: f.member.membershipId,
      responsible_team_id: f.teams[0].id, visibility: "teams", visible_teams: 1, activities: 1, audits: 1, outbox: 1, receipts: 1,
      display_name: before.display_name, email_display: before.email_display, company: before.company, status: before.status });
    const replay = await editLeadOperationalV1(pool, { actor: f.owner, leadId: f.leadId, command, idempotencyKey: key });
    expect(replay).toMatchObject({ changed: true, replayed: true, requestId: changed.requestId, leadVersion: changed.leadVersion });
    expect(await evidence(f.workspace.id, f.leadId)).toEqual(after);
    await expect(editLeadOperationalV1(pool, { actor: f.owner, leadId: f.leadId,
      command: { ...command, visibility: "workspace" }, idempotencyKey: key })).rejects.toMatchObject({ code: "idempotency_conflict" });
  });

  it("moves stages, persists a durable zero-effect same-stage result, and preserves lifecycle status", async () => {
    const f = await fixture(), moveKey = `stage-move-${randomUUID()}`;
    const moved = await transitionLeadStageV1(pool, { actor: f.owner, leadId: f.leadId, idempotencyKey: moveKey,
      command: { contractVersion: "lead-stage-transition.v1", expectedVersion: f.version, targetStageId: f.stages[1].id } });
    expect(moved).toMatchObject({ changed: true, replayed: false, leadVersion: f.version + 1,
      stage: { stageId: f.stages[1].id, name: "Working", position: 1 } });
    const afterMove = await evidence(f.workspace.id, f.leadId);
    expect(afterMove).toMatchObject({ version: f.version + 1, stage_id: f.stages[1].id, status: "open",
      activities: 1, audits: 1, outbox: 1, receipts: 1 });
    const sameKey = `stage-same-${randomUUID()}`, sameCommand = { contractVersion: "lead-stage-transition.v1" as const,
      expectedVersion: f.version + 1, targetStageId: f.stages[1].id };
    const unchanged = await transitionLeadStageV1(pool, { actor: f.owner, leadId: f.leadId,
      idempotencyKey: sameKey, command: sameCommand });
    expect(unchanged).toMatchObject({ changed: false, replayed: false, leadVersion: f.version + 1,
      stage: { stageId: f.stages[1].id } });
    const afterSame = await evidence(f.workspace.id, f.leadId);
    expect(afterSame).toMatchObject({ version: f.version + 1, activities: 1, audits: 1, outbox: 1, receipts: 2 });
    const replay = await transitionLeadStageV1(pool, { actor: f.owner, leadId: f.leadId,
      idempotencyKey: sameKey, command: sameCommand });
    expect(replay).toMatchObject({ changed: false, replayed: true, requestId: unchanged.requestId });
    expect(await evidence(f.workspace.id, f.leadId)).toEqual(afterSame);
  });

  it("enforces current visibility, direct Member assignment, role ceilings, and active same-Workspace references", async () => {
    const f = await fixture();
    await editLeadOperationalV1(pool, { actor: f.admin, leadId: f.leadId, idempotencyKey: `assign-${randomUUID()}`,
      command: { contractVersion: "lead-operational-edit.v1", expectedVersion: f.version,
        responsibleMembershipId: f.member.membershipId, responsibleTeamId: null, visibility: "workspace", visibleTeamIds: [] } });
    const moved = await transitionLeadStageV1(pool, { actor: f.member, leadId: f.leadId, idempotencyKey: `member-${randomUUID()}`,
      command: { contractVersion: "lead-stage-transition.v1", expectedVersion: f.version + 1, targetStageId: f.stages[1].id } });
    expect(moved.changed).toBe(true);
    await expect(editLeadOperationalV1(pool, { actor: f.member, leadId: f.leadId, idempotencyKey: `edit-${randomUUID()}`,
      command: { contractVersion: "lead-operational-edit.v1", expectedVersion: moved.leadVersion,
        responsibleMembershipId: null, responsibleTeamId: null, visibility: "workspace", visibleTeamIds: [] } }))
      .rejects.toMatchObject({ code: "permission_required", status: 403 });
    await expect(transitionLeadStageV1(pool, { actor: f.otherMember, leadId: f.leadId, idempotencyKey: `other-${randomUUID()}`,
      command: { contractVersion: "lead-stage-transition.v1", expectedVersion: moved.leadVersion, targetStageId: f.stages[0].id } }))
      .rejects.toMatchObject({ code: "permission_required", status: 403 });
    await pool.query("update pipeline_stages set status='archived' where id=$1", [f.stages[0].id]);
    await expect(transitionLeadStageV1(pool, { actor: f.owner, leadId: f.leadId, idempotencyKey: `archived-${randomUUID()}`,
      command: { contractVersion: "lead-stage-transition.v1", expectedVersion: moved.leadVersion, targetStageId: f.stages[0].id } }))
      .rejects.toMatchObject({ code: "stage_unavailable", status: 409 });
    expect((await evidence(f.workspace.id, f.leadId)).receipts).toBe(2);
  });

  it("allows only one command at an expected version and leaves the stale loser effect-free", async () => {
    const f = await fixture();
    const operations = await Promise.allSettled([
      editLeadOperationalV1(pool, { actor: f.owner, leadId: f.leadId, idempotencyKey: `race-edit-${randomUUID()}`,
        command: { contractVersion: "lead-operational-edit.v1", expectedVersion: f.version,
          responsibleMembershipId: f.member.membershipId, responsibleTeamId: null, visibility: "workspace", visibleTeamIds: [] } }),
      transitionLeadStageV1(pool, { actor: f.owner, leadId: f.leadId, idempotencyKey: `race-stage-${randomUUID()}`,
        command: { contractVersion: "lead-stage-transition.v1", expectedVersion: f.version, targetStageId: f.stages[1].id } }),
    ]);
    expect(operations.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(operations.filter(result => result.status === "rejected").map(result => (result as PromiseRejectedResult).reason))
      .toEqual([expect.objectContaining({ code: "stale_version" })]);
    expect(await evidence(f.workspace.id, f.leadId)).toMatchObject({ version: f.version + 1, activities: 1, audits: 1, outbox: 1, receipts: 1 });
  });

  it("serializes stage movement against active-stage archival at the commit authority boundary", async () => {
    const f = await fixture(), command = transitionLeadStageV1(pool, { actor: f.owner, leadId: f.leadId,
      idempotencyKey: `archive-race-${randomUUID()}`, command: { contractVersion: "lead-stage-transition.v1",
        expectedVersion: f.version, targetStageId: f.stages[1].id } });
    const archive = pool.query("update pipeline_stages set status='archived' where workspace_id=$1 and id=$2",
      [f.workspace.id, f.stages[1].id]);
    const [moveResult, archiveResult] = await Promise.allSettled([command, archive]);
    expect(archiveResult.status).toBe("fulfilled");
    const after = await evidence(f.workspace.id, f.leadId);
    if (moveResult.status === "fulfilled") {
      expect(moveResult.value.changed).toBe(true);
      expect(after).toMatchObject({ version: f.version + 1, stage_id: f.stages[1].id,
        activities: 1, audits: 1, outbox: 1, receipts: 1 });
    } else {
      expect(moveResult.reason).toMatchObject({ code: "stage_unavailable" });
      expect(after).toMatchObject({ version: f.version, stage_id: f.stages[0].id,
        activities: 0, audits: 0, outbox: 0, receipts: 0 });
    }
  });

  it("serializes stage movement with identity-review resolution through the same Lead version", async () => {
    const f = await fixture(true), view = await getIdentityReviewCandidatesV1(pool, f.owner, f.leadId);
    const candidate = view.candidates.find(item => item.targetType === "contact")!;
    expect(candidate).toBeTruthy();
    const outcomes = await Promise.allSettled([
      transitionLeadStageV1(pool, { actor: f.owner, leadId: f.leadId, idempotencyKey: `identity-race-stage-${randomUUID()}`,
        command: { contractVersion: "lead-stage-transition.v1", expectedVersion: view.leadVersion,
          targetStageId: f.stages[1].id } }),
      decideLeadIdentityReviewV1(pool, { actor: f.owner, leadId: f.leadId, idempotencyKey: `identity-race-review-${randomUUID()}`,
        command: { contractVersion: "lead-identity-review-decision.v1", outcome: "resolve",
          expectedLeadVersion: view.leadVersion, expectedReviewVersion: view.reviewVersion,
          expectedIntakeVersion: view.intakeVersion, contact: { action: "link", candidateId: candidate.candidateId,
            targetId: candidate.targetId, expectedTargetVersion: candidate.expectedTargetVersion }, company: { action: "dismiss" } } }),
    ]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(result => result.status === "rejected").map(result => (result as PromiseRejectedResult).reason))
      .toEqual([expect.objectContaining({ code: "stale_version" })]);
    const after = await evidence(f.workspace.id, f.leadId);
    expect(after.version).toBe(view.leadVersion + 1);
    expect([0, 1]).toContain(after.activities);
    expect(after.activities).toBe(after.audits);
    expect(after.activities).toBe(after.outbox);
    expect(after.activities).toBe(after.receipts);
  });

  it("rolls back the complete business/evidence set after every operational-edit write boundary", async () => {
    const f = await fixture(), before = await evidence(f.workspace.id, f.leadId);
    const boundaries = [
      { table: "leads", event: "after update" },
      { table: "lead_visible_teams", event: "after insert" },
      { table: "lead_activities", event: "after insert" },
      { table: "audit_events", event: "after insert" },
      { table: "outbox_messages", event: "after insert" },
      { table: "idempotency_records", event: "after insert" },
    ] as const;
    for (const [index, boundary] of boundaries.entries()) {
      const functionName = `p1a_test_fail_management_step_${index}`, triggerName = `${functionName}_trigger`;
      await pool.query(`create function ${functionName}() returns trigger language plpgsql as $$
        begin raise exception 'injected management boundary failure'; end $$`);
      await pool.query(`create trigger ${triggerName} ${boundary.event} on ${boundary.table}
        for each row execute function ${functionName}()`);
      try {
        await expect(editLeadOperationalV1(pool, { actor: f.owner, leadId: f.leadId,
          idempotencyKey: `rollback-${index}-${randomUUID()}`, command: { contractVersion: "lead-operational-edit.v1",
            expectedVersion: f.version, responsibleMembershipId: f.member.membershipId,
            responsibleTeamId: f.teams[0].id, visibility: "teams", visibleTeamIds: [f.teams[0].id] } })).rejects.toBeTruthy();
        expect(await evidence(f.workspace.id, f.leadId), boundary.table).toEqual(before);
      } finally {
        await pool.query(`drop trigger if exists ${triggerName} on ${boundary.table}`);
        await pool.query(`drop function if exists ${functionName}()`);
      }
    }
  });

  it("rolls back the complete business/evidence set after every stage-transition write boundary", async () => {
    const f = await fixture(), before = await evidence(f.workspace.id, f.leadId);
    const boundaries = [
      { table: "leads", event: "after update" }, { table: "lead_activities", event: "after insert" },
      { table: "audit_events", event: "after insert" }, { table: "outbox_messages", event: "after insert" },
      { table: "idempotency_records", event: "after insert" },
    ] as const;
    for (const [index, boundary] of boundaries.entries()) {
      const functionName = `p1a_test_fail_stage_step_${index}`, triggerName = `${functionName}_trigger`;
      await pool.query(`create function ${functionName}() returns trigger language plpgsql as $$
        begin raise exception 'injected stage boundary failure'; end $$`);
      await pool.query(`create trigger ${triggerName} ${boundary.event} on ${boundary.table}
        for each row execute function ${functionName}()`);
      try {
        await expect(transitionLeadStageV1(pool, { actor: f.owner, leadId: f.leadId,
          idempotencyKey: `stage-rollback-${index}-${randomUUID()}`, command: { contractVersion: "lead-stage-transition.v1",
            expectedVersion: f.version, targetStageId: f.stages[1].id } })).rejects.toBeTruthy();
        expect(await evidence(f.workspace.id, f.leadId), boundary.table).toEqual(before);
      } finally {
        await pool.query(`drop trigger if exists ${triggerName} on ${boundary.table}`);
        await pool.query(`drop function if exists ${functionName}()`);
      }
    }
  });
});
