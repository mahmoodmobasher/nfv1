import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const connectionString = process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow";
const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString });

async function actorFixture(db = pool) {
  const user = (await db.query<{ id: string }>(
    "insert into users(display_name,status) values('Customization Owner','active') returning id",
  )).rows[0];
  const workspace = (await db.query<{ id: string }>(
    `insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
     values('Customization Workspace',$1,'active','essentials','monthly',$2) returning id`,
    [`customization-${randomUUID()}`, user.id],
  )).rows[0];
  const role = (await db.query<{ id: string }>(
    "insert into roles(workspace_id,code) values($1,'owner') returning id", [workspace.id],
  )).rows[0];
  const membership = (await db.query<{ id: string }>(
    "insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active') returning id",
    [workspace.id, user.id, role.id],
  )).rows[0];
  return { userId: user.id, workspaceId: workspace.id, membershipId: membership.id };
}

async function createDefinition(db: PoolClient | Pool, actor: Awaited<ReturnType<typeof actorFixture>>, input?: {
  fieldType?: string; code?: string; lifecycle?: "draft" | "active"; flags?: string;
}) {
  const definitionId = randomUUID(), operationId = randomUUID();
  const fieldType = input?.fieldType ?? "short_text";
  const code = input?.code ?? `field_${definitionId.replaceAll("-", "").slice(0, 12)}`;
  const row = (await db.query<{ id: string }>(
    `insert into custom_field_definitions(id,workspace_id,target_record_type,code,label,field_type,display_order,
      governing_operation_id,created_by_membership_id,updated_by_membership_id ${input?.flags ? `,${input.flags}` : ""})
     values($1,$2,'crm.lead',$3,'Custom field',$4,$5,$6,$7,$7 ${input?.flags ? ",true" : ""}) returning id`,
    [definitionId, actor.workspaceId, code, fieldType, Math.floor(Math.random() * 9000), operationId, actor.membershipId],
  )).rows[0];
  if (input?.lifecycle === "active") await db.query(
    `update custom_field_definitions set lifecycle='active',version=2,governing_operation_id=$2,
      updated_by_membership_id=$3,updated_at=now() where id=$1`, [row.id, randomUUID(), actor.membershipId],
  );
  return row.id;
}

async function createOption(db: PoolClient | Pool, actor: Awaited<ReturnType<typeof actorFixture>>, definitionId: string) {
  return (await db.query<{ id: string }>(
    `insert into custom_field_options(workspace_id,definition_id,code,label,display_order,governing_operation_id,
      created_by_membership_id,updated_by_membership_id) values($1,$2,$3,'Option',0,$4,$5,$5) returning id`,
    [actor.workspaceId, definitionId, `option_${randomUUID().replaceAll("-", "").slice(0, 12)}`, randomUUID(), actor.membershipId],
  )).rows[0].id;
}

async function createList(db: PoolClient, actor: Awaited<ReturnType<typeof actorFixture>>, ast: unknown,
  sort: { source: "system" | "custom"; field?: string; definitionId?: string } = { source: "system", field: "updated_at" }) {
  const listId = randomUUID(), operationId = randomUUID();
  await db.query("begin");
  try {
    await db.query(
      `insert into saved_lists(id,workspace_id,target_record_type,name,owner_membership_id,governing_operation_id,
        created_by_membership_id,updated_by_membership_id) values($1,$2,'crm.lead','My list',$3,$4,$3,$3)`,
      [listId, actor.workspaceId, actor.membershipId, operationId],
    );
    await db.query(
      `insert into saved_list_versions(workspace_id,list_id,definition_version,filter_ast,filter_ast_hash,
        sort_source,sort_field_code,sort_definition_id,governing_operation_id,created_by_membership_id)
       values($1,$2,1,$3,$4,$5,$6,$7,$8,$9)`,
      [actor.workspaceId, listId, JSON.stringify(ast), "a".repeat(64), sort.source,
        sort.source === "system" ? sort.field : null, sort.source === "custom" ? sort.definitionId : null,
        operationId, actor.membershipId],
    );
    await db.query("commit");
    return listId;
  } catch (error) { await db.query("rollback"); throw error; }
}

