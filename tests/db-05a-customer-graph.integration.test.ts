import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const connectionString = process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow";
const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString });

async function actorFixture(db: Pool | PoolClient = pool) {
  const userId = (await db.query<{ id: string }>(
    "insert into users(display_name,status) values('Customer Graph Owner','active') returning id",
  )).rows[0].id;
  const workspaceId = (await db.query<{ id: string }>(
    `insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
     values('Customer Graph Workspace',$1,'active','essentials','monthly',$2) returning id`,
    [`customer-graph-${randomUUID()}`, userId],
  )).rows[0].id;
  const roleId = (await db.query<{ id: string }>(
    "insert into roles(workspace_id,code) values($1,'owner') returning id", [workspaceId],
  )).rows[0].id;
  const membershipId = (await db.query<{ id: string }>(
    "insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active') returning id",
    [workspaceId, userId, roleId],
  )).rows[0].id;
  const teamId = (await db.query<{ id: string }>(
    `insert into teams(workspace_id,name,name_normalized,status,created_by_membership_id)
     values($1,'Customer Graph Team','customer graph team','active',$2) returning id`, [workspaceId, membershipId],
  )).rows[0].id;
  return { workspaceId, membershipId, teamId };
}

async function createCompany(db: Pool | PoolClient, actor: Awaited<ReturnType<typeof actorFixture>>, name: string = randomUUID()) {
  return (await db.query<{ id: string }>(
    `insert into companies(workspace_id,display_name,name_normalized,domain_normalized)
     values($1,$2,$3,null) returning id`, [actor.workspaceId, `Company ${name}`, `company ${name}`],
  )).rows[0].id;
}

async function createContact(db: Pool | PoolClient, actor: Awaited<ReturnType<typeof actorFixture>>, name = randomUUID()) {
  return (await db.query<{ id: string }>(
    `insert into contacts(workspace_id,display_name,person_name_normalized)
     values($1,$2,$3) returning id`, [actor.workspaceId, `Contact ${name}`, `contact ${name}`],
  )).rows[0].id;
}

function zeroCounts() {
  return {
    contactsScanned: 0, companiesScanned: 0, contactEmailPointsWritten: 0,
    contactPhonePointsWritten: 0, companyDomainPointsWritten: 0, affiliationsWritten: 0,
    issuesOpened: 0, issuesResolved: 0,
  };
}

async function createRun(db: Pool | PoolClient, actor: Awaited<ReturnType<typeof actorFixture>>) {
  return (await db.query<{ id: string }>(
    `insert into customer_graph_reconciliation_runs(workspace_id,source_cutoff,source_cutoff_id,counts,
      operation_id,created_by_membership_id) values($1,now(),$2,$3,$4,$5) returning id`,
    [actor.workspaceId, randomUUID(), JSON.stringify(zeroCounts()), randomUUID(), actor.membershipId],
  )).rows[0].id;
}

