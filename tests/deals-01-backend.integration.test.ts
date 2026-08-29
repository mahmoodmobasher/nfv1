import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import {
  createDeal as createDealService,
  getSalesPipeline,
  listDeals,
  salesPipelineViewV1Schema,
  transitionDeal,
} from "../src/backend/modules/sales";
import { createSession } from "../src/server/security/session";
import { getServerEnv } from "../src/server/env";

const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow",
});
const env = getServerEnv();

async function actorFixture(
  roleCode: "owner" | "member" = "owner",
  workspaceId?: string,
) {
  const user = (
    await pool.query<{ id: string }>(
      `insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)
       values($1,$1,'Sales actor','active',now()) returning id`,
      [`sales-${randomUUID()}@test.local`],
    )
  ).rows[0];
  const workspace = workspaceId
    ? { id: workspaceId }
    : (
        await pool.query<{ id: string }>(
          `insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
           values('Sales',$1,'active','growth','monthly',$2) returning id`,
          [`sales-${randomUUID()}`, user.id],
        )
      ).rows[0];
  const role = (
    await pool.query<{ id: string }>(
      `insert into roles(workspace_id,code,permissions,is_system) values($1,$2,'{}',true)
       on conflict(workspace_id,code) do update set code=excluded.code returning id`,
      [workspace.id, roleCode],
    )
  ).rows[0];
  const membership = (
    await pool.query<{ id: string }>(
      `insert into workspace_memberships(workspace_id,user_id,role_id,status)
       values($1,$2,$3,'active') returning id`,
      [workspace.id, user.id, role.id],
    )
  ).rows[0];
  const session = await createSession(pool, {
    userId: user.id,
    securityVersion: 1,
    secret: env.SESSION_SECRET,
    idleMinutes: 30,
    absoluteHours: 24,
  });
  return {
    userId: user.id,
    sessionId: session.id,
    workspaceId: workspace.id,
    membershipId: membership.id,
    role: roleCode,
  } as const;
}

async function fixture() {
  const actor = await actorFixture();
  const operationId = randomUUID();
  const company = (
    await pool.query<{ id: string }>(
      `insert into companies(workspace_id,display_name,name_normalized,normalization_version,status,visibility,governing_operation_id,created_by_membership_id,updated_by_membership_id,authority_contract_version)
       values($1,'Acme secret','acme secret','customer-graph-v1','active','workspace',$2,$3,$3,'customer-graph-v1') returning id`,
      [actor.workspaceId, operationId, actor.membershipId],
    )
  ).rows[0];
  const pipeline = (
    await pool.query<{ id: string }>(
      `insert into sales_pipelines(workspace_id,code,label,is_default,governing_operation_id,created_by_membership_id,updated_by_membership_id)
       values($1,$2,'Sales',true,$3,$4,$4) returning id`,
      [
        actor.workspaceId,
        `sales.pipeline_${randomUUID().slice(0, 8)}`,
        randomUUID(),
        actor.membershipId,
      ],
    )
  ).rows[0];
  const stages: Array<{ id: string; outcome: "open" | "won" | "lost" }> = [];
  for (const [index, outcome] of (
    ["open", "open", "won", "lost"] as const
  ).entries()) {
    stages.push(
      (
        await pool.query<{ id: string; outcome: "open" | "won" | "lost" }>(
          `insert into deal_stage_definitions(workspace_id,pipeline_id,code,label,outcome_class,sort_key,default_probability_bps,governing_operation_id,created_by_membership_id,updated_by_membership_id)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) returning id,outcome_class outcome`,
          [
            actor.workspaceId,
            pipeline.id,
            `sales.stage_${index}_${randomUUID().slice(0, 6)}`,
            `Stage ${index}`,
            outcome,
            (index + 1) * 1000,
            outcome === "won" ? 10000 : outcome === "lost" ? 0 : index * 2000,
            randomUUID(),
            actor.membershipId,
          ],
        )
      ).rows[0],
    );
  }
  return { actor, company, pipeline, stages };
}

