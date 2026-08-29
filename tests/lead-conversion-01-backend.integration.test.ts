import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import {
  convertLeadToDealV1,
  getIdentityReviewCandidatesV1,
  getLeadConversionPreviewV1,
  getLeadOutcomeReconciliationV1,
  resolveLeadIdentityReviewV1,
  submitLeadInquiryV1,
  transitionLeadLifecycleV1,
} from "../src/backend/modules/leads";
import { transitionDeal } from "../src/backend/modules/sales";
import type { TrustedActor } from "../src/backend/platform/authorization";

const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow",
});

async function fixture() {
  const user = (
    await pool.query<{ id: string }>(
      `insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)
       values($1,$1,'Conversion Owner','active',now()) returning id`,
      [`conversion-${randomUUID()}@test.local`],
    )
  ).rows[0];
  const workspace = (
    await pool.query<{ id: string }>(
      `insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
       values('Conversion',$1,'active','growth','monthly',$2) returning id`,
      [`conversion-${randomUUID()}`, user.id],
    )
  ).rows[0];
  const role = (
    await pool.query<{ id: string }>(
      `insert into roles(workspace_id,code,permissions,is_system)
       values($1,'owner','{}',true) returning id`,
      [workspace.id],
    )
  ).rows[0];
  const membership = (
    await pool.query<{ id: string }>(
      `insert into workspace_memberships(workspace_id,user_id,role_id,status)
       values($1,$2,$3,'active') returning id`,
      [workspace.id, user.id, role.id],
    )
  ).rows[0];
  const session = (
    await pool.query<{ id: string }>(
      `insert into sessions(user_id,session_hash,idle_expires_at,absolute_expires_at,auth_method)
       values($1,$2,now()+interval '1 hour',now()+interval '1 day','password') returning id`,
      [user.id, randomUUID()],
    )
  ).rows[0];
  const actor: TrustedActor = {
    userId: user.id,
    sessionId: session.id,
    workspaceId: workspace.id,
    membershipId: membership.id,
    role: "owner",
  };
  await pool.query(
    `insert into pipeline_stages(workspace_id,name,position,status)
     values($1,'New',0,'active')`,
    [workspace.id],
  );
  const company = (
    await pool.query<{ id: string }>(
      `insert into companies(workspace_id,display_name,name_normalized,normalization_version,status,visibility,
         governing_operation_id,created_by_membership_id,updated_by_membership_id,authority_contract_version)
       values($1,'North Labs','north labs','customer-graph-v1','active','workspace',$2,$3,$3,'customer-graph-v1') returning id`,
      [workspace.id, randomUUID(), membership.id],
    )
  ).rows[0];
  const pipeline = (
    await pool.query<{ id: string }>(
      `insert into sales_pipelines(workspace_id,code,label,is_default,governing_operation_id,created_by_membership_id,updated_by_membership_id)
       values($1,$2,'Sales',true,$3,$4,$4) returning id`,
      [
        workspace.id,
        `sales.pipeline_${randomUUID().slice(0, 8)}`,
        randomUUID(),
        membership.id,
      ],
    )
  ).rows[0];
  await pool.query(
    `insert into deal_stage_definitions(workspace_id,pipeline_id,code,label,outcome_class,sort_key,default_probability_bps,
       governing_operation_id,created_by_membership_id,updated_by_membership_id)
     values($1,$2,$3,'Discovery','open',1000,1500,$4,$5,$5)`,
    [
      workspace.id,
      pipeline.id,
      `sales.stage_${randomUUID().slice(0, 8)}`,
      randomUUID(),
      membership.id,
    ],
  );
  const intake = await submitLeadInquiryV1(pool, {
    actor,
    idempotencyKey: `intake-${randomUUID()}`,
    command: {
      contractVersion: "lead-inquiry-intake.v1",
      intakeChannel: "manual",
      person: {
        displayName: "Taylor North",
        email: `taylor-${randomUUID()}@example.test`,
      },
      organization: { name: "North Labs" },
      inquiry: { receivedAt: "2026-08-26T12:00:00.000Z" },
      source: {
        sourceCategory: "manual",
        sourceMedium: "unknown",
        sourceDetail: {},
        campaignContext: {},
        attributionContractVersion: "p1a-attribution-v1",
      },
      requestedAssignment: { responsibleMembershipId: membership.id },
    },
  });
  const review = await getIdentityReviewCandidatesV1(
    pool,
    actor,
    intake.leadId,
  );
  const companyCandidate = review.candidates.find(
    (candidate) => candidate.targetType === "company",
  )!;
  await resolveLeadIdentityReviewV1(pool, {
    actor,
    leadId: intake.leadId,
    idempotencyKey: `resolve-${randomUUID()}`,
    command: {
      contractVersion: "lead-identity-review-decision.v1",
      expectedLeadVersion: review.leadVersion,
      expectedReviewVersion: review.reviewVersion,
      expectedIntakeVersion: review.intakeVersion,
      outcome: "resolve",
      contact: { action: "dismiss" },
      company: {
        action: "link",
        candidateId: companyCandidate.candidateId,
        targetId: company.id,
        expectedTargetVersion: companyCandidate.targetVersion,
      },
    },
  });
  // Reach `qualified` through the real lifecycle rather than raw SQL. Before Phase 1
  // nothing could set it, which is why conversion was unreachable in production.
  const closingStages = (
    await pool.query<{ id: string; outcome_class: string }>(
      `insert into deal_stage_definitions(workspace_id,pipeline_id,code,label,outcome_class,sort_key,default_probability_bps,
         governing_operation_id,created_by_membership_id,updated_by_membership_id)
       values($1,$2,$3,'Won','won',9000,10000,$5,$6,$6),($1,$2,$4,'Lost','lost',9500,0,$5,$6,$6)
       returning id,outcome_class`,
      [workspace.id, pipeline.id, `sales.stage_${randomUUID().slice(0, 8)}`,
        `sales.stage_${randomUUID().slice(0, 8)}`, randomUUID(), membership.id],
    )
  ).rows;
  for (const target of ["working", "qualified"] as const) {
    const version = (await pool.query<{ version: number }>(
      "select version from leads where workspace_id=$1 and id=$2", [workspace.id, intake.leadId])).rows[0].version;
    await transitionLeadLifecycleV1(pool, { actor, leadId: intake.leadId, idempotencyKey: `lc-${randomUUID()}`,
      command: { contractVersion: "lead-lifecycle-transition.v1", expectedVersion: version,
        targetLifecycle: target, disqualificationReason: null, disqualificationNote: null } });
  }
  return { actor, leadId: intake.leadId, company, workspaceId: workspace.id,
    wonStageId: closingStages.find(stage => stage.outcome_class === "won")!.id,
    lostStageId: closingStages.find(stage => stage.outcome_class === "lost")!.id };
}

