import { randomUUID } from "node:crypto";
import { expect, test, type Page, type Route } from "playwright/test";
import { Pool } from "pg";
import { submitLeadInquiryV1 } from "../../src/backend/modules/leads";
import type { TrustedActor } from "../../src/backend/platform/authorization";
import { keyedHash } from "../../src/server/security/crypto";

const database = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });
const sessionSecret = "local-only-session-secret-change-me-32chars";
type Fixture = { actor: TrustedActor; leadId: string; workspaceId: string; userId: string };

async function fixture(page: Page): Promise<Fixture> {
  const suffix = randomUUID(), email = `activity-browser-${suffix}@example.test`;
  const user = (await database.query<{ id: string }>(`insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at) values($1,$1,'Activity Browser Owner','active',now()) returning id`, [email])).rows[0];
  const workspace = (await database.query<{ id: string }>(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id) values('Activity Browser',$1,'active','growth','monthly',$2) returning id`, [`activity-browser-${suffix}`, user.id])).rows[0];
  const role = (await database.query<{ id: string }>(`insert into roles(workspace_id,code,permissions,is_system) values($1,'owner','{}',true) returning id`, [workspace.id])).rows[0];
  const membership = (await database.query<{ id: string }>(`insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active') returning id`, [workspace.id, user.id, role.id])).rows[0];
  await database.query(`insert into pipeline_stages(workspace_id,name,position,status) values($1,'New',0,'active')`, [workspace.id]);
  const token = `activity-browser-${suffix}`, session = (await database.query<{ id: string }>(`insert into sessions(user_id,session_hash,active_workspace_id,idle_expires_at,absolute_expires_at,authenticated_at,auth_method) values($1,$2,$3,now()+interval '1 hour',now()+interval '1 day',now(),'password') returning id`, [user.id, keyedHash(token, sessionSecret), workspace.id])).rows[0];
  await page.context().addCookies([{ name: "nexaflow_session", value: token, url: test.info().project.use.baseURL as string }]);
  const actor: TrustedActor = { userId: user.id, workspaceId: workspace.id, membershipId: membership.id, sessionId: session.id, role: "owner" };
  const created = await submitLeadInquiryV1(database, { actor, idempotencyKey: randomUUID(), command: { contractVersion: "lead-inquiry-intake.v1", intakeChannel: "manual", person: { displayName: "Activity Browser Lead", email: `lead-${suffix}@example.test` }, inquiry: { receivedAt: "2026-08-27T12:00:00.000Z" }, source: { sourceCategory: "manual", sourceMedium: "unknown", sourceDetail: {}, campaignContext: {}, attributionContractVersion: "p1a-attribution-v1" } } });
  return { actor, leadId: created.leadId, workspaceId: workspace.id, userId: user.id };
}

const requestId = () => randomUUID();
function item(leadId: string, activityId: string, subject: string, occurredAt: string, kind: "note" | "call" | "meeting" | "email" | "message" | "other" = "call") { return { activityId, version: 1, target: { recordType: "crm.lead", recordId: leadId }, origin: "manual", kind, direction: "outbound", outcome: "connected", occurredAt, durationMinutes: 10, subject, details: `${subject} details`, createdByMembershipId: "30000000-0000-4000-8000-000000000031", createdAt: "2026-08-27T15:00:00.000Z" }; }
function list(leadId: string, items: ReturnType<typeof item>[], options: { version?: number; canCreate?: boolean; hasMore?: boolean; cursor?: string | null } = {}) { return { data: { contractVersion: "lead-activity-list.v1", lead: { leadId, version: options.version ?? 1, capabilities: { canViewActivities: true, canCreateActivity: options.canCreate ?? true } }, items, hasMore: options.hasMore ?? false, nextCursor: options.cursor ?? null, requestId: requestId() } }; }
function failure(code: "validation_failed" | "stale_version" | "activity_unavailable" | "permission_required", action: "none" | "refetch_lead" | "retry_same_request" | "clear_protected_state", fields?: string[]) { return { error: { code, message: code === "stale_version" ? "The Lead has changed." : code === "permission_required" ? "This action is not available." : "Activities are temporarily unavailable.", retryable: action === "retry_same_request", reconciliation: { required: action !== "none", action }, zeroPartialEffects: true, ...(fields ? { fields } : {}) }, requestId: requestId() }; }
async function fulfill(route: Route, body: unknown, status = 200) { await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }); }
async function fillDraft(page: Page, subject: string, kind = "call") { await page.locator("#activity-kind").selectOption(kind); await page.locator("#activity-subject").fill(subject); }

