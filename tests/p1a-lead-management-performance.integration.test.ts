import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { transitionLeadStageV1 } from "../src/backend/modules/leads";
import type { TrustedActor } from "../src/backend/platform/authorization";
import { LEAD_ACTIVITY_APPEND_SQL_V1, LEAD_MUTATION_LOCK_SQL_V1, LEAD_OPERATIONAL_UPDATE_SQL_V1,
  LEAD_STAGE_LOCK_SQL_V1, LEAD_STAGE_UPDATE_SQL_V1 } from
  "../src/backend/modules/leads/persistence/repositories/lead.repository";

const suite = process.env.RUN_P1A_PERFORMANCE === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });
let actor: TrustedActor, workspaceId: string, fixtureUserId: string, leadId: string, firstStageId: string, secondStageId: string;

function percentile(values: number[], fraction: number) {
  return [...values].sort((left, right) => left - right)[Math.ceil(values.length * fraction) - 1];
}

suite("P1A Lead-management point mutation performance", () => {
  beforeAll(async () => {
    const user = (await pool.query<{ id: string }>(`insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)
      values($1,$1,'Mutation Performance Owner','active',now()) returning id`, [`mutation-perf-${randomUUID()}@test.local`])).rows[0];
    fixtureUserId = user.id;
    const workspace = (await pool.query<{ id: string }>(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
      values('Mutation Scale',$1,'active','growth','monthly',$2) returning id`, [`mutation-scale-${randomUUID()}`, user.id])).rows[0];
    workspaceId = workspace.id;
    const role = (await pool.query<{ id: string }>(`insert into roles(workspace_id,code,permissions,is_system)
      values($1,'owner','{}',true) returning id`, [workspace.id])).rows[0];
    const membership = (await pool.query<{ id: string }>(`insert into workspace_memberships(workspace_id,user_id,role_id,status)
      values($1,$2,$3,'active') returning id`, [workspace.id, user.id, role.id])).rows[0];
    const session = (await pool.query<{ id: string }>(`insert into sessions(user_id,session_hash,idle_expires_at,absolute_expires_at,auth_method)
      values($1,$2,now()+interval '1 hour',now()+interval '1 day','password') returning id`, [user.id, randomUUID()])).rows[0];
    const stages = (await pool.query<{ id: string; position: number }>(`insert into pipeline_stages(workspace_id,name,position,status)
      values($1,'New',0,'active'),($1,'Working',1,'active') returning id,position`, [workspace.id])).rows.sort((a, b) => a.position - b.position);
    [firstStageId, secondStageId] = stages.map(stage => stage.id);
    actor = { userId: user.id, sessionId: session.id, workspaceId: workspace.id, membershipId: membership.id, role: "owner" };
    await pool.query(`insert into leads(workspace_id,display_name,person_name_normalized,email_display,email_normalized,company,
      source,original_source_category,original_source_medium,original_source_detail,original_campaign_context,
      attribution_contract_version,intake_channel,lifecycle_definition_id,stage_id,status,visibility)
      select $1,'Mutation Lead '||g,'mutation lead '||g,'mutation-'||g||'@example.test','mutation-'||g||'@example.test','Scale',
        'manual','manual','unknown','{}','{}','p1a-attribution-v1','manual','00000000-0000-4000-8000-000000000001',$2,'open','workspace'
      from generate_series(1,100001) g`, [workspace.id, firstStageId]);
    await pool.query("analyze leads"); await pool.query("analyze pipeline_stages");
    leadId = (await pool.query<{ id: string }>("select id from leads where workspace_id=$1 order by id limit 1", [workspace.id])).rows[0].id;
  }, 120_000);
  afterAll(async () => {
    if (workspaceId) {
      await pool.query("delete from audit_events where workspace_id=$1", [workspaceId]);
      await pool.query("delete from outbox_messages where workspace_id=$1", [workspaceId]);
      await pool.query("delete from idempotency_records where principal_key like $1", [`workspace:${workspaceId}:%`]);
      await pool.query("delete from lead_activities where workspace_id=$1", [workspaceId]);
      await pool.query("delete from leads where workspace_id=$1", [workspaceId]);
      await pool.query("delete from workspaces where id=$1", [workspaceId]);
    }
    if (fixtureUserId) await pool.query("delete from users where id=$1", [fixtureUserId]);
    await pool.end();
  });

  it("uses indexed point plans and keeps the full stage command p95 below 200 ms", async () => {
    const client = await pool.connect(), plans: Record<string, string> = {};
    try {
      await client.query("begin");
      for (const [name, sql, parameters] of [
        ["lead_lock", LEAD_MUTATION_LOCK_SQL_V1, [workspaceId, leadId]],
        ["stage_lock", LEAD_STAGE_LOCK_SQL_V1, [workspaceId, secondStageId]],
        ["operational_update", LEAD_OPERATIONAL_UPDATE_SQL_V1, [workspaceId, leadId, 1, null, null, "workspace"]],
        ["stage_update", LEAD_STAGE_UPDATE_SQL_V1, [workspaceId, leadId, 2, secondStageId]],
        ["activity_append", LEAD_ACTIVITY_APPEND_SQL_V1,
          [workspaceId, leadId, "updated", "Performance evidence.", actor.membershipId]],
      ] as Array<[string, string, unknown[]]>) {
        const plan = await client.query(`explain (analyze,buffers,format text) ${sql}`, parameters);
        plans[name] = plan.rows.map(row => row["QUERY PLAN"]).join("\n");
        expect(plans[name]).not.toMatch(/Seq Scan on (?:leads|lead_activities)/);
        if (name === "stage_lock")
          expect(plans[name]).toMatch(/pipeline_stages_workspace_id_id_uq|Seq Scan on pipeline_stages/);
      }
      await client.query("rollback");
    } finally { client.release(); }
    const samples: number[] = [];
    let version = 1;
    for (let index = 0; index < 30; index++) {
      const targetStageId = index % 2 === 0 ? secondStageId : firstStageId, start = performance.now();
      const result = await transitionLeadStageV1(pool, { actor, leadId, idempotencyKey: randomUUID(),
        command: { contractVersion: "lead-stage-transition.v1", expectedVersion: version, targetStageId } });
      samples.push(performance.now() - start); version = result.leadVersion;
    }
    const p95Ms = percentile(samples, .95);
    console.info("P1A_LEAD_MANAGEMENT_PERFORMANCE_EVIDENCE", JSON.stringify({ rows: 100001, samples: samples.length,
      stageTransitionP95Ms: p95Ms, plans }));
    expect(p95Ms).toBeLessThan(200);
  }, 120_000);
});