async function fixtureWithNewIdentity() {
  const user = (
    await pool.query<{ id: string }>(
      `insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)
       values($1,$1,'Conversion Owner','active',now()) returning id`,
      [`conversion-${randomUUID()}@test.local`],
    )
  ).rows[0];
  const workspace = (
    await pool.query<{ id: string }>(
      `insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
       values('Conversion',$1,'active','growth','monthly',$2) returning id`,
      [`conversion-${randomUUID()}`, user.id],
    )
  ).rows[0];
  const role = (
    await pool.query<{ id: string }>(
      `insert into roles(workspace_id,code,permissions,is_system)
       values($1,'owner','{}',true) returning id`,
      [workspace.id],
    )
  ).rows[0];
  const membership = (
    await pool.query<{ id: string }>(
      `insert into workspace_memberships(workspace_id,user_id,role_id,status)
       values($1,$2,$3,'active') returning id`,
      [workspace.id, user.id, role.id],
    )
  ).rows[0];
  const session = (
    await pool.query<{ id: string }>(
      `insert into sessions(user_id,session_hash,idle_expires_at,absolute_expires_at,auth_method)
       values($1,$2,now()+interval '1 hour',now()+interval '1 day','password') returning id`,
      [user.id, randomUUID()],
    )
  ).rows[0];
  const actor: TrustedActor = {
    userId: user.id,
    sessionId: session.id,
    workspaceId: workspace.id,
    membershipId: membership.id,
    role: "owner",
  };
  await pool.query(
    `insert into pipeline_stages(workspace_id,name,position,status)
     values($1,'New',0,'active')`,
    [workspace.id],
  );
  const pipeline = (
    await pool.query<{ id: string }>(
      `insert into sales_pipelines(workspace_id,code,label,is_default,governing_operation_id,created_by_membership_id,updated_by_membership_id)
       values($1,$2,'Sales',true,$3,$4,$4) returning id`,
      [
        workspace.id,
        `sales.pipeline_${randomUUID().slice(0, 8)}`,
        randomUUID(),
        membership.id,
      ],
    )
  ).rows[0];
  await pool.query(
    `insert into deal_stage_definitions(workspace_id,pipeline_id,code,label,outcome_class,sort_key,default_probability_bps,
       governing_operation_id,created_by_membership_id,updated_by_membership_id)
     values($1,$2,$3,'Discovery','open',1000,1500,$4,$5,$5)`,
    [
      workspace.id,
      pipeline.id,
      `sales.stage_${randomUUID().slice(0, 8)}`,
      randomUUID(),
      membership.id,
    ],
  );
  // No canonical Company or Contact is pre-made here: identity review must CREATE both,
  // the path that previously produced legacy-p1a-root-v1 records no conversion could ever use.
  // One legacy Contact is seeded only so a review actually opens (submit-lead-inquiry opens a
  // review only when at least one candidate exists); the decision below rejects it and creates new.
  const email = `jordan-${randomUUID()}@example.test`;
  await pool.query(
    `insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
     values($1,'Prior Jordan','prior jordan',$2,$2)`,
    [workspace.id, email],
  );
  const intake = await submitLeadInquiryV1(pool, {
    actor,
    idempotencyKey: `intake-${randomUUID()}`,
    command: {
      contractVersion: "lead-inquiry-intake.v1",
      intakeChannel: "manual",
      person: {
        displayName: "Jordan Vale",
        email,
      },
      organization: { name: "Vale Robotics" },
      inquiry: { receivedAt: "2026-08-26T12:00:00.000Z" },
      source: {
        sourceCategory: "manual",
        sourceMedium: "unknown",
        sourceDetail: {},
        campaignContext: {},
        attributionContractVersion: "p1a-attribution-v1",
      },
      requestedAssignment: { responsibleMembershipId: membership.id },
    },
  });
  const review = await getIdentityReviewCandidatesV1(
    pool,
    actor,
    intake.leadId,
  );
  await resolveLeadIdentityReviewV1(pool, {
    actor,
    leadId: intake.leadId,
    idempotencyKey: `resolve-${randomUUID()}`,
    command: {
      contractVersion: "lead-identity-review-decision.v1",
      expectedLeadVersion: review.leadVersion,
      expectedReviewVersion: review.reviewVersion,
      expectedIntakeVersion: review.intakeVersion,
      outcome: "resolve",
      contact: { action: "create" },
      company: { action: "create" },
    },
  });
  for (const target of ["working", "qualified"] as const) {
    const version = (await pool.query<{ version: number }>(
      "select version from leads where workspace_id=$1 and id=$2", [workspace.id, intake.leadId])).rows[0].version;
    await transitionLeadLifecycleV1(pool, { actor, leadId: intake.leadId, idempotencyKey: `lc-${randomUUID()}`,
      command: { contractVersion: "lead-lifecycle-transition.v1", expectedVersion: version,
        targetLifecycle: target, disqualificationReason: null, disqualificationNote: null } });
  }
  return { actor, leadId: intake.leadId, workspaceId: workspace.id };
}

