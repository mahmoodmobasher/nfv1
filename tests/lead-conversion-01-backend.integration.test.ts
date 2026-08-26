import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import {
  convertLeadToDealV1,
  getIdentityReviewCandidatesV1,
  getLeadConversionPreviewV1,
  resolveLeadIdentityReviewV1,
  submitLeadInquiryV1,
} from "../src/backend/modules/leads";
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
  await pool.query(
    `update leads set lifecycle_definition_id=(select id from lead_lifecycle_definitions where code='qualified')
     where workspace_id=$1 and id=$2`,
    [workspace.id, intake.leadId],
  );
  return { actor, leadId: intake.leadId, company };
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
});