suite("DB-05A Customer Graph persistence", () => {
  beforeAll(async () => { await pool.query("select 1"); });
  beforeEach(async () => { await pool.query("truncate users cascade"); });
  afterAll(async () => { await pool.end(); });

  it("installs exactly eight dormant tables and the frozen root columns/indexes", async () => {
    const tables = (await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema='public'
       and table_name like any(array['contact_identity_points','company_domain_points','contact_company_affiliations',
       'contact_visible_teams','company_visible_teams','customer_graph_reconciliation_runs',
       'customer_graph_reconciliation_checkpoints','customer_graph_reconciliation_issues']) order by table_name`,
    )).rows.map((row) => row.table_name);
    expect(tables).toEqual(["company_domain_points", "company_visible_teams", "contact_company_affiliations",
      "contact_identity_points", "contact_visible_teams", "customer_graph_reconciliation_checkpoints",
      "customer_graph_reconciliation_issues", "customer_graph_reconciliation_runs"]);
    for (const root of ["contacts", "companies"]) {
      const columns = (await pool.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema='public' and table_name=$1
         and column_name in ('responsible_membership_id','responsible_team_id','visibility','governing_operation_id',
         'created_by_membership_id','updated_by_membership_id','archived_at','archived_by_membership_id',
         'authority_contract_version') order by column_name`, [root],
      )).rows.map((row) => row.column_name);
      expect(columns).toHaveLength(9);
      const indexes = (await pool.query<{ indexname: string }>(
        `select indexname from pg_indexes where schemaname='public' and tablename=$1
         and indexname like $2 order by indexname`, [root, `${root}_%_idx`],
      )).rows.map((row) => row.indexname);
      expect(indexes).toContain(`${root}_default_list_idx`);
      expect(indexes).toContain(`${root}_responsible_membership_idx`);
      expect(indexes).toContain(`${root}_responsible_team_idx`);
    }
    expect(Number((await pool.query(
      `select count(*) from pg_constraint where contype='f' and connamespace='public'::regnamespace
       and conrelid in ('contact_identity_points'::regclass,'company_domain_points'::regclass,
       'contact_company_affiliations'::regclass,'contact_visible_teams'::regclass,'company_visible_teams'::regclass)
       and confrelid in ('leads'::regclass,'lead_identity_reviews'::regclass,'lead_identity_candidates'::regclass,
       'lead_identity_decisions'::regclass)`,
    )).rows[0].count)).toBe(0);
    expect(Number((await pool.query(
      `select count(*) from pg_trigger where not tgisinternal and tgrelid in
       ('contact_identity_points'::regclass,'company_domain_points'::regclass,
        'contact_company_affiliations'::regclass,'customer_graph_reconciliation_runs'::regclass,
        'customer_graph_reconciliation_checkpoints'::regclass,'customer_graph_reconciliation_issues'::regclass)`,
    )).rows[0].count)).toBe(6);
  });

  it("preserves legacy root writes while enforcing customer-graph archive and Workspace provenance", async () => {
    const actor = await actorFixture(), other = await actorFixture();
    await pool.query(
      `insert into companies(workspace_id,display_name,name_normalized,status)
       values($1,'Legacy Archived','legacy archived','archived')`, [actor.workspaceId],
    );
    await expect(pool.query(
      `insert into companies(workspace_id,display_name,name_normalized,status,authority_contract_version)
       values($1,'Graph Archived','graph archived','archived','customer-graph-v1')`, [actor.workspaceId],
    )).rejects.toMatchObject({ code: "23514" });
    await pool.query(
      `insert into companies(workspace_id,display_name,name_normalized,status,authority_contract_version,
       archived_at,archived_by_membership_id) values($1,'Graph Archived','graph archived','archived',
       'customer-graph-v1',now(),$2)`, [actor.workspaceId, actor.membershipId],
    );
    await expect(pool.query(
      `insert into contacts(workspace_id,display_name,person_name_normalized,responsible_membership_id)
       values($1,'Cross Workspace','cross workspace',$2)`, [actor.workspaceId, other.membershipId],
    )).rejects.toMatchObject({ code: "23503" });
    const root = (await pool.query(
      "select visibility,authority_contract_version,governing_operation_id from companies where display_name='Legacy Archived'",
    )).rows[0];
    expect(root).toEqual({ visibility: "workspace", authority_contract_version: "legacy-p1a-root-v1",
      governing_operation_id: null });
  });

  it("stores non-unique candidate identities while enforcing point shape, primary and immutable correction", async () => {
    const actor = await actorFixture(), first = await createContact(pool, actor), second = await createContact(pool, actor);
    const firstId = (await pool.query<{ id: string }>(
      `insert into contact_identity_points(workspace_id,contact_id,kind,display_value,normalized_value,
       normalization_version,is_primary,source,governing_operation_id,created_by_membership_id)
       values($1,$2,'email','Shared@Example.com','shared@example.com','email-v1',true,'manual',$3,$4) returning id`,
      [actor.workspaceId, first, randomUUID(), actor.membershipId],
    )).rows[0].id;
    await pool.query(
      `insert into contact_identity_points(workspace_id,contact_id,kind,display_value,normalized_value,
       normalization_version,is_primary,source,governing_operation_id)
       values($1,$2,'email','shared@example.com','shared@example.com','email-v1',true,'legacy_root',$3)`,
      [actor.workspaceId, second, randomUUID()],
    );
    expect(Number((await pool.query(
      "select count(*) from contact_identity_points where workspace_id=$1 and normalized_value='shared@example.com'",
      [actor.workspaceId],
    )).rows[0].count)).toBe(2);
    await expect(pool.query(
      `insert into contact_identity_points(workspace_id,contact_id,kind,display_value,normalized_value,
       normalization_version,is_primary,source,governing_operation_id)
       values($1,$2,'email','Other@Example.com','other@example.com','email-v1',true,'manual',$3)`,
      [actor.workspaceId, first, randomUUID()],
    )).rejects.toMatchObject({ code: "23505" });
    await expect(pool.query(
      "update contact_identity_points set normalized_value='changed@example.com',version=2,governing_operation_id=$2 where id=$1",
      [firstId, randomUUID()],
    )).rejects.toMatchObject({ code: "P0001" });
    await pool.query(
      `update contact_identity_points set lifecycle='archived',is_primary=false,version=2,governing_operation_id=$2,
       archived_at=now(),archived_by_membership_id=$3,updated_by_membership_id=$3,updated_at=now() where id=$1`,
      [firstId, randomUUID(), actor.membershipId],
    );
    await expect(pool.query(
      "update contact_identity_points set version=3,governing_operation_id=$2 where id=$1", [firstId, randomUUID()],
    )).rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query("delete from contact_identity_points where id=$1", [firstId]))
      .rejects.toMatchObject({ code: "P0001" });
  });

  it("enforces domain grammar, verification/source pairs and immutable domain identity", async () => {
    const actor = await actorFixture(), companyId = await createCompany(pool, actor);
    for (const domain of ["https://example.com", "example.com/path", "*.example.com", "-bad.example", "bad-.example"]) {
      await expect(pool.query(
        `insert into company_domain_points(workspace_id,company_id,domain_display,domain_normalized,
         normalization_version,source,governing_operation_id) values($1,$2,$3,$3,'domain-v1','manual',$4)`,
        [actor.workspaceId, companyId, domain, randomUUID()],
      )).rejects.toMatchObject({ code: "23514" });
    }
    await expect(pool.query(
      `insert into company_domain_points(workspace_id,company_id,domain_display,domain_normalized,
       normalization_version,verification_status,source,governing_operation_id)
       values($1,$2,'example.com','example.com','domain-v1','verified','manual',$3)`,
      [actor.workspaceId, companyId, randomUUID()],
    )).rejects.toMatchObject({ code: "23514" });
    const domainId = (await pool.query<{ id: string }>(
      `insert into company_domain_points(workspace_id,company_id,domain_display,domain_normalized,
       normalization_version,verification_status,verification_method,verified_at,source,source_record_id,
       governing_operation_id) values($1,$2,'Example.com','example.com','domain-v1','verified',
       'identity_review',now(),'lead_identity_review',$3,$4) returning id`,
      [actor.workspaceId, companyId, randomUUID(), randomUUID()],
    )).rows[0].id;
    await expect(pool.query(
      "update company_domain_points set domain_display='Changed.com',version=2,governing_operation_id=$2 where id=$1",
      [domainId, randomUUID()],
    )).rejects.toMatchObject({ code: "P0001" });
  });

  it("retains affiliation history and forbids in-place role or primary reinterpretation", async () => {
    const actor = await actorFixture(), contactId = await createContact(pool, actor);
    const companyId = await createCompany(pool, actor), secondCompanyId = await createCompany(pool, actor);
    const affiliationId = (await pool.query<{ id: string }>(
      `insert into contact_company_affiliations(workspace_id,contact_id,company_id,role_code,is_primary,
       valid_from,governing_operation_id,created_by_membership_id) values($1,$2,$3,'employee',true,now(),$4,$5) returning id`,
      [actor.workspaceId, contactId, companyId, randomUUID(), actor.membershipId],
    )).rows[0].id;
    await expect(pool.query(
      `insert into contact_company_affiliations(workspace_id,contact_id,company_id,role_code,is_primary,
       valid_from,governing_operation_id) values($1,$2,$3,'owner',true,now(),$4)`,
      [actor.workspaceId, contactId, secondCompanyId, randomUUID()],
    )).rejects.toMatchObject({ code: "23505" });
    await expect(pool.query(
      "update contact_company_affiliations set role_code='owner',version=2,governing_operation_id=$2 where id=$1",
      [affiliationId, randomUUID()],
    )).rejects.toMatchObject({ code: "P0001" });
    await pool.query(
      `update contact_company_affiliations set lifecycle='ended',valid_to=now(),ended_by_membership_id=$2,
       version=2,governing_operation_id=$3,updated_at=now() where id=$1`,
      [affiliationId, actor.membershipId, randomUUID()],
    );
    await pool.query(
      `insert into contact_company_affiliations(workspace_id,contact_id,company_id,role_code,is_primary,
       valid_from,governing_operation_id,created_by_membership_id) values($1,$2,$3,'owner',true,now(),$4,$5)`,
      [actor.workspaceId, contactId, secondCompanyId, randomUUID(), actor.membershipId],
    );
    await expect(pool.query(
      "update contact_company_affiliations set version=3,governing_operation_id=$2 where id=$1",
      [affiliationId, randomUUID()],
    )).rejects.toMatchObject({ code: "P0001" });
    expect(Number((await pool.query(
      "select count(*) from contact_company_affiliations where workspace_id=$1 and contact_id=$2",
      [actor.workspaceId, contactId],
    )).rows[0].count)).toBe(2);
  });

  it("serializes a primary identity switch under the Contact root and fails a stale contender closed", async () => {
    const actor = await actorFixture(), contactId = await createContact(pool, actor);
    const primaryId = (await pool.query<{ id: string }>(
      `insert into contact_identity_points(workspace_id,contact_id,kind,display_value,normalized_value,
       normalization_version,is_primary,source,governing_operation_id) values
       ($1,$2,'email','first@example.com','first@example.com','email-v1',true,'manual',$3) returning id`,
      [actor.workspaceId, contactId, randomUUID()],
    )).rows[0].id;
    const replacementId = (await pool.query<{ id: string }>(
      `insert into contact_identity_points(workspace_id,contact_id,kind,display_value,normalized_value,
       normalization_version,is_primary,source,governing_operation_id) values
       ($1,$2,'email','second@example.com','second@example.com','email-v1',false,'manual',$3) returning id`,
      [actor.workspaceId, contactId, randomUUID()],
    )).rows[0].id;
    const winner = await pool.connect(), contender = await pool.connect();
    try {
      await winner.query("begin");
      await winner.query("select id,version from contacts where workspace_id=$1 and id=$2 for update",
        [actor.workspaceId, contactId]);
      await contender.query("begin");
      const waitingLock = contender.query<{ version: number }>(
        "select version from contacts where workspace_id=$1 and id=$2 for update", [actor.workspaceId, contactId],
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      await winner.query(
        "update contact_identity_points set is_primary=false,version=2,governing_operation_id=$2,updated_at=now() where id=$1",
        [primaryId, randomUUID()],
      );
      await winner.query(
        "update contact_identity_points set is_primary=true,version=2,governing_operation_id=$2,updated_at=now() where id=$1",
        [replacementId, randomUUID()],
      );
      await winner.query("update contacts set version=2,updated_at=now() where workspace_id=$1 and id=$2",
        [actor.workspaceId, contactId]);
      await winner.query("commit");
      expect(Number((await waitingLock).rows[0].version)).toBe(2);
      await contender.query("rollback");
      expect((await pool.query(
        `select id from contact_identity_points where workspace_id=$1 and contact_id=$2 and kind='email'
         and lifecycle='active' and is_primary`, [actor.workspaceId, contactId],
      )).rows.map((row) => row.id)).toEqual([replacementId]);
    } finally { winner.release(); contender.release(); }
  });

  it("retains visible-Team and provenance rows with NO ACTION and no disclosure inference", async () => {
    const actor = await actorFixture(), contactId = await createContact(pool, actor), companyId = await createCompany(pool, actor);
    await pool.query(
      `insert into contact_visible_teams(workspace_id,contact_id,team_id,created_by_membership_id)
       values($1,$2,$3,$4)`, [actor.workspaceId, contactId, actor.teamId, actor.membershipId],
    );
    await pool.query(
      `insert into company_visible_teams(workspace_id,company_id,team_id,created_by_membership_id)
       values($1,$2,$3,$4)`, [actor.workspaceId, companyId, actor.teamId, actor.membershipId],
    );
    await expect(pool.query("delete from teams where id=$1", [actor.teamId])).rejects.toMatchObject({ code: "23503" });
    await expect(pool.query("delete from workspace_memberships where id=$1", [actor.membershipId]))
      .rejects.toMatchObject({ code: "23503" });
  });

  it("enforces exact run counts and resumable lifecycle without decreasing counters", async () => {
    const actor = await actorFixture(), runId = await createRun(pool, actor);
    const badCounts = [
      { ...zeroCounts(), unknown: 0 },
      { ...zeroCounts(), contactsScanned: -1 },
      { ...zeroCounts(), contactsScanned: 1.5 },
      { ...zeroCounts(), contactsScanned: "1" },
      { ...zeroCounts(), contactsScanned: 9007199254740992 },
    ];
    for (const counts of badCounts) {
      try {
        await pool.query(
          `insert into customer_graph_reconciliation_runs(workspace_id,source_cutoff,source_cutoff_id,counts,
           operation_id,created_by_membership_id) values($1,now(),$2,$3,$4,$5)`,
          [actor.workspaceId, randomUUID(), JSON.stringify(counts), randomUUID(), actor.membershipId],
        );
        throw new Error("invalid reconciliation counts accepted");
      } catch (error) {
        expect(["23514", "P0001"]).toContain((error as { code: string }).code);
      }
    }
    await pool.query(
      `update customer_graph_reconciliation_runs set state='running',started_at=now(),version=2,
       counts=jsonb_set(counts,'{contactsScanned}','10'),updated_at=now() where id=$1`, [runId],
    );
    await expect(pool.query(
      `update customer_graph_reconciliation_runs set state='blocked',version=3,
       counts=jsonb_set(counts,'{contactsScanned}','9'),updated_at=now() where id=$1`, [runId],
    )).rejects.toMatchObject({ code: "P0001" });
    await pool.query(
      "update customer_graph_reconciliation_runs set state='blocked',version=3,updated_at=now() where id=$1", [runId],
    );
    await pool.query(
      "update customer_graph_reconciliation_runs set state='running',version=4,updated_at=now() where id=$1", [runId],
    );
    await pool.query(
      "update customer_graph_reconciliation_runs set state='complete',completed_at=now(),version=5,updated_at=now() where id=$1",
      [runId],
    );
    await expect(pool.query(
      "update customer_graph_reconciliation_runs set version=6,updated_at=now() where id=$1", [runId],
    )).rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query("delete from customer_graph_reconciliation_runs where id=$1", [runId]))
      .rejects.toMatchObject({ code: "P0001" });
  });

  it("enforces monotonic checkpoints and privacy-safe immutable issue evidence", async () => {
    const actor = await actorFixture(), runId = await createRun(pool, actor);
    const firstId = "10000000-0000-0000-0000-000000000001";
    await pool.query(
      `insert into customer_graph_reconciliation_checkpoints(workspace_id,run_id,stream,last_updated_at,last_id,
       processed_count,issue_count) values($1,$2,'contact_email','2026-01-01',$3,10,1)`,
      [actor.workspaceId, runId, firstId],
    );
    await expect(pool.query(
      `update customer_graph_reconciliation_checkpoints set last_updated_at='2025-01-01',last_id=$3,
       processed_count=11,version=2,updated_at=now() where workspace_id=$1 and run_id=$2 and stream='contact_email'`,
      [actor.workspaceId, runId, randomUUID()],
    )).rejects.toMatchObject({ code: "P0001" });
    await pool.query(
      `update customer_graph_reconciliation_checkpoints set processed_count=11,version=2,updated_at=now()
       where workspace_id=$1 and run_id=$2 and stream='contact_email'`, [actor.workspaceId, runId],
    );
    const validMetadata: Record<string, unknown>[] = [
      { sourceVersion: 1 },
      { sourceVersion: 1, validationCode: "email_format" },
      { sourceVersion: 1, activeCandidateCount: 2 },
      { sourceVersion: 1 },
      { expectedVersion: 1, observedVersion: 2 },
      { sourceVersion: 1, authorityContractVersion: "legacy-p1a-root-v1" },
    ];
    const codes = ["missing_normalized_value", "invalid_legacy_value", "ambiguous_primary", "missing_company",
      "version_changed", "authority_conflict"];
    for (let index = 0; index < codes.length; index += 1) await pool.query(
      `insert into customer_graph_reconciliation_issues(workspace_id,run_id,stream,source_record_type,
       source_record_id,issue_code,safe_metadata) values($1,$2,'contact_email','contact',$3,$4,$5)`,
      [actor.workspaceId, runId, randomUUID(), codes[index], JSON.stringify(validMetadata[index])],
    );
    for (const metadata of [{ sourceVersion: 1, email: "secret@example.com" }, { sourceVersion: 0 },
      { sourceVersion: 1.5 }, { sourceVersion: "1" }, { expectedVersion: 1 },
      { sourceVersion: 1, authorityContractVersion: "donor" }]) await expect(pool.query(
      `insert into customer_graph_reconciliation_issues(workspace_id,run_id,stream,source_record_type,
       source_record_id,issue_code,safe_metadata) values($1,$2,'contact_email','contact',$3,'authority_conflict',$4)`,
      [actor.workspaceId, runId, randomUUID(), JSON.stringify(metadata)],
    )).rejects.toMatchObject({ code: "23514" });
    const issueId = (await pool.query<{ id: string }>(
      "select id from customer_graph_reconciliation_issues where run_id=$1 and issue_code='missing_normalized_value'",
      [runId],
    )).rows[0].id;
    await expect(pool.query(
      "update customer_graph_reconciliation_issues set safe_metadata='{\"sourceVersion\":2}',version=2 where id=$1",
      [issueId],
    )).rejects.toMatchObject({ code: "P0001" });
    await pool.query(
      `update customer_graph_reconciliation_issues set state='resolved',resolution_code='source_corrected',
       version=2,updated_at=now() where id=$1`, [issueId],
    );
    await expect(pool.query(
      "update customer_graph_reconciliation_issues set version=3,updated_at=now() where id=$1", [issueId],
    )).rejects.toMatchObject({ code: "P0001" });
  });

  it("rolls back service-owned 20/50/20 maximum checks under owner-root locks", async () => {
    const actor = await actorFixture(), contactId = await createContact(pool, actor);
    for (let index = 0; index < 20; index += 1) await pool.query(
      `insert into contact_identity_points(workspace_id,contact_id,kind,display_value,normalized_value,
       normalization_version,source,governing_operation_id) values($1,$2,'email',$3,$3,'email-v1','manual',$4)`,
      [actor.workspaceId, contactId, `person${index}@example.com`, randomUUID()],
    );
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select id from contacts where workspace_id=$1 and id=$2 for update", [actor.workspaceId, contactId]);
      const count = Number((await client.query(
        "select count(*) from contact_identity_points where workspace_id=$1 and contact_id=$2 and kind='email' and lifecycle='active'",
        [actor.workspaceId, contactId],
      )).rows[0].count);
      expect(count + 1).toBeGreaterThan(20);
      await client.query("rollback");
    } finally { client.release(); }
    expect(Number((await pool.query(
      "select count(*) from contact_identity_points where workspace_id=$1 and contact_id=$2", [actor.workspaceId, contactId],
    )).rows[0].count)).toBe(20);

    const companyIds: string[] = [];
    for (let index = 0; index < 50; index += 1) {
      const companyId = await createCompany(pool, actor, `limit-${index}`);
      companyIds.push(companyId);
      await pool.query(
        `insert into contact_company_affiliations(workspace_id,contact_id,company_id,role_code,is_primary,
         valid_from,governing_operation_id) values($1,$2,$3,'employee',$4,now(),$5)`,
        [actor.workspaceId, contactId, companyId, index === 0, randomUUID()],
      );
    }
    const affiliationClient = await pool.connect();
    try {
      await affiliationClient.query("begin");
      await affiliationClient.query("select id from contacts where workspace_id=$1 and id=$2 for update",
        [actor.workspaceId, contactId]);
      const count = Number((await affiliationClient.query(
        `select count(*) from contact_company_affiliations where workspace_id=$1 and contact_id=$2
         and lifecycle='active'`, [actor.workspaceId, contactId],
      )).rows[0].count);
      expect(count + 1).toBeGreaterThan(50);
      await affiliationClient.query("rollback");
    } finally { affiliationClient.release(); }
    expect(Number((await pool.query(
      "select count(*) from contact_company_affiliations where workspace_id=$1 and contact_id=$2",
      [actor.workspaceId, contactId],
    )).rows[0].count)).toBe(50);

    const teamIds = [actor.teamId];
    for (let index = 1; index < 20; index += 1) teamIds.push((await pool.query<{ id: string }>(
      `insert into teams(workspace_id,name,name_normalized,status,created_by_membership_id)
       values($1,$2,$3,'active',$4) returning id`,
      [actor.workspaceId, `Limit Team ${index}`, `limit team ${index}`, actor.membershipId],
    )).rows[0].id);
    for (const teamId of teamIds) await pool.query(
      `insert into contact_visible_teams(workspace_id,contact_id,team_id,created_by_membership_id)
       values($1,$2,$3,$4)`, [actor.workspaceId, contactId, teamId, actor.membershipId],
    );
    const teamClient = await pool.connect();
    try {
      await teamClient.query("begin");
      await teamClient.query("select id from contacts where workspace_id=$1 and id=$2 for update",
        [actor.workspaceId, contactId]);
      const count = Number((await teamClient.query(
        "select count(*) from contact_visible_teams where workspace_id=$1 and contact_id=$2",
        [actor.workspaceId, contactId],
      )).rows[0].count);
      expect(count + 1).toBeGreaterThan(20);
      await teamClient.query("rollback");
    } finally { teamClient.release(); }
    expect(Number((await pool.query(
      "select count(*) from contact_visible_teams where workspace_id=$1 and contact_id=$2",
      [actor.workspaceId, contactId],
    )).rows[0].count)).toBe(20);
  });
});

