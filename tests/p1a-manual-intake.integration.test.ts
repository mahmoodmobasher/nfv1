import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { decideLeadIdentityReviewV1, getIdentityReviewCandidatesV1, getLeadDetailV1, listIdentityReviewQueueV1,
  listLeadSummariesV1, submitLeadInquiryV1,
  resolveLeadIdentityReviewV1 } from "../src/backend/modules/leads";
import type { TrustedActor } from "../src/backend/platform/authorization";

const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });

async function fixture() {
  const users = (await pool.query<{ id: string }>(
    `insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)
     values($1,$1,'Owner','active',now()),($2,$2,'Member','active',now()) returning id`,
    [`owner-${randomUUID()}@test.local`, `member-${randomUUID()}@test.local`],
  )).rows;
  const workspace = (await pool.query<{ id: string }>(
    `insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
     values('P1A Manual',$1,'active','growth','monthly',$2) returning id`, [`p1a-${randomUUID()}`, users[0].id],
  )).rows[0];
  const roles = (await pool.query<{ id: string; code: string }>(
    `insert into roles(workspace_id,code,permissions,is_system)
     values($1,'owner','{}',true),($1,'admin','{}',true),($1,'member','{}',true) returning id,code`, [workspace.id],
  )).rows;
  const role = Object.fromEntries(roles.map(item => [item.code, item.id]));
  const memberships = (await pool.query<{ id: string; user_id: string }>(
    `insert into workspace_memberships(workspace_id,user_id,role_id,status)
     values($1,$2,$4,'active'),($1,$3,$5,'active') returning id,user_id`,
    [workspace.id, users[0].id, users[1].id, role.owner, role.member],
  )).rows;
  const sessions = [] as Array<{ id: string; user_id: string }>;
  for (const user of users) sessions.push((await pool.query<{ id: string; user_id: string }>(
    `insert into sessions(user_id,session_hash,idle_expires_at,absolute_expires_at,auth_method)
     values($1,$2,now()+interval '1 hour',now()+interval '1 day','password') returning id,user_id`,
    [user.id, randomUUID()],
  )).rows[0]);
  const stage = (await pool.query<{ id: string }>(
    `insert into pipeline_stages(workspace_id,name,position,status) values($1,'New',0,'active') returning id`, [workspace.id],
  )).rows[0];
  const actor = (userIndex: number, actorRole: "owner" | "member"): TrustedActor => ({ userId: users[userIndex].id,
    sessionId: sessions.find(item => item.user_id === users[userIndex].id)!.id, workspaceId: workspace.id,
    membershipId: memberships.find(item => item.user_id === users[userIndex].id)!.id, role: actorRole });
  return { workspace, stage, owner: actor(0, "owner"), member: actor(1, "member") };
}

function command(overrides: Record<string, unknown> = {}) {
  return { contractVersion: "lead-inquiry-intake.v1" as const, intakeChannel: "manual" as const,
    person: { displayName: "Taylor North", email: `taylor-${randomUUID()}@example.test` },
    organization: { name: "North Labs" }, inquiry: { receivedAt: "2026-08-25T12:00:00.000Z" },
    source: { sourceCategory: "manual" as const, sourceMedium: "unknown" as const, sourceDetail: {}, campaignContext: {}, attributionContractVersion: "p1a-attribution-v1" as const },
    ...overrides };
}

const protectedBusinessTables = ["leads", "lead_intakes", "lead_activities", "lead_identity_reviews",
  "lead_identity_candidates", "lead_identity_decisions", "lead_identity_decision_heads", "contacts", "companies",
  "audit_events", "outbox_messages"] as const;
async function protectedStateDigest() {
  return Object.fromEntries(await Promise.all(protectedBusinessTables.map(async table => [table, (await pool.query(
    `select count(*)::int count,md5(coalesce(jsonb_agg(to_jsonb(snapshot) order by to_jsonb(snapshot)::text)::text,'[]')) digest
       from ${table} snapshot`)).rows[0]])));
}

async function waitForActivity(predicate: (row: { pid: number; query: string; wait_event_type: string | null }) => boolean) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const rows = (await pool.query<{ pid: number; query: string; wait_event_type: string | null }>(
      `select pid,query,wait_event_type from pg_stat_activity
        where datname=current_database() and pid<>pg_backend_pid() and state='active'`,
    )).rows;
    const found = rows.find(predicate);
    if (found) return found;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for controlled PostgreSQL lock overlap");
}

