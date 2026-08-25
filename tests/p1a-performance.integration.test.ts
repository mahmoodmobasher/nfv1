import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { getIdentityReviewCandidatesV1, submitLeadInquiryV1 } from "../src/backend/modules/leads";
import type { TrustedActor } from "../src/backend/platform/authorization";

const suite = process.env.RUN_P1A_PERFORMANCE === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });
let actor: TrustedActor, workspaceId: string;

function percentile95(values: number[]) { return [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1]; }
async function latency(sql: string, parameters: unknown[], samples = 30) {
  const values: number[] = [];
  for (let index = 0; index < samples; index++) { const start = performance.now(); await pool.query(sql, parameters); values.push(performance.now() - start); }
  return percentile95(values);
}

suite("P1A representative PostgreSQL performance", () => {
  beforeAll(async () => {
    await pool.query("truncate users cascade");
    const user = (await pool.query<{ id: string }>(`insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)
      values($1,$1,'Performance Owner','active',now()) returning id`, [`perf-${randomUUID()}@test.local`])).rows[0];
    const workspace = (await pool.query<{ id: string }>(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
      values('P1A Scale',$1,'active','growth','monthly',$2) returning id`, [`scale-${randomUUID()}`, user.id])).rows[0];
    workspaceId = workspace.id;
    const role = (await pool.query<{ id: string }>(`insert into roles(workspace_id,code,permissions,is_system)
      values($1,'owner','{}',true) returning id`, [workspace.id])).rows[0];
    const membership = (await pool.query<{ id: string }>(`insert into workspace_memberships(workspace_id,user_id,role_id,status)
      values($1,$2,$3,'active') returning id`, [workspace.id, user.id, role.id])).rows[0];
    const session = (await pool.query<{ id: string }>(`insert into sessions(user_id,session_hash,idle_expires_at,absolute_expires_at,auth_method)
      values($1,$2,now()+interval '1 hour',now()+interval '1 day','password') returning id`, [user.id, randomUUID()])).rows[0];
    const stage = (await pool.query<{ id: string }>(`insert into pipeline_stages(workspace_id,name,position,status)
      values($1,'New',0,'active') returning id`, [workspace.id])).rows[0];
    actor = { userId: user.id, sessionId: session.id, workspaceId: workspace.id, membershipId: membership.id, role: "owner" };
    await pool.query(`insert into companies(workspace_id,display_name,name_normalized)
      select $1,'Company '||g,'company '||g from generate_series(1,25000) g`, [workspace.id]);
    const companyId = (await pool.query<{ id: string }>(`select id from companies where workspace_id=$1 and name_normalized='company 25000'`, [workspace.id])).rows[0].id;
    await pool.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized,
      phone_display,phone_normalized,phone_country_code_used,company_id)
      select $1,'Person '||g,'person '||g,'person-'||g||'@example.test','person-'||g||'@example.test',
        '+1416'||lpad(g::text,7,'0'),'+1416'||lpad(g::text,7,'0'),'CA',case when g=100000 then $2::uuid else null end
      from generate_series(1,100000) g`, [workspace.id, companyId]);
    await pool.query(`insert into leads(workspace_id,display_name,person_name_normalized,email_display,email_normalized,company,
      source,stage_id,status,visibility) select $1,'Scale Lead '||g,'scale lead '||g,'lead-'||g||'@example.test',
      'lead-'||g||'@example.test','Scale','website',$2,'open','workspace' from generate_series(1,100000) g`, [workspace.id, stage.id]);
    await pool.query("analyze contacts"); await pool.query("analyze companies"); await pool.query("analyze leads");
  }, 120_000);
  afterAll(async () => { await pool.end(); });

  it("uses bounded indexed plans and meets candidate/review/manual p95 targets", async () => {
    const emailSql = `select id,version from contacts where workspace_id=$1 and status='active' and email_normalized=$2 order by id limit 10`;
    const phoneSql = `select id,version from contacts where workspace_id=$1 and status='active' and phone_normalized=$2 order by id limit 10`;
    const nameSql = `select c.id,c.version from contacts c join companies o on o.workspace_id=c.workspace_id and o.id=c.company_id and o.status='active'
      where c.workspace_id=$1 and c.status='active' and c.person_name_normalized=$2 and o.name_normalized=$3 order by c.id limit 10`;
    const companySql = `select id,version from companies where workspace_id=$1 and status='active' and name_normalized=$2 order by id limit 10`;
    const held = await submitLeadInquiryV1(pool, { actor, idempotencyKey: randomUUID(), command: {
      contractVersion: "lead-inquiry-intake.v1", intakeChannel: "manual", person: { displayName: "Person 100000",
        email: "person-100000@example.test" }, organization: { name: "Company 25000" },
      inquiry: { receivedAt: "2026-08-25T12:00:00.000Z" }, source: { sourceCategory: "manual", sourceMedium: "unknown",
        sourceDetail: {}, campaignContext: {}, attributionContractVersion: "p1a-attribution-v1" } } });
    const reviewId = held.reviewCaseId!;
    const reviewQueueSql = `select id,lead_id,version from lead_identity_reviews
      where workspace_id=$1 and state='pending' order by updated_at,id limit 50`;
    const candidateDetailSql = `select id,contact_id,company_id,target_version,evidence_kind,evidence_strength
      from lead_identity_candidates where workspace_id=$1 and review_id=$2
      order by case evidence_strength when 'strong' then 1 when 'supplementary' then 2 else 3 end,
        coalesce(contact_id,company_id),id limit 30`;
    await pool.query("set enable_seqscan=off");
    const plans = await Promise.all([
      pool.query(`explain (analyze,buffers,format text) ${emailSql}`, [workspaceId, "person-100000@example.test"]),
      pool.query(`explain (analyze,buffers,format text) ${phoneSql}`, [workspaceId, "+14160099999"]),
      pool.query(`explain (analyze,buffers,format text) ${nameSql}`, [workspaceId, "person 100000", "company 25000"]),
      pool.query(`explain (analyze,buffers,format text) ${companySql}`, [workspaceId, "company 25000"]),
      pool.query(`explain (analyze,buffers,format text) ${reviewQueueSql}`, [workspaceId]),
      pool.query(`explain (analyze,buffers,format text) ${candidateDetailSql}`, [workspaceId, reviewId]),
    ]);
    await pool.query("reset enable_seqscan");
    for (const plan of plans) {
      const text = plan.rows.map(row => row["QUERY PLAN"]).join("\n");
      expect(text).toMatch(/Index (?:Only )?Scan|Bitmap Index Scan/);
      expect(text).not.toMatch(/Seq Scan on (?:contacts|companies|leads)/);
    }
    const metrics = { emailP95Ms: await latency(emailSql, [workspaceId, "person-100000@example.test"]),
      phoneP95Ms: await latency(phoneSql, [workspaceId, "+14160099999"]),
      nameCompanyP95Ms: await latency(nameSql, [workspaceId, "person 100000", "company 25000"]),
      companyP95Ms: await latency(companySql, [workspaceId, "company 25000"]),
      reviewQueueP95Ms: await latency(reviewQueueSql, [workspaceId]), candidateDetailP95Ms: 0, manualP95Ms: 0 };
    const candidateDetails: number[] = [];
    for (let index = 0; index < 30; index++) { const start = performance.now();
      await getIdentityReviewCandidatesV1(pool, actor, held.leadId); candidateDetails.push(performance.now() - start); }
    metrics.candidateDetailP95Ms = percentile95(candidateDetails);
    const manual: number[] = [];
    for (let index = 0; index < 30; index++) {
      const start = performance.now();
      await submitLeadInquiryV1(pool, { actor, idempotencyKey: randomUUID(), command: {
        contractVersion: "lead-inquiry-intake.v1", intakeChannel: "manual", person: { displayName: `Latency ${index}`, email: `latency-${index}@example.test` },
        inquiry: { receivedAt: "2026-08-25T12:00:00.000Z" }, source: { sourceCategory: "manual", sourceMedium: "unknown",
          sourceDetail: {}, campaignContext: {}, attributionContractVersion: "p1a-attribution-v1" } } });
      manual.push(performance.now() - start);
    }
    metrics.manualP95Ms = percentile95(manual);
    console.info("P1A_PERFORMANCE_EVIDENCE", JSON.stringify({ samplesPerMeasurement: 30, rows: {
      leads: 100000, contacts: 100000, companies: 25000 }, ...metrics }));
    expect(metrics.emailP95Ms).toBeLessThan(100);
    expect(metrics.phoneP95Ms).toBeLessThan(100);
    expect(metrics.nameCompanyP95Ms).toBeLessThan(200);
    expect(metrics.companyP95Ms).toBeLessThan(200);
    expect(metrics.reviewQueueP95Ms).toBeLessThan(200);
    expect(metrics.candidateDetailP95Ms).toBeLessThan(200);
    expect(metrics.manualP95Ms).toBeLessThan(500);
  }, 120_000);
});
