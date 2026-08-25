import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { GET as detailGet, POST as decisionPost } from "../src/app/api/workspaces/[workspaceId]/leads/[leadId]/identity-review/route";
import { GET as queueGet } from "../src/app/api/workspaces/[workspaceId]/identity-reviews/route";
import { GET as pipelineStagesGet } from "../src/app/api/workspaces/[workspaceId]/pipeline-stages/route";
import { PATCH as legacyLeadPatch } from "../src/app/api/workspaces/[workspaceId]/leads/[leadId]/route";
import { getLeadDetailV1, listLeadSummariesV1, submitLeadInquiryV1 } from "../src/backend/modules/leads";
import { getServerEnv } from "../src/server/env";
import { createSession } from "../src/server/security/session";

const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });
const env = getServerEnv(), params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });
const csrf = "p1a-presentation-csrf";

async function fixture() {
  const user = (await pool.query<{ id: string }>(`insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)
    values($1,$1,'Presentation Owner','active',now()) returning id`, [`presentation-${randomUUID()}@test.local`])).rows[0];
  const workspace = (await pool.query<{ id: string }>(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
    values('Presentation',$1,'active','growth','monthly',$2) returning id`, [`presentation-${randomUUID()}`, user.id])).rows[0];
  const role = (await pool.query<{ id: string }>(`insert into roles(workspace_id,code,permissions,is_system)
    values($1,'owner','{}',true) returning id`, [workspace.id])).rows[0];
  const membership = (await pool.query<{ id: string }>(`insert into workspace_memberships(workspace_id,user_id,role_id,status)
    values($1,$2,$3,'active') returning id`, [workspace.id, user.id, role.id])).rows[0];
  await pool.query("insert into pipeline_stages(workspace_id,name,position,status) values($1,'New',0,'active')", [workspace.id]);
  await pool.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
    values($1,'Route Candidate','route candidate','route@example.test','route@example.test')`, [workspace.id]);
  const session = await createSession(pool, { userId: user.id, securityVersion: 1, secret: env.SESSION_SECRET,
    idleMinutes: 30, absoluteHours: 24 });
  await pool.query("update sessions set active_workspace_id=$2,authenticated_at=now(),auth_method='password' where id=$1", [session.id, workspace.id]);
  const actor = { userId: user.id, sessionId: session.id, workspaceId: workspace.id, membershipId: membership.id, role: "owner" as const };
  const held = await submitLeadInquiryV1(pool, { actor, idempotencyKey: randomUUID(), command: {
    contractVersion: "lead-inquiry-intake.v1", intakeChannel: "manual", person: { displayName: "Route Candidate", email: "route@example.test" },
    inquiry: { receivedAt: "2026-08-25T12:00:00.000Z" }, source: { sourceCategory: "manual", sourceMedium: "unknown",
      sourceDetail: {}, campaignContext: {}, attributionContractVersion: "p1a-attribution-v1" } } });
  return { workspace, held, actor, headers: { cookie: `${env.SESSION_COOKIE_NAME}=${session.token}; nexaflow_csrf=${csrf}` } };
}

function decisionRequest(workspaceId: string, leadId: string, body: unknown, cookie: string) {
  return new Request(`${env.APP_ORIGIN}/api/workspaces/${workspaceId}/leads/${leadId}/identity-review`, { method: "POST",
    headers: { cookie, origin: env.APP_ORIGIN, "x-csrf-token": csrf, "content-type": "application/json",
      "idempotency-key": randomUUID() }, body: JSON.stringify(body) });
}

function assertPrivate(response: Response) {
  expect(response.headers.get("cache-control")).toContain("private");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("pragma")).toBe("no-cache");
  expect(response.headers.get("vary")).toBe("cookie");
}

