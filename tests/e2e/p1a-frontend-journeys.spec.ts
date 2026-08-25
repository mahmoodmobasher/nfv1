import { randomUUID } from "node:crypto";
import { expect, test, type Page, type Request } from "playwright/test";
import { Pool } from "pg";
import { submitLeadInquiryV1 } from "../../src/backend/modules/leads";
import type { TrustedActor } from "../../src/backend/platform/authorization";
import { keyedHash } from "../../src/server/security/crypto";

const database = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow",
});
const sessionSecret = "local-only-session-secret-change-me-32chars";

type BrowserFixture = {
  actor: TrustedActor;
  token: string;
  workspaceId: string;
};

async function browserFixture(page: Page): Promise<BrowserFixture> {
  const suffix = randomUUID();
  const user = (await database.query<{ id: string }>(
    `insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)
     values($1,$1,'P1A Browser Owner','active',now()) returning id`,
    [`p1a-browser-${suffix}@example.test`],
  )).rows[0];
  const workspace = (await database.query<{ id: string }>(
    `insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
     values('P1A Browser',$1,'active','growth','monthly',$2) returning id`,
    [`p1a-browser-${suffix}`, user.id],
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
  await database.query(
    `insert into pipeline_stages(workspace_id,name,position,status) values($1,'New',0,'active')`,
    [workspace.id],
  );
  const token = `p1a-browser-${suffix}`;
  const session = (await database.query<{ id: string }>(
    `insert into sessions(user_id,session_hash,active_workspace_id,idle_expires_at,absolute_expires_at,authenticated_at,auth_method)
     values($1,$2,$3,now()+interval '1 hour',now()+interval '1 day',now(),'password') returning id`,
    [user.id, keyedHash(token, sessionSecret), workspace.id],
  )).rows[0];
  await page.context().addCookies([{ name: "nexaflow_session", value: token, url: "http://127.0.0.1:3000" }]);
  return {
    token,
    workspaceId: workspace.id,
    actor: {
      userId: user.id,
      workspaceId: workspace.id,
      membershipId: membership.id,
      sessionId: session.id,
      role: "owner",
    },
  };
}

function successfulIntake(index: number) {
  const leadId = `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  return {
    data: {
      contractVersion: "lead-inquiry-intake-result.v1",
      intakeId: `11000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      leadId,
      disposition: "created",
      contactId: null,
      companyId: null,
      reviewCaseId: null,
      candidateSummary: { strong: 0, supplementary: 0, probable: 0 },
      leadVersion: 1,
      reviewVersion: null,
      replayed: false,
      requestId: `12000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      nextView: { kind: "lead_detail", leadId },
    },
  };
}

async function fillMinimumIntake(page: Page, name = "Taylor Browser") {
  await page.locator("#displayName").fill(name);
  await page.locator("#email").fill("taylor@example.test");
}

test.afterAll(async () => database.end());

test("manual intake maps errors and keeps one request identity across a safe retry", async ({ page }) => {
  await browserFixture(page);
  const consoleErrors: string[] = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto("/crm/leads/new");

  await page.getByRole("button", { name: "Create lead" }).click();
  const summary = page.getByRole("alert").filter({ hasText: "Please correct the following" });
  await expect(summary).toBeFocused();
  await expect(page.locator("#displayName")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#email")).toHaveAttribute("aria-invalid", "true");
  await summary.getByRole("link", { name: "Enter a name." }).click();
  await expect(page.locator("#displayName")).toBeFocused();

  await fillMinimumIntake(page);
  const submissions: Request[] = [];
  await page.route("**/api/workspaces/*/leads", async route => {
    if (route.request().method() !== "POST") return route.continue();
    submissions.push(route.request());
    if (submissions.length === 1) return route.abort("connectionreset");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(successfulIntake(1)) });
  });
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page.getByText(/temporarily unavailable|could not be completed/i)).toBeVisible();
  await expect(page.locator("#displayName")).toHaveValue("Taylor Browser");
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page.getByRole("heading", { name: "Lead created." })).toBeVisible();

  expect(submissions).toHaveLength(2);
  expect(submissions[1].headers()["idempotency-key"]).toBe(submissions[0].headers()["idempotency-key"]);
  expect(submissions[1].postDataJSON().inquiry.receivedAt).toBe(submissions[0].postDataJSON().inquiry.receivedAt);
  expect(consoleErrors.filter(message => !message.includes("ERR_CONNECTION_RESET"))).toEqual([]);
});

test("a new inquiry receives a new timestamp and idempotency key", async ({ page }) => {
  await browserFixture(page);
  const requests: Request[] = [];
  await page.route("**/api/workspaces/*/leads", async route => {
    if (route.request().method() !== "POST") return route.continue();
    requests.push(route.request());
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(successfulIntake(requests.length)) });
  });
  await page.goto("/crm/leads/new");
  await fillMinimumIntake(page, "First Inquiry");
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page.getByRole("button", { name: "Add another lead" })).toBeVisible();
  await page.getByRole("button", { name: "Add another lead" }).click();
  await fillMinimumIntake(page, "Second Inquiry");
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].headers()["idempotency-key"]).not.toBe(requests[0].headers()["idempotency-key"]);
  expect(requests[1].postDataJSON().inquiry.receivedAt).not.toBe(requests[0].postDataJSON().inquiry.receivedAt);
});

test("identity review keeps identifiers out of decision copy and separates Hold from Resolve", async ({ page }, testInfo) => {
  const fixture = await browserFixture(page);
  const candidateEmail = `candidate-${randomUUID()}@example.test`;
  const target = (await database.query<{ id: string }>(
    `insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized)
     values($1,'Existing Taylor','existing taylor',$2,$2) returning id`,
    [fixture.workspaceId, candidateEmail],
  )).rows[0];
  const held = await submitLeadInquiryV1(database, {
    actor: fixture.actor,
    idempotencyKey: randomUUID(),
    command: {
      contractVersion: "lead-inquiry-intake.v1",
      intakeChannel: "manual",
      person: { displayName: "Existing Taylor", email: candidateEmail },
      inquiry: { receivedAt: "2026-08-25T12:00:00.000Z" },
      source: { sourceCategory: "manual", sourceMedium: "unknown", sourceDetail: {}, campaignContext: {}, attributionContractVersion: "p1a-attribution-v1" },
    },
  });
  const decisions: unknown[] = [];
  await page.route("**/api/workspaces/*/leads/*/identity-review", async route => {
    if (route.request().method() !== "POST") return route.continue();
    decisions.push(route.request().postDataJSON());
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: {
        contractVersion: "lead-identity-review-decision-result.v1", outcome: "hold", disposition: "held_for_review",
        reviewId: held.reviewCaseId, leadId: held.leadId, contactId: null, companyId: null, leadVersion: 1,
        reviewVersion: 1, replayed: false, requestId: randomUUID(),
        nextView: { kind: "identity_review_detail", leadId: held.leadId, reviewId: held.reviewCaseId },
      } }),
    });
  });
  await page.goto(`/crm/identity-reviews/${held.leadId}`);
  await expect(page.getByText("Existing Taylor", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Email matches exactly after normalization/)).toBeVisible();
  await page.getByRole("radio", { name: /Existing Taylor/ }).check();
  const visibleText = await page.locator("body").innerText();
  expect(visibleText).not.toContain(target.id);
  expect(visibleText).not.toContain(candidateEmail);
  expect(visibleText).not.toMatch(/link:|candidateId|targetId|expectedTargetVersion/);
  await page.screenshot({ path: testInfo.outputPath("identity-review-safe-decision.png"), fullPage: true });

  await page.getByRole("button", { name: "Hold for review" }).click();
  await expect(page.getByRole("heading", { name: /Review remains Pending/i })).toBeVisible();
  expect(decisions).toHaveLength(1);
  expect(decisions[0]).toMatchObject({ outcome: "hold" });
  expect(decisions[0]).not.toHaveProperty("contact");
  expect(decisions[0]).not.toHaveProperty("company");
});

test("P1A pages remain operable at an effective 320px and 200% zoom without horizontal overflow", async ({ page }, testInfo) => {
  await browserFixture(page);
  await page.setViewportSize({ width: 640, height: 700 });
  await page.goto("/crm/leads/new");
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await expect(page.getByRole("heading", { name: "Add a lead" })).toBeVisible();
  await page.locator("#displayName").fill("A very long but safe display name that must wrap without disclosing anything else");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const create = page.getByRole("button", { name: "Create lead" });
  await create.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(create).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("manual-intake-320px-zoom200.png"), fullPage: true });
});

test("identity queue exposes empty, filter reset, and retry-safe page context", async ({ page }) => {
  await browserFixture(page);
  await page.goto("/crm/identity-reviews");
  await expect(page.getByRole("heading", { name: "No identity reviews match these filters." })).toBeVisible();
  await page.getByLabel("Evidence").selectOption("email");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("status")).toContainText("Page 1");
  await expect(page.getByRole("status")).toContainText("email");
  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(page.getByLabel("Evidence")).toHaveValue("any");
});

test("P1A surfaces retain focus and semantic boundaries under dark, forced colours, and reduced motion", async ({ page }, testInfo) => {
  await browserFixture(page);
  await page.emulateMedia({ colorScheme: "dark", forcedColors: "active", reducedMotion: "reduce" });
  await page.goto("/crm/leads/new");
  const create = page.getByRole("button", { name: "Create lead" });
  await create.focus();
  await expect(create).toBeFocused();
  await expect(page.locator(".p1a-readonly").getByText("Manual", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).not.toBe("smooth");
  await page.screenshot({ path: testInfo.outputPath("manual-intake-dark-forced-reduced.png"), fullPage: true });
});
