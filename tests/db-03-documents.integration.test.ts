import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const connectionString = process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow";
const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString });

async function actorFixture(db = pool) {
  const user = (await db.query<{ id: string }>(
    "insert into users(display_name,status) values('Documents Owner','active') returning id",
  )).rows[0];
  const workspace = (await db.query<{ id: string }>(
    `insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
     values('Documents Workspace',$1,'active','essentials','monthly',$2) returning id`,
    [`documents-${randomUUID()}`, user.id],
  )).rows[0];
  const role = (await db.query<{ id: string }>(
    "insert into roles(workspace_id,code) values($1,'owner') returning id", [workspace.id],
  )).rows[0];
  const membership = (await db.query<{ id: string }>(
    "insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active') returning id",
    [workspace.id, user.id, role.id],
  )).rows[0];
  return { workspaceId: workspace.id, membershipId: membership.id };
}

async function createReservedDocument(client: PoolClient, actor: Awaited<ReturnType<typeof actorFixture>>, referenceCount = 1) {
  if (referenceCount < 0 || referenceCount > 20) throw new Error("document_reference_count_invalid");
  const documentId = randomUUID(), versionId = randomUUID(), objectId = randomUUID(), operationId = randomUUID();
  await client.query("begin");
  try {
    await client.query(
      `insert into document_records(id,workspace_id,governing_operation_id,created_by_membership_id,updated_by_membership_id)
       values($1,$2,$3,$4,$4)`, [documentId, actor.workspaceId, operationId, actor.membershipId],
    );
    await client.query(
      `insert into document_versions(id,workspace_id,document_id,content_version,state,display_filename,
        declared_mime_type,governing_operation_id,created_by_membership_id)
       values($1,$2,$3,1,'reserved','proposal.pdf','application/pdf',$4,$5)`,
      [versionId, actor.workspaceId, documentId, operationId, actor.membershipId],
    );
    await client.query(
      `insert into document_storage_objects(id,workspace_id,document_id,content_version,storage_adapter_code,
        residency_region_code,residency_policy_version,container_handle,object_key,encryption_mode,state,
        upload_expires_at,governing_operation_id)
       values($1,$2,$3,1,'s3','ca1','residency-v1','documents',$4,'provider_managed','reserved',now()+interval '15 minutes',$5)`,
      [objectId, actor.workspaceId, documentId,
        `workspaces/${actor.workspaceId}/documents/${documentId}/versions/1/${objectId}`, operationId],
    );
    for (let index = 0; index < referenceCount; index += 1) await client.query(
      `insert into document_record_references(workspace_id,document_id,record_type,record_id,created_by_membership_id)
       values($1,$2,'crm.lead',$3,$4)`, [actor.workspaceId, documentId, randomUUID(), actor.membershipId],
    );
    await client.query("commit");
    return { documentId, versionId, objectId };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function makeAvailable(client: PoolClient, actor: Awaited<ReturnType<typeof actorFixture>>,
  document: Awaited<ReturnType<typeof createReservedDocument>>) {
  const hash = "a".repeat(64);
  let operationId = randomUUID();
  await client.query("begin");
  await client.query(
    `update document_versions set state='uploaded',detected_mime_type='application/pdf',byte_size=1024,
      sha256_hex=$3,governing_operation_id=$4 where workspace_id=$1 and document_id=$2 and content_version=1`,
    [actor.workspaceId, document.documentId, hash, operationId],
  );
  await client.query(
    `update document_storage_objects set state='uploaded',upload_verified_at=now(),provider_object_version='v1',
      etag='etag-v1',governing_operation_id=$3,updated_at=now() where workspace_id=$1 and id=$2`,
    [actor.workspaceId, document.objectId, operationId],
  );
  await client.query(
    `update document_records set availability='quarantined',version=2,governing_operation_id=$3,
      updated_by_membership_id=$4,updated_at=now() where workspace_id=$1 and id=$2`,
    [actor.workspaceId, document.documentId, operationId, actor.membershipId],
  );
  await client.query("commit");

  operationId = randomUUID();
  await client.query("begin");
  await client.query("update document_versions set state='quarantined',governing_operation_id=$3 where workspace_id=$1 and document_id=$2",
    [actor.workspaceId, document.documentId, operationId]);
  await client.query(
    `update document_storage_objects set state='quarantined',next_attempt_at=now(),governing_operation_id=$3,
      updated_at=now() where workspace_id=$1 and id=$2`, [actor.workspaceId, document.objectId, operationId],
  );
  await client.query(
    `update document_records set version=3,governing_operation_id=$3,updated_by_membership_id=$4,updated_at=now()
     where workspace_id=$1 and id=$2`, [actor.workspaceId, document.documentId, operationId, actor.membershipId],
  );
  await client.query("commit");

  operationId = randomUUID();
  await client.query(
    `update document_storage_objects set state='scanning',attempt_count=1,next_attempt_at=now()+interval '15 minutes',
      governing_operation_id=$3,updated_at=now() where workspace_id=$1 and id=$2`,
    [actor.workspaceId, document.objectId, operationId],
  );

  operationId = randomUUID();
  await client.query("begin");
  await client.query(
    `insert into document_scan_results(workspace_id,storage_object_id,attempt_number,outcome,engine_code,
      engine_version,signature_set_version,scanned_sha256_hex,safe_result_code,started_at,completed_at,governing_operation_id)
     values($1,$2,1,'clean','scanner','1','sig-1',$3,'clean',now()-interval '1 second',now(),$4)`,
    [actor.workspaceId, document.objectId, hash, operationId],
  );
  await client.query(
    `update document_versions set state='available',available_at=now(),governing_operation_id=$3
     where workspace_id=$1 and document_id=$2`, [actor.workspaceId, document.documentId, operationId],
  );
  await client.query(
    `update document_storage_objects set state='clean',next_attempt_at=null,governing_operation_id=$3,updated_at=now()
     where workspace_id=$1 and id=$2`, [actor.workspaceId, document.objectId, operationId],
  );
  await client.query(
    `update document_records set availability='available',version=4,governing_operation_id=$3,
      updated_by_membership_id=$4,updated_at=now() where workspace_id=$1 and id=$2`,
    [actor.workspaceId, document.documentId, operationId, actor.membershipId],
  );
  await client.query("commit");
  return hash;
}

async function redactAvailable(client: PoolClient, actor: Awaited<ReturnType<typeof actorFixture>>,
  document: Awaited<ReturnType<typeof createReservedDocument>>) {
  let operationId=randomUUID();
  await client.query("begin");
  await client.query(
    `update document_records set lifecycle='redaction_pending',availability='unavailable',version=5,
      governing_operation_id=$3,updated_by_membership_id=$4,redaction_requested_at=now(),
      redaction_requested_by_membership_id=$4,updated_at=now() where workspace_id=$1 and id=$2`,
    [actor.workspaceId,document.documentId,operationId,actor.membershipId],
  );
  await client.query(
    `update document_storage_objects set state='delete_pending',delete_requested_at=now(),
      governing_operation_id=$3,updated_at=now() where workspace_id=$1 and id=$2`,
    [actor.workspaceId,document.objectId,operationId],
  );
  await client.query("commit");
  operationId=randomUUID();
  await client.query("begin");
  await client.query(
    `update document_versions set state='redacted',display_filename=null,declared_mime_type=null,
      detected_mime_type=null,byte_size=null,sha256_hex=null,redaction_marker='content_redacted',
      redacted_at=now(),available_at=null,governing_operation_id=$3 where workspace_id=$1 and document_id=$2`,
    [actor.workspaceId,document.documentId,operationId],
  );
  await client.query(
    `update document_storage_objects set state='purged',provider_object_version=null,etag=null,
      encryption_key_handle=null,delete_verified_at=now(),governing_operation_id=$3,updated_at=now()
     where workspace_id=$1 and id=$2`,[actor.workspaceId,document.objectId,operationId],
  );
  await client.query(
    `update document_records set lifecycle='redacted',version=6,governing_operation_id=$3,
      updated_by_membership_id=$4,redacted_at=now(),redacted_by_membership_id=$4,updated_at=now()
     where workspace_id=$1 and id=$2`,[actor.workspaceId,document.documentId,operationId,actor.membershipId],
  );
  await client.query("commit");
}

suite("DB-03 Documents persistence", () => {
  beforeAll(async () => { await pool.query("select 1"); });
  beforeEach(async () => { await pool.query("truncate users cascade"); });
  afterAll(async () => { await pool.end(); });

  it("completes provider-neutral reservation, scan, and clean availability atomically", async () => {
    const actor = await actorFixture(), client = await pool.connect();
    try {
      const document = await createReservedDocument(client, actor);
      await makeAvailable(client, actor, document);
      expect((await pool.query(
        `select d.lifecycle,d.availability,d.version,v.state version_state,o.state object_state,
          (select count(*)::int from document_scan_results where storage_object_id=o.id) scans
         from document_records d join document_versions v on v.workspace_id=d.workspace_id and v.document_id=d.id
         join document_storage_objects o on o.workspace_id=d.workspace_id and o.document_id=d.id
         where d.id=$1`, [document.documentId],
      )).rows[0]).toEqual({ lifecycle: "active", availability: "available", version: 4,
        version_state: "available", object_state: "clean", scans: 1 });
    } finally { client.release(); }
  });

  it("rejects invalid MIME, filename, object locator, reference, provenance, and metadata", async () => {
    const actor = await actorFixture(), other = await actorFixture(), client = await pool.connect();
    try {
      const document = await createReservedDocument(client, actor, 0);
      await expect(pool.query(
        `insert into document_versions(workspace_id,document_id,content_version,state,display_filename,
          declared_mime_type,governing_operation_id,created_by_membership_id)
         values($1,$2,2,'reserved','../bad.exe','application/octet-stream',$3,$4)`,
        [actor.workspaceId, document.documentId, randomUUID(), actor.membershipId],
      )).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query(
        `insert into document_record_references(workspace_id,document_id,record_type,record_id,relationship_role,created_by_membership_id)
         values($1,$2,'crm.unknown',$3,'owner',$4)`,
        [actor.workspaceId, document.documentId, randomUUID(), actor.membershipId],
      )).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query(
        `insert into document_record_references(workspace_id,document_id,record_type,record_id,created_by_membership_id)
         values($1,$2,'crm.lead',$3,$4)`,
        [actor.workspaceId, document.documentId, randomUUID(), other.membershipId],
      )).rejects.toMatchObject({ code: "23503" });
      await expect(pool.query(
        `insert into document_storage_objects(workspace_id,document_id,content_version,storage_adapter_code,
          residency_region_code,residency_policy_version,container_handle,object_key,encryption_mode,
          upload_expires_at,governing_operation_id)
         values($1,$2,1,'S3','x','v1','bucket','/bad/../key','provider_managed',now(),$3)`,
        [actor.workspaceId, document.documentId, randomUUID()],
      )).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query(
        `insert into retention_legal_holds(workspace_id,record_id,reason_code,policy_version,
          governing_operation_id,placed_by_membership_id,status,released_at)
         values($1,$2,'unknown','v1',$3,$4,'active',now())`,
        [actor.workspaceId, document.documentId, randomUUID(), actor.membershipId],
      )).rejects.toMatchObject({ code: "23514" });
    } finally { client.release(); }
  });

  it("enforces immutable versions, objects, scans, roots, and NO ACTION retention", async () => {
    const actor = await actorFixture(), client = await pool.connect();
    try {
      const document = await createReservedDocument(client, actor);
      await expect(pool.query("delete from document_records where id=$1", [document.documentId]))
        .rejects.toMatchObject({ code: "P0001" });
      await expect(pool.query("delete from document_versions where id=$1", [document.versionId]))
        .rejects.toMatchObject({ code: "P0001" });
      await expect(pool.query("delete from document_storage_objects where id=$1", [document.objectId]))
        .rejects.toMatchObject({ code: "P0001" });
      await expect(pool.query("delete from workspaces where id=$1", [actor.workspaceId]))
        .rejects.toMatchObject({ code: "23503" });
      await expect(pool.query(
        `update document_versions set display_filename='replacement.pdf',governing_operation_id=$2 where id=$1`,
        [document.versionId, randomUUID()],
      )).rejects.toMatchObject({ code: "P0001" });
    } finally { client.release(); }
  });

  it("scrubs all classified version and object facts through the privileged redaction flow", async () => {
    const actor = await actorFixture(), client = await pool.connect();
    try {
      const document = await createReservedDocument(client, actor);
      await makeAvailable(client, actor, document);
      await redactAvailable(client,actor,document);
      expect((await pool.query(
        `select v.display_filename,v.declared_mime_type,v.detected_mime_type,v.byte_size,v.sha256_hex,
          v.redaction_marker,o.provider_object_version,o.etag,o.encryption_key_handle,d.lifecycle,d.availability
         from document_records d join document_versions v on v.workspace_id=d.workspace_id and v.document_id=d.id
         join document_storage_objects o on o.workspace_id=d.workspace_id and o.document_id=d.id where d.id=$1`,
        [document.documentId],
      )).rows[0]).toEqual({ display_filename: null, declared_mime_type: null, detected_mime_type: null,
        byte_size: null, sha256_hex: null, redaction_marker: "content_redacted", provider_object_version: null,
        etag: null, encryption_key_handle: null, lifecycle: "redacted", availability: "unavailable" });

      let operationId=randomUUID();
      await client.query("begin");
      await client.query(
        `update document_records set lifecycle='purge_pending',version=7,governing_operation_id=$3,
          updated_by_membership_id=$4,purge_requested_at=now(),purge_requested_by_membership_id=$4,updated_at=now()
         where workspace_id=$1 and id=$2`,[actor.workspaceId,document.documentId,operationId,actor.membershipId],
      );
      await client.query("commit");
      operationId=randomUUID();
      await client.query("begin");
      await client.query(
        `update document_versions set state='purged',purged_at=now(),governing_operation_id=$3
         where workspace_id=$1 and document_id=$2`,[actor.workspaceId,document.documentId,operationId],
      );
      await client.query(
        `update document_records set lifecycle='purged',version=8,governing_operation_id=$3,
          updated_by_membership_id=$4,purged_at=now(),purged_by_membership_id=$4,updated_at=now()
         where workspace_id=$1 and id=$2`,[actor.workspaceId,document.documentId,operationId,actor.membershipId],
      );
      await client.query("commit");
      expect((await pool.query("select lifecycle,availability from document_records where id=$1",[document.documentId])).rows[0])
        .toEqual({lifecycle:"purged",availability:"unavailable"});
    } finally { client.release(); }
  });

  it("retains Platform legal holds and deterministically fences a competing purge", async () => {
    const actor = await actorFixture(), setup = await pool.connect(), holdClient = await pool.connect(), purgeClient = await pool.connect();
    try {
      const document = await createReservedDocument(setup, actor, 0);
      await holdClient.query("begin");
      await holdClient.query("select id from document_records where workspace_id=$1 and id=$2 for update",
        [actor.workspaceId, document.documentId]);
      const holdId = randomUUID();
      await holdClient.query(
        `insert into retention_legal_holds(id,workspace_id,record_id,reason_code,policy_version,
          governing_operation_id,placed_by_membership_id) values($1,$2,$3,'legal_dispute','v1',$4,$5)`,
        [holdId, actor.workspaceId, document.documentId, randomUUID(), actor.membershipId],
      );
      await purgeClient.query("begin");
      const purgeLock = purgeClient.query("select id from document_records where workspace_id=$1 and id=$2 for update",
        [actor.workspaceId, document.documentId]);
      await holdClient.query("commit");
      await purgeLock;
      expect((await purgeClient.query(
        `select id from retention_legal_holds where workspace_id=$1 and record_type='crm.document'
         and record_id=$2 and status='active' for share`, [actor.workspaceId, document.documentId],
      )).rows).toHaveLength(1);
      await purgeClient.query("rollback");
      await expect(pool.query("delete from retention_legal_holds where id=$1", [holdId]))
        .rejects.toMatchObject({ code: "P0001" });
    } finally { setup.release(); holdClient.release(); purgeClient.release(); }
  });

  it("rolls back every fixture write on late reference or scan failure and enforces 0..20 refs", async () => {
    const actor = await actorFixture(), client = await pool.connect();
    try {
      await createReservedDocument(client, actor, 0);
      await createReservedDocument(client, actor, 20);
      await expect(createReservedDocument(client, actor, 21)).rejects.toThrow("document_reference_count_invalid");
      const before = Number((await pool.query("select count(*) count from document_records")).rows[0].count);
      await client.query("begin");
      try {
        const documentId=randomUUID(), operationId=randomUUID();
        await client.query(
          `insert into document_records(id,workspace_id,governing_operation_id,created_by_membership_id,updated_by_membership_id)
           values($1,$2,$3,$4,$4)`,[documentId,actor.workspaceId,operationId,actor.membershipId],
        );
        await client.query(
          `insert into document_versions(workspace_id,document_id,content_version,state,display_filename,
            declared_mime_type,governing_operation_id,created_by_membership_id)
           values($1,$2,1,'reserved','rollback.pdf','application/pdf',$3,$4)`,
          [actor.workspaceId,documentId,operationId,actor.membershipId],
        );
        await client.query(
          `insert into document_record_references(workspace_id,document_id,record_type,record_id,created_by_membership_id)
           values($1,$2,'crm.invalid',$3,$4)`,
          [actor.workspaceId, documentId, randomUUID(), actor.membershipId],
        );
        await client.query("commit");
        throw new Error("late failure expected");
      } catch (error) {
        await client.query("rollback");
        expect(error).toMatchObject({ code: "23514" });
      }
      expect(Number((await pool.query("select count(*) count from document_records")).rows[0].count)).toBe(before);

      const scanned=await createReservedDocument(client,actor,0);
      await makeAvailable(client,actor,scanned);
      await expect(pool.query(
        `insert into document_scan_results(workspace_id,storage_object_id,attempt_number,outcome,engine_code,
          engine_version,signature_set_version,scanned_sha256_hex,safe_result_code,started_at,completed_at,governing_operation_id)
         select workspace_id,id,1,'clean','scanner','1','sig',repeat('a',64),'clean',now(),now(),governing_operation_id
         from document_storage_objects where id=$1`,[scanned.objectId],
      )).rejects.toMatchObject({code:"23505"});
      const objectOperation=(await pool.query("select governing_operation_id from document_storage_objects where id=$1",[scanned.objectId])).rows[0].governing_operation_id;
      await client.query("begin");
      await client.query(
        `insert into document_scan_results(workspace_id,storage_object_id,attempt_number,outcome,engine_code,
          engine_version,signature_set_version,scanned_sha256_hex,safe_result_code,started_at,completed_at,governing_operation_id)
         values($1,$2,2,'clean','scanner','1','sig',$3,'clean',now(),now(),$4)`,
        [actor.workspaceId,scanned.objectId,"b".repeat(64),objectOperation],
      );
      await expect(client.query("commit")).rejects.toMatchObject({code:"P0001"});
      await client.query("rollback");
      expect(Number((await pool.query("select count(*) count from document_scan_results where storage_object_id=$1",[scanned.objectId])).rows[0].count)).toBe(1);
    } finally { client.release(); }
  });

  it("installs only stable v1 integrity triggers and no cross-table legal-hold trigger", async () => {
    const rows = (await pool.query<{ tgname: string }>(
      `select tgname from pg_trigger where not tgisinternal and
       tgrelid in ('document_records'::regclass,'document_versions'::regclass,'document_storage_objects'::regclass,
         'document_scan_results'::regclass,'retention_legal_holds'::regclass) order by tgname`,
    )).rows.map((row) => row.tgname);
    expect(rows).toEqual([
      "document_records_enforce_v1", "document_records_pairing_v1",
      "document_scan_results_append_only_v1", "document_scan_results_pairing_v1",
      "document_storage_objects_enforce_v1", "document_storage_objects_pairing_v1",
      "document_versions_enforce_v1", "document_versions_scrub_pairing_v1",
      "retention_legal_holds_enforce_v1",
    ]);
  });
});