test("authenticated Activity state machine preserves stale fence, deterministic chronology, filters and focus", async ({ page }, testInfo) => {
  const f = await fixture(page), same = "2026-08-27T14:00:00.000Z", older = "2026-08-26T14:00:00.000Z";
  const high = item(f.leadId, "20000000-0000-4000-8000-000000000023", "Equal high", same), low = item(f.leadId, "20000000-0000-4000-8000-000000000021", "Equal low", same), old = item(f.leadId, "20000000-0000-4000-8000-000000000099", "Older", older);
  let failFilter = false, posts = 0, releaseMeeting!: () => void;
  const meetingGate = new Promise<void>(resolve => { releaseMeeting = resolve; });
  await page.route("**/api/workspaces/*/leads/*/activities*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === "GET") {
      const kind = url.searchParams.get("kind") ?? "", cursor = url.searchParams.get("cursor");
      if (kind === "meeting") await meetingGate;
      if (failFilter && kind === "email") return fulfill(route, failure("activity_unavailable", "retry_same_request"), 503);
      if (cursor) return fulfill(route, list(f.leadId, [low, old], { version: 2 }));
      const values = kind === "call" ? [high, low] : kind === "meeting" ? [item(f.leadId, "20000000-0000-4000-8000-000000000031", "Meeting result", same, "meeting")] : [high, low];
      return fulfill(route, list(f.leadId, values, { version: kind === "call" ? 2 : 1, hasMore: kind === "call" || kind === "", cursor: kind === "call" || kind === "" ? "opaque_activity_cursor" : null }));
    }
    posts++;
    if (posts === 1) return fulfill(route, failure("stale_version", "refetch_lead"), 409);
    const command = request.postDataJSON() as { kind: "note" | "call"; subject: string; occurredAt: string };
    const created = item(f.leadId, posts === 2 ? "20000000-0000-4000-8000-000000000022" : "20000000-0000-4000-8000-000000000040", command.subject, posts === 2 ? older : command.occurredAt, command.kind);
    return fulfill(route, { data: { contractVersion: "activity-create-result.v1", activity: created, leadVersion: 2, replayed: posts === 4, requestId: requestId() } }, 201);
  });
  await page.goto(`/crm/leads/${f.leadId}`);
  await expect(page.getByRole("heading", { name: "Equal high", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Log activity", exact: true }).click();
  const validation = page.locator('.lead-activity [data-feedback-kind="validation"]');
  await expect(validation).toBeFocused(); await expect(validation).toHaveAttribute("role", "alert");
  await validation.getByRole("link", { name: /Enter a subject/ }).click(); await expect(page.locator("#activity-subject")).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("activity-validation-focus.png"), fullPage: true });

  await fillDraft(page, "Stale protected draft"); await page.getByRole("button", { name: "Log activity", exact: true }).click();
  const stale = page.locator('.lead-activity [data-feedback-kind="conflict"]'); await expect(stale).toBeFocused();
  await page.locator("#activity-subject").fill("Stale protected draft edited");
  await expect(page.getByRole("button", { name: "Load latest before submitting" })).toBeDisabled(); await expect(stale).toBeVisible();
  await stale.getByRole("button", { name: "Load latest Lead and activity" }).click();
  await expect(page.locator('.lead-activity [data-feedback-kind="info"]')).toBeFocused(); await expect(page.locator("#activity-subject")).toHaveValue("Stale protected draft edited");

  await page.getByRole("button", { name: "Log activity", exact: true }).click();
  await expect(page.locator('.lead-activity [data-feedback-kind="success"]')).toBeFocused();
  const ordered = await page.locator(".lead-activity-card h3").allTextContents(); expect(ordered.slice(0, 3)).toEqual(["Equal high", "Equal low", "Stale protected draft edited"]);

  await page.getByRole("button", { name: "Load older activity" }).click(); await expect(page.getByRole("heading", { name: "Older", exact: true })).toBeVisible();
  expect(await page.getByRole("heading", { name: "Equal low", exact: true }).count()).toBe(1); await expect(page.getByRole("button", { name: "Load older activity" })).toHaveCount(0);

  await page.locator("#activity-filter").selectOption("call"); await expect(page.getByText(/Call only/)).toBeVisible();
  await fillDraft(page, "Filtered note", "note"); await page.getByRole("button", { name: "Log activity", exact: true }).click();
  await expect(page.getByText("Activity logged. It is outside the confirmed call filter.")).toBeVisible(); await expect(page.getByText("Filtered note", { exact: true })).toHaveCount(0);

  failFilter = true; await page.locator("#activity-filter").selectOption("email");
  await expect(page.locator("#activity-filter")).toHaveValue("call"); await expect(page.getByText(/Results remain filtered by call/)).toBeVisible(); await expect(page.getByRole("heading", { name: "Equal high", exact: true })).toBeVisible();
  failFilter = false; await page.locator("#activity-filter").selectOption("meeting"); await page.locator("#activity-filter").selectOption("call");
  await expect(page.getByText(/Call only/)).toBeVisible(); releaseMeeting(); await expect(page.getByText(/Call only/)).toBeVisible(); await expect(page.getByRole("heading", { name: "Meeting result", exact: true })).toHaveCount(0);
});

