import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import {
  GROUPS, INTAKE_SOURCE_COLUMNS, LEAD_SOURCE_COLUMNS, actorFixture, emptyInventory, selectList,
  planIndexes, planNodes, sourceInventoryDigest, vnextInventoryDigest, type RawRow,
} from "./support/db-06b-lead-vnext.helpers";

const connectionString = process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow";
const parsedDatabaseUrl = new URL(connectionString);
const isIsolatedLocalDatabase = ["127.0.0.1", "localhost", "::1"].includes(parsedDatabaseUrl.hostname)
  && parsedDatabaseUrl.port === "54329" && /^\/nexaflow(?:_db0?6b|_test|$)/.test(parsedDatabaseUrl.pathname);
const boundedEvidenceSuite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;

boundedEvidenceSuite("DB-06B bounded 100-row integrity evidence", () => {
  const performancePool = new Pool({ connectionString });
  beforeAll(async () => { expect(isIsolatedLocalDatabase).toBe(true); await performancePool.query("select 1"); });
  afterAll(async () => { await performancePool.end(); });

  it("traverses and HMAC-compares exactly 100 representative Leads with transparent bounded plans", async () => {
    if (!isIsolatedLocalDatabase) throw new Error("unsafe_database_target"); await performancePool.query("truncate users cascade");
    const actor = await actorFixture(performancePool), runId = randomUUID();
    await performancePool.query("begin");
    try {
      await performancePool.query("set local session_replication_role=replica");
      await performancePool.query("delete from pipeline_stages where workspace_id=$1", [actor.workspaceId]);
      await performancePool.query(`insert into companies(id,workspace_id,display_name,name_normalized,updated_at)
        select ('e1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,'Company '||g,'company '||g,
        timestamptz '2026-01-01'+((g%10)||' seconds')::interval from generate_series(1,100) g`, [actor.workspaceId]);
      await performancePool.query(`insert into contacts(id,workspace_id,display_name,person_name_normalized,company_id,updated_at)
        select ('e2000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,'Contact '||g,'contact '||g,
        ('e1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        timestamptz '2026-01-01'+((g%10)||' seconds')::interval from generate_series(1,100) g`, [actor.workspaceId]);
      await performancePool.query(`insert into pipeline_stages(id,workspace_id,name,position,status,updated_at)
        select ('e3000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,'Stage '||g,g+100,'active',
        timestamptz '2026-01-01'+((g%10)||' seconds')::interval from generate_series(1,100) g`, [actor.workspaceId]);
      await performancePool.query(`insert into leads(id,workspace_id,display_name,person_name_normalized,email_display,
        email_normalized,source,original_source_category,original_source_medium,original_source_detail,original_campaign_context,
        attribution_contract_version,intake_channel,stage_id,status,visibility,contact_id,company_id,lifecycle_definition_id,updated_at) select
        ('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,'Lead '||g,'lead '||g,
        'lead-'||g||'@example.test','lead-'||g||'@example.test','manual','manual','unknown','{}','{}','p1a-attribution-v1',
        'manual',('e3000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'open','workspace',
        ('e2000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        ('e1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        '00000000-0000-4000-8000-000000000001'::uuid,
        timestamptz '2026-01-01'+((g%10)||' seconds')::interval from generate_series(1,100) g`, [actor.workspaceId]);
      await performancePool.query(`insert into lead_intakes(id,workspace_id,intake_channel,idempotency_key,
        actor_membership_id,request_hash,contract_version,normalization_version,attribution_contract_version,source_category,
        source_medium,state,lead_id,outcome) select ('a2000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,'manual',
        'db06b-key-'||lpad(g::text,16,'0'),$2,repeat('a',64),'lead-inquiry-intake.v1','p1a-identity-v2','p1a-attribution-v1',
        'manual','unknown','committed',('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'{}'::jsonb
        from generate_series(1,100) g`, [actor.workspaceId, actor.membershipId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_runs(id,workspace_id,state,source_cutoff_at,
        source_cutoff_id,leads_scanned,leads_verified,issues_opened,operation_id,started_at,completed_at,
        created_by_membership_id) values($1,$2,'complete','2026-01-01 00:00:09+00',
        'a1000000-0000-0000-0000-000000000099',100,100,100,gen_random_uuid(),now(),now(),$3)`,
      [runId, actor.workspaceId, actor.membershipId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_runs(id,workspace_id,source_cutoff_at,
        source_cutoff_id,operation_id,created_by_membership_id,updated_at) select
        ('c1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
        timestamptz '2026-01-01'+((g%10)||' seconds')::interval,gen_random_uuid(),gen_random_uuid(),$2,
        timestamptz '2026-01-01'+((g%10)||' seconds')::interval from generate_series(1,99) g`,
      [actor.workspaceId, actor.membershipId]);
      await performancePool.query(`insert into lead_vnext_mappings(workspace_id,lead_id,source_version,
        verified_source_version,state,reconciliation_run_id,verified_at,governing_operation_id) select $1,
        ('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,1,1,'verified',$2,now(),gen_random_uuid()
        from generate_series(1,100) g`, [actor.workspaceId, runId]);
      await performancePool.query(`insert into lead_visible_teams(workspace_id,lead_id,team_id)
        select $1,('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$2 from generate_series(1,100) g`,
      [actor.workspaceId, actor.teamId]);
      await performancePool.query(`insert into lead_identity_reviews(id,workspace_id,intake_id,lead_id,state,version,
        resolved_at,resolved_by_membership_id,created_at,updated_at) select
        ('b1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
        ('a2000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        ('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        case when g%2=0 then 'resolved' else 'pending' end,1,
        case when g%2=0 then now() else null end,case when g%2=0 then $2::uuid else null end,
        timestamptz '2026-01-01'+((g%10)||' seconds')::interval,
        timestamptz '2026-01-01'+((g%10)||' seconds')::interval from generate_series(1,100) g`,
      [actor.workspaceId, actor.membershipId]);
      await performancePool.query(`insert into lead_identity_candidates(id,workspace_id,review_id,contact_id,
        evidence_kind,evidence_strength,normalization_version,target_version,evidence_metadata) select
        ('b2000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
        ('b1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        ('e2000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'email','strong','p1a-identity-v2',1,'{}'
        from generate_series(1,100) g`, [actor.workspaceId]);
      await performancePool.query(`insert into lead_identity_decisions(id,workspace_id,intake_id,review_id,operation,
        idempotency_key,request_hash,request_id,correlation_id,governing_outcome,actor_membership_id,
        expected_lead_version,expected_review_version,expected_intake_version,result_lead_version,result_review_version,
        contract_version,normalization_version) select ('b3000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
        ('a2000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        ('b1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'lead-identity-review-decision.v1',
        'db06b-decision-'||lpad(g::text,16,'0'),repeat('c',64),gen_random_uuid(),gen_random_uuid(),'hold',$2,
        1,1,1,1,1,'lead-identity-review-decision.v1','p1a-identity-v2' from generate_series(1,100) g`,
      [actor.workspaceId, actor.membershipId]);
      await performancePool.query(`insert into lead_identity_decision_heads(workspace_id,intake_id,decision_id)
        select $1,('a2000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        ('b3000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid from generate_series(1,100) g`, [actor.workspaceId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_issues(id,workspace_id,run_id,stream,
        source_record_type,source_record_id,issue_code,observed_version,safe_code) select
        ('a3000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,$2,'lead_root','lead',
        ('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'missing_intake',1,'missing'
        from generate_series(1,98) g`, [actor.workspaceId, runId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_issues(id,workspace_id,run_id,stream,
        source_record_type,source_record_id,issue_code,observed_version,safe_code) values
        ('a4000000-0000-0000-0000-000000000017',$1,$2,'lead_root','lead','a1000000-0000-0000-0000-000000000017','multiple_intakes',1,'multiple'),
        ('a5000000-0000-0000-0000-000000000017',$1,$2,'lead_root','lead','a1000000-0000-0000-0000-000000000017','authority_conflict',1,'writer_not_p1a')`, [actor.workspaceId, runId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_checkpoints(workspace_id,run_id,stream,
        last_sort_at,last_id,processed_count,issue_count) select $1,$2,stream,'2026-01-01 00:00:09+00',
        'a1000000-0000-0000-0000-000000000099',100,case when stream='lead_root' then 100 else 0 end
        from unnest(array['lead_root','intake','identity_review','visibility','lead_history','platform_evidence']) stream`,
      [actor.workspaceId, runId]);
      await performancePool.query(`insert into lead_vnext_reconciliation_checkpoints(workspace_id,run_id,stream)
        select $1,('c1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'lead_root'
        from generate_series(1,99) g`, [actor.workspaceId]);
      await performancePool.query(`insert into lead_authority_states(workspace_id,governing_operation_id)
        select ('d1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,gen_random_uuid()
        from generate_series(1,99) g`);
      await performancePool.query(`insert into lead_authority_states(workspace_id,active_writer,migration_state,
        governing_operation_id) values($1,'p1a','reconciling',gen_random_uuid())`, [actor.workspaceId]);
      await performancePool.query(`insert into lead_activities(id,workspace_id,lead_id,kind,body,created_by_membership_id)
        select ('a6000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
        ('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'created','Created',$2
        from generate_series(1,100) g`, [actor.workspaceId, actor.membershipId]);
      await performancePool.query(`insert into audit_events(id,workspace_id,actor_type,action,target_type,target_id,outcome,
        request_id,correlation_id,metadata_version,metadata) select ('a7000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        $1,'system','crm.lead_operational_updated','lead',('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        'success',g::text,g::text,1,jsonb_build_object('operation','lead-operational-edit.v1','result_version',1)
        from generate_series(1,100) g`, [actor.workspaceId]);
      await performancePool.query(`insert into outbox_messages(id,workspace_id,topic,aggregate_type,aggregate_id,
        operation_id,result_version,payload) select ('a8000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,$1,
        'crm.lead.operational_updated.v1','lead',('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
        ('a9000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,1,'{}'::jsonb from generate_series(1,100) g`, [actor.workspaceId]);
      await performancePool.query(`insert into idempotency_records(principal_key,operation,idempotency_key,request_hash,
        outcome,expires_at) select $1||g,'lead-operational-edit.v1','db06b-receipt-'||lpad(g::text,16,'0'),repeat('b',64),
        jsonb_build_object('leadId',('a1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'version',1),now()+interval '1 day'
        from generate_series(1,100) g`, [`workspace:${actor.workspaceId}:membership:${actor.membershipId}:lead:`]);
      await performancePool.query("commit");
    } catch (error) { await performancePool.query("rollback"); throw error; }
    await performancePool.query(`analyze leads,lead_intakes,lead_identity_reviews,lead_identity_candidates,
      lead_identity_decisions,lead_identity_decision_heads,lead_visible_teams,lead_vnext_mappings,
      lead_vnext_reconciliation_issues,lead_vnext_reconciliation_runs,lead_vnext_reconciliation_checkpoints,
      lead_authority_states,lead_activities,audit_events,outbox_messages,idempotency_records,contacts,companies,pipeline_stages`);
    await performancePool.query("set enable_seqscan=off");

    async function measure(name: string, sql: string, params: unknown[], allowSequential = false) {
      const explain = (await performancePool.query(`explain (analyze,buffers,format json) ${sql}`, params)).rows[0]["QUERY PLAN"][0];
      const nodes = planNodes(explain.Plan), indexes = planIndexes(explain.Plan);
      if (!allowSequential) expect(nodes, name).not.toContain("Seq Scan");
      const started = performance.now(); await performancePool.query(sql, params); const smokeMs = performance.now() - started;
      expect(smokeMs, name).toBeLessThan(200);
      return { executionMs: Number(explain["Execution Time"]), smokeMs, nodes, indexes, sharedRead: explain.Plan["Shared Read Blocks"] ?? 0,
        rowsRemoved: explain.Plan["Rows Removed by Filter"] ?? 0 };
    }
    const lowerTime = "1970-01-01", lowerId = "00000000-0000-0000-0000-000000000000";
    const upperTime = "9999-01-01", upperId = "ffffffff-ffff-ffff-ffff-ffffffffffff", sampleLead = "a1000000-0000-0000-0000-000000000050";
    const evidence = {
      root: await measure("root", `select ${LEAD_SOURCE_COLUMNS.join(",")} from leads where workspace_id=$1
        and (updated_at,id)>($2,$3) and (updated_at,id)<=($4,$5) order by updated_at,id limit 18`,
      [actor.workspaceId, lowerTime, lowerId, upperTime, upperId]),
      reread: await measure("reread", "select id,version from leads where workspace_id=$1 and id=$2", [actor.workspaceId, sampleLead]),
      intake: await measure("intake", "select id,version from lead_intakes where workspace_id=$1 and lead_id=$2", [actor.workspaceId, sampleLead]),
      reviewsPending: await measure("reviewsPending", `select id,lead_id,updated_at from lead_identity_reviews where
        workspace_id=$1 and state='pending' and (updated_at,id)>($2,$3) order by updated_at,id limit 18`,
      [actor.workspaceId, lowerTime, lowerId]),
      reviewsResolved: await measure("reviewsResolved", `select id,lead_id,updated_at from lead_identity_reviews where
        workspace_id=$1 and state='resolved' and (updated_at,id)>($2,$3) order by updated_at,id limit 18`,
      [actor.workspaceId, lowerTime, lowerId]),
      candidates: await measure("candidates", `select id,target_version from lead_identity_candidates where workspace_id=$1
        and review_id=$2 order by evidence_strength,evidence_kind,id`, [actor.workspaceId, "b1000000-0000-0000-0000-000000000050"]),
      decisions: await measure("decisions", `select id,result_lead_version from lead_identity_decisions where workspace_id=$1
        and review_id=$2 order by created_at,id`, [actor.workspaceId, "b1000000-0000-0000-0000-000000000050"]),
      head: await measure("head", `select decision_id,version from lead_identity_decision_heads where workspace_id=$1
        and intake_id=$2`, [actor.workspaceId, "a2000000-0000-0000-0000-000000000050"]),
      visibility: await measure("visibility", `select team_id,created_at from lead_visible_teams where lead_id=$1
        order by team_id`, [sampleLead]),
      history: await measure("history", `select id,kind,created_at from lead_activities where workspace_id=$1 and lead_id=$2
        order by created_at,id`, [actor.workspaceId, sampleLead]),
      lifecycle: await measure("lifecycle", `select id,code,is_terminal,status,contract_version,version
        from lead_lifecycle_definitions where id=$1`, ["00000000-0000-4000-8000-000000000001"], true),
      stage: await measure("stage", "select id,name,position,status from pipeline_stages where workspace_id=$1 and id=$2",
      [actor.workspaceId, "e3000000-0000-0000-0000-000000000050"]),
      contact: await measure("contact", "select id,status,version from contacts where workspace_id=$1 and id=$2",
      [actor.workspaceId, "e2000000-0000-0000-0000-000000000050"]),
      company: await measure("company", "select id,status,version from companies where workspace_id=$1 and id=$2",
      [actor.workspaceId, "e1000000-0000-0000-0000-000000000050"]),
      outbox: await measure("outbox", `select id,status from outbox_messages where workspace_id=$1 and topic=$2
        and aggregate_type='lead' and aggregate_id=$3 and operation_id=$4 and result_version=1`,
      [actor.workspaceId, "crm.lead.operational_updated.v1", sampleLead, "a9000000-0000-0000-0000-000000000050"]),
      mappings: await measure("mappings", `select lead_id,state from lead_vnext_mappings where workspace_id=$1
        and state='verified' and lead_id>$2 order by lead_id limit 18`, [actor.workspaceId, lowerId]),
      issues: await measure("issues", `select id,source_record_id from lead_vnext_reconciliation_issues where workspace_id=$1
        and run_id=$2 and state='open' and stream='lead_root' and (source_record_id,id)>($3,$4)
        order by source_record_id,id limit 18`, [actor.workspaceId, runId, lowerId, lowerId]),
      run: await measure("run", `select id,state,updated_at from lead_vnext_reconciliation_runs where workspace_id=$1
        and state='pending' and (updated_at,id)<($2,$3) order by updated_at desc nulls last,id desc nulls last limit 51`,
      [actor.workspaceId, upperTime, upperId]),
      checkpoint: await measure("checkpoint", `select * from lead_vnext_reconciliation_checkpoints where
        workspace_id=$1 and run_id=$2 and stream='lead_root'`, [actor.workspaceId, runId]),
      authority: await measure("authority", "select active_writer,migration_state,version from lead_authority_states where workspace_id=$1",
      [actor.workspaceId]),
      antiJoin: await measure("antiJoin", `with page as materialized (select id,workspace_id,version,updated_at
        from leads where workspace_id=$1 and (updated_at,id)>($2,$3) order by updated_at,id limit 18)
        select l.id from page l left join lead_vnext_mappings m on m.workspace_id=l.workspace_id and m.lead_id=l.id
        and m.reconciliation_run_id=$4 where m.lead_id is null or m.state<>'verified' or m.source_version<>l.version
        order by l.updated_at,l.id`, [actor.workspaceId, lowerTime, lowerId, runId]),
      audit: await measure("audit", `select id,occurred_at,outcome,request_id,correlation_id,metadata_version,metadata
        from audit_events where workspace_id=$1 and target_type='lead' and target_id=$2
        and action='crm.lead_operational_updated' and (occurred_at,id)>($3,$4) order by occurred_at,id limit 51`,
      [actor.workspaceId, sampleLead, lowerTime, lowerId]),
      receipts: await measure("receipts", `select id from idempotency_records where principal_key=$1
        and operation='lead-operational-edit.v1'`, [`workspace:${actor.workspaceId}:membership:${actor.membershipId}:lead:50`]),
    };
    expect(evidence.audit.indexes).toContain("audit_events_workspace_target_action_occurred_idx");

    const issueIds = new Set<string>(); let issueSource = lowerId, issueId = lowerId;
    while (true) {
      const rows = (await performancePool.query<{ id: string; source_record_id: string }>(`select id,source_record_id
        from lead_vnext_reconciliation_issues where workspace_id=$1 and run_id=$2 and state='open' and stream='lead_root'
        and (source_record_id,id)>($3,$4) order by source_record_id,id limit 18`, [actor.workspaceId, runId, issueSource, issueId])).rows;
      const page = rows.slice(0, 17); for (const row of page) { expect(issueIds.has(row.id)).toBe(false); issueIds.add(row.id); }
      if (rows.length <= 17) break; issueSource = page.at(-1)!.source_record_id; issueId = page.at(-1)!.id;
    }
    expect(issueIds.size).toBe(100);

    const mappingIds = new Set<string>(); let mappingCursor = lowerId;
    while (true) {
      const rows = (await performancePool.query<{ lead_id: string }>(`select lead_id from lead_vnext_mappings
        where workspace_id=$1 and state='verified' and lead_id>$2 order by lead_id limit 18`,
      [actor.workspaceId, mappingCursor])).rows;
      const page = rows.slice(0, 17); for (const row of page) { expect(mappingIds.has(row.lead_id)).toBe(false); mappingIds.add(row.lead_id); }
      if (rows.length <= 17) break; mappingCursor = page.at(-1)!.lead_id;
    }
    expect(mappingIds.size).toBe(100);

    const key = randomBytes(32), sweepStarted = performance.now();
    let cursorTime = new Date(0), cursorId = lowerId, swept = 0, hashMatches = 0;
    while (true) {
      const leads = (await performancePool.query<RawRow>(`select ${LEAD_SOURCE_COLUMNS.join(",")}
        from leads where workspace_id=$1
        and (updated_at,id)>($2,$3) order by updated_at,id limit 26`, [actor.workspaceId, cursorTime, cursorId])).rows.slice(0, 25);
      if (leads.length === 0) break;
      const ids = leads.map((row) => row.id as string);
      const intakes = (await performancePool.query<RawRow>(`select ${INTAKE_SOURCE_COLUMNS.join(",")}
        from lead_intakes where workspace_id=$1 and lead_id=any($2::uuid[]) order by lead_id,id`, [actor.workspaceId, ids])).rows;
      const reviews = (await performancePool.query<RawRow>(`select lead_id,${selectList("reviews")}
        from lead_identity_reviews where workspace_id=$1 and lead_id=any($2::uuid[]) order by lead_id,created_at,id`,
      [actor.workspaceId, ids])).rows;
      const reviewIds = reviews.map((row) => row.id as string), intakeIds = intakes.map((row) => row.id as string);
      const candidates = (await performancePool.query<RawRow>(`select ${selectList("candidates")}
        from lead_identity_candidates where workspace_id=$1 and review_id=any($2::uuid[]) order by review_id,created_at,id`,
      [actor.workspaceId, reviewIds])).rows;
      const decisions = (await performancePool.query<RawRow>(`select ${selectList("decisions")}
        from lead_identity_decisions where workspace_id=$1 and review_id=any($2::uuid[]) order by review_id,created_at,id`,
      [actor.workspaceId, reviewIds])).rows;
      const heads = (await performancePool.query<RawRow>(`select ${selectList("heads")}
        from lead_identity_decision_heads where workspace_id=$1 and intake_id=any($2::uuid[]) order by intake_id`,
      [actor.workspaceId, intakeIds])).rows;
      const visibleTeams = (await performancePool.query<RawRow>(`select lead_id,${selectList("visibleTeams")}
        from lead_visible_teams where workspace_id=$1 and lead_id=any($2::uuid[]) order by lead_id,team_id`,
      [actor.workspaceId, ids])).rows;
      const lifecycleIds = [...new Set(leads.flatMap((row) => row.lifecycle_definition_id ? [row.lifecycle_definition_id as string] : []))];
      const lifecycle = lifecycleIds.length ? (await performancePool.query<RawRow>(`select ${selectList("lifecycle")}
        from lead_lifecycle_definitions where id=any($1::uuid[])`, [lifecycleIds])).rows : [];
      const stages = (await performancePool.query<RawRow>(`select ${selectList("stage")} from pipeline_stages
        where workspace_id=$1 and id=any($2::uuid[])`, [actor.workspaceId, leads.map((row) => row.stage_id)])).rows;
      const contacts = (await performancePool.query<RawRow>(`select ${selectList("contacts")} from contacts
        where workspace_id=$1 and id=any($2::uuid[])`, [actor.workspaceId, leads.map((row) => row.contact_id)])).rows;
      const companies = (await performancePool.query<RawRow>(`select ${selectList("companies")} from companies
        where workspace_id=$1 and id=any($2::uuid[])`, [actor.workspaceId, leads.map((row) => row.company_id)])).rows;
      const history = (await performancePool.query<RawRow>(`select lead_id,${selectList("history")} from lead_activities
        where workspace_id=$1 and lead_id=any($2::uuid[]) order by lead_id,created_at,id`, [actor.workspaceId, ids])).rows;
      const audits = (await performancePool.query<RawRow>(`select ${selectList("audits")} from audit_events
        where workspace_id=$1 and target_type='lead' and target_id=any($2::uuid[]) order by target_id,occurred_at,id`,
      [actor.workspaceId, ids])).rows;
      const outbox = (await performancePool.query<RawRow>(`select ${selectList("outbox")} from outbox_messages
        where workspace_id=$1 and aggregate_type='lead' and aggregate_id=any($2::uuid[]) order by aggregate_id,created_at,id`,
      [actor.workspaceId, ids])).rows;
      const principalKeys = ids.map((id) => `workspace:${actor.workspaceId}:membership:${actor.membershipId}:lead:${Number(id.slice(-12))}`);
      const receipts = (await performancePool.query<RawRow>(`select ${selectList("receipts")},outcome->>'leadId' lead_id
        from idempotency_records where principal_key=any($1::text[]) and operation='lead-operational-edit.v1'
        order by principal_key,created_at,id`, [principalKeys])).rows;
      const groupBy = (rows: RawRow[], keyName: string) => {
        const map = new Map<string, RawRow[]>(); for (const row of rows) {
          const groupKey = row[keyName] as string; if (!map.has(groupKey)) map.set(groupKey, []); map.get(groupKey)!.push(row);
        } return map;
      };
      const byLead = groupBy(intakes, "lead_id"), reviewsByLead = groupBy(reviews, "lead_id");
      const reviewToLead = new Map(reviews.map((row) => [row.id as string, row.lead_id as string]));
      const intakeToLead = new Map(intakes.map((row) => [row.id as string, row.lead_id as string]));
      const byRelatedLead = (rows: RawRow[], relation: "review_id" | "intake_id") => {
        const mapped = rows.map((row) => ({ ...row, __lead_id: relation === "review_id"
          ? reviewToLead.get(row[relation] as string) : intakeToLead.get(row[relation] as string) }));
        return groupBy(mapped, "__lead_id");
      };
      const candidatesByLead = byRelatedLead(candidates, "review_id"), decisionsByLead = byRelatedLead(decisions, "review_id");
      const headsByLead = byRelatedLead(heads, "intake_id"), teamsByLead = groupBy(visibleTeams, "lead_id");
      const historyByLead = groupBy(history, "lead_id"), auditsByLead = groupBy(audits, "target_id");
      const outboxByLead = groupBy(outbox, "aggregate_id"), receiptsByLead = groupBy(receipts, "lead_id");
      const lifecycleById = groupBy(lifecycle, "id"), stageById = groupBy(stages, "id");
      const contactsById = groupBy(contacts, "id"), companiesById = groupBy(companies, "id");
      for (const lead of leads) {
        const leadId = lead.id as string, inventory = emptyInventory();
        inventory.lead = [lead]; inventory.intakes = byLead.get(leadId) ?? []; inventory.reviews = reviewsByLead.get(leadId) ?? [];
        inventory.candidates = candidatesByLead.get(leadId) ?? []; inventory.decisions = decisionsByLead.get(leadId) ?? [];
        inventory.heads = headsByLead.get(leadId) ?? []; inventory.visibleTeams = teamsByLead.get(leadId) ?? [];
        inventory.lifecycle = lifecycleById.get(lead.lifecycle_definition_id as string) ?? [];
        inventory.stage = stageById.get(lead.stage_id as string) ?? []; inventory.contacts = contactsById.get(lead.contact_id as string) ?? [];
        inventory.companies = companiesById.get(lead.company_id as string) ?? []; inventory.history = historyByLead.get(leadId) ?? [];
        inventory.audits = auditsByLead.get(leadId) ?? []; inventory.outbox = outboxByLead.get(leadId) ?? [];
        inventory.receipts = receiptsByLead.get(leadId) ?? [];
        for (const group of GROUPS) if (inventory[group].length === 0) throw new Error(`empty_${group}_at_${swept}`);
        const sourceDigest = sourceInventoryDigest(key, inventory);
        const projectionDigest = vnextInventoryDigest(key, inventory);
        if (timingSafeEqual(sourceDigest, projectionDigest)) hashMatches += 1; else throw new Error(`parity_mismatch_at_${swept}`);
        swept += 1;
      }
      const last = leads.at(-1)!; cursorTime = last.updated_at as Date; cursorId = last.id as string;
    }
    const sweepMs = performance.now() - sweepStarted;
    expect(swept).toBe(100); expect(hashMatches).toBe(100);
    const sizes = (await performancePool.query(`select relname,pg_relation_size(oid)::bigint heap_bytes,
      pg_indexes_size(oid)::bigint index_bytes,(select count(*)::int from pg_index where indrelid=pg_class.oid) index_count
      from pg_class where relkind='r' and relname in ('leads','lead_intakes','lead_identity_reviews',
      'lead_identity_candidates','lead_identity_decisions','lead_identity_decision_heads','lead_visible_teams',
      'lead_vnext_mappings','lead_vnext_reconciliation_issues','lead_vnext_reconciliation_runs',
      'lead_vnext_reconciliation_checkpoints','lead_authority_states','audit_events','outbox_messages',
      'idempotency_records') order by relname`)).rows;
    console.info("DB_06B_BOUNDED_INTEGRITY", JSON.stringify({ counts: { cutoffLeads: swept, intakes: 100,
      reviews: 100, candidates: 100, decisions: 100, heads: 100, visibleTeams: 100, historyRows: 100, audits: 100,
      outbox: 100, receipts: 100, verified: 100, stale: 0, blocked: 0, openIssues: 100,
      resolvedIssues: 0, waivedIssues: 0, hashMatches, hashMismatches: swept - hashMatches },
    sweep: { elapsedMs: sweepMs, pageSize: 25 }, evidence, sizes }));
  }, 60_000);
});