function command(f: Awaited<ReturnType<typeof fixture>>) {
  return {
    contractVersion: "sales-deal-create.v1" as const,
    pipelineId: f.pipeline.id,
    stageId: f.stages[0].id,
    name: "Private expansion",
    value: {
      amountMinor: "123456",
      currencyCode: "USD" as const,
      currencyExponent: 2 as const,
    },
    expectedCloseOn: "2027-01-30",
    parties: { companyId: f.company.id, contacts: [] },
    responsibleMembershipId: f.actor.membershipId,
    responsibleTeamId: null,
    visibility: "workspace" as const,
    visibleTeamIds: [],
  };
}

suite("DEALS-01 backend", () => {
  beforeAll(() => pool.query("select 1"));
  beforeEach(() => pool.query("truncate users cascade"));
  afterAll(() => pool.end());

  it("commits Deal, party, transition, Audit, Outbox and receipt atomically without PII evidence", async () => {
    const f = await fixture(),
      key = `create-${randomUUID()}`;
    const result = await createDealService(pool, {
      actor: f.actor,
      command: command(f),
      key,
      requestId: randomUUID(),
    });
    expect(result).toMatchObject({
      changed: true,
      version: 1,
      replayed: false,
    });
    const state = (
      await pool.query(
        `select d.amount_minor::text "amountMinor",
          (select count(*)::int from deal_party_refs where workspace_id=d.workspace_id and deal_id=d.id and lifecycle='active') parties,
          (select count(*)::int from deal_stage_transitions where workspace_id=d.workspace_id and deal_id=d.id) transitions,
          (select count(*)::int from audit_events where workspace_id=d.workspace_id and target_id=d.id and action='sales.deal_created') audits,
          (select count(*)::int from outbox_messages where workspace_id=d.workspace_id and aggregate_id=d.id and topic='sales.deal.created.v1') outbox,
          (select count(*)::int from idempotency_records where operation='sales-deal-create.v1' and idempotency_key=$2) receipts
         from deals d where d.workspace_id=$1 and d.id=$3`,
        [f.actor.workspaceId, key, result.dealId],
      )
    ).rows[0];
    expect(state).toMatchObject({
      amountMinor: "123456",
      parties: 1,
      transitions: 1,
      audits: 1,
      outbox: 1,
      receipts: 1,
    });
    const evidence = JSON.stringify(
      (
        await pool.query(
          `select metadata from audit_events where target_id=$1 union all select payload from outbox_messages where aggregate_id=$1`,
          [result.dealId],
        )
      ).rows,
    );
    expect(evidence).not.toContain("Private expansion");
    expect(evidence).not.toContain("Acme secret");
  });

  it("persists and replays same-stage no-effect without false transition evidence", async () => {
    const f = await fixture();
    const created = await createDealService(pool, {
      actor: f.actor,
      command: command(f),
      key: `create-${randomUUID()}`,
      requestId: randomUUID(),
    });
    const key = `same-${randomUUID()}`,
      transition = {
        contractVersion: "sales-deal-stage-transition.v1" as const,
        expectedVersion: 1,
        targetStageId: f.stages[0].id,
        lostReasonCode: null,
      };
    await expect(
      transitionDeal(pool, {
        actor: f.actor,
        dealId: created.dealId,
        command: transition,
        key,
        requestId: randomUUID(),
      }),
    ).resolves.toMatchObject({ changed: false, version: 1, replayed: false });
    await expect(
      transitionDeal(pool, {
        actor: f.actor,
        dealId: created.dealId,
        command: transition,
        key,
        requestId: randomUUID(),
      }),
    ).resolves.toMatchObject({ changed: false, version: 1, replayed: true });
    const evidence = (
      await pool.query(
        `select (select count(*)::int from deal_stage_transitions where deal_id=$1) transitions,(select count(*)::int from audit_events where target_id=$1 and action='sales.deal_stage_transitioned') audits,(select count(*)::int from outbox_messages where aggregate_id=$1 and topic='sales.deal.stage_transitioned.v1') outbox`,
        [created.dealId],
      )
    ).rows[0];
    expect(evidence).toEqual({ transitions: 1, audits: 0, outbox: 0 });
  });

  it("serializes concurrent expectedVersion transitions", async () => {
    const f = await fixture();
    const created = await createDealService(pool, {
      actor: f.actor,
      command: command(f),
      key: `create-${randomUUID()}`,
      requestId: randomUUID(),
    });
    const attempts = await Promise.allSettled(
      [f.stages[1], f.stages[2]].map((stage) =>
        transitionDeal(pool, {
          actor: f.actor,
          dealId: created.dealId,
          command: {
            contractVersion: "sales-deal-stage-transition.v1",
            expectedVersion: 1,
            targetStageId: stage.id,
            lostReasonCode: null,
          },
          key: `move-${randomUUID()}`,
          requestId: randomUUID(),
        }),
      ),
    );
    expect(
      attempts.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts
        .filter((result) => result.status === "rejected")
        .map((result) => (result as PromiseRejectedResult).reason.code),
    ).toEqual(["stale_version"]);
  });

  it("binds transition receipts to the URL Deal identity", async () => {
    const f = await fixture(),
      key = `scoped-${randomUUID()}`;
    const first = await createDealService(pool, {
      actor: f.actor,
      command: command(f),
      key: `create-${randomUUID()}`,
      requestId: randomUUID(),
    });
    const second = await createDealService(pool, {
      actor: f.actor,
      command: { ...command(f), name: "Second private Deal" },
      key: `create-${randomUUID()}`,
      requestId: randomUUID(),
    });
    const transition = {
      contractVersion: "sales-deal-stage-transition.v1" as const,
      expectedVersion: 1,
      targetStageId: f.stages[1].id,
      lostReasonCode: null,
    };
    await transitionDeal(pool, {
      actor: f.actor,
      dealId: first.dealId,
      command: transition,
      key,
      requestId: randomUUID(),
    });
    await expect(
      transitionDeal(pool, {
        actor: f.actor,
        dealId: second.dealId,
        command: transition,
        key,
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "idempotency_conflict", status: 409 });
    await expect(
      pool.query(`select version from deals where id=$1`, [second.dealId]),
    ).resolves.toMatchObject({ rows: [{ version: 1 }] });
  });

  it("does not release a stored transition outcome after responsibility and visibility revocation", async () => {
    const f = await fixture(),
      member = await actorFixture("member", f.actor.workspaceId),
      key = `revoked-${randomUUID()}`;
    const created = await createDealService(pool, {
      actor: f.actor,
      command: { ...command(f), responsibleMembershipId: member.membershipId },
      key: `create-${randomUUID()}`,
      requestId: randomUUID(),
    });
    const transition = {
      contractVersion: "sales-deal-stage-transition.v1" as const,
      expectedVersion: 1,
      targetStageId: f.stages[1].id,
      lostReasonCode: null,
    };
    await expect(
      transitionDeal(pool, {
        actor: member,
        dealId: created.dealId,
        command: transition,
        key,
        requestId: randomUUID(),
      }),
    ).resolves.toMatchObject({ changed: true, replayed: false });
    await pool.query(
      `update deals set responsible_membership_id=$3,visibility='teams',version=version+1,updated_at=now() where workspace_id=$1 and id=$2`,
      [f.actor.workspaceId, created.dealId, f.actor.membershipId],
    );
    await expect(
      transitionDeal(pool, {
        actor: member,
        dealId: created.dealId,
        command: transition,
        key,
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "resource_not_found", status: 404 });
  });

  it("fails the selected page when a Deal becomes hidden before final serialization", async () => {
    const f = await fixture(),
      member = await actorFixture("member", f.actor.workspaceId);
    const created = await createDealService(pool, {
      actor: f.actor,
      command: command(f),
      key: `create-${randomUUID()}`,
      requestId: randomUUID(),
    });
    await expect(
      listDeals(
        pool,
        member,
        { lifecycle: "active", limit: 25 },
        randomUUID(),
        async () => {
          await pool.query(
            `update deals set visibility='teams',version=version+1,updated_at=now() where workspace_id=$1 and id=$2`,
            [f.actor.workspaceId, created.dealId],
          );
        },
      ),
    ).rejects.toMatchObject({ code: "resource_not_found", status: 404 });
  });

  it("returns a pipeline view whose stages actually satisfy the published contract", async () => {
    const f = await fixture();
    const view = await getSalesPipeline(pool, f.actor, randomUUID());
    expect(() => salesPipelineViewV1Schema.parse(view)).not.toThrow();
    expect(view.pipeline?.stages[0]).toMatchObject({
      pipelineId: f.pipeline.id,
    });
  });
});