const performanceSuite = process.env.RUN_DB_PERFORMANCE === "1" ? describe : describe.skip;
const performancePool = new Pool({ connectionString });

function percentile(values: number[], quantile: number) {
  return [...values].sort((left, right) => left - right)[Math.ceil(values.length * quantile) - 1];
}

function planNodes(plan: unknown): string[] {
  if (!plan || typeof plan !== "object") return [];
  const value = plan as { [key: string]: unknown; Plans?: unknown[] };
  return [typeof value["Node Type"] === "string" ? value["Node Type"] : "",
    ...(value.Plans ?? []).flatMap(planNodes)].filter(Boolean);
}

type DocumentPageRow={id:string;updated_at:Date;content_version?:number;object_id?:string};

performanceSuite("DB-03 Documents representative plans", () => {
  afterAll(async () => { await performancePool.end(); });

  it("proves linked, unlinked, access, worker, hold, and version keysets at representative scale", async () => {
    await performancePool.query("truncate users cascade");
    const actor = await actorFixture(performancePool);
    const targetId = "60000000-0000-0000-0000-000000000001";
    await performancePool.query("begin");
    try {
      await performancePool.query("set local session_replication_role=replica");
      await performancePool.query(
        `insert into document_records(id,workspace_id,lifecycle,availability,version,current_content_version,
          governing_operation_id,created_by_membership_id,updated_by_membership_id,created_at,updated_at)
         select ('61000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,'active','available',1,1,
          ('62000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$2,$2,
          timestamptz '2026-01-01'+((g%1000)||' seconds')::interval,
          timestamptz '2026-01-01'+((g%1000)||' seconds')::interval from generate_series(1,100001) g`,
        [actor.workspaceId, actor.membershipId],
      );
      await performancePool.query(
        `insert into document_versions(workspace_id,document_id,content_version,state,display_filename,declared_mime_type,
          detected_mime_type,byte_size,sha256_hex,governing_operation_id,created_by_membership_id,available_at)
         select $1,('61000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,1,'available','f.pdf','application/pdf',
          'application/pdf',1024,repeat('a',64),('62000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$2,now()
         from generate_series(1,100001) g`, [actor.workspaceId, actor.membershipId],
      );
      await performancePool.query(
        `insert into document_storage_objects(id,workspace_id,document_id,content_version,storage_adapter_code,
          residency_region_code,residency_policy_version,container_handle,object_key,provider_object_version,etag,
          encryption_mode,state,upload_expires_at,upload_verified_at,attempt_count,governing_operation_id)
         select ('63000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
          ('61000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,1,'s3','ca1','v1','docs','objects/'||g,
          'v1','etag','provider_managed','clean',now(),now(),1,
          ('62000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid from generate_series(1,100001) g`, [actor.workspaceId],
      );
      await performancePool.query(
        `insert into document_record_references(workspace_id,document_id,record_type,record_id,created_by_membership_id)
         select $1,('61000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'crm.lead',$2,$3
         from generate_series(1,100001) g`, [actor.workspaceId, targetId, actor.membershipId],
      );
      await performancePool.query(
        `insert into document_scan_results(workspace_id,storage_object_id,attempt_number,outcome,engine_code,
          engine_version,signature_set_version,scanned_sha256_hex,safe_result_code,started_at,completed_at,governing_operation_id)
         select $1,('63000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,1,'clean','scanner','1','sig-1',
          repeat('a',64),'clean',now()-interval '1 second',now(),
          ('62000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid from generate_series(1,100001) g`,
        [actor.workspaceId],
      );
      await performancePool.query(
        `insert into document_records(id,workspace_id,governing_operation_id,created_by_membership_id,updated_by_membership_id,
          created_at,updated_at)
         select ('64000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
          ('65000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$2,$2,
          timestamptz '2026-02-01'+((g%1000)||' seconds')::interval,
          timestamptz '2026-02-01'+((g%1000)||' seconds')::interval from generate_series(1,100001) g`,
        [actor.workspaceId, actor.membershipId],
      );
      await performancePool.query(
        `insert into document_storage_objects(id,workspace_id,document_id,content_version,storage_adapter_code,
          residency_region_code,residency_policy_version,container_handle,object_key,encryption_mode,state,
          upload_expires_at,upload_verified_at,delete_requested_at,next_attempt_at,attempt_count,governing_operation_id)
         select ('66000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
          ('67000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,1,'s3','ca1','v1','worker','worker/'||g,
          'provider_managed',(array['quarantined','scanning','failed','delete_pending'])[(g%4)+1],now(),now(),
          case when g%4=3 then now() else null end,case when g%4<3 then now() else null end,1,
          ('68000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid from generate_series(1,100001) g`, [actor.workspaceId],
      );
      await performancePool.query(
        `insert into retention_legal_holds(workspace_id,record_id,reason_code,policy_version,governing_operation_id,placed_by_membership_id)
         select $1,('69000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'regulatory','v1',
          ('6a000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$2 from generate_series(1,100001) g`,
        [actor.workspaceId, actor.membershipId],
      );
      await performancePool.query("commit");
    } catch (error) { await performancePool.query("rollback"); throw error; }

    await performancePool.query("begin");
    try {
      await performancePool.query("set local session_replication_role=replica");
      await performancePool.query(
        `insert into document_versions(workspace_id,document_id,content_version,state,display_filename,declared_mime_type,
          detected_mime_type,byte_size,sha256_hex,governing_operation_id,created_by_membership_id,available_at)
         select $1,'61000000-0000-0000-0000-000000000001',g,'available','f-'||g||'.pdf','application/pdf',
          'application/pdf',1024,repeat('b',64),('6b000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$2,now()
         from generate_series(2,100) g`, [actor.workspaceId, actor.membershipId],
      );
      await performancePool.query(
        `insert into document_storage_objects(id,workspace_id,document_id,content_version,storage_adapter_code,
          residency_region_code,residency_policy_version,container_handle,object_key,provider_object_version,etag,
          encryption_mode,state,upload_expires_at,upload_verified_at,attempt_count,governing_operation_id)
         select ('6c000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
          '61000000-0000-0000-0000-000000000001',g,'s3','ca1','v1','docs','history/'||g,'v'||g,'etag-'||g,
          'provider_managed','clean',now(),now(),1,('6b000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid
         from generate_series(2,100) g`, [actor.workspaceId],
      );
      await performancePool.query(
        `update document_records set version=2,current_content_version=100,governing_operation_id=$3,
          updated_at=timestamptz '2030-01-01' where workspace_id=$1 and id=$2`,
        [actor.workspaceId,"61000000-0000-0000-0000-000000000001",randomUUID()],
      );
      await performancePool.query("commit");
    } catch(error){await performancePool.query("rollback");throw error;}

    const linkedSql = `select d.id,d.updated_at,v.content_version,o.id object_id from document_record_references ref
      join document_records d on d.workspace_id=ref.workspace_id and d.id=ref.document_id
      join document_versions v on v.workspace_id=d.workspace_id and v.document_id=d.id and v.content_version=d.current_content_version
      join document_storage_objects o on o.workspace_id=d.workspace_id and o.document_id=d.id and o.content_version=d.current_content_version
      where ref.workspace_id=$1 and ref.record_type='crm.lead' and ref.record_id=$2 and d.lifecycle='active'
      and d.availability='available' and v.state='available' and o.state='clean'
      and ($3::timestamptz is null or (d.updated_at,d.id)<($3::timestamptz,$4::uuid))
      order by d.updated_at desc nulls last,d.id desc nulls last limit 51`;
    const unlinkedSql = `select d.id,d.updated_at from document_records d where d.workspace_id=$1
      and d.created_by_membership_id=$2 and d.lifecycle='active'
      and not exists(select 1 from document_record_references ref where ref.workspace_id=d.workspace_id and ref.document_id=d.id)
      and ($3::timestamptz is null or (d.updated_at,d.id)<($3::timestamptz,$4::uuid))
      order by d.updated_at desc nulls last,d.id desc nulls last limit 51`;
    const accessSql = `select d.id,v.content_version,o.id object_id from document_records d
      join document_versions v on v.workspace_id=d.workspace_id and v.document_id=d.id and v.content_version=d.current_content_version
      join document_storage_objects o on o.workspace_id=d.workspace_id and o.document_id=d.id and o.content_version=d.current_content_version
      where d.workspace_id=$1 and d.id=$2 and d.lifecycle='active' and d.availability='available'
      and v.state='available' and o.state='clean'`;
    const workerSql = `select id from document_storage_objects where state=$1 and next_attempt_at<=now() and attempt_count<3
      order by next_attempt_at,id limit 51`;
    const purgeSql = `select id from document_storage_objects where workspace_id=$1 and state='delete_pending'
      order by updated_at,id limit 51`;
    const holdSql = `select id from retention_legal_holds where workspace_id=$1 and record_type='crm.document'
      and record_id=$2 and status='active' for share`;
    const versionSql = `select id,content_version from document_versions where workspace_id=$1 and document_id=$2
      and content_version<$3 order by content_version desc limit 51`;

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

    const firstLinked = (await performancePool.query<DocumentPageRow>(linkedSql, [actor.workspaceId, targetId, null, null])).rows;
    expect(firstLinked[0]).toMatchObject({ id:"61000000-0000-0000-0000-000000000001",content_version:100 });
    const linkedIds: string[] = [];
    const linkedOrder:Array<{id:string;updated_at:Date}>=[];
    let cursorTime: Date | null = null, cursorId: string | null = null;
    while (true) {
      const rows:DocumentPageRow[] = (await performancePool.query<DocumentPageRow>(
        linkedSql,[actor.workspaceId,targetId,cursorTime,cursorId],
      )).rows;
      linkedIds.push(...rows.slice(0, 50).map((row) => row.id));
      linkedOrder.push(...rows.slice(0,50).map((row)=>({id:row.id,updated_at:row.updated_at})));
      if (rows.length<=50) break;
      cursorTime=rows[49].updated_at; cursorId=rows[49].id;
    }
    expect(linkedIds).toHaveLength(100001);
    expect(new Set(linkedIds).size).toBe(100001);
    expect(linkedOrder.some((row,index)=>index>0&&row.updated_at.getTime()===linkedOrder[index-1].updated_at.getTime())).toBe(true);

    const firstUnlinked = (await performancePool.query<DocumentPageRow>(
      unlinkedSql,[actor.workspaceId,actor.membershipId,null,null],
    )).rows;
    const unlinkedIds: string[] = [];
    cursorTime=null; cursorId=null;
    while (true) {
      const rows:DocumentPageRow[] = (await performancePool.query<DocumentPageRow>(
        unlinkedSql,[actor.workspaceId,actor.membershipId,cursorTime,cursorId],
      )).rows;
      unlinkedIds.push(...rows.slice(0,50).map((row) => row.id));
      if(rows.length<=50)break; cursorTime=rows[49].updated_at; cursorId=rows[49].id;
    }
    expect(unlinkedIds).toHaveLength(100001);
    expect(new Set(unlinkedIds).size).toBe(100001);

    const linkedBoundary=firstLinked[49], unlinkedBoundary=firstUnlinked[49];
    const evidence = {
      linked: await measure("linked",linkedSql,[actor.workspaceId,targetId,linkedBoundary.updated_at,linkedBoundary.id]),
      unlinked: await measure("unlinked",unlinkedSql,[actor.workspaceId,actor.membershipId,unlinkedBoundary.updated_at,unlinkedBoundary.id]),
      access: await measure("access",accessSql,[actor.workspaceId,linkedIds[0]]),
      quarantinedWorker: await measure("quarantinedWorker",workerSql,["quarantined"]),
      scanningWorker: await measure("scanningWorker",workerSql,["scanning"]),
      failedWorker: await measure("failedWorker",workerSql,["failed"]),
      purgeBatch: await measure("purgeBatch",purgeSql,[actor.workspaceId]),
      hold: await measure("hold",holdSql,[actor.workspaceId,"69000000-0000-0000-0000-000000050000"]),
      versions: await measure("versions",versionSql,[actor.workspaceId,linkedIds[0],101]),
    };
    const sizes=(await performancePool.query(
      `select relname,pg_relation_size(oid)::bigint heap_bytes,pg_indexes_size(oid)::bigint index_bytes
       from pg_class where relkind='r' and (relname like 'document_%' or relname='retention_legal_holds') order by relname`,
    )).rows.map((row)=>({...row,indexToHeapRatio:Number(row.index_bytes)/Math.max(1,Number(row.heap_bytes))}));
    const reservationSamples:number[]=[],scrubSamples:number[]=[];
    const transactionClient=await performancePool.connect();
    try{
      const documents:Array<Awaited<ReturnType<typeof createReservedDocument>>>=[];
      for(let index=0;index<30;index+=1){
        const started=performance.now();
        const document=await createReservedDocument(transactionClient,actor,0);
        reservationSamples.push(performance.now()-started);
        await makeAvailable(transactionClient,actor,document);
        documents.push(document);
      }
      for(const document of documents){const started=performance.now();await redactAvailable(transactionClient,actor,document);scrubSamples.push(performance.now()-started);}
    }finally{transactionClient.release();}
    const reservationP95=percentile(reservationSamples,.95),scrubP95=percentile(scrubSamples,.95);
    expect(reservationP95).toBeLessThan(200);expect(scrubP95).toBeLessThan(200);
    console.info("DB_03_DOCUMENTS_PERFORMANCE_EVIDENCE",JSON.stringify({rows:100001,evidence,reservationP95,scrubP95,sizes}));
  }, 240_000);
});