async function presentationRace(operation: "detail" | "queue",
  change: "reassignment" | "team_visibility" | "membership" | "session" | "candidate") {
  const f = await fixture(), email = `${operation}-${change}@example.test`;
  const target = (await pool.query<{ id: string }>(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
    values($1,'Race Candidate','race candidate',$2,$2) returning id`, [f.workspace.id, email])).rows[0];
  const held = await submitLeadInquiryV1(pool, { actor: f.member, command: command({ person: { displayName: "Race Candidate", email },
    requestedAssignment: { responsibleMembershipId: f.member.membershipId } }), idempotencyKey: randomUUID() });
  let teamId: string | undefined;
  if (change === "team_visibility") {
    teamId = (await pool.query<{ id: string }>(`insert into teams(workspace_id,name,name_normalized,status,created_by_membership_id)
      values($1,'Disclosure Team','disclosure team','active',$2) returning id`, [f.workspace.id, f.owner.membershipId])).rows[0].id;
    await pool.query(`insert into team_memberships(workspace_id,team_id,workspace_membership_id,created_by_membership_id)
      values($1,$2,$3,$4)`, [f.workspace.id, teamId, f.member.membershipId, f.owner.membershipId]);
    await pool.query("update leads set visibility='teams' where workspace_id=$1 and id=$2", [f.workspace.id, held.leadId]);
    await pool.query("insert into lead_visible_teams(workspace_id,lead_id,team_id) values($1,$2,$3)", [f.workspace.id, held.leadId, teamId]);
  }
  const blocker = await pool.connect(); await blocker.query("begin");
  if (change === "reassignment") await blocker.query("update leads set owner_membership_id=null where workspace_id=$1 and id=$2",
    [f.workspace.id, held.leadId]);
  if (change === "team_visibility") await blocker.query(
    "delete from team_memberships where workspace_id=$1 and team_id=$2 and workspace_membership_id=$3",
    [f.workspace.id, teamId, f.member.membershipId]);
  if (change === "candidate") await blocker.query("update contacts set status='archived',version=version+1 where workspace_id=$1 and id=$2",
    [f.workspace.id, target.id]);
  if (change === "membership") await blocker.query(
    "update workspace_memberships set status='suspended' where workspace_id=$1 and id=$2", [f.workspace.id, f.member.membershipId]);
  if (change === "session") await blocker.query("update sessions set revoked_at=now() where id=$1", [f.member.sessionId]);
  let released = false;
  try {
    const pending = operation === "detail" ? getIdentityReviewCandidatesV1(pool, f.member, held.leadId)
      : listIdentityReviewQueueV1(pool, f.member, { assignment: "all", evidence: "any", limit: 50 });
    const blockedQuery = change === "reassignment" ? "from leads" : change === "team_visibility" ? "team_memberships" :
      change === "candidate" ? "from contacts" : "from workspace_memberships";
    await waitForActivity(row => row.wait_event_type === "Lock" && row.query.includes(blockedQuery));
    await blocker.query("commit"); blocker.release(); released = true;
    if (change !== "candidate") await expect(pending).rejects.toMatchObject({ code: "resource_not_found" });
    else if (operation === "detail") expect(await pending).toMatchObject({ candidates: [], reconciliation: { status: "stale" },
      capabilities: { canHold: true, canResolve: false } });
    else expect(await pending).toMatchObject({ items: [{ candidateSummary: { strong: 0 }, reconciliation: { status: "stale" },
      capabilities: { canHold: true, canResolve: false } }] });
  } finally {
    if (!released) { await blocker.query("rollback").catch(() => undefined); blocker.release(); }
  }
}

suite("P1A manual intake modular transaction", () => {
  beforeAll(async () => { await pool.query("select 1"); });
  beforeEach(async () => { await pool.query("truncate users cascade"); });
  afterAll(async () => { await pool.end(); });

  it("creates one Lead with one Audit/event and replays the stored result", async () => {
    const f = await fixture(), key = randomUUID(), input = command();
    const first = await submitLeadInquiryV1(pool, { actor: f.owner, command: input, idempotencyKey: key });
    const replay = await submitLeadInquiryV1(pool, { actor: f.owner, command: input, idempotencyKey: key });
    expect(first).toMatchObject({ disposition: "created", contactId: null, companyId: null, reviewCaseId: null,
      reviewVersion: null, replayed: false, candidateSummary: { strong: 0, supplementary: 0, probable: 0 },
      nextView: { kind: "lead_detail", leadId: first.leadId } });
    expect(replay).toMatchObject({ leadId: first.leadId, intakeId: first.intakeId, disposition: "replayed", replayed: true,
      contactId: null, companyId: null, reviewCaseId: null, reviewVersion: null, requestId: first.requestId,
      nextView: { kind: "lead_detail", leadId: first.leadId } });
    expect((await pool.query("select count(*)::int count from leads")).rows[0].count).toBe(1);
    expect((await pool.query("select count(*)::int count from audit_events where action='crm.inquiry_created'")).rows[0].count).toBe(1);
    expect((await pool.query("select count(*)::int count from outbox_messages where topic='crm.inquiry.created.v1'")).rows[0].count).toBe(1);
    await expect(submitLeadInquiryV1(pool, { actor: f.owner, command: command(), idempotencyKey: key })).rejects.toMatchObject({ code: "idempotency_conflict" });
  });

  it("serializes concurrent same-key submissions without duplicate effects", async () => {
    const f = await fixture(), key = randomUUID(), input = command();
    const results = await Promise.all([
      submitLeadInquiryV1(pool, { actor: f.owner, command: input, idempotencyKey: key }),
      submitLeadInquiryV1(pool, { actor: f.owner, command: input, idempotencyKey: key }),
    ]);
    expect(results.filter(item => item.replayed)).toHaveLength(1);
    expect(new Set(results.map(item => item.leadId)).size).toBe(1);
    expect((await pool.query("select count(*)::int count from leads")).rows[0].count).toBe(1);
  });

  it("binds intake replay to the original actor and current assignment, Membership, and Workspace", async () => {
    const f = await fixture(), key = randomUUID(), input = command({ requestedAssignment: { membershipId: f.member.membershipId } });
    const first = await submitLeadInquiryV1(pool, { actor: f.member, command: input, idempotencyKey: key });
    const auditCount = (await pool.query("select count(*)::int count from audit_events")).rows[0].count;
    await expect(submitLeadInquiryV1(pool, { actor: f.owner, command: input, idempotencyKey: key })).rejects.toMatchObject({ code: "resource_not_found" });
    await pool.query("update leads set owner_membership_id=null where workspace_id=$1 and id=$2", [f.workspace.id, first.leadId]);
    await expect(submitLeadInquiryV1(pool, { actor: f.member, command: input, idempotencyKey: key })).rejects.toMatchObject({ code: "resource_not_found" });
    await pool.query("update workspace_memberships set status='suspended' where workspace_id=$1 and id=$2", [f.workspace.id, f.member.membershipId]);
    await expect(submitLeadInquiryV1(pool, { actor: f.member, command: input, idempotencyKey: key })).rejects.toMatchObject({ code: "resource_not_found" });
    await expect(submitLeadInquiryV1(pool, { actor: { ...f.owner, workspaceId: randomUUID() }, command: input,
      idempotencyKey: key })).rejects.toMatchObject({ code: "resource_not_found" });
    expect((await pool.query("select count(*)::int count from audit_events")).rows[0].count).toBe(auditCount);
    expect((await pool.query("select count(*)::int count from outbox_messages")).rows[0].count).toBe(1);
  });

  it("holds deterministic exact candidates and exposes details only to authorized actors", async () => {
    const f = await fixture(), email = "candidate@example.test";
    await pool.query(
      `insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
       values($1,'Existing Person','existing person',$2,$2)`, [f.workspace.id, email],
    );
    const held = await submitLeadInquiryV1(pool, { actor: f.owner, command: command({ person: { displayName: "Candidate", email } }), idempotencyKey: randomUUID() });
    expect(held).toMatchObject({ disposition: "held_for_review", candidateSummary: { strong: 1 }, reviewVersion: 1 });
    const view = await getIdentityReviewCandidatesV1(pool, f.owner, held.leadId);
    expect(view.candidates).toHaveLength(1);
    expect(view).toMatchObject({ contractVersion: "lead-identity-review-detail.v1", lead: { maskedEmail: "c***@example.test" },
      originalAttribution: { sourceCategory: "manual" }, capabilities: { canLinkContact: true, canHold: true, canResolve: true },
      reconciliation: { status: "current" } });
    expect(view.candidates[0]).toMatchObject({ targetType: "contact", maskedEmail: "c***@example.test", evidenceStrength: "strong" });
    expect(JSON.stringify(view)).not.toContain(email);
    await expect(getIdentityReviewCandidatesV1(pool, f.member, held.leadId)).rejects.toMatchObject({ code: "resource_not_found" });
    expect((await pool.query("select count(*)::int count from audit_events where action='crm.inquiry_held_for_review'")).rows[0].count).toBe(1);
    expect((await pool.query("select count(*)::int count from outbox_messages where topic like 'crm.inquiry.%'")).rows[0].count).toBe(2);
  });

  it("returns an authorized deterministic queue with bounded cursors and current per-row capabilities", async () => {
    const f = await fixture();
    await pool.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
      values($1,'Queue Candidate','queue candidate','queue@example.test','queue@example.test')`, [f.workspace.id]);
    await pool.query(`insert into companies(workspace_id,display_name,name_normalized)
      values($1,'North Labs','north labs')`, [f.workspace.id]);
    const memberLead = await submitLeadInquiryV1(pool, { actor: f.member, command: command({ person: {
      displayName: "Member Queue", email: "queue@example.test" }, requestedAssignment: {
      responsibleMembershipId: f.member.membershipId } }), idempotencyKey: randomUUID() });
    const ownerLead = await submitLeadInquiryV1(pool, { actor: f.owner, command: command({ person: {
      displayName: "Owner Queue", email: "queue@example.test" } }), idempotencyKey: randomUUID() });
    const page1 = await listIdentityReviewQueueV1(pool, f.owner, { assignment: "all", evidence: "any", limit: 1 });
    expect(page1).toMatchObject({ contractVersion: "lead-identity-review-queue.v1" });
    expect(page1.items).toHaveLength(1); expect(page1.nextCursor).toBeTruthy();
    expect(page1.items[0]).toMatchObject({ capabilities: { canLinkContact: true, canLinkCompany: true, canResolve: true },
      reconciliation: { status: "current" } });
    const page2 = await listIdentityReviewQueueV1(pool, f.owner, { assignment: "all", evidence: "any", limit: 1,
      cursor: page1.nextCursor! });
    expect(page2.items).toHaveLength(1);
    expect(new Set([...page1.items, ...page2.items].map(item => item.leadId)))
      .toEqual(new Set([memberLead.leadId, ownerLead.leadId]));
    const memberQueue = await listIdentityReviewQueueV1(pool, f.member, { assignment: "all", evidence: "email", limit: 50 });
    expect(memberQueue.items.map(item => item.leadId)).toEqual([memberLead.leadId]);
    expect(memberQueue.items[0]).toMatchObject({ assignment: { responsibleMembershipId: f.member.membershipId },
      capabilities: { canCreateContact: true, canLinkContact: false, canDismiss: true, canHold: true, canResolve: true } });
    expect(JSON.stringify(memberQueue)).not.toContain("queue@example.test");
    expect((await listIdentityReviewQueueV1(pool, f.member, { assignment: "unassigned", evidence: "any", limit: 50 })).items).toEqual([]);
    await pool.query("update leads set owner_membership_id=null where workspace_id=$1 and id=$2", [f.workspace.id, memberLead.leadId]);
    expect((await listIdentityReviewQueueV1(pool, f.member, { assignment: "all", evidence: "any", limit: 50 })).items).toEqual([]);
    await pool.query("update workspace_memberships set status='suspended' where workspace_id=$1 and id=$2", [f.workspace.id, f.member.membershipId]);
    await expect(listIdentityReviewQueueV1(pool, f.member, { assignment: "all", evidence: "any", limit: 50 }))
      .rejects.toMatchObject({ code: "resource_not_found" });
  });

  it("withholds all candidate details when an evidence target becomes inaccessible", async () => {
    const f = await fixture(), email = "archived-candidate@example.test";
    const target = (await pool.query<{ id: string }>(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
      values($1,'Archived Candidate','archived candidate',$2,$2) returning id`, [f.workspace.id, email])).rows[0];
    const held = await submitLeadInquiryV1(pool, { actor: f.owner, command: command({ person: {
      displayName: "Archived Candidate", email } }), idempotencyKey: randomUUID() });
    await pool.query("update contacts set status='archived',version=version+1 where id=$1", [target.id]);
    const view = await getIdentityReviewCandidatesV1(pool, f.owner, held.leadId);
    expect(view.candidates).toEqual([]);
    expect(view).toMatchObject({ reconciliation: { status: "stale", retryable: true, action: "refresh_identity_review" },
      capabilities: { canCreateContact: false, canLinkContact: false, canDismiss: false, canHold: true, canResolve: false } });
    expect(JSON.stringify(view)).not.toContain(target.id);
    expect(JSON.stringify(view)).not.toContain(email);
    const queue = await listIdentityReviewQueueV1(pool, f.owner, { assignment: "all", evidence: "any", limit: 50 });
    expect(queue.items[0]).toMatchObject({ candidateSummary: { strong: 0, supplementary: 0, probable: 0 },
      capabilities: { canCreateContact: false, canLinkContact: false, canDismiss: false, canHold: true, canResolve: false },
      reconciliation: { status: "stale", retryable: true, action: "refresh_identity_review" } });
  });

  it("advances a sparse Member cursor across invisible scans without repeating the same range", async () => {
    const f = await fixture(), email = "sparse-queue@example.test";
    await pool.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
      values($1,'Sparse Candidate','sparse candidate',$2,$2)`, [f.workspace.id, email]);
    const visible = await submitLeadInquiryV1(pool, { actor: f.member, command: command({ person: {
      displayName: "Visible Oldest", email }, requestedAssignment: { responsibleMembershipId: f.member.membershipId } }),
      idempotencyKey: randomUUID() });
    for (let index = 0; index < 25; index++) await submitLeadInquiryV1(pool, { actor: f.owner,
      command: command({ person: { displayName: `Hidden ${index}`, email } }), idempotencyKey: randomUUID() });
    let cursor: string | undefined, found: string[] = [];
    for (let attempt = 0; attempt < 3 && !found.length; attempt++) {
      const page = await listIdentityReviewQueueV1(pool, f.member, { assignment: "all", evidence: "any", limit: 1, ...(cursor ? { cursor } : {}) });
      found = page.items.map(item => item.leadId); cursor = page.nextCursor ?? undefined;
    }
    expect(found).toEqual([visible.leadId]);
  });

  it.each(["detail", "queue"] as const)("withholds %s when responsibility changes at the disclosure boundary", async operation => {
    await presentationRace(operation, "reassignment");
  });

  it.each(["detail", "queue"] as const)("withholds %s when team visibility is removed at the disclosure boundary", async operation => {
    await presentationRace(operation, "team_visibility");
  });

  it.each(["detail", "queue"] as const)("withholds %s when Membership authority is suspended at the disclosure boundary", async operation => {
    await presentationRace(operation, "membership");
  });

  it.each(["detail", "queue"] as const)("withholds %s when Session authority is revoked at the disclosure boundary", async operation => {
    await presentationRace(operation, "session");
  });

  it.each(["detail", "queue"] as const)("returns stale %s reconciliation when a candidate changes at the disclosure boundary", async operation => {
    await presentationRace(operation, "candidate");
  });

  it.each(["detail", "queue"] as const)("withholds %s when the review resolves during disclosure", async operation => {
    const f = await fixture(), email = `${operation}-resolution@example.test`;
    await pool.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
      values($1,'Resolution Candidate','resolution candidate',$2,$2)`, [f.workspace.id, email]);
    const held = await submitLeadInquiryV1(pool, { actor: f.member, command: command({ person: {
      displayName: "Resolution Candidate", email }, requestedAssignment: { responsibleMembershipId: f.member.membershipId } }),
      idempotencyKey: randomUUID() });
    const view = await getIdentityReviewCandidatesV1(pool, f.member, held.leadId);
    await pool.query(`create function p1a_disclosure_delay() returns trigger language plpgsql as $$
      begin perform pg_advisory_xact_lock(812501); return new; end $$`);
    await pool.query(`create trigger p1a_disclosure_delay before insert on audit_events
      for each row execute function p1a_disclosure_delay()`);
    const blocker = await pool.connect(); let blockerReleased = false; await blocker.query("begin");
    await blocker.query("select pg_advisory_xact_lock(812501)");
    try {
      const resolution = decideLeadIdentityReviewV1(pool, { actor: f.member, leadId: held.leadId, idempotencyKey: randomUUID(), command: {
        contractVersion: "lead-identity-review-decision.v1", outcome: "resolve", expectedLeadVersion: view.leadVersion,
        expectedReviewVersion: view.reviewVersion, expectedIntakeVersion: view.intakeVersion,
        contact: { action: "dismiss" }, company: { action: "dismiss" } } });
      await waitForActivity(row => row.wait_event_type === "Lock" && row.query.includes("insert into audit_events"));
      const pending = operation === "detail" ? getIdentityReviewCandidatesV1(pool, f.member, held.leadId)
        : listIdentityReviewQueueV1(pool, f.member, { assignment: "all", evidence: "any", limit: 50 });
      await waitForActivity(row => row.wait_event_type === "Lock" && row.query.includes("from lead_intakes"));
      await blocker.query("commit"); blocker.release(); blockerReleased = true;
      await expect(resolution).resolves.toMatchObject({ outcome: "resolve" });
      await expect(pending).rejects.toMatchObject({ code: "resource_not_found" });
    } finally {
      if (!blockerReleased) { await blocker.query("rollback").catch(() => undefined); blocker.release(); }
      await pool.query("drop trigger if exists p1a_disclosure_delay on audit_events");
      await pool.query("drop function if exists p1a_disclosure_delay()");
    }
  });

  it("lets an Owner atomically link candidates and replays the resolution", async () => {
    const f = await fixture(), company = (await pool.query<{ id: string }>(
      `insert into companies(workspace_id,display_name,name_normalized) values($1,'North Labs','north labs') returning id`, [f.workspace.id],
    )).rows[0];
    const contact = (await pool.query<{ id: string }>(
      `insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized,company_id)
       values($1,'Taylor North','taylor north','link@example.test','link@example.test',$2) returning id`, [f.workspace.id, company.id],
    )).rows[0];
    const held = await submitLeadInquiryV1(pool, { actor: f.owner, command: command({ person: { displayName: "Taylor North", email: "link@example.test" } }), idempotencyKey: randomUUID() });
    const view = await getIdentityReviewCandidatesV1(pool, f.owner, held.leadId);
    const contactCandidate = view.candidates.find(item => item.targetType === "contact" && item.evidenceKind === "email")!;
    const companyCandidate = view.candidates.find(item => item.targetType === "company")!;
    const key = randomUUID(), decision = { contractVersion: "lead-identity-review-decision.v1" as const,
      expectedLeadVersion: view.leadVersion, expectedReviewVersion: view.reviewVersion, expectedIntakeVersion: view.intakeVersion,
      outcome: "resolve" as const, contact: { action: "link" as const, candidateId: contactCandidate.candidateId,
        targetId: contact.id, expectedTargetVersion: contactCandidate.targetVersion }, company: { action: "link" as const,
        candidateId: companyCandidate.candidateId, targetId: company.id, expectedTargetVersion: companyCandidate.targetVersion } };
    await expect(resolveLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId, idempotencyKey: randomUUID(),
      command: { ...decision, contact: { ...decision.contact, targetId: randomUUID() } } }))
      .rejects.toMatchObject({ code: "invalid_match_decision" });
    await expect(resolveLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId, idempotencyKey: randomUUID(),
      command: { ...decision, company: { ...decision.company, targetId: randomUUID() } } }))
      .rejects.toMatchObject({ code: "invalid_match_decision" });
    await expect(resolveLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId, idempotencyKey: randomUUID(),
      command: { ...decision, contact: { ...decision.contact, expectedTargetVersion: decision.contact.expectedTargetVersion + 1 } } }))
      .rejects.toMatchObject({ code: "stale_version" });
    await expect(resolveLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId, idempotencyKey: randomUUID(),
      command: { ...decision, company: { ...decision.company, expectedTargetVersion: decision.company.expectedTargetVersion + 1 } } }))
      .rejects.toMatchObject({ code: "stale_version" });
    const result = await resolveLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId, command: decision, idempotencyKey: key });
    const replay = await resolveLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId, command: decision, idempotencyKey: key });
    expect(result).toMatchObject({ contactId: contact.id, companyId: company.id, leadVersion: 2, reviewVersion: 2,
      replayed: false, nextView: { kind: "identity_review_queue" } });
    expect(replay).toMatchObject({ contactId: contact.id, companyId: company.id, replayed: true, requestId: result.requestId,
      nextView: { kind: "identity_review_queue" } });
    expect((await pool.query("select state from lead_identity_reviews where id=$1", [view.reviewId])).rows[0].state).toBe("resolved");
    expect((await pool.query("select count(*)::int count from audit_events where action='crm.inquiry_review_resolved'")).rows[0].count).toBe(1);
  });

  it("applies an explicit idempotent Hold with pending lineage and no identity mutation", async () => {
    const f = await fixture(), email = "hold@example.test";
    await pool.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
      values($1,'Hold Candidate','hold candidate',$2,$2)`, [f.workspace.id, email]);
    const held = await submitLeadInquiryV1(pool, { actor: f.owner,
      command: command({ person: { displayName: "Hold Candidate", email } }), idempotencyKey: randomUUID() });
    const view = await getIdentityReviewCandidatesV1(pool, f.owner, held.leadId), key = randomUUID();
    const decision = { contractVersion: "lead-identity-review-decision.v1" as const, outcome: "hold" as const,
      expectedLeadVersion: view.leadVersion, expectedReviewVersion: view.reviewVersion, expectedIntakeVersion: view.intakeVersion };
    const result = await decideLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId, command: decision, idempotencyKey: key });
    const replay = await decideLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId, command: decision, idempotencyKey: key });
    expect(result).toMatchObject({ outcome: "hold", disposition: "held_for_review", contactId: null, companyId: null,
      leadVersion: 1, reviewVersion: 2, replayed: false, nextView: { kind: "identity_review_detail", leadId: held.leadId } });
    expect(replay).toMatchObject({ outcome: "hold", disposition: "replayed", contactId: null, companyId: null,
      reviewVersion: 2, replayed: true, nextView: { kind: "identity_review_detail", leadId: held.leadId } });
    await expect(decideLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId,
      command: { ...decision, reasonCode: "changed" }, idempotencyKey: key })).rejects.toMatchObject({ code: "idempotency_conflict" });
    await pool.query(`update workspace_memberships set role_id=(select id from roles where workspace_id=$1 and code='owner')
      where workspace_id=$1 and id=$2`, [f.workspace.id, f.member.membershipId]);
    await expect(decideLeadIdentityReviewV1(pool, { actor: { ...f.member, role: "owner" }, leadId: held.leadId,
      command: { ...decision, reasonCode: "cross-actor-changed" }, idempotencyKey: key }))
      .rejects.toMatchObject({ code: "resource_not_found" });
    expect((await pool.query("select state,version from lead_identity_reviews where id=$1", [view.reviewId])).rows[0]).toMatchObject({ state: "pending", version: 2 });
    expect((await pool.query("select count(*)::int count from contacts")).rows[0].count).toBe(1);
    expect((await pool.query("select count(*)::int count from companies")).rows[0].count).toBe(0);
    expect((await pool.query("select count(*)::int count from audit_events where action='crm.inquiry_held_for_review'")).rows[0].count).toBe(2);
    expect((await pool.query("select count(*)::int count from outbox_messages where topic='crm.inquiry.review_required.v1'")).rows[0].count).toBe(2);
  });

  it("serializes competing Hold and Resolve decisions to one effective successor", async () => {
    const f = await fixture(), email = "competing@example.test";
    await pool.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
      values($1,'Competing','competing',$2,$2)`, [f.workspace.id, email]);
    const held = await submitLeadInquiryV1(pool, { actor: f.owner,
      command: command({ person: { displayName: "Competing", email } }), idempotencyKey: randomUUID() });
    const view = await getIdentityReviewCandidatesV1(pool, f.owner, held.leadId), expected = {
      contractVersion: "lead-identity-review-decision.v1" as const, expectedLeadVersion: view.leadVersion,
      expectedReviewVersion: view.reviewVersion, expectedIntakeVersion: view.intakeVersion };
    const settled = await Promise.allSettled([
      decideLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId,
        command: { ...expected, outcome: "hold" }, idempotencyKey: randomUUID() }),
      decideLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId,
        command: { ...expected, outcome: "resolve", contact: { action: "dismiss" }, company: { action: "dismiss" } }, idempotencyKey: randomUUID() }),
    ]);
    expect(settled.filter(item => item.status === "fulfilled")).toHaveLength(1);
    const rejected = settled.find(item => item.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "stale_version" });
    expect((await pool.query("select count(*)::int count from lead_identity_decisions")).rows[0].count).toBe(2);
    expect((await pool.query("select count(*)::int count from audit_events")).rows[0].count).toBe(2);
  });

  it("rolls back when Membership authority is lost while a Member decision waits for final locks", async () => {
    const f = await fixture(), email = "authority-race@example.test";
    await pool.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
      values($1,'Authority Race','authority race',$2,$2)`, [f.workspace.id, email]);
    const held = await submitLeadInquiryV1(pool, { actor: f.member, command: command({ person: { displayName: "Authority Race", email },
      requestedAssignment: { membershipId: f.member.membershipId } }), idempotencyKey: randomUUID() });
    const view = await getIdentityReviewCandidatesV1(pool, f.member, held.leadId), blocker = await pool.connect();
    await blocker.query("begin");
    await blocker.query("update workspace_memberships set status='suspended' where workspace_id=$1 and id=$2", [f.workspace.id, f.member.membershipId]);
    const pending = decideLeadIdentityReviewV1(pool, { actor: f.member, leadId: held.leadId, idempotencyKey: randomUUID(), command: {
      contractVersion: "lead-identity-review-decision.v1", outcome: "resolve", expectedLeadVersion: view.leadVersion,
      expectedReviewVersion: view.reviewVersion, expectedIntakeVersion: view.intakeVersion,
      contact: { action: "create" }, company: { action: "dismiss" } } });
    await new Promise(resolve => setTimeout(resolve, 30));
    await blocker.query("commit"); blocker.release();
    await expect(pending).rejects.toMatchObject({ code: "resource_not_found" });
    expect((await pool.query("select count(*)::int count from lead_identity_decisions")).rows[0].count).toBe(1);
    expect((await pool.query("select count(*)::int count from contacts")).rows[0].count).toBe(1);
    expect((await pool.query("select count(*)::int count from audit_events")).rows[0].count).toBe(1);
  });

  it("rejects an in-flight owner-assignment loss before any decision mutation", async () => {
    const f = await fixture(), email = "assignment-race@example.test";
    await pool.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
      values($1,'Assignment Race','assignment race',$2,$2)`, [f.workspace.id, email]);
    const held = await submitLeadInquiryV1(pool, { actor: f.member, command: command({ person: { displayName: "Assignment Race", email },
      requestedAssignment: { membershipId: f.member.membershipId } }), idempotencyKey: randomUUID() });
    const view = await getIdentityReviewCandidatesV1(pool, f.member, held.leadId), blocker = await pool.connect();
    await blocker.query("begin");
    await blocker.query("update leads set owner_membership_id=null where workspace_id=$1 and id=$2", [f.workspace.id, held.leadId]);
    const pending = decideLeadIdentityReviewV1(pool, { actor: f.member, leadId: held.leadId, idempotencyKey: randomUUID(), command: {
      contractVersion: "lead-identity-review-decision.v1", outcome: "resolve", expectedLeadVersion: view.leadVersion,
      expectedReviewVersion: view.reviewVersion, expectedIntakeVersion: view.intakeVersion,
      contact: { action: "create" }, company: { action: "dismiss" } } });
    await new Promise(resolve => setTimeout(resolve, 30));
    await blocker.query("commit"); blocker.release();
    await expect(pending).rejects.toMatchObject({ code: "resource_not_found" });
    expect((await pool.query("select count(*)::int count from lead_identity_decisions")).rows[0].count).toBe(1);
    expect((await pool.query("select count(*)::int count from audit_events")).rows[0].count).toBe(1);
  });

  it("rolls back when team visibility is lost while a Member Hold waits for final locks", async () => {
    const f = await fixture(), email = "visibility-race@example.test";
    await pool.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
      values($1,'Visibility Race','visibility race',$2,$2)`, [f.workspace.id, email]);
    const held = await submitLeadInquiryV1(pool, { actor: f.member, command: command({ person: { displayName: "Visibility Race", email },
      requestedAssignment: { membershipId: f.member.membershipId } }), idempotencyKey: randomUUID() });
    const team = (await pool.query<{ id: string }>(
      `insert into teams(workspace_id,name,name_normalized,status,created_by_membership_id)
       values($1,'Review Team','review team','active',$2) returning id`, [f.workspace.id, f.owner.membershipId])).rows[0];
    await pool.query(`insert into team_memberships(workspace_id,team_id,workspace_membership_id,created_by_membership_id)
      values($1,$2,$3,$4)`, [f.workspace.id, team.id, f.member.membershipId, f.owner.membershipId]);
    await pool.query("update leads set visibility='teams' where workspace_id=$1 and id=$2", [f.workspace.id, held.leadId]);
    await pool.query("insert into lead_visible_teams(workspace_id,lead_id,team_id) values($1,$2,$3)", [f.workspace.id, held.leadId, team.id]);
    const view = await getIdentityReviewCandidatesV1(pool, f.member, held.leadId), blocker = await pool.connect();
    await blocker.query("begin");
    await blocker.query("delete from team_memberships where workspace_id=$1 and team_id=$2 and workspace_membership_id=$3",
      [f.workspace.id, team.id, f.member.membershipId]);
    const pending = decideLeadIdentityReviewV1(pool, { actor: f.member, leadId: held.leadId, idempotencyKey: randomUUID(), command: {
      contractVersion: "lead-identity-review-decision.v1", outcome: "hold", expectedLeadVersion: view.leadVersion,
      expectedReviewVersion: view.reviewVersion, expectedIntakeVersion: view.intakeVersion } });
    await new Promise(resolve => setTimeout(resolve, 30));
    await blocker.query("commit"); blocker.release();
    await expect(pending).rejects.toMatchObject({ code: "resource_not_found" });
    expect((await pool.query("select count(*)::int count from lead_identity_decisions")).rows[0].count).toBe(1);
    expect((await pool.query("select count(*)::int count from audit_events")).rows[0].count).toBe(1);
  });

  it("rejects stale review versions without partial decision or identity writes", async () => {
    const f = await fixture(), email = "stale-review@example.test";
    await pool.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
      values($1,'Stale Candidate','stale candidate',$2,$2)`, [f.workspace.id, email]);
    const held = await submitLeadInquiryV1(pool, { actor: f.owner,
      command: command({ person: { displayName: "Stale Candidate", email } }), idempotencyKey: randomUUID() });
    const view = await getIdentityReviewCandidatesV1(pool, f.owner, held.leadId);
    await expect(resolveLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId,
      idempotencyKey: randomUUID(), command: { contractVersion: "lead-identity-review-decision.v1",
        expectedLeadVersion: view.leadVersion + 1, expectedReviewVersion: view.reviewVersion,
        expectedIntakeVersion: view.intakeVersion, outcome: "resolve",
        contact: { action: "dismiss" }, company: { action: "dismiss" } } })).rejects.toMatchObject({ code: "stale_version" });
    expect((await pool.query("select count(*)::int count from lead_identity_decisions")).rows[0].count).toBe(1);
    expect((await pool.query("select count(*)::int count from contacts")).rows[0].count).toBe(1);
    expect((await pool.query("select state from lead_identity_reviews where id=$1", [view.reviewId])).rows[0].state).toBe("pending");
  });

  it("allows an assigned-visible Member to create identities but never link existing", async () => {
    const f = await fixture(), email = "member-review@example.test";
    await pool.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
      values($1,'Existing','existing',$2,$2)`, [f.workspace.id, email]);
    const held = await submitLeadInquiryV1(pool, { actor: f.member, command: command({ person: { displayName: "Member Lead", email },
      requestedAssignment: { membershipId: f.member.membershipId } }), idempotencyKey: randomUUID() });
    const view = await getIdentityReviewCandidatesV1(pool, f.member, held.leadId), candidate = view.candidates[0];
    await expect(resolveLeadIdentityReviewV1(pool, { actor: f.member, leadId: held.leadId, idempotencyKey: randomUUID(), command: {
      contractVersion: "lead-identity-review-decision.v1" as const, expectedLeadVersion: 1, expectedReviewVersion: 1, expectedIntakeVersion: 2,
      outcome: "resolve", contact: { action: "link", candidateId: candidate.candidateId, targetId: candidate.targetId,
        expectedTargetVersion: candidate.targetVersion }, company: { action: "dismiss" } } })).rejects.toMatchObject({ code: "permission_required" });
    const resolveKey = randomUUID(), resolveCommand = {
      contractVersion: "lead-identity-review-decision.v1" as const, expectedLeadVersion: 1, expectedReviewVersion: 1, expectedIntakeVersion: 2,
      outcome: "resolve" as const, contact: { action: "create" as const }, company: { action: "create" as const } };
    const resolved = await resolveLeadIdentityReviewV1(pool, { actor: f.member, leadId: held.leadId,
      idempotencyKey: resolveKey, command: resolveCommand });
    expect(resolved.contactId).toBeTruthy();expect(resolved.companyId).toBeTruthy();
    await expect(resolveLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId,
      idempotencyKey: resolveKey, command: resolveCommand })).rejects.toMatchObject({ code: "resource_not_found" });
    await pool.query("update leads set owner_membership_id=null where workspace_id=$1 and id=$2", [f.workspace.id, held.leadId]);
    await expect(resolveLeadIdentityReviewV1(pool, { actor: f.member, leadId: held.leadId,
      idempotencyKey: resolveKey, command: resolveCommand })).rejects.toMatchObject({ code: "resource_not_found" });
    expect((await pool.query("select count(*)::int count from audit_events where action='crm.inquiry_review_resolved'")).rows[0].count).toBe(1);
  });

  it("serializes same-identity distinct-key Contact creation and forces waiter reconciliation", async () => {
    const f = await fixture(), email = "identity-race@example.test";
    await pool.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
      values($1,'Seed','seed',$2,$2)`, [f.workspace.id, email]);
    const held = await Promise.all(["Race One", "Race Two"].map(displayName => submitLeadInquiryV1(pool, { actor: f.owner,
      command: command({ person: { displayName, email }, organization: undefined }), idempotencyKey: randomUUID() })));
    const views = await Promise.all(held.map(item => getIdentityReviewCandidatesV1(pool, f.owner, item.leadId)));
    const settled = await Promise.allSettled(views.map((view, index) => decideLeadIdentityReviewV1(pool, { actor: f.owner,
      leadId: held[index].leadId, idempotencyKey: randomUUID(), command: { contractVersion: "lead-identity-review-decision.v1",
        outcome: "resolve", expectedLeadVersion: view.leadVersion, expectedReviewVersion: view.reviewVersion,
        expectedIntakeVersion: view.intakeVersion, contact: { action: "create" }, company: { action: "dismiss" } } })));
    expect(settled.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect((settled.find(item => item.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "stale_version" });
    expect((await pool.query("select count(*)::int count from contacts where email_normalized=$1", [email])).rows[0].count).toBe(2);
  });

  it("uses one cross-version lock namespace when retained-v1 resolution contends with v2 intake", async () => {
    const f = await fixture(), email = "intake-resolution-race@example.test", secondEmail = "v2-race@example.test";
    const phone = "+16473894802", domain = "shared-lock.example";
    await pool.query(`insert into companies(workspace_id,display_name,name_normalized,domain_normalized)
      values($1,'North Labs','north labs',$2)`, [f.workspace.id, domain]);
    await pool.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized,
      phone_display,phone_normalized,phone_country_code_used,normalization_version)
      values($1,'Race Seed','race seed',$2,$2,$3,$3,'+1','p1a-identity-v1')`, [f.workspace.id, email, phone]);
    const held = await submitLeadInquiryV1(pool, { actor: f.owner, command: command({ person: {
      displayName: "Race Seed", email, phone, phoneCountryOverride: "CA" } }),
      idempotencyKey: randomUUID() });
    await pool.query("update leads set normalization_version='p1a-identity-v1' where workspace_id=$1 and id=$2",
      [f.workspace.id, held.leadId]);
    const view = await getIdentityReviewCandidatesV1(pool, f.owner, held.leadId);
    const blocker = await pool.connect();
    let resolution: Promise<unknown> | undefined, intake: Promise<unknown> | undefined, barrierError: unknown;
    let blockerPid = 0, resolutionPid = 0, intakePid = 0;
    try {
      await blocker.query("begin");
      blockerPid = (await blocker.query<{ pid: number }>("select pg_backend_pid() pid")).rows[0].pid;
      await blocker.query("select pg_advisory_xact_lock(hashtextextended($1,7102))",
        [`${f.workspace.id}:contact:phone:${phone}`]);
      resolution = decideLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId, idempotencyKey: randomUUID(), command: {
        contractVersion: "lead-identity-review-decision.v1", outcome: "resolve", expectedLeadVersion: view.leadVersion,
        expectedReviewVersion: view.reviewVersion, expectedIntakeVersion: view.intakeVersion,
        contact: { action: "create" }, company: { action: "create" } } });
      resolutionPid = (await waitForActivity(row => row.wait_event_type === "Lock" &&
        row.query.includes("pg_advisory_xact_lock") && row.query.includes("7102"))).pid;
      expect((await pool.query<{ blockers: number[] }>("select pg_blocking_pids($1) blockers", [resolutionPid])).rows[0].blockers)
        .toContain(blockerPid);
      intake = submitLeadInquiryV1(pool, { actor: f.owner, command: command({ person: {
        displayName: "Race Seed", email: secondEmail, phone, phoneCountryOverride: "US" },
        organization: { name: "Alternate Labs", domain } }), idempotencyKey: randomUUID() });
      intakePid = (await waitForActivity(row => row.pid !== resolutionPid && row.wait_event_type === "Lock" &&
        row.query.includes("from companies") && row.query.includes("for update"))).pid;
      expect((await pool.query<{ blockers: number[] }>("select pg_blocking_pids($1) blockers", [intakePid])).rows[0].blockers)
        .toContain(resolutionPid);
    } catch (error) {
      barrierError = error;
    } finally {
      await blocker.query("commit").catch(() => undefined);
      blocker.release();
    }
    const settled = await Promise.allSettled([resolution, intake].filter((item): item is Promise<unknown> => Boolean(item)));
    if (barrierError) throw barrierError;
    expect({ blockerPid, resolutionPid, intakePid }).toMatchObject({ blockerPid: expect.any(Number),
      resolutionPid: expect.any(Number), intakePid: expect.any(Number) });
    expect(new Set([blockerPid, resolutionPid, intakePid]).size).toBe(3);
    expect(settled).toHaveLength(2);
    expect(settled.every(item => item.status === "fulfilled")).toBe(true);
  });

  it("rejects stale candidate targets and caps deterministic Workspace-scoped disclosure at ten", async () => {
    const f = await fixture(), email = "bounded@example.test";
    const ids: string[] = [];
    for (let index = 0; index < 12; index++) ids.push((await pool.query<{ id: string }>(
      `insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
       values($1,$2,$3,$4,$4) returning id`, [f.workspace.id, `Bounded ${index}`, `bounded ${index}`, email])).rows[0].id);
    const held = await submitLeadInquiryV1(pool, { actor: f.owner,
      command: command({ person: { displayName: "Bounded", email }, organization: undefined }), idempotencyKey: randomUUID() });
    expect(held.candidateSummary.strong).toBe(10);
    const view = await getIdentityReviewCandidatesV1(pool, f.owner, held.leadId);
    expect(view.candidates).toHaveLength(10);
    expect(view.candidates.map(item => item.targetId)).toEqual([...view.candidates.map(item => item.targetId)].sort());
    for (const targetId of ids.filter(id => !view.candidates.some(item => item.targetId === id))) await pool.query(
      `insert into lead_identity_candidates(workspace_id,review_id,contact_id,evidence_kind,evidence_strength,
        normalization_version,target_version,evidence_metadata)
       values($1,$2,$3,'email','strong','p1a-identity-v1',1,'{"match_key_version":"p1a-identity-v1"}')`,
      [f.workspace.id, view.reviewId, targetId]);
    const legacyCapped = await getIdentityReviewCandidatesV1(pool, f.owner, held.leadId);
    expect(legacyCapped.candidates).toHaveLength(10);
    expect((await listIdentityReviewQueueV1(pool, f.owner, { assignment: "all", evidence: "email", limit: 50 }))
      .items[0].candidateSummary.strong).toBe(10);
    const candidate = view.candidates[0];
    await pool.query("update contacts set version=version+1 where workspace_id=$1 and id=$2", [f.workspace.id, candidate.targetId]);
    await expect(decideLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId, idempotencyKey: randomUUID(), command: {
      contractVersion: "lead-identity-review-decision.v1", outcome: "resolve", expectedLeadVersion: view.leadVersion,
      expectedReviewVersion: view.reviewVersion, expectedIntakeVersion: view.intakeVersion,
      contact: { action: "link", candidateId: candidate.candidateId, targetId: candidate.targetId,
        expectedTargetVersion: candidate.targetVersion }, company: { action: "dismiss" } } })).rejects.toMatchObject({ code: "stale_version" });
    const foreign = await fixture();
    await expect(getIdentityReviewCandidatesV1(pool, foreign.owner, held.leadId)).rejects.toMatchObject({ code: "resource_not_found" });
  });

  it("caps email, phone, and mixed probable evidence independently with a combined maximum of thirty", async () => {
    const f = await fixture(), email = "all-caps@example.test", phone = "+14165550123";
    for (let index = 0; index < 12; index++) {
      await pool.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
        values($1,$2,$3,$4,$4)`, [f.workspace.id, `Email ${index}`, `email ${index}`, email]);
      await pool.query(`insert into contacts(workspace_id,display_name,person_name_normalized,phone_display,phone_normalized,phone_country_code_used)
        values($1,$2,$3,$4,$4,'CA')`, [f.workspace.id, `Phone ${index}`, `phone ${index}`, phone]);
    }
    for (let index = 0; index < 16; index++) {
      const company = (await pool.query<{ id: string }>(`insert into companies(workspace_id,display_name,name_normalized)
        values($1,$2,'north labs') returning id`, [f.workspace.id, `North Labs ${index}`])).rows[0];
      if (index < 6) await pool.query(`insert into contacts(workspace_id,display_name,person_name_normalized,company_id)
        values($1,'Cap Person','cap person',$2)`, [f.workspace.id, company.id]);
    }
    const held = await submitLeadInquiryV1(pool, { actor: f.owner, command: command({
      person: { displayName: "Cap Person", email, phone }, organization: { name: "North Labs" } }), idempotencyKey: randomUUID() });
    expect(held.candidateSummary).toEqual({ strong: 10, supplementary: 10, probable: 10 });
    const view = await getIdentityReviewCandidatesV1(pool, f.owner, held.leadId);
    expect(view.candidates).toHaveLength(30);
    for (const kind of ["email", "phone", "name_company"] as const) {
      const ids = view.candidates.filter(item => item.evidenceKind === kind).map(item => item.targetId);
      expect(ids).toEqual([...ids].sort());
    }
    const result = await decideLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId, idempotencyKey: randomUUID(), command: {
      contractVersion: "lead-identity-review-decision.v1", outcome: "resolve", expectedLeadVersion: view.leadVersion,
      expectedReviewVersion: view.reviewVersion, expectedIntakeVersion: view.intakeVersion,
      contact: { action: "dismiss" }, company: { action: "dismiss" } } });
    expect(result.disposition).toBe("resolved");
  });

  it("persists the normalized Company domain query and uses it for candidate rerun", async () => {
    const f = await fixture(), domain = "domain-rerun.example";
    await pool.query(`insert into companies(workspace_id,display_name,name_normalized,domain_normalized)
      values($1,'Different Name','different name',$2)`, [f.workspace.id, domain]);
    const held = await submitLeadInquiryV1(pool, { actor: f.owner, command: command({ person: {
      displayName: "Domain Person", email: "domain-person@example.test" }, organization: { name: "Submitted Name", domain } }),
      idempotencyKey: randomUUID() });
    expect(held.candidateSummary.probable).toBe(1);
    const stored = (await pool.query(`select outcome #>> '{_candidateQuery,companyDomainNormalized}' domain
      from lead_intakes where id=$1`, [held.intakeId])).rows[0];
    expect(stored.domain).toBe(domain);
    const view = await getIdentityReviewCandidatesV1(pool, f.owner, held.leadId);
    const result = await decideLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId, idempotencyKey: randomUUID(), command: {
      contractVersion: "lead-identity-review-decision.v1", outcome: "resolve", expectedLeadVersion: view.leadVersion,
      expectedReviewVersion: view.reviewVersion, expectedIntakeVersion: view.intakeVersion,
      contact: { action: "dismiss" }, company: { action: "create" } } });
    expect(result.companyId).toBeTruthy();
    expect((await pool.query("select domain_normalized from companies where id=$1", [result.companyId])).rows[0].domain_normalized).toBe(domain);
  });

  it("rolls the entire command back when a required event write fails", async () => {
    const f = await fixture();
    await pool.query(`create function fail_p1a_event() returns trigger language plpgsql as $$ begin
      if new.topic='crm.inquiry.created.v1' then raise exception 'injected P1A event failure'; end if; return new; end $$`);
    await pool.query(`create trigger fail_p1a_event before insert on outbox_messages for each row execute function fail_p1a_event()`);
    try { await expect(submitLeadInquiryV1(pool, { actor: f.owner, command: command(), idempotencyKey: randomUUID() })).rejects.toThrow("injected P1A event failure"); }
    finally { await pool.query("drop trigger fail_p1a_event on outbox_messages");await pool.query("drop function fail_p1a_event()") }
    for (const table of ["leads", "lead_intakes", "lead_identity_reviews", "lead_identity_candidates", "lead_identity_decisions", "audit_events", "outbox_messages"]) {
      expect((await pool.query(`select count(*)::int count from ${table}`)).rows[0].count, table).toBe(0);
    }
  });

  it("rolls back and permits same-key retry at every manual-intake write boundary", async () => {
    const boundaries = [
      { table: "leads", when: "after insert", condition: "true" },
      { table: "lead_identity_reviews", when: "after insert", condition: "true" },
      { table: "lead_identity_candidates", when: "after insert", condition: "true" },
      { table: "lead_identity_decisions", when: "after insert", condition: "true" },
      { table: "lead_identity_decision_heads", when: "after insert", condition: "true" },
      { table: "lead_intakes", when: "before update", condition: "new.state='committed'" },
      { table: "audit_events", when: "after insert", condition: "true" },
      { table: "outbox_messages", when: "after insert", condition: "new.topic='crm.inquiry.created.v1'" },
      { table: "outbox_messages", when: "after insert", condition: "new.topic='crm.inquiry.review_required.v1'" },
    ];
    for (const [index, boundary] of boundaries.entries()) {
      await pool.query("truncate users cascade");
      const f = await fixture(), email = `intake-boundary-${index}@example.test`, key = randomUUID();
      await pool.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
        values($1,'Intake Boundary','intake boundary',$2,$2)`, [f.workspace.id, email]);
      const functionName = `fail_p1a_intake_${index}`, triggerName = `fail_p1a_intake_${index}`;
      await pool.query(`create function ${functionName}() returns trigger language plpgsql as $$ begin
        if ${boundary.condition} then raise exception 'injected intake boundary failure'; end if; return new; end $$`);
      await pool.query(`create trigger ${triggerName} ${boundary.when} on ${boundary.table} for each row execute function ${functionName}()`);
      const intakeCommand = command({ person: { displayName: "Intake Boundary", email } });
      try {
        await expect(submitLeadInquiryV1(pool, { actor: f.owner, command: intakeCommand, idempotencyKey: key })).rejects.toThrow("injected");
      } finally {
        await pool.query(`drop trigger ${triggerName} on ${boundary.table}`);
        await pool.query(`drop function ${functionName}()`);
      }
      for (const table of ["leads", "lead_intakes", "lead_identity_reviews", "lead_identity_candidates",
        "lead_identity_decisions", "lead_identity_decision_heads", "lead_activities", "audit_events", "outbox_messages"])
        expect((await pool.query(`select count(*)::int count from ${table}`)).rows[0].count, `${boundary.table}:${table}`).toBe(0);
      const retry = await submitLeadInquiryV1(pool, { actor: f.owner, command: intakeCommand, idempotencyKey: key });
      expect(retry).toMatchObject({ disposition: "held_for_review", replayed: false });
      expect((await pool.query("select count(*)::int count from leads")).rows[0].count).toBe(1);
    }
  });

  it("rolls back Hold Audit and Outbox failures and permits same-key retry", async () => {
    for (const [index, boundary] of [
      { table: "audit_events", condition: "new.action='crm.inquiry_held_for_review'" },
      { table: "outbox_messages", condition: "new.topic='crm.inquiry.review_required.v1'" },
    ].entries()) {
      await pool.query("truncate users cascade");
      const f = await fixture(), email = `hold-boundary-${index}@example.test`, key = randomUUID();
      await pool.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
        values($1,'Hold Boundary','hold boundary',$2,$2)`, [f.workspace.id, email]);
      const held = await submitLeadInquiryV1(pool, { actor: f.owner,
        command: command({ person: { displayName: "Hold Boundary", email } }), idempotencyKey: randomUUID() });
      const view = await getIdentityReviewCandidatesV1(pool, f.owner, held.leadId);
      const before = { decisions: (await pool.query("select count(*)::int count from lead_identity_decisions")).rows[0].count,
        audits: (await pool.query("select count(*)::int count from audit_events")).rows[0].count,
        events: (await pool.query("select count(*)::int count from outbox_messages")).rows[0].count };
      const functionName = `fail_p1a_hold_${index}`, triggerName = `fail_p1a_hold_${index}`;
      await pool.query(`create function ${functionName}() returns trigger language plpgsql as $$ begin
        if ${boundary.condition} then raise exception 'injected hold boundary failure'; end if; return new; end $$`);
      await pool.query(`create trigger ${triggerName} after insert on ${boundary.table} for each row execute function ${functionName}()`);
      const hold = { contractVersion: "lead-identity-review-decision.v1" as const, outcome: "hold" as const,
        expectedLeadVersion: view.leadVersion, expectedReviewVersion: view.reviewVersion, expectedIntakeVersion: view.intakeVersion };
      try {
        await expect(decideLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId, command: hold, idempotencyKey: key }))
          .rejects.toThrow("injected");
      } finally {
        await pool.query(`drop trigger ${triggerName} on ${boundary.table}`);
        await pool.query(`drop function ${functionName}()`);
      }
      expect((await pool.query("select state,version from lead_identity_reviews where id=$1", [view.reviewId])).rows[0])
        .toMatchObject({ state: "pending", version: view.reviewVersion });
      expect((await pool.query("select count(*)::int count from lead_identity_decisions")).rows[0].count).toBe(before.decisions);
      expect((await pool.query("select count(*)::int count from audit_events")).rows[0].count).toBe(before.audits);
      expect((await pool.query("select count(*)::int count from outbox_messages")).rows[0].count).toBe(before.events);
      const retry = await decideLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId, command: hold, idempotencyKey: key });
      expect(retry).toMatchObject({ outcome: "hold", replayed: false, reviewVersion: view.reviewVersion + 1 });
    }
  });

  it("rolls back every resolve write boundary and each required event insertion", async () => {
    const boundaries = [
      { table: "companies", when: "after insert", condition: "true" },
      { table: "contacts", when: "after insert", condition: "true" },
      { table: "lead_identity_decisions", when: "after insert", condition: "true" },
      { table: "leads", when: "before update", condition: "true" },
      { table: "lead_identity_reviews", when: "before update", condition: "true" },
      { table: "audit_events", when: "after insert", condition: "true" },
      ...["crm.inquiry.review_resolved.v1", "crm.company.created.v1", "crm.contact.created.v1", "crm.inquiry.linked.v1"]
        .map(topic => ({ table: "outbox_messages", when: "after insert", condition: `new.topic='${topic}'` })),
    ];
    for (const [index, boundary] of boundaries.entries()) {
      await pool.query("truncate users cascade");
      const f = await fixture(), email = `boundary-${index}@example.test`;
      await pool.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
        values($1,'Boundary Seed','boundary seed',$2,$2)`, [f.workspace.id, email]);
      const held = await submitLeadInquiryV1(pool, { actor: f.owner,
        command: command({ person: { displayName: "Boundary", email } }), idempotencyKey: randomUUID() });
      const view = await getIdentityReviewCandidatesV1(pool, f.owner, held.leadId);
      const before = Object.fromEntries(await Promise.all(["leads", "contacts", "companies", "lead_identity_decisions",
        "lead_identity_reviews", "audit_events", "outbox_messages"].map(async table => [table,
          (await pool.query(`select count(*)::int count from ${table}`)).rows[0].count])));
      const functionName = `fail_p1a_boundary_${index}`, triggerName = `fail_p1a_boundary_${index}`;
      await pool.query(`create function ${functionName}() returns trigger language plpgsql as $$ begin
        if ${boundary.condition} then raise exception 'injected ${boundary.table} boundary failure'; end if; return new; end $$`);
      await pool.query(`create trigger ${triggerName} ${boundary.when} on ${boundary.table} for each row execute function ${functionName}()`);
      try {
        await expect(decideLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId, idempotencyKey: randomUUID(), command: {
          contractVersion: "lead-identity-review-decision.v1", outcome: "resolve", expectedLeadVersion: view.leadVersion,
          expectedReviewVersion: view.reviewVersion, expectedIntakeVersion: view.intakeVersion,
          contact: { action: "create" }, company: { action: "create" } } })).rejects.toThrow("injected");
      } finally {
        await pool.query(`drop trigger ${triggerName} on ${boundary.table}`);
        await pool.query(`drop function ${functionName}()`);
      }
      for (const [table, count] of Object.entries(before))
        expect((await pool.query(`select count(*)::int count from ${table}`)).rows[0].count, `${boundary.table}:${table}`).toBe(count);
      expect((await pool.query("select state from lead_identity_reviews where id=$1", [view.reviewId])).rows[0].state).toBe("pending");
    }
  });

  it("emits the exact Audit/event set for all Contact and Company action permutations and replay", async () => {
    const actions = ["create", "link", "dismiss"] as const;
    for (const contactAction of actions) for (const companyAction of actions) {
      await pool.query("truncate users cascade");
      const f = await fixture(), email = `${contactAction}-${companyAction}@example.test`;
      const company = (await pool.query<{ id: string }>(
        `insert into companies(workspace_id,display_name,name_normalized) values($1,'North Labs','north labs') returning id`, [f.workspace.id])).rows[0];
      const contact = (await pool.query<{ id: string }>(
        `insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized,company_id)
         values($1,'Permutation','permutation',$2,$2,$3) returning id`, [f.workspace.id, email, company.id])).rows[0];
      const held = await submitLeadInquiryV1(pool, { actor: f.owner,
        command: command({ person: { displayName: "Permutation", email } }), idempotencyKey: randomUUID() });
      const view = await getIdentityReviewCandidatesV1(pool, f.owner, held.leadId);
      const contactCandidate = view.candidates.find(item => item.targetType === "contact" && item.targetId === contact.id)!;
      const companyCandidate = view.candidates.find(item => item.targetType === "company" && item.targetId === company.id)!;
      const dimension = (action: typeof actions[number], candidate: typeof contactCandidate) => action === "link"
        ? { action, candidateId: candidate.candidateId, targetId: candidate.targetId, expectedTargetVersion: candidate.targetVersion }
        : { action };
      const commandValue = { contractVersion: "lead-identity-review-decision.v1" as const, outcome: "resolve" as const,
        expectedLeadVersion: view.leadVersion, expectedReviewVersion: view.reviewVersion, expectedIntakeVersion: view.intakeVersion,
        contact: dimension(contactAction, contactCandidate), company: dimension(companyAction, companyCandidate) };
      const key = randomUUID();
      await decideLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId, command: commandValue, idempotencyKey: key });
      await decideLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId, command: commandValue, idempotencyKey: key });
      const topics = (await pool.query<{ topic: string }>(
        `select topic from outbox_messages where topic not in ('crm.inquiry.created.v1','crm.inquiry.review_required.v1') order by topic`)).rows.map(row => row.topic);
      const expected = ["crm.inquiry.review_resolved.v1"];
      if (contactAction === "create") expected.push("crm.contact.created.v1");
      if (companyAction === "create") expected.push("crm.company.created.v1");
      if (contactAction !== "dismiss" || companyAction !== "dismiss") expected.push("crm.inquiry.linked.v1");
      expect(topics).toEqual(expected.sort());
      expect((await pool.query("select count(*)::int count from audit_events where action='crm.inquiry_review_resolved'")).rows[0].count).toBe(1);
    }
  });

  it.each([
    ["(647) 389-4802", "+16473894802", "+1"],
    ["16473894802", "+16473894802", "+1"],
    ["+44 20 7946 0958", "+442079460958", "+44"],
  ] as const)("persists authoritative phone presentation %s and replays exactly once", async (display, canonical, callingCode) => {
    const f = await fixture(), key = randomUUID();
    const input = command({ person: { displayName: "Phone Only", phone: display, phoneCountryOverride: "CA" } });
    const first = await submitLeadInquiryV1(pool, { actor: f.owner, command: input, idempotencyKey: key });
    const replay = await submitLeadInquiryV1(pool, { actor: f.owner, command: input, idempotencyKey: key });
    expect(replay).toMatchObject({ leadId: first.leadId, replayed: true });
    expect((await pool.query(`select phone,phone_normalized,phone_country_code_used,normalization_version
      from leads where workspace_id=$1 and id=$2`, [f.workspace.id, first.leadId])).rows[0]).toEqual({
        phone: display, phone_normalized: canonical, phone_country_code_used: callingCode,
        normalization_version: "p1a-identity-v2",
      });
    expect((await pool.query("select count(*)::int count from lead_intakes")).rows[0].count).toBe(1);
    expect((await pool.query("select count(*)::int count from audit_events")).rows[0].count).toBe(1);
    expect((await pool.query("select count(*)::int count from outbox_messages")).rows[0].count).toBe(1);
  });

  it("conflicts the same key when phone display or effective national country input changes", async () => {
    const f = await fixture(), displayKey = randomUUID(), countryKey = randomUUID();
    await submitLeadInquiryV1(pool, { actor: f.owner, idempotencyKey: displayKey,
      command: command({ person: { displayName: "Phone Hash", phone: "6473894802", phoneCountryOverride: "CA" } }) });
    await expect(submitLeadInquiryV1(pool, { actor: f.owner, idempotencyKey: displayKey,
      command: command({ person: { displayName: "Phone Hash", phone: "(647) 389-4802", phoneCountryOverride: "CA" } }) }))
      .rejects.toMatchObject({ code: "idempotency_conflict" });
    await submitLeadInquiryV1(pool, { actor: f.owner, idempotencyKey: countryKey,
      command: command({ person: { displayName: "Country Hash", phone: "6473894802", phoneCountryOverride: "CA" } }) });
    await expect(submitLeadInquiryV1(pool, { actor: f.owner, idempotencyKey: countryKey,
      command: command({ person: { displayName: "Country Hash", phone: "6473894802", phoneCountryOverride: "US" } }) }))
      .rejects.toMatchObject({ code: "idempotency_conflict" });
  });

  it("gives absent and blank phone presentations the same replay hash when email is authoritative", async () => {
    const f = await fixture(), key = randomUUID(), email = `blank-${randomUUID()}@example.test`;
    const absent = command({ person: { displayName: "Email Only", email } });
    const blank = command({ person: { displayName: "Email Only", email, phone: "   ", phoneCountryOverride: "CA" } });
    const first = await submitLeadInquiryV1(pool, { actor: f.owner, command: absent, idempotencyKey: key });
    const replay = await submitLeadInquiryV1(pool, { actor: f.owner, command: blank, idempotencyKey: key });
    expect(replay).toMatchObject({ leadId: first.leadId, replayed: true });
    expect((await pool.query("select phone,phone_normalized,phone_country_code_used,normalization_version from leads where id=$1",
      [first.leadId])).rows[0]).toEqual({ phone: null, phone_normalized: null, phone_country_code_used: null,
      normalization_version: "p1a-identity-v2" });
  });

  it("hashes explicit international phone replay by derived country context and normalization version", async () => {
    const f = await fixture(), key = randomUUID();
    const ca = command({ person: { displayName: "International", phone: "+44 20 7946 0958", phoneCountryOverride: "CA" } });
    const us = command({ person: { displayName: "International", phone: "+44 20 7946 0958", phoneCountryOverride: "US" } });
    const first = await submitLeadInquiryV1(pool, { actor: f.owner, command: ca, idempotencyKey: key });
    const replay = await submitLeadInquiryV1(pool, { actor: f.owner, command: us, idempotencyKey: key });
    expect(replay).toMatchObject({ leadId: first.leadId, replayed: true });
    expect((await pool.query("select phone_country_code_used,normalization_version from leads where id=$1", [first.leadId])).rows[0])
      .toEqual({ phone_country_code_used: "+44", normalization_version: "p1a-identity-v2" });
  });

  it("returns strict nullable-safe canonical list/detail views with deterministic cursor and no read effects", async () => {
    const f = await fixture();
    const created = await submitLeadInquiryV1(pool, { actor: f.owner, idempotencyKey: randomUUID(), command: command({
      person: { displayName: "Display Authority", email: "display-authority@example.test" }, organization: undefined,
    }) });
    const before = { audit: (await pool.query("select count(*)::int count from audit_events")).rows[0].count,
      outbox: (await pool.query("select count(*)::int count from outbox_messages")).rows[0].count };
    const detail = await getLeadDetailV1(pool, f.owner, created.leadId);
    expect(detail).toMatchObject({ contractVersion: "getLeadDetail.v1", lead: { displayName: "Display Authority",
      structuredName: { firstName: null, lastName: null }, company: { companyId: null, displayName: null },
      assignment: { responsibleMembershipId: null, responsibleTeamId: null, isUnassigned: true },
      lifecycle: { code: "new" }, identityReviewStatus: "not_required", capabilities: { canView: true, canEdit: false },
      originalAttribution: { sourceCategory: "manual", intakeChannel: "manual" } } });
    expect(JSON.stringify(detail)).not.toContain("emailNormalized");
    expect(JSON.stringify(detail)).not.toContain("display-authority@example.test");
    const firstPage = await listLeadSummariesV1(pool, f.owner, { q: "display authority", limit: 1 });
    expect(firstPage.items.map(item => item.leadId)).toContain(created.leadId);
    expect(firstPage.items[0].contact.maskedEmail).toBe("d***@example.test");
    expect((await pool.query("select count(*)::int count from audit_events")).rows[0].count).toBe(before.audit);
    expect((await pool.query("select count(*)::int count from outbox_messages")).rows[0].count).toBe(before.outbox);
    await expect(getLeadDetailV1(pool, { ...f.member, workspaceId: randomUUID() }, created.leadId))
      .rejects.toMatchObject({ code: "resource_not_found" });
  });

  it.each(["6473894802 x123", "6473894802 ext 123", "6473894802#123", "6473894802,123",
    "26473894802", "64738", "++16473894802", "647+3894802", "CALL6473894802", "6473894802\u0000"])(
    "rejects invalid phone %j before any governing transaction mutation", async phone => {
      const f = await fixture();
      const before = await protectedStateDigest();
      const fields = phone === "26473894802" ? ["person.phone", "person.phoneCountryOverride"] : ["person.phone"];
      await expect(submitLeadInquiryV1(pool, { actor: f.owner,
        command: command({ person: { displayName: "Rejected Phone", phone, phoneCountryOverride: "CA" } }),
        idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "validation_failed", safe: { fields } });
      expect(await protectedStateDigest()).toEqual(before);
    });

  it("rejects absent email plus blank phone before creating any durable authority", async () => {
    const f = await fixture(), before = await protectedStateDigest();
    await expect(submitLeadInquiryV1(pool, { actor: f.owner, idempotencyKey: randomUUID(), command: command({
      person: { displayName: "No Identity", phone: "   ", phoneCountryOverride: "CA" },
    }) })).rejects.toMatchObject({ code: "validation_failed" });
    expect(await protectedStateDigest()).toEqual(before);
  });
});
