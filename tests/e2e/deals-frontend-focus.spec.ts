import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "playwright/test";
import { Pool } from "pg";
import { keyedHash } from "../../src/server/security/crypto";

const database = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow",
});
const sessionSecret = "local-only-session-secret-change-me-32chars";

async function browserFixture(page: Page) {
  const suffix = randomUUID();
  const user = (await database.query<{ id: string }>(
    `insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)
     values($1,$1,'Deals Focus Owner','active',now()) returning id`,
    [`deals-focus-${suffix}@example.test`],
  )).rows[0];
  const workspace = (await database.query<{ id: string }>(
    `insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
     values('Deals Focus',$1,'active','growth','monthly',$2) returning id`,
    [`deals-focus-${suffix}`, user.id],
  )).rows[0];
  const role = (await database.query<{ id: string }>(
    `insert into roles(workspace_id,code,permissions,is_system)
     values($1,'owner','{}',true) returning id`,
    [workspace.id],
  )).rows[0];
  const membership = (await database.query<{ id: string }>(
    `insert into workspace_memberships(workspace_id,user_id,role_id,status)
     values($1,$2,$3,'active') returning id`,
    [workspace.id, user.id, role.id],
  )).rows[0];
  const token = `deals-focus-${suffix}`;
  await database.query(
    `insert into sessions(user_id,session_hash,active_workspace_id,idle_expires_at,absolute_expires_at,authenticated_at,auth_method)
     values($1,$2,$3,now()+interval '1 hour',now()+interval '1 day',now(),'password')`,
    [user.id, keyedHash(token, sessionSecret), workspace.id],
  );
  await page.context().addCookies([{ name: "nexaflow_session", value: token, url: test.info().project.use.baseURL as string }]);
  return { workspaceId: workspace.id, membershipId: membership.id };
}

test.afterAll(async () => database.end());

test("Change stage focuses persistent Cancel after async detail and restores its trigger", async ({ page }) => {
  const fixture = await browserFixture(page);
  const pipelineId = "30000000-0000-4000-8000-000000000001";
  const stageId = "30000000-0000-4000-8000-000000000002";
  const targetStageId = "30000000-0000-4000-8000-000000000003";
  const dealId = "30000000-0000-4000-8000-000000000004";
  const requestId = "30000000-0000-4000-8000-000000000005";
  const now = "2026-08-26T12:00:00.000Z";
  const stage = { stageId, code: "sales.qualification", label: "Qualification", outcomeClass: "open", sortKey: 0, defaultProbabilityBps: 1000, version: 1 } as const;
  const targetStage = { stageId: targetStageId, code: "sales.proposal", label: "Proposal", outcomeClass: "open", sortKey: 1, defaultProbabilityBps: 3000, version: 1 } as const;
  const summary = { dealId, name: "Focus-safe Deal", lifecycle: "active", outcomeClass: "open", stageId, pipelineId, value: null, expectedCloseOn: null, probabilityBps: 1000, company: { available: false }, primaryContact: null, responsibleMembershipId: fixture.membershipId, version: 1, updatedAt: now, capabilities: { canEdit: true, canTransition: true, canArchive: true, canRestore: false } };
  const pipeline = { data: { contractVersion: "sales-pipeline-view.v1", pipeline: { pipelineId, label: "Sales", configurationVersion: 1, version: 1, stages: [stage, targetStage] }, options: { responsibleMemberships: [], teams: [] }, capabilities: { canCreate: true, canManageAssignment: true }, requestId } };
  const list = { data: { contractVersion: "sales-deal-list.v1", filters: { lifecycle: "active" }, items: [summary], nextCursor: null, requestId } };
  const detail = { data: { contractVersion: "sales-deal-detail.v1", deal: { dealId, name: summary.name, pipelineId, stageId, outcomeClass: "open", lifecycle: "active", value: null, probabilityBps: 1000, expectedCloseOn: null, closedAt: null, lostReasonCode: null, responsibleMembershipId: fixture.membershipId, responsibleTeamId: null, visibility: "workspace", visibleTeamIds: [], parties: [{ kind: "company", available: false }], version: 1, updatedAt: now, capabilities: { ...summary.capabilities, canManageAssignment: true, eligibleTargetStageIds: [targetStageId] } }, pipeline: { pipelineId, label: "Sales", stages: [stage, targetStage] }, options: { responsibleMemberships: [], teams: [] }, requestId } };
  let releaseDetail!: () => void;
  const detailGate = new Promise<void>(resolve => { releaseDetail = resolve; });
  await page.route("**/api/workspaces/*/deal-pipeline", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(pipeline) }));
  await page.route("**/api/workspaces/*/deals?*", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(list) }));
  await page.route(`**/api/workspaces/*/deals/${dealId}`, async route => { await detailGate; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) }); });

  await page.goto("/crm/deals");
  const trigger = page.getByRole("button", { name: `Change stage for ${summary.name}` });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  await expect(cancel).toBeVisible();
  await expect(cancel).toBeEnabled();
  await expect(cancel).toBeFocused();
  releaseDetail();
  await expect(dialog.getByLabel("New stage")).toBeVisible();
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(cancel).toBeFocused();
  await cancel.click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