suite("P1A presentation routes", () => {
  beforeAll(async () => { await pool.query("select 1"); });
  beforeEach(async () => { await pool.query("truncate users cascade"); });
  afterAll(async () => { await pool.end(); });

  it("returns protected detail and queue envelopes with private caching and no raw candidate PII", async () => {
    const f = await fixture();
    const detail = await detailGet(new Request(`${env.APP_ORIGIN}/api/workspaces/${f.workspace.id}/leads/${f.held.leadId}/identity-review`,
      { headers: f.headers }), params({ workspaceId: f.workspace.id, leadId: f.held.leadId }));
    expect(detail.status).toBe(200); assertPrivate(detail);
    const detailBody = await detail.json();
    expect(detailBody.data).toMatchObject({ contractVersion: "lead-identity-review-detail.v1", requestId: expect.any(String),
      capabilities: { canCreateContact: true, canLinkContact: true }, candidates: [{ maskedEmail: "r***@example.test" }] });
    expect(JSON.stringify(detailBody)).not.toContain("route@example.test");
    const queue = await queueGet(new Request(`${env.APP_ORIGIN}/api/workspaces/${f.workspace.id}/identity-reviews?limit=25`,
      { headers: f.headers }), params({ workspaceId: f.workspace.id }));
    expect(queue.status).toBe(200); assertPrivate(queue);
    const queueBody = await queue.json();
    expect(queueBody.data).toMatchObject({ contractVersion: "lead-identity-review-queue.v1", requestId: expect.any(String),
      items: [{ leadId: f.held.leadId, capabilities: { canHold: true } }] });
    expect(JSON.stringify(queueBody)).not.toContain("route@example.test");
  });

  it("returns the authoritative ordered active Pipeline-stage registry with private caching",async()=>{
    const f=await fixture();
    await pool.query("insert into pipeline_stages(workspace_id,name,position,status) values($1,'Working',1,'active'),($1,'Archived',2,'archived')",[f.workspace.id]);
    const response=await pipelineStagesGet(new Request(`${env.APP_ORIGIN}/api/workspaces/${f.workspace.id}/pipeline-stages`,
      {headers:f.headers}),params({workspaceId:f.workspace.id}));
    expect(response.status).toBe(200);assertPrivate(response);
    expect(await response.json()).toMatchObject({data:{contractVersion:"listLeadPipelineStages.v1",requestId:expect.any(String),
      items:[{name:"New",position:0,status:"active"},{name:"Working",position:1,status:"active"}]}});
  });

  it("derives pending-review capability and navigation from current assignment authority",async()=>{
    const f=await fixture(),ownerDetail=await getLeadDetailV1(pool,f.actor,f.held.leadId);
    expect(ownerDetail.lead).toMatchObject({identityReviewStatus:"pending",capabilities:{canReview:true},
      nextView:{kind:"identity_review_detail",leadId:f.held.leadId}});
    const memberUser=(await pool.query<{id:string}>(`insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)
      values($1,$1,'Presentation Member','active',now()) returning id`,[`presentation-member-${randomUUID()}@test.local`])).rows[0];
    const memberRole=(await pool.query<{id:string}>(`insert into roles(workspace_id,code,permissions,is_system)
      values($1,'member','{}',true) returning id`,[f.workspace.id])).rows[0];
    const member=(await pool.query<{id:string}>(`insert into workspace_memberships(workspace_id,user_id,role_id,status)
      values($1,$2,$3,'active') returning id`,[f.workspace.id,memberUser.id,memberRole.id])).rows[0];
    const session=await createSession(pool,{userId:memberUser.id,securityVersion:1,secret:env.SESSION_SECRET,idleMinutes:30,absoluteHours:24});
    await pool.query("update sessions set active_workspace_id=$2,authenticated_at=now(),auth_method='password' where id=$1",[session.id,f.workspace.id]);
    const actor={userId:memberUser.id,sessionId:session.id,workspaceId:f.workspace.id,membershipId:member.id,role:"member"as const};
    const list=await listLeadSummariesV1(pool,actor,{q:"",limit:50});
    expect(list.items[0]).toMatchObject({leadId:f.held.leadId,identityReviewStatus:"pending",capabilities:{canReview:false},
      nextView:{kind:"lead_detail",leadId:f.held.leadId}});
  });

  it("blocks legacy PATCH for canonical intake Leads without any mutation",async()=>{
    const f=await fixture(),before=(await pool.query(`select l.version,l.display_name,l.email_display,l.company,l.stage_id,
      (select count(*)::int from audit_events where workspace_id=l.workspace_id) audits,
      (select count(*)::int from outbox_messages where workspace_id=l.workspace_id) outbox
      from leads l where l.id=$1 and l.workspace_id=$2`,[f.held.leadId,f.workspace.id])).rows[0];
    const stageId=(await pool.query<{id:string}>("select id from pipeline_stages where workspace_id=$1 and status='active'",[f.workspace.id])).rows[0].id;
    const request=new Request(`${env.APP_ORIGIN}/api/workspaces/${f.workspace.id}/leads/${f.held.leadId}`,{method:"PATCH",
      headers:{...f.headers,origin:env.APP_ORIGIN,"x-csrf-token":csrf,"content-type":"application/json","idempotency-key":randomUUID()},
      body:JSON.stringify({firstName:"Legacy",lastName:"Overwrite",email:"overwrite@example.test",company:"Wrong",
        source:"other",stageId,status:"won",visibility:"workspace",teamIds:[],expectedVersion:f.held.leadVersion})});
    const response=await legacyLeadPatch(request,params({workspaceId:f.workspace.id,leadId:f.held.leadId}));
    expect(response.status).toBe(404);
    const after=(await pool.query(`select l.version,l.display_name,l.email_display,l.company,l.stage_id,
      (select count(*)::int from audit_events where workspace_id=l.workspace_id) audits,
      (select count(*)::int from outbox_messages where workspace_id=l.workspace_id) outbox
      from leads l where l.id=$1 and l.workspace_id=$2`,[f.held.leadId,f.workspace.id])).rows[0];
    expect(after).toEqual(before);
  });

  it("authenticates before filter validation and returns the same bounded no-detail error", async () => {
    const workspaceId = randomUUID(), leadId = randomUUID();
    for (const response of [
      await queueGet(new Request(`${env.APP_ORIGIN}/api/workspaces/${workspaceId}/identity-reviews?unknown=true`), params({ workspaceId })),
      await detailGet(new Request(`${env.APP_ORIGIN}/api/workspaces/${workspaceId}/leads/${leadId}/identity-review`), params({ workspaceId, leadId })),
    ]) {
      expect(response.status).toBe(401); assertPrivate(response);
      expect(await response.json()).toMatchObject({ error: { code: "authentication_required", retryable: false,
        reconciliation: { required: false, action: "none" } }, requestId: expect.any(String) });
    }
  });

  it("never returns guessed/resolved navigation and returns typed navigation only after current disclosure", async () => {
    const f = await fixture(), base = { contractVersion: "lead-identity-review-decision.v1", outcome: "hold",
      expectedLeadVersion: 1, expectedReviewVersion: 1, expectedIntakeVersion: 2 };
    const guessedId = randomUUID();
    const guessed = await decisionPost(decisionRequest(f.workspace.id, guessedId, base, f.headers.cookie),
      params({ workspaceId: f.workspace.id, leadId: guessedId }));
    const guessedBody = await guessed.json();
    expect({ status: guessed.status, body: guessedBody }).toEqual({ status: 404, body: expect.objectContaining({
      error: expect.objectContaining({ code: "resource_not_found" }),
    }) }); assertPrivate(guessed);
    expect(guessedBody).not.toHaveProperty("nextView");

    const stale = await decisionPost(decisionRequest(f.workspace.id, f.held.leadId, { ...base, expectedLeadVersion: 99 }, f.headers.cookie),
      params({ workspaceId: f.workspace.id, leadId: f.held.leadId }));
    expect(stale.status).toBe(409); assertPrivate(stale);
    expect(await stale.json()).toMatchObject({ error: { code: "stale_version" },
      nextView: { kind: "identity_review_detail", leadId: f.held.leadId } });

    const resolved = await decisionPost(decisionRequest(f.workspace.id, f.held.leadId, { ...base, outcome: "resolve",
      contact: { action: "dismiss" }, company: { action: "dismiss" } }, f.headers.cookie),
      params({ workspaceId: f.workspace.id, leadId: f.held.leadId }));
    expect(resolved.status).toBe(200); assertPrivate(resolved);
    for (const command of [base, { ...base, expectedLeadVersion: 99, expectedReviewVersion: 99 }]) {
      const after = await decisionPost(decisionRequest(f.workspace.id, f.held.leadId, command, f.headers.cookie),
        params({ workspaceId: f.workspace.id, leadId: f.held.leadId }));
      expect(after.status).toBe(404); assertPrivate(after);
      const body = await after.json();
      expect(body).toMatchObject({ error: { code: "resource_not_found" } }); expect(body).not.toHaveProperty("nextView");
      expect(JSON.stringify(body)).not.toContain(f.held.leadId);
    }
  });

  it("applies private cache headers to authenticated validation and tenant-safe not-found errors", async () => {
    const f = await fixture();
    const rejectedMutation = await decisionPost(new Request(
      `${env.APP_ORIGIN}/api/workspaces/${f.workspace.id}/leads/${f.held.leadId}/identity-review`, { method: "POST" }),
    params({ workspaceId: f.workspace.id, leadId: f.held.leadId }));
    expect(rejectedMutation.status).toBe(403); assertPrivate(rejectedMutation);
    const validation = await queueGet(new Request(`${env.APP_ORIGIN}/api/workspaces/${f.workspace.id}/identity-reviews?unknown=true`,
      { headers: f.headers }), params({ workspaceId: f.workspace.id }));
    expect(validation.status).toBe(400); assertPrivate(validation);
    const missing = await detailGet(new Request(`${env.APP_ORIGIN}/api/workspaces/${f.workspace.id}/leads/${randomUUID()}/identity-review`,
      { headers: f.headers }), params({ workspaceId: f.workspace.id, leadId: randomUUID() }));
    expect(missing.status).toBe(404); assertPrivate(missing);
  });
});