async function command(f: Awaited<ReturnType<typeof fixture>>) {
  const preview = await getLeadConversionPreviewV1(pool, f.actor, f.leadId);
  expect(preview).toMatchObject({
    eligible: true,
    capabilities: { canConvert: true },
  });
  return {
    contractVersion: "lead-convert-to-deal.v1" as const,
    expectedLeadVersion: preview.lead.version,
    intakeId: preview.lead.intakeId,
    expectedIntakeVersion: preview.lead.intakeVersion,
    review: preview.lead.review!,
    company: {
      companyId: preview.choices.companies[0].companyId,
      expectedVersion: preview.choices.companies[0].version,
    },
    primaryContact: null,
    pipeline: {
      pipelineId: preview.pipeline!.pipelineId,
      expectedVersion: preview.pipeline!.version,
      expectedConfigurationVersion: preview.pipeline!.configurationVersion,
      stageId: preview.pipeline!.initialStage.stageId,
      expectedStageVersion: preview.pipeline!.initialStage.version,
    },
    deal: {
      name: "North Labs opportunity",
      value: null,
      expectedCloseOn: null,
    },
    assignment: preview.assignment,
  };
}

suite("LEAD-CONVERSION-01 backend", () => {
  beforeAll(() => pool.query("select 1"));
  beforeEach(() => pool.query("truncate users cascade"));
  afterAll(() => pool.end());

  it("commits the complete conversion atomically and replays without duplicate evidence", async () => {
    const f = await fixture();
    const input = await command(f);
    const key = `convert-${randomUUID()}`;
    const first = await convertLeadToDealV1(pool, {
      actor: f.actor,
      leadId: f.leadId,
      command: input,
      idempotencyKey: key,
    });
    const replay = await convertLeadToDealV1(pool, {
      actor: f.actor,
      leadId: f.leadId,
      command: input,
      idempotencyKey: key,
    });
    expect(first).toMatchObject({ committed: true, replayed: false });
    expect(replay).toMatchObject({ committed: true, replayed: true });
    const state = (
      await pool.query(
        `select l.status,d.code lifecycle,
          (select count(*)::int from deals where workspace_id=l.workspace_id) deals,
          (select count(*)::int from lead_deal_conversion_lineage where workspace_id=l.workspace_id and lead_record_id=l.id) lineage,
          (select count(*)::int from audit_events where workspace_id=l.workspace_id and target_id=l.id and action='crm.lead_converted') audits,
          (select count(*)::int from outbox_messages where workspace_id=l.workspace_id and operation_id=(select governing_operation_id from lead_deal_conversion_lineage where lead_record_id=l.id)) events,
          (select count(*)::int from idempotency_records where operation='lead-convert-to-deal.v1' and idempotency_key=$2) receipts
         from leads l join lead_lifecycle_definitions d on d.id=l.lifecycle_definition_id
         where l.workspace_id=$1 and l.id=$3`,
        [f.actor.workspaceId, key, f.leadId],
      )
    ).rows[0];
    expect(state).toEqual({
      status: "open",
      lifecycle: "converted",
      deals: 1,
      lineage: 1,
      audits: 1,
      events: 2,
      receipts: 1,
    });
    const evidence = JSON.stringify(
      (
        await pool.query(
          `select metadata value from audit_events where target_id=$1
           union all select payload from outbox_messages where operation_id=(select governing_operation_id from lead_deal_conversion_lineage where lead_record_id=$1)`,
          [f.leadId],
        )
      ).rows,
    );
    expect(evidence).not.toContain("North Labs opportunity");
    expect(evidence).not.toContain("North Labs");
  });

  it("rolls back Lead, Deal, lineage and evidence together on a late failure", async () => {
    const f = await fixture();
    const input = await command(f);
    await expect(
      convertLeadToDealV1(pool, {
        actor: f.actor,
        leadId: f.leadId,
        command: input,
        idempotencyKey: `rollback-${randomUUID()}`,
        beforeEvidence: async () => {
          throw new Error("controlled_failure");
        },
      }),
    ).rejects.toThrow("controlled_failure");
    expect(
      (
        await pool.query(
          `select d.code lifecycle,(select count(*)::int from deals where workspace_id=l.workspace_id) deals,
             (select count(*)::int from lead_deal_conversion_lineage where workspace_id=l.workspace_id) lineage
           from leads l join lead_lifecycle_definitions d on d.id=l.lifecycle_definition_id where l.id=$1`,
          [f.leadId],
        )
      ).rows[0],
    ).toEqual({ lifecycle: "qualified", deals: 0, lineage: 0 });
  });

  it("allows only one concurrent conversion for a Lead", async () => {
    const f = await fixture();
    const input = await command(f);
    const settled = await Promise.allSettled(
      [0, 1].map(() =>
        convertLeadToDealV1(pool, {
          actor: f.actor,
          leadId: f.leadId,
          command: input,
          idempotencyKey: `race-${randomUUID()}`,
        }),
      ),
    );
    expect(settled.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(settled.find((item) => item.status === "rejected")).toMatchObject({
      reason: { code: "already_converted" },
    });
  });

  it("maps responsible Membership loss after preview to stale preview", async () => {
    const f = await fixture();
    const user = (
      await pool.query<{ id: string }>(
        `insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)
         values($1,$1,'Assignee','active',now()) returning id`,
        [`assignee-${randomUUID()}@test.local`],
      )
    ).rows[0];
    const role = (
      await pool.query<{ id: string }>(
        `insert into roles(workspace_id,code,permissions,is_system)
         values($1,'member','{}',true) returning id`,
        [f.actor.workspaceId],
      )
    ).rows[0];
    const assignee = (
      await pool.query<{ id: string }>(
        `insert into workspace_memberships(workspace_id,user_id,role_id,status)
         values($1,$2,$3,'active') returning id`,
        [f.actor.workspaceId, user.id, role.id],
      )
    ).rows[0];
    await pool.query(
      `update leads set owner_membership_id=$3 where workspace_id=$1 and id=$2`,
      [f.actor.workspaceId, f.leadId, assignee.id],
    );
    const input = await command(f);
    await pool.query(
      `update workspace_memberships set status='suspended' where workspace_id=$1 and id=$2`,
      [f.actor.workspaceId, assignee.id],
    );
    await expect(
      convertLeadToDealV1(pool, {
        actor: f.actor,
        leadId: f.leadId,
        command: input,
        idempotencyKey: `assignment-loss-${randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: "stale_preview", status: 409 });
    expect(
      (
        await pool.query<{ deals: number }>(
          `select count(*)::int deals from deals where workspace_id=$1`,
          [f.actor.workspaceId],
        )
      ).rows[0].deals,
    ).toBe(0);
  });

  it("does not release a stored Deal result after actor revocation", async () => {
    const f = await fixture();
    const input = await command(f);
    const key = `revoked-replay-${randomUUID()}`;
    await convertLeadToDealV1(pool, {
      actor: f.actor,
      leadId: f.leadId,
      command: input,
      idempotencyKey: key,
    });
    await pool.query(`update sessions set revoked_at=now() where id=$1`, [
      f.actor.sessionId,
    ]);
    await expect(
      convertLeadToDealV1(pool, {
        actor: f.actor,
        leadId: f.leadId,
        command: input,
        idempotencyKey: key,
      }),
    ).rejects.toMatchObject({ code: "resource_not_found", status: 404 });
    const evidence = (
      await pool.query<{ audits: number; events: number; receipts: number }>(
        `select
          (select count(*)::int from audit_events where workspace_id=$1 and action='crm.lead_converted') audits,
          (select count(*)::int from outbox_messages where workspace_id=$1 and topic in ('crm.lead.converted.v1','sales.deal.created.v1')) events,
          (select count(*)::int from idempotency_records where operation='lead-convert-to-deal.v1' and idempotency_key=$2) receipts`,
        [f.actor.workspaceId, key],
      )
    ).rows[0];
    expect(evidence).toEqual({ audits: 1, events: 2, receipts: 1 });
  });

  // ---- Phase 3: the Deal outcome settles the Lead outcome -------------------

  // Conversion refuses a Lead whose status is already terminal (`legacy_status_terminal`),
  // so a manual outcome override can only happen AFTER the Deal exists. These are kept
  // separate so tests can put the override in the right place.
  async function convertLead(f: Awaited<ReturnType<typeof fixture>>) {
    const result = await convertLeadToDealV1(pool, { actor: f.actor, leadId: f.leadId,
      command: await command(f), idempotencyKey: `convert-${randomUUID()}` });
    const deal = (await pool.query<{ id: string; version: number }>(
      `select deal.id,deal.version from deals deal
         join lead_deal_conversion_lineage lineage on lineage.workspace_id=deal.workspace_id and lineage.deal_id=deal.id
        where lineage.workspace_id=$1 and lineage.lead_record_id=$2`,
      [f.workspaceId, f.leadId])).rows[0];
    return { result, deal };
  }

  async function closeDeal(f: Awaited<ReturnType<typeof fixture>>,
    deal: { id: string; version: number }, stageId: string) {
    await transitionDeal(pool, { actor: f.actor, dealId: deal.id, key: `deal-${randomUUID()}`, requestId: randomUUID(),
      command: { contractVersion: "sales-deal-stage-transition.v1", expectedVersion: deal.version,
        targetStageId: stageId, lostReasonCode: stageId === f.lostStageId ? ("budget" as const) : null } });
  }

  async function convertThenClose(f: Awaited<ReturnType<typeof fixture>>, stageId: string) {
    const { result, deal } = await convertLead(f);
    await closeDeal(f, deal, stageId);
    return { result, dealId: deal.id };
  }

  const leadOutcome = async (leadId: string) => (await pool.query<{ status: string; status_source: string }>(
    "select status,status_source from leads where id=$1", [leadId])).rows[0];

  it("reaches conversion through the real lifecycle and marks the Lead converted", async () => {
    const f = await fixture();
    const result = await convertLeadToDealV1(pool, { actor: f.actor, leadId: f.leadId,
      command: await command(f), idempotencyKey: `convert-${randomUUID()}` });
    expect(result).toMatchObject({ committed: true });
    expect((await pool.query<{ lifecycle: string }>(
      `select definition.code lifecycle from leads lead
         join lead_lifecycle_definitions definition on definition.id=lead.lifecycle_definition_id
        where lead.id=$1`, [f.leadId])).rows[0].lifecycle).toBe("converted");
  });

  it("settles the Lead as won when its Deal is won", async () => {
    const f = await fixture();
    await convertThenClose(f, f.wonStageId);
    expect(await leadOutcome(f.leadId)).toMatchObject({ status: "won", status_source: "system" });
  });

  it("settles the Lead as lost when its only Deal is lost", async () => {
    const f = await fixture();
    await convertThenClose(f, f.lostStageId);
    expect(await leadOutcome(f.leadId)).toMatchObject({ status: "lost", status_source: "system" });
  });

  it("never downgrades a Lead that already produced a won Deal", async () => {
    const f = await fixture();
    const { dealId } = await convertThenClose(f, f.wonStageId);
    // A second Deal on the same Lead, closed lost, must not undo the win.
    // Re-closing is refused (terminal Deal), and the won outcome stands.
    const closed = (await pool.query<{ version: number }>(
      "select version from deals where id=$1", [dealId])).rows[0];
    await expect(transitionDeal(pool, { actor: f.actor, dealId, key: `deal-${randomUUID()}`, requestId: randomUUID(),
      command: { contractVersion: "sales-deal-stage-transition.v1", expectedVersion: closed.version,
        targetStageId: f.lostStageId, lostReasonCode: "budget" } }))
      .rejects.toMatchObject({ code: "terminal_deal" });
    expect(await leadOutcome(f.leadId)).toMatchObject({ status: "won", status_source: "system" });
  });

  it("never overwrites a manual outcome", async () => {
    const f = await fixture();
    const { deal } = await convertLead(f);
    // An Owner records the real-world result by hand, then the Deal closes the other way.
    await pool.query("update leads set status='won',status_source='manual' where id=$1", [f.leadId]);
    await closeDeal(f, deal, f.lostStageId);
    expect(await leadOutcome(f.leadId)).toMatchObject({ status: "won", status_source: "manual" });
  });

  it("reports a manual outcome that disagrees with its Deals, to Owner and Admin only", async () => {
    const f = await fixture();
    await convertThenClose(f, f.lostStageId);
    const clean = await getLeadOutcomeReconciliationV1(pool, f.actor);
    expect(clean.items).toEqual([]);
    await pool.query("update leads set status='won',status_source='manual' where id=$1", [f.leadId]);
    const drifted = await getLeadOutcomeReconciliationV1(pool, f.actor);
    expect(drifted.items).toHaveLength(1);
    expect(drifted.items[0]).toMatchObject({ leadId: f.leadId, leadStatus: "won", statusSource: "manual",
      disagreement: "won_without_a_won_deal", deals: { won: 0, lost: 1, open: 0 } });
    const memberRole = (await pool.query<{ id: string }>(
      `insert into roles(workspace_id,code,permissions,is_system) values($1,'member','{}',true)
       on conflict do nothing returning id`, [f.workspaceId])).rows[0]
      ?? (await pool.query<{ id: string }>("select id from roles where workspace_id=$1 and code='member'", [f.workspaceId])).rows[0];
    await pool.query("update workspace_memberships set role_id=$2 where id=$1", [f.actor.membershipId, memberRole.id]);
    await expect(getLeadOutcomeReconciliationV1(pool, f.actor))
      .rejects.toMatchObject({ code: "permission_required", status: 403 });
  });

  it("makes a brand-new identity-review Contact and Company primary-eligible for conversion", async () => {
    const f = await fixtureWithNewIdentity();
    const preview = await getLeadConversionPreviewV1(pool, f.actor, f.leadId);
    expect(preview.eligible).toBe(true);
    expect(preview.ineligibilityReasons).toEqual([]);
    expect(preview.choices.companies).toHaveLength(1);
    expect(preview.choices.primaryContacts).toHaveLength(1);
    expect(preview.choices.primaryContacts[0]).toMatchObject({ primaryEligible: true });
    const input = {
      contractVersion: "lead-convert-to-deal.v1" as const,
      expectedLeadVersion: preview.lead.version,
      intakeId: preview.lead.intakeId,
      expectedIntakeVersion: preview.lead.intakeVersion,
      review: preview.lead.review!,
      company: {
        companyId: preview.choices.companies[0].companyId,
        expectedVersion: preview.choices.companies[0].version,
      },
      primaryContact: {
        contactId: preview.choices.primaryContacts[0].contactId,
        expectedVersion: preview.choices.primaryContacts[0].version,
      },
      pipeline: {
        pipelineId: preview.pipeline!.pipelineId,
        expectedVersion: preview.pipeline!.version,
        expectedConfigurationVersion: preview.pipeline!.configurationVersion,
        stageId: preview.pipeline!.initialStage.stageId,
        expectedStageVersion: preview.pipeline!.initialStage.version,
      },
      deal: { name: "Vale Robotics opportunity", value: null, expectedCloseOn: null },
      assignment: preview.assignment,
    };
    const result = await convertLeadToDealV1(pool, {
      actor: f.actor,
      leadId: f.leadId,
      command: input,
      idempotencyKey: `convert-${randomUUID()}`,
    });
    expect(result).toMatchObject({ committed: true, replayed: false });
  });
});
