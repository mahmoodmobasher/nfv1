import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "playwright/test";
import { Pool } from "pg";
import { submitLeadInquiryV1 } from "../../src/backend/modules/leads";
import type { TrustedActor } from "../../src/backend/platform/authorization";
import { keyedHash } from "../../src/server/security/crypto";
import type { LeadConversionPreviewV1 } from "../../src/frontend/features/leads";

const database = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });
const sessionSecret = "local-only-session-secret-change-me-32chars";

async function browserFixture(page: Page): Promise<{ actor: TrustedActor; workspaceId: string }> {
  const suffix = randomUUID();
  const user = (await database.query<{ id: string }>(`insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at) values($1,$1,'Conversion Browser Owner','active',now()) returning id`, [`conversion-browser-${suffix}@example.test`])).rows[0];
  const workspace = (await database.query<{ id: string }>(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id) values('Conversion Browser',$1,'active','growth','monthly',$2) returning id`, [`conversion-browser-${suffix}`, user.id])).rows[0];
  const role = (await database.query<{ id: string }>(`insert into roles(workspace_id,code,permissions,is_system) values($1,'owner','{}',true) returning id`, [workspace.id])).rows[0];
  const membership = (await database.query<{ id: string }>(`insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active') returning id`, [workspace.id, user.id, role.id])).rows[0];
  await database.query(`insert into pipeline_stages(workspace_id,name,position,status) values($1,'New',0,'active')`, [workspace.id]);
  const token = `conversion-browser-${suffix}`;
  const session = (await database.query<{ id: string }>(`insert into sessions(user_id,session_hash,active_workspace_id,idle_expires_at,absolute_expires_at,authenticated_at,auth_method) values($1,$2,$3,now()+interval '1 hour',now()+interval '1 day',now(),'password') returning id`, [user.id, keyedHash(token, sessionSecret), workspace.id])).rows[0];
  await page.context().addCookies([{ name: "nexaflow_session", value: token, url: test.info().project.use.baseURL as string }]);
  return { workspaceId: workspace.id, actor: { userId: user.id, workspaceId: workspace.id, membershipId: membership.id, sessionId: session.id, role: "owner" } };
}

async function createLead(actor: TrustedActor) {
  return submitLeadInquiryV1(database, { actor, idempotencyKey: randomUUID(), command: { contractVersion: "lead-inquiry-intake.v1", intakeChannel: "manual", person: { displayName: "Qualified Conversion Lead", email: `conversion-${randomUUID()}@example.test` }, inquiry: { receivedAt: "2026-08-26T12:00:00.000Z" }, source: { sourceCategory: "manual", sourceMedium: "unknown", sourceDetail: {}, campaignContext: {}, attributionContractVersion: "p1a-attribution-v1" } } });
}

function eligiblePreview(leadId: string, membershipId: string): { ids: string[]; payload: { data: LeadConversionPreviewV1 } } {
  const ids = Array.from({ length: 10 }, (_, index) => `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
  return { ids, payload: { data: { contractVersion: "lead-conversion-preview.v1", lead: { leadId, label: "Qualified Conversion Lead", lifecycle: "qualified", legacyStatus: "open", version: 2, intakeId: ids[0], intakeVersion: 1, review: { reviewId: ids[1], reviewVersion: 1, decisionHeadId: ids[2], decisionHeadVersion: 1 } }, eligible: true, ineligibilityReasons: [], capabilities: { canConvert: true }, choices: { companies: [{ companyId: ids[3], label: "Authorized Company", version: 1, disclosure: "full" }], primaryContacts: [{ contactId: ids[4], companyId: ids[3], label: "Authorized Contact", version: 1, disclosure: "full", primaryEligible: true }] }, pipeline: { pipelineId: ids[5], label: "Sales", version: 1, configurationVersion: 1, initialStage: { stageId: ids[6], label: "Qualification", version: 1 } }, dealDefaults: { name: "Qualified Conversion Lead", value: null, expectedCloseOn: null }, assignment: { responsibleMembershipId: membershipId, responsibleTeamId: null, visibility: "workspace", visibleTeamIds: [] }, effects: { createsDeal: true, createsCustomers: false, createsDeliveryProject: false, writesLineage: true, convertsCanonicalLeadLifecycle: true, preservesLegacyLeadStatus: true }, requestId: ids[7] } } };
}

async function openConfirmation(page: Page, leadId: string) {
  await page.goto(`/crm/leads/${leadId}`);
  const review = page.getByRole("button", { name: "Review conversion" });
  await expect(review).toBeVisible();
  await review.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  return { review, dialog };
}

test.afterAll(async () => database.end());

test("fresh conversion preview gates choices and confirmation restores focus before focused success", async ({ page }) => {
  const fixture = await browserFixture(page);
  const created = await createLead(fixture.actor);
  const { ids, payload: preview } = eligiblePreview(created.leadId, fixture.actor.membershipId);
  let releasePreview!: () => void;
  const previewGate = new Promise<void>(resolve => { releasePreview = resolve; });
  await page.route(`**/api/workspaces/*/leads/${created.leadId}/conversion-preview`, async route => { await previewGate; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(preview) }); });
  let releaseConversion!: () => void;
  const conversionGate = new Promise<void>(resolve => { releaseConversion = resolve; });
  await page.route(`**/api/workspaces/*/leads/${created.leadId}/convert`, async route => { await conversionGate; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { contractVersion: "lead-conversion-result.v1", leadId: created.leadId, leadVersion: 3, deal: { available: true, dealId: ids[8] }, committed: true, replayed: false, requestId: ids[9], nextView: { kind: "deal_detail", dealId: ids[8] } } }) }); });

  await page.goto(`/crm/leads/${created.leadId}`);
  await expect(page.getByText("Checking conversion eligibility…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review conversion" })).toHaveCount(0);
  releasePreview();
  const review = page.getByRole("button", { name: "Review conversion" });
  await expect(review).toBeVisible();
  await page.setViewportSize({ width: 640, height: 720 });
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect((await review.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await expect(page.getByLabel("Company")).toHaveValue(ids[3]);
  await page.getByLabel("Primary Contact").selectOption(ids[4]);
  await review.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(review).toBeFocused();
  await review.click();
  const convert = dialog.getByRole("button", { name: "Convert Lead to Deal" });
  await convert.click();
  await expect(dialog.getByRole("button", { name: "Converting…" })).toBeDisabled();
  releaseConversion();
  const success = page.getByRole("status").filter({ hasText: "Lead converted" });
  await expect(success).toBeFocused();
  await expect(success.getByRole("link", { name: "View Deal" })).toHaveAttribute("href", `/crm/deals/${ids[8]}`);
});

test("ineligible preview suppresses conversion choices and submit", async ({ page }) => {
  const fixture = await browserFixture(page), created = await createLead(fixture.actor);
  const { payload } = eligiblePreview(created.leadId, fixture.actor.membershipId);
  payload.data = { ...payload.data, eligible: false, ineligibilityReasons: ["identity_review_pending"], capabilities: { canConvert: false }, lead: { ...payload.data.lead, review: null } };
  await page.route(`**/api/workspaces/*/leads/${created.leadId}/conversion-preview`, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) }));
  await page.goto(`/crm/leads/${created.leadId}`);
  await expect(page.getByText("Complete the pending Identity Review before conversion.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review conversion" })).toHaveCount(0);
  await expect(page.getByLabel("Company")).toHaveCount(0);
});

test("stale preview requires reload and reconfirmation before announcing replay", async ({ page }) => {
  const fixture = await browserFixture(page), created = await createLead(fixture.actor);
  const { ids, payload } = eligiblePreview(created.leadId, fixture.actor.membershipId);
  await page.route(`**/api/workspaces/*/leads/${created.leadId}/conversion-preview`, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) }));
  let attempts = 0;
  await page.route(`**/api/workspaces/*/leads/${created.leadId}/convert`, route => {
    attempts += 1;
    if (attempts === 1) return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: { code: "stale_preview", message: "The conversion preview changed.", retryable: false, reconciliation: { required: true, action: "refetch_preview" }, guarantees: { zeroPartialEffects: true } }, requestId: ids[8] }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { contractVersion: "lead-conversion-result.v1", leadId: created.leadId, leadVersion: 3, deal: { available: true, dealId: ids[8] }, committed: true, replayed: true, requestId: ids[9], nextView: { kind: "deal_detail", dealId: ids[8] } } }) });
  });
  let journey = await openConfirmation(page, created.leadId);
  await journey.dialog.getByRole("button", { name: "Convert Lead to Deal" }).click();
  const stale = page.getByRole("alert").filter({ hasText: "The conversion preview changed." });
  await expect(stale).toBeFocused();
  await expect(journey.review).toBeDisabled();
  await stale.getByRole("button", { name: "Reload conversion preview" }).click();
  await expect(journey.review).toBeEnabled();
  await journey.review.click();
  journey = { review: journey.review, dialog: page.getByRole("dialog") };
  await expect(journey.dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await journey.dialog.getByRole("button", { name: "Convert Lead to Deal" }).click();
  const replay = page.getByRole("status").filter({ hasText: "Conversion was already applied" });
  await expect(replay).toBeFocused();
});

test("mutation authority loss clears protected Lead and conversion state", async ({ page }) => {
  const fixture = await browserFixture(page), created = await createLead(fixture.actor);
  const { ids, payload } = eligiblePreview(created.leadId, fixture.actor.membershipId);
  await page.route(`**/api/workspaces/*/leads/${created.leadId}/conversion-preview`, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) }));
  await page.route(`**/api/workspaces/*/leads/${created.leadId}/convert`, route => route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: { code: "permission_required", message: "Conversion is no longer authorized.", retryable: false, reconciliation: { required: true, action: "clear_conversion_state" }, guarantees: { zeroPartialEffects: true } }, requestId: ids[8] }) }));
  const { dialog } = await openConfirmation(page, created.leadId);
  await dialog.getByRole("button", { name: "Convert Lead to Deal" }).click();
  const safe = page.getByRole("alert").filter({ hasText: "Lead unavailable" });
  await expect(safe).toBeFocused();
  await expect(page.getByText("Qualified Conversion Lead")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review conversion" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to leads" })).toBeVisible();
});
