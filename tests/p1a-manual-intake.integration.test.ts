import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { submitLeadInquiryV1, resolveLeadIdentityReviewV1 } from "../src/backend/modules/leads";
import { getIdentityReviewCandidatesV1 } from "../src/backend/modules/identity-review";
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

suite("P1A manual intake modular transaction", () => {
  beforeAll(async () => { await pool.query("select 1"); });
  beforeEach(async () => { await pool.query("truncate users cascade"); });
  afterAll(async () => { await pool.end(); });

  it("creates one Lead with one Audit/event and replays the stored result", async () => {
    const f = await fixture(), key = randomUUID(), input = command();
    const first = await submitLeadInquiryV1(pool, { actor: f.owner, command: input, idempotencyKey: key });
    const replay = await submitLeadInquiryV1(pool, { actor: f.owner, command: input, idempotencyKey: key });
    expect(first).toMatchObject({ disposition: "created", replayed: false, candidateSummary: { strong: 0, supplementary: 0, probable: 0 } });
    expect(replay).toMatchObject({ leadId: first.leadId, intakeId: first.intakeId, disposition: "replayed", replayed: true, requestId: first.requestId });
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
    expect(view.candidates[0]).toMatchObject({ targetType: "contact", email, evidenceStrength: "strong" });
    await expect(getIdentityReviewCandidatesV1(pool, f.member, held.leadId)).rejects.toMatchObject({ code: "resource_not_found" });
    expect((await pool.query("select count(*)::int count from audit_events where action='crm.inquiry_held_for_review'")).rows[0].count).toBe(1);
    expect((await pool.query("select count(*)::int count from outbox_messages where topic like 'crm.inquiry.%'")).rows[0].count).toBe(2);
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
    const result = await resolveLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId, command: decision, idempotencyKey: key });
    const replay = await resolveLeadIdentityReviewV1(pool, { actor: f.owner, leadId: held.leadId, command: decision, idempotencyKey: key });
    expect(result).toMatchObject({ contactId: contact.id, companyId: company.id, leadVersion: 2, reviewVersion: 2, replayed: false });
    expect(replay).toMatchObject({ contactId: contact.id, companyId: company.id, replayed: true, requestId: result.requestId });
    expect((await pool.query("select state from lead_identity_reviews where id=$1", [view.reviewId])).rows[0].state).toBe("resolved");
    expect((await pool.query("select count(*)::int count from audit_events where action='crm.inquiry_review_resolved'")).rows[0].count).toBe(1);
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
      contractVersion: "lead-identity-review-decision.v1", expectedLeadVersion: 1, expectedReviewVersion: 1, expectedIntakeVersion: 2,
      outcome: "resolve", contact: { action: "link", candidateId: candidate.candidateId, targetId: candidate.targetId,
        expectedTargetVersion: candidate.targetVersion }, company: { action: "dismiss" } } })).rejects.toMatchObject({ code: "permission_required" });
    const resolved = await resolveLeadIdentityReviewV1(pool, { actor: f.member, leadId: held.leadId, idempotencyKey: randomUUID(), command: {
      contractVersion: "lead-identity-review-decision.v1", expectedLeadVersion: 1, expectedReviewVersion: 1, expectedIntakeVersion: 2,
      outcome: "resolve", contact: { action: "create" }, company: { action: "create" } } });
    expect(resolved.contactId).toBeTruthy();expect(resolved.companyId).toBeTruthy();
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
});