test("authenticated Activity visual matrix covers themes, responsive boundaries and truthful states", async ({ page }, testInfo) => {
  const f = await fixture(page), populated = item(f.leadId, "20000000-0000-4000-8000-000000000051", "Visual populated activity", "2026-08-27T14:00:00.000Z");
  let mode: "empty" | "populated" | "first-error" | "older-error" | "authority" = "empty", replay = false, stalePost = false, holdPost = false, holdGet = true, releasePost!: () => void, releaseGet!: () => void;
  const getGate = new Promise<void>(resolve => { releaseGet = resolve; });
  await page.route("**/api/workspaces/*/leads/*/activities*", async route => {
    if (route.request().method() === "GET") {
      if (holdGet) await getGate;
      if (mode === "first-error") return fulfill(route, failure("activity_unavailable", "retry_same_request"), 503);
      if (mode === "authority") return fulfill(route, failure("permission_required", "clear_protected_state"), 403);
      if (new URL(route.request().url()).searchParams.get("cursor") && mode === "older-error") return fulfill(route, failure("activity_unavailable", "retry_same_request"), 503);
      return fulfill(route, list(f.leadId, mode === "empty" ? [] : [populated], { hasMore: mode === "older-error", cursor: mode === "older-error" ? "older_cursor" : null }));
    }
    if (stalePost) { stalePost = false; return fulfill(route, failure("stale_version", "refetch_lead"), 409); }
    if (holdPost) await new Promise<void>(resolve => { releasePost = resolve; });
    return fulfill(route, { data: { contractVersion: "activity-create-result.v1", activity: populated, leadVersion: 1, replayed: replay, requestId: requestId() } }, 201);
  });

  const initialNavigation = page.goto(`/crm/leads/${f.leadId}`); await expect(page.getByText("Loading Lead activity…")).toBeVisible(); await page.screenshot({ path: testInfo.outputPath("activity-loading.png"), fullPage: true }); holdGet = false; releaseGet(); await initialNavigation;

  for (const [appearance, effective] of [["light", "light"], ["dark", "dark"], ["system", "light"], ["system", "dark"]] as const) {
    await database.query(`insert into user_preferences(user_id,appearance) values($1,$2) on conflict(user_id) do update set appearance=$2,version=user_preferences.version+1,updated_at=now()`, [f.userId, appearance]);
    await page.emulateMedia({ colorScheme: effective, forcedColors: "none", reducedMotion: "no-preference" }); mode = "populated"; await page.goto(`/crm/leads/${f.leadId}`);
    await expect(page.getByRole("heading", { name: "Visual populated activity", exact: true })).toBeVisible(); await page.screenshot({ path: testInfo.outputPath(`activity-${appearance}-${effective}.png`), fullPage: true });
  }

  await page.setViewportSize({ width: 320, height: 720 }); await page.reload(); await expect(page.getByRole("heading", { name: "Visual populated activity", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true); await page.screenshot({ path: testInfo.outputPath("activity-mobile-320.png"), fullPage: true });
  await page.setViewportSize({ width: 640, height: 720 }); await page.evaluate(() => { document.documentElement.style.zoom = "2"; }); await expect(page.getByRole("heading", { name: "Visual populated activity", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true); const subject = page.locator("#activity-subject"); await subject.focus(); await expect(subject).toBeFocused(); await page.screenshot({ path: testInfo.outputPath("activity-zoom-200-focus.png"), fullPage: true });
  await page.evaluate(() => { document.documentElement.style.zoom = ""; }); await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: "dark", forcedColors: "active", reducedMotion: "reduce" }); await page.reload(); await expect(page.getByRole("heading", { name: "Visual populated activity", exact: true })).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).not.toBe("smooth"); await page.screenshot({ path: testInfo.outputPath("activity-forced-colors-reduced-motion.png"), fullPage: true });

  mode = "empty"; await page.reload(); await expect(page.getByRole("heading", { name: "No activity yet" })).toBeVisible(); await page.screenshot({ path: testInfo.outputPath("activity-empty.png"), fullPage: true });
  mode = "first-error"; await page.reload(); await expect(page.getByRole("heading", { name: "Activity unavailable" })).toBeVisible(); await page.screenshot({ path: testInfo.outputPath("activity-first-load-error.png"), fullPage: true });
  mode = "older-error"; await page.reload(); await page.getByRole("button", { name: "Load older activity" }).click(); await expect(page.getByText(/Previously loaded activity remains/)).toBeVisible(); await page.screenshot({ path: testInfo.outputPath("activity-load-older-error.png"), fullPage: true });

  mode = "populated"; await page.reload(); await page.getByRole("button", { name: "Log activity", exact: true }).click(); await expect(page.locator('.lead-activity [data-feedback-kind="validation"]')).toBeFocused(); await page.screenshot({ path: testInfo.outputPath("activity-validation.png"), fullPage: true });
  await fillDraft(page, "Pending visual"); holdPost = true; await page.getByRole("button", { name: "Log activity", exact: true }).click(); await expect(page.locator('.lead-activity [data-feedback-kind="pending"]')).toBeVisible(); await page.screenshot({ path: testInfo.outputPath("activity-pending.png"), fullPage: true }); releasePost(); holdPost = false;
  await expect(page.locator('.lead-activity [data-feedback-kind="success"]')).toBeFocused(); await page.screenshot({ path: testInfo.outputPath("activity-success.png"), fullPage: true });
  replay = true; await fillDraft(page, "Replay visual"); await page.getByRole("button", { name: "Log activity", exact: true }).click(); await expect(page.locator('.lead-activity [data-feedback-kind="replay"]')).toBeFocused(); await page.screenshot({ path: testInfo.outputPath("activity-replay.png"), fullPage: true });
  stalePost = true; await fillDraft(page, "Stale visual"); await page.getByRole("button", { name: "Log activity", exact: true }).click(); await expect(page.locator('.lead-activity [data-feedback-kind="conflict"]')).toBeFocused(); await page.screenshot({ path: testInfo.outputPath("activity-stale-conflict.png"), fullPage: true });
  mode = "authority"; await page.locator("#activity-filter").selectOption("call"); await expect(page.getByRole("heading", { name: "Lead unavailable" })).toBeVisible(); await page.screenshot({ path: testInfo.outputPath("activity-authority-loss.png"), fullPage: true });
});
