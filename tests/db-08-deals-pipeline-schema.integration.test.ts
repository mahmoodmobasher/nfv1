import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const connectionString = process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow";
const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString });

type Actor = {
  userId: string;
  workspaceId: string;
  membershipId: string;
  teamId: string;
};

type Pipeline = {
  pipelineId: string;
  stages: Record<string, { id: string; outcome: "open" | "won" | "lost"; probability: number }>;
};

async function actorFixture(db: Pool | PoolClient = pool): Promise<Actor> {
  const userId = (await db.query<{ id: string }>(
    "insert into users(display_name,status) values('DB-08A Owner','active') returning id",
  )).rows[0].id;
  const workspaceId = (await db.query<{ id: string }>(
    `insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
     values('DB-08A Workspace',$1,'active','growth','monthly',$2) returning id`,
    [`db08a-${randomUUID()}`, userId],
  )).rows[0].id;
  const roleId = (await db.query<{ id: string }>(
    "insert into roles(workspace_id,code) values($1,'owner') returning id", [workspaceId],
  )).rows[0].id;
  const membershipId = (await db.query<{ id: string }>(
    `insert into workspace_memberships(workspace_id,user_id,role_id,status)
     values($1,$2,$3,'active') returning id`, [workspaceId, userId, roleId],
  )).rows[0].id;
  const teamId = (await db.query<{ id: string }>(
    `insert into teams(workspace_id,name,name_normalized,status,created_by_membership_id)
     values($1,'Sales','sales','active',$2) returning id`, [workspaceId, membershipId],
  )).rows[0].id;
  return { userId, workspaceId, membershipId, teamId };
}

async function pipelineFixture(db: Pool | PoolClient, actor: Actor): Promise<Pipeline> {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const pipelineId = (await db.query<{ id: string }>(
    `insert into sales_pipelines(workspace_id,code,label,is_default,governing_operation_id,
      created_by_membership_id,updated_by_membership_id)
     values($1,$2,'Sales',true,$3,$4,$4) returning id`,
    [actor.workspaceId, `sales.pipeline_${suffix}`, randomUUID(), actor.membershipId],
  )).rows[0].id;
  const template = [
    ["sales.qualification", "Qualification", "open", 1000],
    ["sales.discovery", "Discovery", "open", 2500],
    ["sales.proposal", "Proposal", "open", 5000],
    ["sales.negotiation", "Negotiation", "open", 7500],
    ["sales.closed_won", "Closed won", "won", 10000],
    ["sales.closed_lost", "Closed lost", "lost", 0],
  ] as const;
  const stages: Pipeline["stages"] = {};
  for (const [index, [code, label, outcome, probability]] of template.entries()) {
    const row = (await db.query<{ id: string }>(
      `insert into deal_stage_definitions(workspace_id,pipeline_id,code,label,outcome_class,sort_key,
        default_probability_bps,governing_operation_id,created_by_membership_id,updated_by_membership_id)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) returning id`,
      [actor.workspaceId, pipelineId, code, label, outcome, (index + 1) * 1000, probability,
        randomUUID(), actor.membershipId],
    )).rows[0];
    stages[code] = { id: row.id, outcome, probability };
  }
  return { pipelineId, stages };
}

async function createDeal(db: Pool | PoolClient, actor: Actor, pipeline: Pipeline, input?: {
  stageCode?: string;
  amountMinor?: string | null;
  currencyCode?: string | null;
  currencyExponent?: number | null;
  visibility?: "workspace" | "teams";
}) {
  const stage = pipeline.stages[input?.stageCode ?? "sales.qualification"];
  const terminal = stage.outcome !== "open";
  return (await db.query<{ id: string }>(
    `insert into deals(workspace_id,pipeline_id,stage_id,outcome_class,name,amount_minor,currency_code,
      currency_exponent,probability_bps,expected_close_on,stage_entered_at,closed_at,lost_reason_code,
      responsible_membership_id,responsible_team_id,visibility,governing_operation_id,
      created_by_membership_id,updated_by_membership_id)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,date '2026-12-31',now(),$10,$11,$12,$13,$14,$15,$16,$16)
     returning id`,
    [actor.workspaceId, pipeline.pipelineId, stage.id, stage.outcome, `Deal ${randomUUID()}`,
      input && "amountMinor" in input ? input.amountMinor : null,
      input && "currencyCode" in input ? input.currencyCode : null,
      input && "currencyExponent" in input ? input.currencyExponent : null,
      stage.probability, terminal ? new Date() : null, stage.outcome === "lost" ? "other" : null,
      actor.membershipId, actor.teamId, input?.visibility ?? "workspace", randomUUID(), actor.membershipId],
  )).rows[0].id;
}