suite("DB-04 Customization persistence", () => {
  beforeAll(async () => { await pool.query("select 1"); });
  beforeEach(async () => { await pool.query("truncate users cascade"); });
  afterAll(async () => { await pool.end(); });

  it("installs exactly eight dormant owner tables without target foreign keys", async () => {
    const tables = (await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema='public' and table_name = any($1) order by table_name`,
      [["custom_field_definitions", "custom_field_options", "custom_field_values", "custom_field_value_options",
        "customization_tags", "record_tag_assignments", "saved_lists", "saved_list_versions"]],
    )).rows.map((row) => row.table_name);
    expect(tables).toEqual(["custom_field_definitions", "custom_field_options", "custom_field_value_options",
      "custom_field_values", "customization_tags", "record_tag_assignments", "saved_list_versions", "saved_lists"]);
    const targetFks = Number((await pool.query(
      `select count(*) from pg_constraint c join pg_class t on t.oid=c.conrelid
       where c.contype='f' and t.relname=any($1) and pg_get_constraintdef(c.oid) ~ '(leads|contacts|companies|deals|projects)'`,
      [tables],
    )).rows[0].count);
    expect(targetFks).toBe(0);
  });

  it("enforces definition types, defaults, flags, lifecycle, identity and non-reusable codes", async () => {
    const actor = await actorFixture();
    await expect(pool.query(
      `insert into custom_field_definitions(workspace_id,target_record_type,code,label,field_type,display_order,
        searchable,governing_operation_id,created_by_membership_id,updated_by_membership_id)
       values($1,'crm.lead','bad_long','Bad','long_text',1,true,$2,$3,$3)`,
      [actor.workspaceId, randomUUID(), actor.membershipId],
    )).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query(
      `insert into custom_field_definitions(workspace_id,target_record_type,code,label,field_type,display_order,
        default_integer_value,governing_operation_id,created_by_membership_id,updated_by_membership_id)
       values($1,'crm.lead','bad_default','Bad','short_text',2,1,$2,$3,$3)`,
      [actor.workspaceId, randomUUID(), actor.membershipId],
    )).rejects.toMatchObject({ code: "23514" });
    const id = await createDefinition(pool, actor, { fieldType: "integer", code: "priority_score", lifecycle: "active" });
    await expect(pool.query("update custom_field_definitions set code='changed' where id=$1", [id]))
      .rejects.toMatchObject({ code: "P0001" });
    await pool.query(
      `update custom_field_definitions set lifecycle='archived',version=3,governing_operation_id=$2,
       archived_at=now(),archived_by_membership_id=$3,updated_at=now() where id=$1`, [id, randomUUID(), actor.membershipId],
    );
    await expect(pool.query(
      `insert into custom_field_definitions(workspace_id,target_record_type,code,label,field_type,display_order,
       governing_operation_id,created_by_membership_id,updated_by_membership_id)
       values($1,'crm.lead','priority_score','Reuse','integer',3,$2,$3,$3)`,
      [actor.workspaceId, randomUUID(), actor.membershipId],
    )).rejects.toMatchObject({ code: "23505" });
  });

  it("pairs select options/defaults to one Workspace and Definition", async () => {
    const actor = await actorFixture(), other = await actorFixture();
    const selectId = await createDefinition(pool, actor, { fieldType: "single_select" });
    const optionId = await createOption(pool, actor, selectId);
    await pool.query(
      `update custom_field_definitions set default_option_id=$2,version=2,governing_operation_id=$3,
       updated_by_membership_id=$4,updated_at=now() where id=$1`, [selectId, optionId, randomUUID(), actor.membershipId],
    );
    const scalarId = await createDefinition(pool, actor, { fieldType: "integer" });
    await expect(createOption(pool, actor, scalarId)).rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query(
      `update custom_field_definitions set default_option_id=$2,version=2,governing_operation_id=$3,
       updated_by_membership_id=$4,updated_at=now() where id=$1`, [scalarId, optionId, randomUUID(), actor.membershipId],
    )).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query(
      `insert into custom_field_options(workspace_id,definition_id,code,label,display_order,governing_operation_id,
       created_by_membership_id,updated_by_membership_id) values($1,$2,'cross','Cross',1,$3,$4,$4)`,
      [actor.workspaceId, selectId, randomUUID(), other.membershipId],
    )).rejects.toMatchObject({ code: "23503" });
  });

  it("enforces typed one-value identity and exact option cardinality", async () => {
    const actor = await actorFixture(), client = await pool.connect();
    try {
      const definitionId = await createDefinition(client, actor, { fieldType: "single_select", lifecycle: "active" });
      const optionId = await createOption(client, actor, definitionId), targetId = randomUUID(), valueId = randomUUID();
      await client.query("begin");
      await client.query(
        `insert into custom_field_values(id,workspace_id,definition_id,target_record_type,target_record_id,field_type,
         governing_operation_id,created_by_membership_id,updated_by_membership_id)
         values($1,$2,$3,'crm.lead',$4,'single_select',$5,$6,$6)`,
        [valueId, actor.workspaceId, definitionId, targetId, randomUUID(), actor.membershipId],
      );
      await client.query(
        `insert into custom_field_value_options(workspace_id,value_id,definition_id,option_id,created_by_membership_id)
         values($1,$2,$3,$4,$5)`, [actor.workspaceId, valueId, definitionId, optionId, actor.membershipId],
      );
      await client.query("commit");
      await expect(pool.query(
        `insert into custom_field_values(workspace_id,definition_id,target_record_type,target_record_id,field_type,
         governing_operation_id,created_by_membership_id,updated_by_membership_id)
         values($1,$2,'crm.lead',$3,'single_select',$4,$5,$5)`,
        [actor.workspaceId, definitionId, targetId, randomUUID(), actor.membershipId],
      )).rejects.toMatchObject({ code: "23505" });

      await client.query("begin");
      await client.query("delete from custom_field_value_options where workspace_id=$1 and value_id=$2", [actor.workspaceId, valueId]);
      await client.query(
        `update custom_field_values set lifecycle='redacted',version=2,governing_operation_id=$2,
         redaction_marker='content_redacted',redacted_at=now(),redacted_by_membership_id=$3,
         updated_by_membership_id=$3,updated_at=now() where id=$1`, [valueId, randomUUID(), actor.membershipId],
      );
      await client.query("commit");
      expect((await pool.query(
        `select text_value,text_normalized,integer_value,decimal_value,boolean_value,date_value,timestamp_value,
          redaction_marker,(select count(*)::int from custom_field_value_options where value_id=$1) links
         from custom_field_values where id=$1`, [valueId],
      )).rows[0]).toMatchObject({ text_value: null, text_normalized: null, integer_value: null,
        decimal_value: null, boolean_value: null, date_value: null, timestamp_value: null,
        redaction_marker: "content_redacted", links: 0 });
    } finally { client.release(); }
  });

  it("rejects missing select links and rolls the root back at the deferred boundary", async () => {
    const actor = await actorFixture(), client = await pool.connect();
    try {
      const definitionId = await createDefinition(client, actor, { fieldType: "multi_select", lifecycle: "active" });
      const valueId = randomUUID();
      await client.query("begin");
      await client.query(
        `insert into custom_field_values(id,workspace_id,definition_id,target_record_type,target_record_id,field_type,
         governing_operation_id,created_by_membership_id,updated_by_membership_id)
         values($1,$2,$3,'crm.lead',$4,'multi_select',$5,$6,$6)`,
        [valueId, actor.workspaceId, definitionId, randomUUID(), randomUUID(), actor.membershipId],
      );
      await expect(client.query("commit")).rejects.toMatchObject({ code: "P0001" });
      await client.query("rollback");
      expect(Number((await pool.query("select count(*) from custom_field_values where id=$1", [valueId])).rows[0].count)).toBe(0);
    } finally { client.release(); }
  });

  it("irreversibly scrubs scalar user content while retaining safe value evidence", async () => {
    const actor = await actorFixture(), definitionId = await createDefinition(pool, actor,
      { fieldType: "short_text", lifecycle: "active" });
    const valueId = (await pool.query<{ id: string }>(
      `insert into custom_field_values(workspace_id,definition_id,target_record_type,target_record_id,field_type,
       text_value,text_normalized,governing_operation_id,created_by_membership_id,updated_by_membership_id)
       values($1,$2,'crm.lead',$3,'short_text','Sensitive Note','sensitive note',$4,$5,$5) returning id`,
      [actor.workspaceId, definitionId, randomUUID(), randomUUID(), actor.membershipId],
    )).rows[0].id;
    await pool.query(
      `update custom_field_values set lifecycle='redacted',text_value=null,text_normalized=null,
       redaction_marker='content_redacted',version=2,governing_operation_id=$2,redacted_at=now(),
       redacted_by_membership_id=$3,updated_by_membership_id=$3,updated_at=now() where id=$1`,
      [valueId, randomUUID(), actor.membershipId],
    );
    expect((await pool.query(
      "select id,lifecycle,text_value,text_normalized,redaction_marker,version from custom_field_values where id=$1", [valueId],
    )).rows[0]).toEqual({ id: valueId, lifecycle: "redacted", text_value: null, text_normalized: null,
      redaction_marker: "content_redacted", version: 2 });
    await expect(pool.query(
      `update custom_field_values set lifecycle='active',text_value='Recovered',text_normalized='recovered',
       redaction_marker=null,version=3,governing_operation_id=$2,updated_at=now() where id=$1`, [valueId, randomUUID()],
    )).rejects.toMatchObject({ code: "P0001" });
  });

  it("enforces tag normalization, stable identity, duplicate assignment and retained NO ACTION provenance", async () => {
    const actor = await actorFixture(), other = await actorFixture(), tagId = randomUUID(), targetId = randomUUID();
    await expect(pool.query(
      `insert into customization_tags(workspace_id,code,label,normalized_label,governing_operation_id,
       created_by_membership_id,updated_by_membership_id) values($1,'vip','VIP','wrong',$2,$3,$3)`,
      [actor.workspaceId, randomUUID(), actor.membershipId],
    )).rejects.toMatchObject({ code: "23514" });
    await pool.query(
      `insert into customization_tags(id,workspace_id,code,label,normalized_label,color_code,governing_operation_id,
       created_by_membership_id,updated_by_membership_id) values($1,$2,'vip','VIP','vip','violet',$3,$4,$4)`,
      [tagId, actor.workspaceId, randomUUID(), actor.membershipId],
    );
    await pool.query(
      `insert into record_tag_assignments(workspace_id,tag_id,record_type,record_id,assigned_by_membership_id)
       values($1,$2,'crm.lead',$3,$4)`, [actor.workspaceId, tagId, targetId, actor.membershipId],
    );
    await expect(pool.query(
      `insert into record_tag_assignments(workspace_id,tag_id,record_type,record_id,assigned_by_membership_id)
       values($1,$2,'crm.lead',$3,$4)`, [actor.workspaceId, tagId, targetId, actor.membershipId],
    )).rejects.toMatchObject({ code: "23505" });
    await expect(pool.query(
      `insert into record_tag_assignments(workspace_id,tag_id,record_type,record_id,assigned_by_membership_id)
       values($1,$2,'crm.lead',$3,$4)`, [actor.workspaceId, tagId, randomUUID(), other.membershipId],
    )).rejects.toMatchObject({ code: "23503" });
    await expect(pool.query("delete from workspace_memberships where id=$1", [actor.membershipId]))
      .rejects.toMatchObject({ code: "23503" });
  });

  it("accepts the bounded immutable saved-list AST and exact root/version pairing", async () => {
    const actor = await actorFixture(), client = await pool.connect();
    try {
      const ast = { kind: "group", operator: "and", children: [
        { kind: "predicate", field: { source: "system", code: "status" }, operator: "eq", value: "open" },
        { kind: "predicate", field: { source: "tags" }, operator: "has_any", value: [randomUUID()] },
      ] };
      const listId = await createList(client, actor, ast);
      await expect(pool.query("update saved_list_versions set sort_direction='desc' where list_id=$1", [listId]))
        .rejects.toMatchObject({ code: "P0001" });
      await expect(pool.query("delete from saved_lists where id=$1", [listId]))
        .rejects.toMatchObject({ code: "P0001" });
      expect((await pool.query(
        `select l.version,l.current_definition_version,v.definition_version from saved_lists l
         join saved_list_versions v on v.workspace_id=l.workspace_id and v.list_id=l.id where l.id=$1`, [listId],
      )).rows[0]).toEqual({ version: 1, current_definition_version: 1, definition_version: 1 });
    } finally { client.release(); }
  });

  it("rejects unknown, oversized, deep, duplicate-set and unpaired saved-list definitions", async () => {
    const actor = await actorFixture(), client = await pool.connect();
    try {
      const invalid = [
        { kind: "all", extra: true },
        { kind: "predicate", field: { source: "system", code: "Status" }, operator: "eq", value: "open" },
        { kind: "predicate", field: { source: "system", code: "status" }, operator: "sql", value: "x" },
        { kind: "predicate", field: { source: "tags" }, operator: "has_any", value: ["x", "x"] },
        { kind: "group", operator: "and", children: [{ kind: "group", operator: "and", children: [
          { kind: "group", operator: "and", children: [{ kind: "group", operator: "and", children: [{ kind: "all" }] }] },
        ] }] },
      ];
      for (const ast of invalid) await expect(createList(client, actor, ast)).rejects.toMatchObject({ code: "P0001" });
      await expect(createList(client, actor, { kind: "all" }, { source: "system", field: " bad" }))
        .rejects.toMatchObject({ code: "23514" });

      const listId = randomUUID();
      await client.query("begin");
      await client.query(
        `insert into saved_lists(id,workspace_id,target_record_type,name,owner_membership_id,governing_operation_id,
         created_by_membership_id,updated_by_membership_id) values($1,$2,'crm.lead','Unpaired',$3,$4,$3,$3)`,
        [listId, actor.workspaceId, actor.membershipId, randomUUID()],
      );
      await expect(client.query("commit")).rejects.toMatchObject({ code: "P0001" });
      await client.query("rollback");
      expect(Number((await pool.query("select count(*) from saved_lists where id=$1", [listId])).rows[0].count)).toBe(0);
    } finally { client.release(); }
  });

  it("enforces AST node, group, set, byte, hash and canonical UUID bounds", async () => {
    const actor = await actorFixture(), client = await pool.connect();
    try {
      const predicate = { kind: "predicate", field: { source: "system", code: "status" }, operator: "eq", value: "open" };
      const tooManyNodes = { kind: "group", operator: "and", children: Array.from({ length: 10 }, () =>
        ({ kind: "group", operator: "or", children: [predicate, predicate, predicate] })) };
      const invalid = [
        tooManyNodes,
        { kind: "group", operator: "and", children: Array.from({ length: 11 }, () => predicate) },
        { kind: "predicate", field: { source: "tags" }, operator: "has_any",
          value: Array.from({ length: 21 }, () => randomUUID()) },
        { kind: "predicate", field: { source: "custom", definitionId: randomUUID().toUpperCase() },
          operator: "eq", value: "x" },
      ];
      for (const ast of invalid) await expect(createList(client, actor, ast)).rejects.toMatchObject({ code: "P0001" });
      await expect(createList(client, actor,
        { kind: "predicate", field: { source: "system", code: "status" }, operator: "eq", value: "x".repeat(8200) }))
        .rejects.toMatchObject({ code: "P0001" });

      const listId = randomUUID(), operationId = randomUUID();
      await client.query("begin");
      await client.query(
        `insert into saved_lists(id,workspace_id,target_record_type,name,owner_membership_id,governing_operation_id,
         created_by_membership_id,updated_by_membership_id) values($1,$2,'crm.lead','Bad hash',$3,$4,$3,$3)`,
        [listId, actor.workspaceId, actor.membershipId, operationId],
      );
      await expect(client.query(
        `insert into saved_list_versions(workspace_id,list_id,definition_version,filter_ast,filter_ast_hash,
         sort_source,sort_field_code,governing_operation_id,created_by_membership_id)
         values($1,$2,1,'{"kind":"all"}','NOT-A-HASH','system','updated_at',$3,$4)`,
        [actor.workspaceId, listId, operationId, actor.membershipId],
      )).rejects.toMatchObject({ code: "23514" });
      await client.query("rollback");
    } finally { client.release(); }
  });

  it("fails closed when Definition archival wins a concurrent active-value race", async () => {
    const actor = await actorFixture(), definitionId = await createDefinition(pool, actor,
      { fieldType: "integer", lifecycle: "active" });
    const archiver = await pool.connect(), writer = await pool.connect(), valueId = randomUUID();
    try {
      await archiver.query("begin");
      await archiver.query(
        `update custom_field_definitions set lifecycle='archived',version=3,governing_operation_id=$2,
         archived_at=now(),archived_by_membership_id=$3,updated_at=now() where id=$1`,
        [definitionId, randomUUID(), actor.membershipId],
      );
      await writer.query("begin");
      const pendingInsert = writer.query(
        `insert into custom_field_values(id,workspace_id,definition_id,target_record_type,target_record_id,field_type,
         integer_value,governing_operation_id,created_by_membership_id,updated_by_membership_id)
         values($1,$2,$3,'crm.lead',$4,'integer',1,$5,$6,$6)`,
        [valueId, actor.workspaceId, definitionId, randomUUID(), randomUUID(), actor.membershipId],
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      await archiver.query("commit");
      await pendingInsert;
      await expect(writer.query("commit")).rejects.toMatchObject({ code: "P0001" });
      await writer.query("rollback");
      expect(Number((await pool.query("select count(*) from custom_field_values where id=$1", [valueId])).rows[0].count)).toBe(0);
    } finally { archiver.release(); writer.release(); }
  });

  it("keeps shared index count constant as definitions are added", async () => {
    const actor = await actorFixture();
    const before = Number((await pool.query(
      `select count(*) from pg_indexes where schemaname='public' and tablename like 'custom_field_%'`,
    )).rows[0].count);
    for (let index = 0; index < 10; index += 1) await createDefinition(pool, actor, { code: `constant_${index}` });
    const after = Number((await pool.query(
      `select count(*) from pg_indexes where schemaname='public' and tablename like 'custom_field_%'`,
    )).rows[0].count);
    expect(after).toBe(before);
  });
});

const performanceSuite = process.env.RUN_DB_PERFORMANCE === "1" ? describe : describe.skip;
const performancePool = new Pool({ connectionString });
function percentile(values: number[], quantile: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
}
function planNodes(plan: { "Node Type": string; Plans?: Array<{ "Node Type": string; Plans?: unknown[] }> }): string[] {
  return [plan["Node Type"], ...(plan.Plans ?? []).flatMap((child) => planNodes(child as typeof plan))];
}

performanceSuite("DB-04 Customization representative performance", () => {
  beforeAll(async () => { await performancePool.query("select 1"); });
  afterAll(async () => { await performancePool.end(); });

  it("keeps typed values, tags, lists and AST compiler shapes bounded at 100,001 rows", async () => {
    await performancePool.query("truncate users cascade");
    const actor = await actorFixture(performancePool), integerDefinition = randomUUID(), selectDefinition = randomUUID();
    const optionIds = Array.from({ length: 3 }, () => randomUUID());
    await performancePool.query("begin");
    try {
      await performancePool.query("set local session_replication_role=replica");
      await performancePool.query(
        `insert into custom_field_definitions(id,workspace_id,target_record_type,code,label,field_type,lifecycle,
         filterable,sortable,display_order,version,governing_operation_id,created_by_membership_id,updated_by_membership_id)
         values($1,$3,'crm.lead','perf_integer','Perf integer','integer','active',true,true,1,2,$4,$5,$5),
               ($2,$3,'crm.lead','perf_select','Perf select','multi_select','active',true,false,2,2,$6,$5,$5)`,
        [integerDefinition, selectDefinition, actor.workspaceId, randomUUID(), actor.membershipId, randomUUID()],
      );
      for (let index = 0; index < optionIds.length; index += 1) await performancePool.query(
        `insert into custom_field_options(id,workspace_id,definition_id,code,label,display_order,governing_operation_id,
         created_by_membership_id,updated_by_membership_id) values($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
        [optionIds[index], actor.workspaceId, selectDefinition, `perf_${index}`, `Perf ${index}`, index, randomUUID(), actor.membershipId],
      );
      await performancePool.query(
        `insert into custom_field_values(id,workspace_id,definition_id,target_record_type,target_record_id,field_type,
         integer_value,governing_operation_id,created_by_membership_id,updated_by_membership_id,created_at,updated_at)
         select ('71000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,$2,'crm.lead',
          ('72000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'integer',g%1000,
          ('73000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$3,$3,
          timestamptz '2026-01-01'+((g%1000)||' seconds')::interval,timestamptz '2026-01-01'+((g%1000)||' seconds')::interval
         from generate_series(1,100001) g`, [actor.workspaceId, integerDefinition, actor.membershipId],
      );
      await performancePool.query(
        `insert into custom_field_values(id,workspace_id,definition_id,target_record_type,target_record_id,field_type,
         governing_operation_id,created_by_membership_id,updated_by_membership_id)
         select ('74000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,$2,'crm.lead',
          ('72000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'multi_select',
          ('76000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$3,$3 from generate_series(1,100001) g`,
        [actor.workspaceId, selectDefinition, actor.membershipId],
      );
      await performancePool.query(
        `insert into custom_field_value_options(workspace_id,value_id,definition_id,option_id,created_by_membership_id)
         select $1,('74000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$2,$3,$4
         from generate_series(1,100001) g`, [actor.workspaceId, selectDefinition, optionIds[0], actor.membershipId],
      );
      const tagId = randomUUID();
      await performancePool.query(
        `insert into customization_tags(id,workspace_id,code,label,normalized_label,governing_operation_id,
         created_by_membership_id,updated_by_membership_id) values($1,$2,'perf','Perf','perf',$3,$4,$4)`,
        [tagId, actor.workspaceId, randomUUID(), actor.membershipId],
      );
      await performancePool.query(
        `insert into record_tag_assignments(workspace_id,tag_id,record_type,record_id,assigned_by_membership_id)
         select $1,$2,'crm.lead',('72000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$3
         from generate_series(1,100001) g`, [actor.workspaceId, tagId, actor.membershipId],
      );
      await performancePool.query(
        `insert into saved_lists(id,workspace_id,target_record_type,name,visibility,owner_membership_id,
         governing_operation_id,created_by_membership_id,updated_by_membership_id,created_at,updated_at)
         select ('78000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,'crm.lead','List '||g,
          case when g%2=0 then 'private' else 'workspace' end,$2,
          ('79000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$2,$2,
          timestamptz '2026-02-01'+((g%1000)||' seconds')::interval,timestamptz '2026-02-01'+((g%1000)||' seconds')::interval
         from generate_series(1,100001) g`, [actor.workspaceId, actor.membershipId],
      );
      await performancePool.query(
        `insert into saved_list_versions(id,workspace_id,list_id,definition_version,filter_ast,filter_ast_hash,
         sort_source,sort_field_code,governing_operation_id,created_by_membership_id)
         select ('7f000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
          '78000000-0000-0000-0000-000000000001',g,'{"kind":"all"}',repeat('a',64),
          'system','updated_at',('79000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$2
         from generate_series(1,100001) g`, [actor.workspaceId, actor.membershipId],
      );
      await performancePool.query("commit");
    } catch (error) { await performancePool.query("rollback"); throw error; }

    await performancePool.query(
      "analyze custom_field_values,custom_field_value_options,customization_tags,record_tag_assignments,saved_lists,saved_list_versions",
    );

    const integerSql = `select target_record_id,integer_value from custom_field_values
      where workspace_id=$1 and definition_id=$2 and target_record_type='crm.lead' and lifecycle='active'
      and integer_value>=500 and ($3::bigint is null or (integer_value,target_record_id)>($3,$4::uuid))
      order by integer_value,target_record_id limit 51`;
    const targetValuesSql = `select v.id,v.field_type,d.code,link.option_id from custom_field_values v
      join custom_field_definitions d on d.workspace_id=v.workspace_id and d.id=v.definition_id
      left join custom_field_value_options link on link.workspace_id=v.workspace_id and link.value_id=v.id
        and link.definition_id=v.definition_id
      where v.workspace_id=$1 and v.target_record_type='crm.lead' and v.target_record_id=$2
      order by d.display_order,v.id`;
    const selectSql = `select v.target_record_id,link.value_id from custom_field_value_options link join custom_field_values v
      on v.workspace_id=link.workspace_id and v.id=link.value_id and v.definition_id=link.definition_id
      where link.workspace_id=$1 and link.definition_id=$2 and link.option_id=$3 and v.lifecycle='active'
      and ($4::uuid is null or link.value_id>$4) order by link.value_id limit 51`;
    const reverseTagSql = `select record_id from record_tag_assignments where workspace_id=$1 and tag_id=$2
      and record_type='crm.lead' and ($3::uuid is null or record_id>$3) order by record_id limit 51`;
    const privateListsSql = `select id,updated_at from saved_lists where workspace_id=$1 and owner_membership_id=$2
      and lifecycle='active' and ($3::timestamptz is null or (updated_at,id)<($3,$4::uuid))
      order by updated_at desc nulls last,id desc nulls last limit 51`;
    const astSql = `select v.target_record_id from custom_field_values v
      where v.workspace_id=$1 and v.definition_id=$2 and v.lifecycle='active' and v.target_record_type='crm.lead'
      and v.integer_value between 400 and 700 and exists(select 1 from record_tag_assignments t
        where t.workspace_id=v.workspace_id and t.record_type=v.target_record_type and t.record_id=v.target_record_id and t.tag_id=$3)
      order by v.integer_value,v.target_record_id limit 51`;
    const currentListSql = `select l.id,l.current_definition_version,v.filter_ast_hash from saved_lists l
      join saved_list_versions v on v.workspace_id=l.workspace_id and v.list_id=l.id
        and v.definition_version=l.current_definition_version where l.workspace_id=$1 and l.id=$2`;
    const listHistorySql = `select definition_version,filter_ast_hash from saved_list_versions
      where workspace_id=$1 and list_id=$2 and definition_version<$3
      order by definition_version desc limit 51`;

    async function measure(name: string, sql: string, params: unknown[]) {
      const explain = (await performancePool.query(`explain (analyze,buffers,format json) ${sql}`, params)).rows[0]["QUERY PLAN"][0];
      const nodes = planNodes(explain.Plan);
      expect(nodes, name).not.toContain("Seq Scan");
      const samples: number[] = [];
      for (let index = 0; index < 30; index += 1) {
        const started = performance.now(); await performancePool.query(sql, params); samples.push(performance.now() - started);
      }
      const p95 = percentile(samples, .95);
      expect(p95, name).toBeLessThan(200);
      return { executionMs: Number(explain["Execution Time"]), p95, nodes };
    }

    async function measureBoundedTarget(name: string, sql: string, params: unknown[]) {
      const explain = (await performancePool.query(`explain (analyze,buffers,format json) ${sql}`, params)).rows[0]["QUERY PLAN"][0];
      const serialized = JSON.stringify(explain.Plan);
      expect(serialized, name).not.toMatch(/"Node Type":"Seq Scan"[^}]*"Relation Name":"custom_field_values"/);
      const samples: number[] = [];
      for (let index = 0; index < 30; index += 1) {
        const started = performance.now(); await performancePool.query(sql, params); samples.push(performance.now() - started);
      }
      const p95 = percentile(samples, .95);
      expect(p95, name).toBeLessThan(200);
      return { executionMs: Number(explain["Execution Time"]), p95, nodes: planNodes(explain.Plan) };
    }

    const historyListId = "78000000-0000-0000-0000-000000000001";
    const evidence = {
      targetValues: await measureBoundedTarget("targetValues", targetValuesSql,
        [actor.workspaceId, "72000000-0000-0000-0000-000000050000"]),
      integer: await measure("integer", integerSql, [actor.workspaceId, integerDefinition, null, null]),
      select: await measure("select", selectSql, [actor.workspaceId, selectDefinition, optionIds[0], null]),
      tag: await measure("tag", reverseTagSql, [actor.workspaceId,
        (await performancePool.query("select id from customization_tags where workspace_id=$1 and code='perf'", [actor.workspaceId])).rows[0].id, null]),
      lists: await measure("lists", privateListsSql, [actor.workspaceId, actor.membershipId, null, null]),
      ast: await measure("ast", astSql, [actor.workspaceId, integerDefinition,
        (await performancePool.query("select id from customization_tags where workspace_id=$1 and code='perf'", [actor.workspaceId])).rows[0].id]),
      currentList: await measure("currentList", currentListSql, [actor.workspaceId, historyListId]),
      listHistory: await measure("listHistory", listHistorySql, [actor.workspaceId, historyListId, 100002]),
    };
    const sizes = (await performancePool.query(
      `select relname,pg_relation_size(oid)::bigint heap_bytes,pg_indexes_size(oid)::bigint index_bytes
       from pg_class where relkind='r' and (relname like 'custom_field_%' or relname like 'customization_%'
        or relname like 'record_tag_%' or relname like 'saved_list%') order by relname`,
    )).rows.map((row) => ({ ...row, indexToHeapRatio: Number(row.index_bytes) / Math.max(1, Number(row.heap_bytes)) }));
    console.info("DB_04_CUSTOMIZATION_PERFORMANCE_EVIDENCE", JSON.stringify({ rows: 100001, evidence, sizes }));
  }, 240_000);
});
