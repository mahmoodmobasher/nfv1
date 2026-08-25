import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { GET as detailGet } from "../src/app/api/workspaces/[workspaceId]/leads/[leadId]/identity-review/route";
import { GET as queueGet } from "../src/app/api/workspaces/[workspaceId]/identity-reviews/route";
import { submitLeadInquiryV1 } from "../src/backend/modules/leads";
import { getServerEnv } from "../src/server/env";
import { createSession } from "../src/server/security/session";

const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });
const env = getServerEnv(), params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

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
  return { workspace, held, headers: { cookie: `${env.SESSION_COOKIE_NAME}=${session.token}` } };
}

suite("P1A presentation routes", () => {
  beforeAll(async () => { await pool.query("select 1"); });
  beforeEach(async () => { await pool.query("truncate users cascade"); });
  afterAll(async () => { await pool.end(); });

  it("returns protected detail and queue envelopes with private caching and no raw candidate PII", async () => {
    const f = await fixture();
    const detail = await detailGet(new Request(`${env.APP_ORIGIN}/api/workspaces/${f.workspace.id}/leads/${f.held.leadId}/identity-review`,
      { headers: f.headers }), params({ workspaceId: f.workspace.id, leadId: f.held.leadId }));
    expect(detail.status).toBe(200); expect(detail.headers.get("cache-control")).toContain("no-store");
    const detailBody = await detail.json();
    expect(detailBody.data).toMatchObject({ contractVersion: "lead-identity-review-detail.v1", requestId: expect.any(String),
      capabilities: { canCreateContact: true, canLinkContact: true }, candidates: [{ maskedEmail: "r***@example.test" }] });
    expect(JSON.stringify(detailBody)).not.toContain("route@example.test");
    const queue = await queueGet(new Request(`${env.APP_ORIGIN}/api/workspaces/${f.workspace.id}/identity-reviews?limit=25`,
      { headers: f.headers }), params({ workspaceId: f.workspace.id }));
    expect(queue.status).toBe(200); expect(queue.headers.get("cache-control")).toContain("no-store");
    const queueBody = await queue.json();
    expect(queueBody.data).toMatchObject({ contractVersion: "lead-identity-review-queue.v1", requestId: expect.any(String),
      items: [{ leadId: f.held.leadId, capabilities: { canHold: true } }] });
    expect(JSON.stringify(queueBody)).not.toContain("route@example.test");
  });

  it("authenticates before filter validation and returns the same bounded no-detail error", async () => {
    const workspaceId = randomUUID(), leadId = randomUUID();
    for (const response of [
      await queueGet(new Request(`${env.APP_ORIGIN}/api/workspaces/${workspaceId}/identity-reviews?unknown=true`), params({ workspaceId })),
      await detailGet(new Request(`${env.APP_ORIGIN}/api/workspaces/${workspaceId}/leads/${leadId}/identity-review`), params({ workspaceId, leadId })),
    ]) {
      expect(response.status).toBe(401); expect(response.headers.get("cache-control")).toContain("no-store");
      expect(await response.json()).toMatchObject({ error: { code: "authentication_required", retryable: false,
        reconciliation: { required: false, action: "none" } }, requestId: expect.any(String) });
    }
  });
});