function flattenPlan(node: { "Node Type": string; "Index Name"?: string; Plans?: Array<unknown> }): string[] {
  return [...(node["Index Name"] ? [node["Index Name"]] : []),
    ...(node.Plans ?? []).flatMap((child) => flattenPlan(child as typeof node))];
}

async function traverse100<T extends { id: string }>(
  fetchPage: (cursor: T | null) => Promise<T[]>,
  tieValue?: (row: T) => string,
) {
  const seen = new Set<string>();
  const rows: T[] = [];
  let cursor: T | null = null;
  let terminalPageSeen = false;
  let tieCrossedPageBoundary = false;
  for (;;) {
    const page = await fetchPage(cursor);
    if (page.length === 0) {
      terminalPageSeen = true;
      break;
    }
    expect(page.length).toBeGreaterThan(0);
    expect(page.length).toBeLessThanOrEqual(17);
    if (tieValue && cursor && tieValue(cursor) === tieValue(page[0])) tieCrossedPageBoundary = true;
    for (const row of page) {
      expect(seen.has(row.id)).toBe(false);
      seen.add(row.id);
      rows.push(row);
    }
    cursor = page.at(-1)!;
  }
  expect(terminalPageSeen).toBe(true);
  expect(rows).toHaveLength(100);
  expect(seen.size).toBe(100);
  if (tieValue) {
    expect(new Set(rows.map(tieValue)).size).toBeLessThan(100);
    expect(tieCrossedPageBoundary).toBe(true);
  }
  return rows;
}