const performanceSuite = process.env.RUN_DB_PERFORMANCE === "1" ? describe : describe.skip;
const performancePool = new Pool({ connectionString });
function percentile(values: number[], quantile: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
}
function planNodes(plan: { "Node Type": string; Plans?: Array<{ "Node Type": string; Plans?: unknown[] }> }): string[] {
  return [plan["Node Type"], ...(plan.Plans ?? []).flatMap((child) => planNodes(child as typeof plan))];
}

performanceSuite("DB-05A Customer Graph representative performance", () => {
  beforeAll(async () => { await performancePool.query("select 1"); });
  afterAll(async () => { await performancePool.end(); });

  it("keeps identity, affiliation, responsibility, visibility and reconciliation plans bounded at 100,001 rows", async () => {
    await performancePool.query("truncate users cascade");
    const actor = await actorFixture(performancePool), companyId = randomUUID(), runId = randomUUID();
    await performancePool.query("begin");
    try {
      await performancePool.query("set local session_replication_role=replica");
      await performancePool.query(
        `insert into companies(id,workspace_id,display_name,name_normalized,responsible_membership_id,responsible_team_id,
         created_at,updated_at) select ('81000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,'Company '||g,
         'company '||g,$2,$3,timestamptz '2026-01-01'+((g%1000)||' seconds')::interval,
         timestamptz '2026-01-01'+((g%1000)||' seconds')::interval from generate_series(1,100001) g`,
        [actor.workspaceId, actor.membershipId, actor.teamId],
      );
      await performancePool.query(
        `insert into contacts(id,workspace_id,display_name,person_name_normalized,responsible_membership_id,
         responsible_team_id,created_at,updated_at) select ('82000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
         $1,'Contact '||g,'contact '||g,$2,$3,timestamptz '2026-01-01'+((g%1000)||' seconds')::interval,
         timestamptz '2026-01-01'+((g%1000)||' seconds')::interval from generate_series(1,100001) g`,
        [actor.workspaceId, actor.membershipId, actor.teamId],
      );
      await performancePool.query(
        `insert into contact_identity_points(id,workspace_id,contact_id,kind,display_value,normalized_value,
         normalization_version,source,governing_operation_id) select
         ('83000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
         ('82000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'email','shared@example.com',
         'shared@example.com','email-v1','legacy_root',('84000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid
         from generate_series(1,100001) g`, [actor.workspaceId],
      );
      await performancePool.query(
        `insert into company_domain_points(id,workspace_id,company_id,domain_display,domain_normalized,
         normalization_version,source,governing_operation_id) select
         ('85000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
         ('81000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'shared.example','shared.example',
         'domain-v1','legacy_root',('86000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid
         from generate_series(1,100001) g`, [actor.workspaceId],
      );
      await performancePool.query(
        `insert into contact_company_affiliations(id,workspace_id,contact_id,company_id,role_code,is_primary,
         valid_from,governing_operation_id) select ('87000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
         ('82000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$2,'employee',true,
         timestamptz '2026-01-01',('88000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid
         from generate_series(1,100001) g`, [actor.workspaceId, companyId],
      );
      await performancePool.query(
        `insert into contact_visible_teams(workspace_id,contact_id,team_id,created_by_membership_id)
         select $1,('82000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$2,$3
        from generate_series(1,100001) g`, [actor.workspaceId, actor.teamId, actor.membershipId],
      );
      await performancePool.query(
        `insert into company_visible_teams(workspace_id,company_id,team_id,created_by_membership_id)
         select $1,('81000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$2,$3
         from generate_series(1,100001) g`, [actor.workspaceId, actor.teamId, actor.membershipId],
      );
      await performancePool.query(
        `insert into customer_graph_reconciliation_runs(id,workspace_id,source_cutoff,source_cutoff_id,counts,
         operation_id,created_by_membership_id) values($1,$2,now(),gen_random_uuid(),$3,gen_random_uuid(),$4)`,
        [runId, actor.workspaceId, JSON.stringify(zeroCounts()), actor.membershipId],
      );
      await performancePool.query(
        `insert into customer_graph_reconciliation_issues(id,workspace_id,run_id,stream,source_record_type,
         source_record_id,issue_code,safe_metadata,created_at,updated_at) select
         ('89000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,$2,'contact_email','contact',
         ('82000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'missing_normalized_value',
         '{"sourceVersion":1}'::jsonb,timestamptz '2026-01-01'+((g%1000)||' seconds')::interval,
         timestamptz '2026-01-01'+((g%1000)||' seconds')::interval from generate_series(1,100001) g`,
        [actor.workspaceId, runId],
      );
      await performancePool.query("commit");
    } catch (error) { await performancePool.query("rollback"); throw error; }
    await performancePool.query(
      "analyze contacts,companies,contact_identity_points,company_domain_points,contact_company_affiliations,contact_visible_teams,company_visible_teams,customer_graph_reconciliation_issues",
    );

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

    const evidence = {
      emailCandidate: await measure("emailCandidate", `select contact_id,id from contact_identity_points where
        workspace_id=$1 and kind='email' and normalized_value='shared@example.com' and normalization_version='email-v1'
        and lifecycle='active' order by contact_id,id limit 11`, [actor.workspaceId]),
      domainCandidate: await measure("domainCandidate", `select company_id,id from company_domain_points where
        workspace_id=$1 and domain_normalized='shared.example' and normalization_version='domain-v1'
        and lifecycle='active' order by company_id,id limit 11`, [actor.workspaceId]),
      contactIdentities: await measure("contactIdentities", `select kind,normalized_value,id from contact_identity_points
        where workspace_id=$1 and contact_id=$2 and lifecycle='active' order by kind,is_primary desc,id limit 51`,
      [actor.workspaceId, "82000000-0000-0000-0000-000000050000"]),
      companyDomains: await measure("companyDomains", `select domain_normalized,id from company_domain_points
        where workspace_id=$1 and company_id=$2 and lifecycle='active' order by is_primary desc,id limit 51`,
      [actor.workspaceId, "81000000-0000-0000-0000-000000050000"]),
      affiliations: await measure("affiliations", `select contact_id,id from contact_company_affiliations where
        workspace_id=$1 and company_id=$2 and lifecycle='active' and ($3::uuid is null or contact_id>$3)
        order by contact_id,id limit 51`, [actor.workspaceId, companyId, null]),
      responsibility: await measure("responsibility", `select id,updated_at from contacts where workspace_id=$1
        and responsible_membership_id=$2 and status='active' and ($3::timestamptz is null or (updated_at,id)<($3,$4::uuid))
        order by updated_at desc nulls last,id desc nulls last limit 51`, [actor.workspaceId, actor.membershipId, null, null]),
      teamResponsibility: await measure("teamResponsibility", `select id,updated_at from companies where workspace_id=$1
        and responsible_team_id=$2 and status='active' and ($3::timestamptz is null or (updated_at,id)<($3,$4::uuid))
        order by updated_at desc nulls last,id desc nulls last limit 51`, [actor.workspaceId, actor.teamId, null, null]),
      visibility: await measure("visibility", `select contact_id from contact_visible_teams where workspace_id=$1
        and team_id=$2 and ($3::uuid is null or contact_id>$3) order by contact_id limit 51`,
      [actor.workspaceId, actor.teamId, null]),
      companyVisibility: await measure("companyVisibility", `select company_id from company_visible_teams where workspace_id=$1
        and team_id=$2 and ($3::uuid is null or company_id>$3) order by company_id limit 51`,
      [actor.workspaceId, actor.teamId, null]),
      contactDefaultList: await measure("contactDefaultList", `select id,updated_at from contacts where workspace_id=$1
        and status='active' and ($2::timestamptz is null or (updated_at,id)<($2,$3::uuid))
        order by updated_at desc nulls last,id desc nulls last limit 51`, [actor.workspaceId, null, null]),
      defaultList: await measure("defaultList", `select id,updated_at from companies where workspace_id=$1 and status='active'
        and ($2::timestamptz is null or (updated_at,id)<($2,$3::uuid))
        order by updated_at desc nulls last,id desc nulls last limit 51`, [actor.workspaceId, null, null]),
      contactDetail: await measure("contactDetail", `select c.id,c.version,p.id identity_id,a.id affiliation_id,v.team_id
        from contacts c
        left join lateral (select id from contact_identity_points where workspace_id=c.workspace_id and contact_id=c.id
          and lifecycle='active' order by kind,is_primary desc,id limit 1) p on true
        left join lateral (select id from contact_company_affiliations where workspace_id=c.workspace_id and contact_id=c.id
          and lifecycle='active' order by is_primary desc,company_id,id limit 1) a on true
        left join lateral (select team_id from contact_visible_teams where workspace_id=c.workspace_id and contact_id=c.id
          order by team_id limit 1) v on true where c.workspace_id=$1 and c.id=$2`,
      [actor.workspaceId, "82000000-0000-0000-0000-000000050000"]),
      issues: await measure("issues", `select source_record_id,id from customer_graph_reconciliation_issues where
        workspace_id=$1 and run_id=$2 and state='open' and stream='contact_email'
        and ($3::uuid is null or source_record_id>$3) order by source_record_id,id limit 51`,
      [actor.workspaceId, runId, null]),
    };

    const traversedContacts = new Set<string>();
    let contactCursorTime: Date | null = null, contactCursorId: string | null = null;
    while (true) {
      const rows: Array<{ id: string; updated_at: Date }> = (await performancePool.query<{ id: string; updated_at: Date }>(
        `select id,updated_at from contacts where workspace_id=$1 and status='active'
         and ($2::timestamptz is null or (updated_at,id)<($2,$3::uuid))
         order by updated_at desc nulls last,id desc nulls last limit 51`,
        [actor.workspaceId, contactCursorTime, contactCursorId],
      )).rows;
      const page: Array<{ id: string; updated_at: Date }> = rows.slice(0, 50);
      for (const row of page) {
        expect(traversedContacts.has(row.id)).toBe(false);
        traversedContacts.add(row.id);
      }
      if (rows.length <= 50) break;
      contactCursorTime = page[page.length - 1].updated_at;
      contactCursorId = page[page.length - 1].id;
    }
    expect(traversedContacts.size).toBe(100001);

    const traversedIssues = new Set<string>();
    let issueCursor: string | null = null;
    while (true) {
      const rows: Array<{ id: string; source_record_id: string }> = (await performancePool.query<{ id: string; source_record_id: string }>(
        `select id,source_record_id from customer_graph_reconciliation_issues where workspace_id=$1 and run_id=$2
         and state='open' and stream='contact_email' and ($3::uuid is null or source_record_id>$3)
         order by source_record_id,id limit 51`, [actor.workspaceId, runId, issueCursor],
      )).rows;
      const page: Array<{ id: string; source_record_id: string }> = rows.slice(0, 50);
      for (const row of page) {
        expect(traversedIssues.has(row.id)).toBe(false);
        traversedIssues.add(row.id);
      }
      if (rows.length <= 50) break;
      issueCursor = page[page.length - 1].source_record_id;
    }
    expect(traversedIssues.size).toBe(100001);
    const sizes = (await performancePool.query(
      `select relname,pg_relation_size(oid)::bigint heap_bytes,pg_indexes_size(oid)::bigint index_bytes
       from pg_class where relkind='r' and relname in ('contacts','companies','contact_identity_points',
       'company_domain_points','contact_company_affiliations','contact_visible_teams','company_visible_teams',
       'customer_graph_reconciliation_issues') order by relname`,
    )).rows.map((row) => ({ ...row, indexToHeapRatio: Number(row.index_bytes) / Math.max(1, Number(row.heap_bytes)) }));
    console.info("DB_05A_CUSTOMER_GRAPH_PERFORMANCE_EVIDENCE", JSON.stringify({ rows: 100001, evidence, sizes }));
  }, 240_000);
});