suite("DB-08A dormant Deals/Pipeline persistence", () => {
  beforeAll(async () => { await pool.query("select 1"); });
  beforeEach(async () => { await pool.query("truncate users cascade"); });
  afterAll(async () => { await pool.end(); });

  it("installs exactly seven empty Sales-owned tables and four narrow triggers", async () => {
    const expectedTables = ["deal_party_refs", "deal_stage_definitions", "deal_stage_transitions",
      "deal_visible_teams", "deals", "lead_deal_conversion_lineage", "sales_pipelines"];
    const tables = (await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema='public' and table_name=any($1)
       order by table_name`, [expectedTables],
    )).rows.map((row) => row.table_name);
    expect(tables).toEqual(expectedTables);
    expect((await pool.query(`select count(*)::int count from sales_pipelines`)).rows[0].count).toBe(0);
    const triggers = (await pool.query<{ tgname: string; table_name: string }>(
      `select t.tgname,c.relname table_name from pg_trigger t join pg_class c on c.oid=t.tgrelid
       where not t.tgisinternal and t.tgname=any($1) order by t.tgname`, [[
        "sales_pipeline_code_immutable_v1", "deal_stage_identity_immutable_v1",
        "deal_stage_transition_insert_only_v1", "lead_deal_conversion_lineage_insert_only_v1",
      ]],
    )).rows;
    expect(triggers).toEqual([
      { tgname: "deal_stage_identity_immutable_v1", table_name: "deal_stage_definitions" },
      { tgname: "deal_stage_transition_insert_only_v1", table_name: "deal_stage_transitions" },
      { tgname: "lead_deal_conversion_lineage_insert_only_v1", table_name: "lead_deal_conversion_lineage" },
      { tgname: "sales_pipeline_code_immutable_v1", table_name: "sales_pipelines" },
    ]);
  });

  it("enforces Workspace-qualified NO ACTION retention without cross-owner target foreign keys", async () => {
    const salesTables = ["sales_pipelines", "deal_stage_definitions", "deals", "deal_party_refs",
      "deal_visible_teams", "deal_stage_transitions", "lead_deal_conversion_lineage"];
    const foreignKeys = (await pool.query<{ table_name: string; target: string; delete_action: string; update_action: string }>(
      `select source.relname table_name,target.relname target,c.confdeltype::text delete_action,
       c.confupdtype::text update_action
       from pg_constraint c join pg_class source on source.oid=c.conrelid
       join pg_class target on target.oid=c.confrelid
       where c.contype='f' and source.relname=any($1) order by source.relname,c.conname`, [salesTables],
    )).rows;
    expect(foreignKeys.length).toBeGreaterThan(0);
    for (const row of foreignKeys) {
      expect(row).toMatchObject({ delete_action: "a", update_action: "a" });
      expect(row.target).not.toMatch(/^(leads|contacts|companies)$/);
    }
    const actor = await actorFixture(), pipeline = await pipelineFixture(pool, actor);
    const dealId = await createDeal(pool, actor, pipeline);
    const opaqueCompanyId = randomUUID();
    await pool.query(
      `insert into deal_party_refs(workspace_id,deal_id,role_code,record_type,record_id,
       governing_operation_id,created_by_membership_id)
       values($1,$2,'customer_company','crm.company',$3,$4,$5)`,
      [actor.workspaceId, dealId, opaqueCompanyId, randomUUID(), actor.membershipId],
    );
    expect((await pool.query("select record_id from deal_party_refs where deal_id=$1", [dealId])).rows[0].record_id)
      .toBe(opaqueCompanyId);
    await expect(pool.query("delete from deals where id=$1", [dealId])).rejects.toMatchObject({ code: "23503" });
  });

  it("enforces money, outcome/stage agreement, probability, archive and controlled-loss tuples", async () => {
    const actor = await actorFixture(), pipeline = await pipelineFixture(pool, actor);
    await createDeal(pool, actor, pipeline, { amountMinor: "0", currencyCode: "USD", currencyExponent: 2 });
    await createDeal(pool, actor, pipeline, { amountMinor: "99999999999999999999", currencyCode: "CAD", currencyExponent: 2 });
    await expect(createDeal(pool, actor, pipeline, { amountMinor: "1", currencyCode: "EUR", currencyExponent: 2 }))
      .rejects.toMatchObject({ code: "23514" });
    await expect(createDeal(pool, actor, pipeline, { amountMinor: "1", currencyCode: null, currencyExponent: null }))
      .rejects.toMatchObject({ code: "23514" });
    const open = pipeline.stages["sales.qualification"];
    await expect(pool.query(
      `insert into deals(workspace_id,pipeline_id,stage_id,outcome_class,name,probability_bps,stage_entered_at,closed_at,
       responsible_membership_id,visibility,governing_operation_id,created_by_membership_id,updated_by_membership_id)
       values($1,$2,$3,'won','Mismatch',10000,now(),now(),$4,'workspace',$5,$4,$4)`,
      [actor.workspaceId, pipeline.pipelineId, open.id, actor.membershipId, randomUUID()],
    )).rejects.toMatchObject({ code: "23503" });
    const lostDeal = await createDeal(pool, actor, pipeline, { stageCode: "sales.closed_lost" });
    await expect(pool.query("update deals set lost_reason_code=null where id=$1", [lostDeal]))
      .rejects.toMatchObject({ code: "23514" });
    await expect(pool.query("update deals set lifecycle='archived' where id=$1", [lostDeal]))
      .rejects.toMatchObject({ code: "23514" });
  });

  it("enforces immutable codes/outcome and insert-only transition/lineage evidence", async () => {
    const actor = await actorFixture(), pipeline = await pipelineFixture(pool, actor);
    await expect(pool.query("update sales_pipelines set code='sales.changed' where id=$1", [pipeline.pipelineId]))
      .rejects.toMatchObject({ code: "P0001" });
    const qualification = pipeline.stages["sales.qualification"];
    await expect(pool.query("update deal_stage_definitions set outcome_class='won' where id=$1", [qualification.id]))
      .rejects.toMatchObject({ code: "P0001" });
    await pool.query("update deal_stage_definitions set label='Qualify',version=2 where id=$1", [qualification.id]);
    const dealId = await createDeal(pool, actor, pipeline);
    const transitionId = (await pool.query<{ id: string }>(
      `insert into deal_stage_transitions(workspace_id,deal_id,to_pipeline_id,to_stage_id,to_outcome_class,
       result_deal_version,changed_by_membership_id,governing_operation_id,occurred_at)
       values($1,$2,$3,$4,'open',1,$5,$6,now()) returning id`,
      [actor.workspaceId, dealId, pipeline.pipelineId, qualification.id, actor.membershipId, randomUUID()],
    )).rows[0].id;
    await expect(pool.query("update deal_stage_transitions set occurred_at=now() where id=$1", [transitionId]))
      .rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query("delete from deal_stage_transitions where id=$1", [transitionId]))
      .rejects.toMatchObject({ code: "P0001" });
    const lineageId = (await pool.query<{ id: string }>(
      `insert into lead_deal_conversion_lineage(workspace_id,lead_record_id,deal_id,source_lead_version,
       result_lead_version,result_deal_version,governing_operation_id,converted_by_membership_id,converted_at)
       values($1,$2,$3,1,2,1,$4,$5,now()) returning id`,
      [actor.workspaceId, randomUUID(), dealId, randomUUID(), actor.membershipId],
    )).rows[0].id;
    await expect(pool.query("delete from lead_deal_conversion_lineage where id=$1", [lineageId]))
      .rejects.toMatchObject({ code: "P0001" });
  });

  it("enforces bounded party and visible-Team slots while leaving complete-set semantics to services", async () => {
    const actor = await actorFixture(), pipeline = await pipelineFixture(pool, actor);
    const dealId = await createDeal(pool, actor, pipeline, { visibility: "teams" });
    expect(Number((await pool.query("select count(*) from deal_party_refs where deal_id=$1", [dealId])).rows[0].count)).toBe(0);
    expect(Number((await pool.query("select count(*) from deal_visible_teams where deal_id=$1", [dealId])).rows[0].count)).toBe(0);
    await pool.query(
      `insert into deal_party_refs(workspace_id,deal_id,role_code,record_type,record_id,contact_slot,is_primary,
       governing_operation_id,created_by_membership_id)
       values($1,$2,'buying_contact','crm.contact',$3,1,true,$4,$5)`,
      [actor.workspaceId, dealId, randomUUID(), randomUUID(), actor.membershipId],
    );
    await expect(pool.query(
      `insert into deal_party_refs(workspace_id,deal_id,role_code,record_type,record_id,contact_slot,
       governing_operation_id,created_by_membership_id)
       values($1,$2,'buying_contact','crm.contact',$3,1,$4,$5)`,
      [actor.workspaceId, dealId, randomUUID(), randomUUID(), actor.membershipId],
    )).rejects.toMatchObject({ code: "23505" });
    await expect(pool.query(
      `insert into deal_party_refs(workspace_id,deal_id,role_code,record_type,record_id,contact_slot,
       governing_operation_id,created_by_membership_id)
       values($1,$2,'buying_contact','crm.contact',$3,21,$4,$5)`,
      [actor.workspaceId, dealId, randomUUID(), randomUUID(), actor.membershipId],
    )).rejects.toMatchObject({ code: "23514" });
    await pool.query(
      `insert into deal_visible_teams(workspace_id,deal_id,team_id,visible_team_slot,created_by_membership_id)
       values($1,$2,$3,1,$4)`, [actor.workspaceId, dealId, actor.teamId, actor.membershipId],
    );
    const secondTeam = (await pool.query<{ id: string }>(
      `insert into teams(workspace_id,name,name_normalized,status,created_by_membership_id)
       values($1,'Sales 2','sales 2','active',$2) returning id`, [actor.workspaceId, actor.membershipId],
    )).rows[0].id;
    await expect(pool.query(
      `insert into deal_visible_teams(workspace_id,deal_id,team_id,visible_team_slot,created_by_membership_id)
       values($1,$2,$3,1,$4)`, [actor.workspaceId, dealId, secondTeam, actor.membershipId],
    )).rejects.toMatchObject({ code: "23505" });
  });

  it("serializes competing default, party and conversion identities with database uniqueness", async () => {
    const actor = await actorFixture(), pipeline = await pipelineFixture(pool, actor);
    await pool.query("update sales_pipelines set is_default=false where id=$1", [pipeline.pipelineId]);
    const secondPipeline = async () => pool.query(
      `insert into sales_pipelines(workspace_id,code,label,is_default,governing_operation_id,
       created_by_membership_id,updated_by_membership_id)
       values($1,$2,'Other',true,$3,$4,$4)`,
      [actor.workspaceId, `sales.other_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
        randomUUID(), actor.membershipId],
    );
    const defaultRace = await Promise.allSettled([secondPipeline(), secondPipeline()]);
    expect(defaultRace.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(defaultRace.filter((result) => result.status === "rejected")).toHaveLength(1);
    const assertUniqueRace = async (attempts: Array<Promise<unknown>>, cardinalitySql: string, dealId: string) => {
      const results = await Promise.allSettled(attempts);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toMatchObject({ code: "23505" });
      expect(Number((await pool.query(cardinalitySql, [dealId])).rows[0].count)).toBe(1);
    };
    const companyDeal = await createDeal(pool, actor, pipeline);
    const companyAttempt = () => pool.query(
      `insert into deal_party_refs(workspace_id,deal_id,role_code,record_type,record_id,
       governing_operation_id,created_by_membership_id)
       values($1,$2,'customer_company','crm.company',$3,$4,$5)`,
      [actor.workspaceId, companyDeal, randomUUID(), randomUUID(), actor.membershipId],
    );
    await assertUniqueRace([companyAttempt(), companyAttempt()],
      "select count(*) from deal_party_refs where deal_id=$1 and lifecycle='active' and role_code='customer_company'",
      companyDeal);

    const slotDeal = await createDeal(pool, actor, pipeline);
    const slotAttempt = () => pool.query(
      `insert into deal_party_refs(workspace_id,deal_id,role_code,record_type,record_id,contact_slot,
       governing_operation_id,created_by_membership_id)
       values($1,$2,'buying_contact','crm.contact',$3,1,$4,$5)`,
      [actor.workspaceId, slotDeal, randomUUID(), randomUUID(), actor.membershipId],
    );
    await assertUniqueRace([slotAttempt(), slotAttempt()],
      "select count(*) from deal_party_refs where deal_id=$1 and lifecycle='active' and contact_slot=1",
      slotDeal);

    const primaryDeal = await createDeal(pool, actor, pipeline);
    const primaryAttempt = (slot: number) => pool.query(
      `insert into deal_party_refs(workspace_id,deal_id,role_code,record_type,record_id,contact_slot,is_primary,
       governing_operation_id,created_by_membership_id)
       values($1,$2,'buying_contact','crm.contact',$3,$4,true,$5,$6)`,
      [actor.workspaceId, primaryDeal, randomUUID(), slot, randomUUID(), actor.membershipId],
    );
    await assertUniqueRace([primaryAttempt(1), primaryAttempt(2)],
      "select count(*) from deal_party_refs where deal_id=$1 and lifecycle='active' and is_primary",
      primaryDeal);

    const dealA = await createDeal(pool, actor, pipeline), dealB = await createDeal(pool, actor, pipeline);
    const leadId = randomUUID(), operationA = randomUUID(), operationB = randomUUID();
    const lineage = (dealId: string, operationId: string) => pool.query(
      `insert into lead_deal_conversion_lineage(workspace_id,lead_record_id,deal_id,source_lead_version,
       result_lead_version,result_deal_version,governing_operation_id,converted_by_membership_id,converted_at)
       values($1,$2,$3,1,2,1,$4,$5,now())`,
      [actor.workspaceId, leadId, dealId, operationId, actor.membershipId],
    );
    const race = await Promise.allSettled([lineage(dealA, operationA), lineage(dealB, operationB)]);
    expect(race.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(race.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("rolls back a late Workspace failure without partial Deal evidence", async () => {
    const actor = await actorFixture(), foreign = await actorFixture(), pipeline = await pipelineFixture(pool, actor);
    const client = await pool.connect();
    const dealId = randomUUID();
    try {
      await client.query("begin");
      const stage = pipeline.stages["sales.qualification"];
      await client.query(
        `insert into deals(id,workspace_id,pipeline_id,stage_id,outcome_class,name,probability_bps,
         stage_entered_at,responsible_membership_id,visibility,governing_operation_id,
         created_by_membership_id,updated_by_membership_id)
         values($1,$2,$3,$4,'open','Rollback',1000,now(),$5,'workspace',$6,$5,$5)`,
        [dealId, actor.workspaceId, pipeline.pipelineId, stage.id, actor.membershipId, randomUUID()],
      );
      await client.query(
        `insert into deal_party_refs(workspace_id,deal_id,role_code,record_type,record_id,
         governing_operation_id,created_by_membership_id)
         values($1,$2,'customer_company','crm.company',$3,$4,$5)`,
        [actor.workspaceId, dealId, randomUUID(), randomUUID(), actor.membershipId],
      );
      await client.query(
        `insert into deal_visible_teams(workspace_id,deal_id,team_id,visible_team_slot,created_by_membership_id)
         values($1,$2,$3,1,$4)`, [actor.workspaceId, dealId, foreign.teamId, actor.membershipId],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      expect(error).toMatchObject({ code: "23503" });
    } finally { client.release(); }
    expect(Number((await pool.query("select count(*) from deals where id=$1", [dealId])).rows[0].count)).toBe(0);
    expect(Number((await pool.query("select count(*) from deal_party_refs where deal_id=$1", [dealId])).rows[0].count)).toBe(0);
  });

  it("traverses deterministic 100-row keysets and proves frozen indexes fit each access path", async () => {
    const actor = await actorFixture(), pipeline = await pipelineFixture(pool, actor);
    const stage = pipeline.stages["sales.qualification"], companyRef = randomUUID();
    const historyDealId = "d8000000-0000-4000-8000-000000000001";
    const fixtureClient = await pool.connect();
    try {
      await fixtureClient.query("begin");
      await fixtureClient.query(
        `insert into deals(id,workspace_id,pipeline_id,stage_id,outcome_class,name,probability_bps,
         expected_close_on,stage_entered_at,responsible_membership_id,responsible_team_id,visibility,
         governing_operation_id,created_by_membership_id,updated_by_membership_id,created_at,updated_at)
         select ('d8000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,$1,$2,$3,'open','Deal '||g,1000,
         date '2026-01-01'+(g/10),timestamptz '2026-01-01'+((g/10)::text||' seconds')::interval,$4,$5,'workspace',
         ('d8100000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,$4,$4,
         timestamptz '2026-01-01',timestamptz '2026-01-01'+((g/10)::text||' seconds')::interval
         from generate_series(1,100) g`, [actor.workspaceId, pipeline.pipelineId, stage.id,
          actor.membershipId, actor.teamId],
      );
      await fixtureClient.query(
        `insert into deal_party_refs(id,workspace_id,deal_id,role_code,record_type,record_id,
         governing_operation_id,created_by_membership_id)
         select ('d8200000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,$1,
         ('d8000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'customer_company','crm.company',$2,
         ('d8300000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,$3 from generate_series(1,100) g`,
        [actor.workspaceId, companyRef, actor.membershipId],
      );
      await fixtureClient.query(
        `insert into deal_stage_transitions(id,workspace_id,deal_id,to_pipeline_id,to_stage_id,to_outcome_class,
         result_deal_version,changed_by_membership_id,governing_operation_id,occurred_at)
         select ('d8400000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,$1,
         'd8000000-0000-4000-8000-000000000001'::uuid,$2,$3,'open',g,$4,
         ('d8500000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,
         timestamptz '2026-01-01'+((g/10)::text||' seconds')::interval from generate_series(1,100) g`,
        [actor.workspaceId, pipeline.pipelineId, stage.id, actor.membershipId],
      );
      await fixtureClient.query("commit");
    } catch (error) {
      await fixtureClient.query("rollback");
      throw error;
    } finally {
      fixtureClient.release();
    }
    await pool.query("analyze deals,deal_party_refs,deal_stage_transitions");

    type TimestampCursor = { id: string; sort_at: Date };
    type DateCursor = { id: string; sort_on: string };
    await traverse100<TimestampCursor>(async (cursor) => (await pool.query<TimestampCursor>(
      `select id,updated_at sort_at from deals where workspace_id=$1 and lifecycle='active'
       and ($2::timestamptz is null or (updated_at,id)<($2,$3::uuid))
       order by updated_at desc nulls last,id desc nulls last limit 17`,
      [actor.workspaceId, cursor?.sort_at ?? null, cursor?.id ?? null])).rows,
    (row) => row.sort_at.toISOString());
    await traverse100<TimestampCursor>(async (cursor) => (await pool.query<TimestampCursor>(
      `select id,stage_entered_at sort_at from deals
       where workspace_id=$1 and pipeline_id=$2 and stage_id=$3 and lifecycle='active'
       and ($4::timestamptz is null or (stage_entered_at,id)>($4,$5::uuid))
       order by stage_entered_at,id limit 17`,
      [actor.workspaceId, pipeline.pipelineId, stage.id, cursor?.sort_at ?? null, cursor?.id ?? null])).rows,
    (row) => row.sort_at.toISOString());
    await traverse100<{ id: string }>(async (cursor) => (await pool.query<{ id: string }>(
      `select deal_id id from deal_party_refs
       where workspace_id=$1 and record_type='crm.company' and record_id=$2 and lifecycle='active'
       and ($3::uuid is null or deal_id>$3) order by deal_id limit 17`,
      [actor.workspaceId, companyRef, cursor?.id ?? null])).rows);
    await traverse100<TimestampCursor>(async (cursor) => (await pool.query<TimestampCursor>(
      `select id,occurred_at sort_at from deal_stage_transitions
       where workspace_id=$1 and deal_id=$2
       and ($3::timestamptz is null or (occurred_at,id)<($3,$4::uuid))
       order by occurred_at desc nulls last,id desc nulls last limit 17`,
      [actor.workspaceId, historyDealId, cursor?.sort_at ?? null, cursor?.id ?? null])).rows,
    (row) => row.sort_at.toISOString());
    for (const [column, value] of [
      ["responsible_membership_id", actor.membershipId],
      ["responsible_team_id", actor.teamId],
    ] as const) {
      await traverse100<TimestampCursor>(async (cursor) => (await pool.query<TimestampCursor>(
        `select id,updated_at sort_at from deals where workspace_id=$1 and ${column}=$2 and lifecycle='active'
         and ($3::timestamptz is null or (updated_at,id)<($3,$4::uuid))
         order by updated_at desc nulls last,id desc nulls last limit 17`,
        [actor.workspaceId, value, cursor?.sort_at ?? null, cursor?.id ?? null])).rows,
      (row) => row.sort_at.toISOString());
    }
    await traverse100<DateCursor>(async (cursor) => (await pool.query<DateCursor>(
      `select id,expected_close_on::text sort_on from deals
       where workspace_id=$1 and lifecycle='active' and outcome_class='open'
       and expected_close_on is not null and expected_close_on<date '2027-01-01'
       and ($2::date is null or (expected_close_on,id)>($2,$3::uuid))
       order by expected_close_on,id limit 17`,
      [actor.workspaceId, cursor?.sort_on ?? null, cursor?.id ?? null])).rows,
    (row) => row.sort_on);

    const planClient = await pool.connect();
    try {
      await planClient.query("begin");
      await planClient.query("set local enable_seqscan=off");
      await planClient.query("set local enable_sort=off");
      const plans = [] as string[];
      for (const [sql, params] of [
        [`select id from deals where workspace_id=$1 and lifecycle='active' order by updated_at desc nulls last,id desc nulls last limit 51`, [actor.workspaceId]],
        [`select id from deals where workspace_id=$1 and pipeline_id=$2 and stage_id=$3 and lifecycle='active' order by stage_entered_at,id limit 51`, [actor.workspaceId, pipeline.pipelineId, stage.id]],
        [`select deal_id from deal_party_refs where workspace_id=$1 and record_type='crm.company' and record_id=$2 and lifecycle='active' order by deal_id limit 51`, [actor.workspaceId, companyRef]],
        [`select id from deal_stage_transitions where workspace_id=$1 and deal_id=$2 order by occurred_at desc nulls last,id desc nulls last limit 51`, [actor.workspaceId, historyDealId]],
        [`select id from deals where workspace_id=$1 and responsible_membership_id=$2 and lifecycle='active' order by updated_at desc nulls last,id desc nulls last limit 51`, [actor.workspaceId, actor.membershipId]],
        [`select id from deals where workspace_id=$1 and responsible_team_id=$2 and lifecycle='active' order by updated_at desc nulls last,id desc nulls last limit 51`, [actor.workspaceId, actor.teamId]],
        [`select id from deals where workspace_id=$1 and lifecycle='active' and outcome_class='open' and expected_close_on is not null and expected_close_on<date '2027-01-01' order by expected_close_on,id limit 51`, [actor.workspaceId]],
      ] as Array<[string, unknown[]]>) {
        const root = (await planClient.query(`explain (format json) ${sql}`, params)).rows[0]["QUERY PLAN"][0];
        plans.push(...flattenPlan(root.Plan));
      }
      expect(plans).toContain("deals_default_list_idx");
      expect(plans).toContain("deals_board_stage_idx");
      expect(plans).toContain("deal_party_refs_active_record_uq");
      expect(plans).toContain("deal_stage_transitions_timeline_idx");
      expect(plans).toContain("deals_responsible_membership_idx");
      expect(plans).toContain("deals_responsible_team_idx");
      expect(plans).toContain("deals_overdue_candidates_idx");
      const reverseLookupDefinition = (await planClient.query<{ indexdef: string }>(
        `select indexdef from pg_indexes where schemaname='public' and indexname='deal_party_refs_reverse_lookup_idx'`,
      )).rows[0].indexdef.toLowerCase();
      expect(reverseLookupDefinition).toContain("(workspace_id, record_type, record_id, lifecycle, deal_id)");
      await planClient.query("commit");
      console.info("DB_08A_BOUNDED_PLAN_EVIDENCE", JSON.stringify({
        rowsPerStream: 100,
        streams: 7,
        plannerIndexes: plans,
        catalogFit: ["deal_party_refs_reverse_lookup_idx"],
      }));
    } catch (error) {
      await planClient.query("rollback");
      throw error;
    } finally {
      planClient.release();
    }
  });

  it("keeps opaque references and immutable evidence free of copied authority or payload columns", async () => {
    const columns = (await pool.query<{ table_name: string; column_name: string }>(
      `select table_name,column_name from information_schema.columns where table_schema='public'
       and table_name=any($1) order by table_name,column_name`, [[
        "deal_party_refs", "deal_stage_transitions", "lead_deal_conversion_lineage",
      ]],
    )).rows;
    const forbidden = columns.filter((row) => /(^|_)(name|label|email|phone|affiliation|description|narrative|payload|authorization|amount)(_|$)/.test(row.column_name));
    expect(forbidden).toEqual([]);
  });
});
