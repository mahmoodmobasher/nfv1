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
  await page.context().addCookies([{ name: "nexaflow_session", value: token, url: test.info().project.use.baseURL as string }]);
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
function heldIntake(index:number){const envelope=successfulIntake(index),reviewId=`13000000-0000-4000-8000-${String(index).padStart(12,"0")}`;return{data:{...envelope.data,disposition:"held_for_review",reviewCaseId:reviewId,reviewVersion:1,nextView:{kind:"identity_review_detail",leadId:envelope.data.leadId,reviewId}}}}

async function fillMinimumIntake(page: Page, name = "Taylor Browser") {
  await page.locator("#displayName").fill(name);
  await page.locator("#email").fill("taylor@example.test");
}

function p1aError(code: "authentication_required" | "permission_required" | "resource_not_found" | "validation_failed" | "intake_unavailable" | "stale_version" |
  "invalid_match_decision" | "assignment_unavailable" | "rate_limited" | "unexpected_error" | "idempotency_conflict", fields?: string[]) {
  const presentation = {
    authentication_required: ["Authentication is required.", "none", false],
    permission_required: ["This action is not available.", "none", false],
    resource_not_found: ["The requested resource is unavailable.", "none", false],
    validation_failed: ["The request is invalid.", "none", false],
    intake_unavailable: ["Lead intake is temporarily unavailable.", "retry_same_request", true],
    stale_version: ["The identity review has changed.", "refetch_identity_review", false],
    invalid_match_decision: ["The selected identity is no longer available.", "refetch_identity_review", false],
    assignment_unavailable: ["The selected responsibility is unavailable.", "refetch_identity_review", false],
    rate_limited: ["Too many requests. Try again later.", "retry_same_request", true],
    unexpected_error: ["The request could not be completed.", "retry_same_request", true],
    idempotency_conflict: ["The idempotency key conflicts with a prior request.", "none", false],
  } as const;
  const [message, action, retryable] = presentation[code];
  return { error: { code, message, retryable, reconciliation: { required: action !== "none", action },
    ...(fields ? { details: { fields } } : {}) }, requestId: randomUUID() };
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

test("ordinary Canada and US phone entry is guided, preserved, and mapped inline", async ({ page }) => {
  await browserFixture(page);
  const submitted: string[] = [];
  await page.route("**/api/workspaces/*/leads", async route => {
    if (route.request().method() !== "POST") return route.continue();
    submitted.push(route.request().postDataJSON().person.phone);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(successfulIntake(submitted.length + 30)) });
  });
  await page.goto("/crm/leads/new");
  await page.locator("#displayName").fill("Phone-only Lead");
  await page.locator("#phone").fill("(647) 389-4802");
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page.getByRole("heading", { name: "Lead created." })).toBeVisible();
  expect(submitted).toEqual(["(647) 389-4802"]);

  await page.getByRole("button", { name: "Add another lead" }).click();
  await page.locator("#displayName").fill("Leading-one Lead");
  await page.locator("#phone").fill("16473894802");
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page.getByRole("heading", { name: "Lead created." })).toBeVisible();
  expect(submitted).toEqual(["(647) 389-4802", "16473894802"]);

  await page.getByRole("button", { name: "Add another lead" }).click();
  await page.locator("#displayName").fill("Invalid Phone");
  await page.locator("#phone").fill("5551234");
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page.locator("#phone-error")).toHaveText("Enter a valid phone number in one of the supported formats.");
  await expect(page.locator(".error-summary")).toBeFocused();
  await page.locator("#phone").fill("6473894802");
  await expect(page.locator("#phone-error")).toHaveCount(0);
});

test("a fieldless validation response does not duplicate generic copy", async ({ page }) => {
  await browserFixture(page);
  await page.route("**/api/workspaces/*/leads", route => route.request().method() === "POST"
    ? route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify(p1aError("validation_failed")) })
    : route.continue());
  await page.goto("/crm/leads/new");
  await fillMinimumIntake(page);
  await page.getByRole("button", { name: "Create lead" }).click();
  const alert = page.locator(".error-summary");
  await expect(alert).toBeFocused();
  await expect(alert.getByText("The request is invalid.", { exact: true })).toHaveCount(1);
  await expect(alert).toContainText("Review the submitted information and try again.");
});

test("canonical Lead creation reaches list, Pipeline, and read-only detail", async ({ page }) => {
  const fixture = await browserFixture(page);
  const created = await submitLeadInquiryV1(database, { actor: fixture.actor, idempotencyKey: randomUUID(), command: {
    contractVersion: "lead-inquiry-intake.v1", intakeChannel: "manual",
    person: { displayName: "Phone-only Canonical Lead", phone: "6473894802", phoneCountryOverride: "CA" },
    inquiry: { receivedAt: "2026-08-25T12:00:00.000Z" },
    source: { sourceCategory: "social_media", sourcePlatform: "instagram", sourceMedium: "organic", sourceDetail: {}, campaignContext: {}, attributionContractVersion: "p1a-attribution-v1" },
  } });
  await database.query(`insert into pipeline_stages(workspace_id,name,position,status) values($1,'Working',1,'active')`, [fixture.workspaceId]);

  await page.goto("/crm");
  await expect(page.getByRole("heading", { name: "Phone-only Canonical Lead" })).toBeVisible();
  await expect(page.getByText("No company provided")).toBeVisible();
  await expect(page.getByText(/Unassigned/)).toBeVisible();

  await page.goto("/crm/pipeline");
  await expect(page.getByRole("heading", { name: /New/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Working/ })).toBeVisible();
  await expect(page.getByText("No leads in this stage.")).toBeVisible();

  await page.goto(`/crm/leads/${created.leadId}`);
  await expect(page.getByRole("heading", { name: "Phone-only Canonical Lead" })).toBeVisible();
  await expect(page.getByText("Instagram")).toBeVisible();
  await expect(page.getByText("Manual", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /save/i })).toHaveCount(0);
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

test("a replayed intake is presented as already committed without a second action", async ({ page }, testInfo) => {
  await browserFixture(page);
  const replay = successfulIntake(2);
  replay.data.disposition = "replayed";
  replay.data.replayed = true;
  let posts = 0;
  await page.route("**/api/workspaces/*/leads", async route => {
    if (route.request().method() !== "POST") return route.continue();
    posts++;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(replay) });
  });
  await page.goto("/crm/leads/new");
  await fillMinimumIntake(page, "Replayed Lead");
  await page.getByRole("button", { name: "Create lead" }).dblclick();
  await expect(page.getByRole("heading", { name: "This lead was already created." })).toBeVisible();
  expect(posts).toBe(1);
  await page.screenshot({ path: testInfo.outputPath("manual-intake-replayed-committed.png"), fullPage: true });
});

test("held intake truthfully routes to the pending identity review",async({page})=>{await browserFixture(page);await page.route("**/api/workspaces/*/leads",route=>route.request().method()==="POST"?route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(heldIntake(8))}):route.continue());await page.goto("/crm/leads/new");await fillMinimumIntake(page,"Held Inquiry");await page.getByRole("button",{name:"Create lead"}).click();await expect(page.getByRole("heading",{name:"Lead created and ready for identity review."})).toBeVisible();await expect(page.getByRole("link",{name:"Review possible matches"})).toHaveAttribute("href",/\/crm\/identity-reviews\//)});

test("editing a held intake body rotates its request identity before commit", async ({ page }) => {
  await browserFixture(page);
  const requests: Request[] = [];
  await page.route("**/api/workspaces/*/leads", async route => {
    if (route.request().method() !== "POST") return route.continue();
    requests.push(route.request());
    if (requests.length === 1) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify(p1aError("intake_unavailable")) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(successfulIntake(3)) });
  });
  await page.goto("/crm/leads/new");
  await fillMinimumIntake(page, "Original Body");
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "temporarily unavailable" })).toBeVisible();
  await page.locator("#displayName").fill("Edited Body");
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page.getByRole("heading", { name: "Lead created." })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1].headers()["idempotency-key"]).not.toBe(requests[0].headers()["idempotency-key"]);
  expect(requests[0].postDataJSON().person.displayName).toBe("Original Body");
  expect(requests[1].postDataJSON().person.displayName).toBe("Edited Body");
});

test("intake preserves retry keys for rate and unexpected errors and rotates after conflict", async ({ page }) => {
  await browserFixture(page);
  const requests: Request[] = [], errors = [p1aError("rate_limited"), p1aError("unexpected_error"), p1aError("idempotency_conflict")];
  await page.route("**/api/workspaces/*/leads", async route => {
    if (route.request().method() !== "POST") return route.continue();
    requests.push(route.request());
    const error = errors.shift();
    return error ? route.fulfill({ status: error.error.code === "rate_limited" ? 429 : error.error.code === "unexpected_error" ? 500 : 409,
      contentType: "application/json", body: JSON.stringify(error) }) :
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(successfulIntake(9)) });
  });
  await page.goto("/crm/leads/new");
  await fillMinimumIntake(page, "Reconciliation Key");
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.getByRole("button", { name: "Create lead" }).click();
    if (attempt < 3) await expect(page.locator(".error-summary")).toBeFocused();
  }
  await expect(page.getByRole("heading", { name: "Lead created." })).toBeVisible();
  const keys = requests.map(request => request.headers()["idempotency-key"]);
  expect(keys[1]).toBe(keys[0]);
  expect(keys[2]).toBe(keys[1]);
  expect(keys[3]).not.toBe(keys[2]);
});

test("backend canonical field errors focus, announce, describe, and clear every real control", async ({ page }, testInfo) => {
  await browserFixture(page);
  const fields = [
    "person.displayName", "person.email", "person.phone", "person.phoneCountryOverride", "organization.name", "organization.domain",
    "inquiry.subject", "inquiry.message", "source.sourceCategory", "source.sourcePlatform", "source.sourceMedium",
    "source.sourceDetail.operator_context", "source.sourceDetail.page", "source.sourceDetail.account", "source.sourceDetail.campaign",
    "source.sourceDetail.ad", "source.sourceDetail.form", "source.sourceDetail.post",
  ];
  await page.route("**/api/workspaces/*/leads", route => route.fulfill({ status: 400, contentType: "application/json",
    body: JSON.stringify(p1aError("validation_failed", fields)) }));
  await page.goto("/crm/leads/new");
  await fillMinimumIntake(page);
  await page.locator("#sourceCategory").selectOption("social_media");
  await page.locator("#sourcePlatform").selectOption("other_social");
  await page.locator("#platformDetail").fill("Community network");
  await page.getByText("Optional attribution context").click();
  await page.getByRole("button", { name: "Create lead" }).click();
  const summary = page.getByRole("alert").filter({ hasText: "The request is invalid." });
  await expect(summary).toBeFocused();
  for (const id of ["displayName", "email", "phone", "phoneCountry", "organizationName", "organizationDomain", "subject", "message",
    "sourceCategory", "sourcePlatform", "sourceMedium", "platformDetail", "page", "account", "campaign", "ad", "form", "post"]) {
    const control = page.locator(`#${id}`);
    await expect(control).toHaveAttribute("aria-invalid", "true");
    await expect(control).toHaveAttribute("aria-describedby", new RegExp(`(?:^| )${id}-error(?: |$)`));
    await expect(page.locator(`#${id}-error`)).toBeVisible();
  }
  await summary.getByRole("link").first().click();
  await expect(page.locator("#displayName")).toBeFocused();
  await page.locator("#phone").fill("+1 416 555 0100");
  await expect(page.locator("#phone")).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#phone-error")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("manual-intake-server-field-errors.png"), fullPage: true });
});

test("social taxonomy is conditional and submits bounded attribution context", async ({ page }, testInfo) => {
  await browserFixture(page);
  let submitted: Request | undefined;
  await page.route("**/api/workspaces/*/leads", async route => {
    if (route.request().method() !== "POST") return route.continue();
    submitted = route.request();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(successfulIntake(4)) });
  });
  await page.goto("/crm/leads/new");
  await expect(page.locator("#sourcePlatform")).toHaveCount(0);
  await fillMinimumIntake(page);
  await page.locator("#sourceCategory").selectOption("social_media");
  await expect(page.locator("#sourcePlatform")).toBeVisible();
  await page.locator("#sourcePlatform").selectOption("other_social");
  await expect(page.locator("#platformDetail")).toBeVisible();
  await page.locator("#platformDetail").fill("Community forum");
  await page.getByText("Optional attribution context").click();
  for (const name of ["Page", "Account", "Campaign", "Ad", "Form", "Post"]) await page.getByLabel(name, { exact: true }).fill(`${name} context`);
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page.getByRole("heading", { name: "Lead created." })).toBeVisible();
  expect(submitted?.postDataJSON().source).toMatchObject({ sourceCategory: "social_media", sourcePlatform: "other_social", sourceMedium: "unknown",
    sourceDetail: { operator_context: "Community forum", page: "Page context", account: "Account context", campaign: "Campaign context",
      ad: "Ad context", form: "Form context", post: "Post context" } });
  await page.screenshot({ path: testInfo.outputPath("manual-intake-social-attribution-success.png"), fullPage: true });
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
    const command=route.request().postDataJSON();decisions.push(command);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: {
        contractVersion: "lead-identity-review-decision-result.v1", outcome: command.outcome, disposition: command.outcome==="hold"?"held_for_review":"resolved",
        reviewId: held.reviewCaseId, leadId: held.leadId, contactId: command.outcome==="resolve"?target.id:null, companyId: null, leadVersion: 1,
        reviewVersion: 1, replayed: false, requestId: randomUUID(),
        nextView: command.outcome==="hold"?{ kind: "identity_review_detail", leadId: held.leadId, reviewId: held.reviewCaseId }:{kind:"identity_review_queue"},
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
  await page.getByRole("radio",{name:/Dismiss company candidates/}).check();
  await page.getByRole("button",{name:"Apply identity decision"}).click();
  await expect(page.getByRole("heading",{name:"Identity review completed."})).toBeVisible();
  await expect(page.getByRole("link",{name:"Return to review queue"})).toBeVisible();
  expect(decisions[0]).toMatchObject({outcome:"resolve",contact:{action:"link"},company:{action:"dismiss"}});
  await page.goto(`/crm/identity-reviews/${held.leadId}`);
  await page.getByRole("button", { name: "Hold for review" }).click();
  await expect(page.getByRole("heading", { name: /Review remains Pending/i })).toBeVisible();
  expect(decisions).toHaveLength(2);
  expect(decisions[1]).toMatchObject({ outcome: "hold" });
  expect(decisions[1]).not.toHaveProperty("contact");
  expect(decisions[1]).not.toHaveProperty("company");
});

for (const authorityCode of ["authentication_required", "permission_required", "resource_not_found"] as const) test(`decision ${authorityCode} clears protected detail, selections, and draft and focuses the generic state`, async ({ page }, testInfo) => {
  const fixture = await browserFixture(page);
  const email = `authority-${randomUUID()}@example.test`;
  await database.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized) values($1,'Existing Authority','existing authority',$2,$2)`,[fixture.workspaceId,email]);
  const held=await submitLeadInquiryV1(database,{actor:fixture.actor,idempotencyKey:randomUUID(),command:{contractVersion:"lead-inquiry-intake.v1",intakeChannel:"manual",person:{displayName:"Existing Authority",email},inquiry:{receivedAt:"2026-08-25T12:00:00.000Z"},source:{sourceCategory:"manual",sourceMedium:"unknown",sourceDetail:{},campaignContext:{},attributionContractVersion:"p1a-attribution-v1"}}});
  await page.route("**/api/workspaces/*/leads/*/identity-review",async route=>{if(route.request().method()!=="POST")return route.continue();const status=authorityCode==="authentication_required"?401:authorityCode==="permission_required"?403:404;return route.fulfill({status,contentType:"application/json",body:JSON.stringify(p1aError(authorityCode))})});
  await page.goto(`/crm/identity-reviews/${held.leadId}`);
  await page.getByRole("radio",{name:/Existing Authority/}).check();
  await page.getByRole("radio",{name:/Dismiss company candidates/}).check();
  await page.getByRole("button",{name:"Apply identity decision"}).click();
  const state=page.getByRole("alert").filter({hasText:"Review no longer available"});
  await expect(state).toBeFocused();
  await expect(page.getByText("Existing Authority",{exact:true})).toHaveCount(0);
  await expect(page.getByText(/matches exactly after normalization/)).toHaveCount(0);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath(`identity-review-${authorityCode}.png`),fullPage:true});
});

test("stale reconciliation preserves a safe proposal, removes lost candidates, and requires reselection", async ({ page }) => {
  const fixture=await browserFixture(page),email=`stale-${randomUUID()}@example.test`;
  await database.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized) values($1,'Existing Stale','existing stale',$2,$2)`,[fixture.workspaceId,email]);
  const held=await submitLeadInquiryV1(database,{actor:fixture.actor,idempotencyKey:randomUUID(),command:{contractVersion:"lead-inquiry-intake.v1",intakeChannel:"manual",person:{displayName:"Existing Stale",email},inquiry:{receivedAt:"2026-08-25T12:00:00.000Z"},source:{sourceCategory:"manual",sourceMedium:"unknown",sourceDetail:{},campaignContext:{},attributionContractVersion:"p1a-attribution-v1"}}});
  await page.goto(`/crm/identity-reviews/${held.leadId}`);
  const current=await page.evaluate(async({workspaceId,leadId})=>await(await fetch(`/api/workspaces/${workspaceId}/leads/${leadId}/identity-review`,{cache:"no-store"})).json(),{workspaceId:fixture.workspaceId,leadId:held.leadId});
  const latest={...current,data:{...current.data,candidates:current.data.candidates.map((candidate:{canLink:boolean})=>({...candidate,canLink:false})),capabilities:{...current.data.capabilities,canLinkContact:false,canLinkCompany:false}}};
  await page.route("**/api/workspaces/*/leads/*/identity-review",async route=>route.request().method()==="POST"?route.fulfill({status:409,contentType:"application/json",body:JSON.stringify(p1aError("stale_version"))}):route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(latest)}));
  await page.getByRole("radio",{name:/Existing Stale/}).check();
  await page.getByRole("radio",{name:/Dismiss company candidates/}).check();
  await page.getByRole("button",{name:"Apply identity decision"}).click();
  await expect(page.getByRole("heading",{name:"Previous proposal — not applied"})).toBeVisible();
  await expect(page.getByRole("status").filter({hasText:"Latest information loaded"})).toBeFocused();
  await expect(page.getByRole("radio",{name:/Existing Stale/})).toHaveCount(0);
  await expect(page.getByText(/Linking is unavailable/)).toBeVisible();
  await expect(page.getByRole("radio",{name:/Create new contact/})).toBeVisible();
  await expect(page.getByRole("button",{name:"Apply identity decision"})).toBeDisabled();
});

test("invalid match and assignment conflicts refetch, preserve safe comparison, and clear selections", async ({ page }) => {
  const fixture=await browserFixture(page),email=`refetch-${randomUUID()}@example.test`;
  await database.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized) values($1,'Existing Refetch','existing refetch',$2,$2)`,[fixture.workspaceId,email]);
  const held=await submitLeadInquiryV1(database,{actor:fixture.actor,idempotencyKey:randomUUID(),command:{contractVersion:"lead-inquiry-intake.v1",intakeChannel:"manual",person:{displayName:"Existing Refetch",email},inquiry:{receivedAt:"2026-08-25T12:00:00.000Z"},source:{sourceCategory:"manual",sourceMedium:"unknown",sourceDetail:{},campaignContext:{},attributionContractVersion:"p1a-attribution-v1"}}});
  await page.goto(`/crm/identity-reviews/${held.leadId}`);
  const current=await page.evaluate(async({workspaceId,leadId})=>await(await fetch(`/api/workspaces/${workspaceId}/leads/${leadId}/identity-review`,{cache:"no-store"})).json(),{workspaceId:fixture.workspaceId,leadId:held.leadId});
  const errors=[p1aError("invalid_match_decision"),p1aError("assignment_unavailable")];let posts=0,gets=0;
  await page.route("**/api/workspaces/*/leads/*/identity-review",async route=>{if(route.request().method()==="POST"){const error=errors[posts++];return route.fulfill({status:409,contentType:"application/json",body:JSON.stringify(error)})}gets++;return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(current)})});
  for(const code of ["invalid_match_decision","assignment_unavailable"]){await page.getByRole("radio",{name:/Existing Refetch/}).check();await page.getByRole("radio",{name:/Dismiss company candidates/}).check();await page.getByRole("button",{name:"Apply identity decision"}).click();await expect(page.getByRole("status").filter({hasText:"Latest information loaded"})).toBeFocused();await expect(page.getByRole("heading",{name:"Previous proposal — not applied"})).toBeVisible();await expect(page.getByRole("button",{name:"Apply identity decision"})).toBeDisabled();expect(code).toBeTruthy()}
  expect(posts).toBe(2);expect(gets).toBe(2);
});

test("decision retry errors preserve one key and idempotency conflict rotates it",async({page})=>{
 const fixture=await browserFixture(page),email=`decision-key-${randomUUID()}@example.test`;await database.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized) values($1,'Decision Key','decision key',$2,$2)`,[fixture.workspaceId,email]);const held=await submitLeadInquiryV1(database,{actor:fixture.actor,idempotencyKey:randomUUID(),command:{contractVersion:"lead-inquiry-intake.v1",intakeChannel:"manual",person:{displayName:"Decision Key",email},inquiry:{receivedAt:"2026-08-25T12:00:00.000Z"},source:{sourceCategory:"manual",sourceMedium:"unknown",sourceDetail:{},campaignContext:{},attributionContractVersion:"p1a-attribution-v1"}}});const requests:Request[]=[],errors=[p1aError("rate_limited"),p1aError("unexpected_error"),p1aError("idempotency_conflict")];
 await page.route("**/api/workspaces/*/leads/*/identity-review",async route=>{if(route.request().method()!=="POST")return route.continue();requests.push(route.request());const error=errors.shift();if(error)return route.fulfill({status:error.error.code==="rate_limited"?429:error.error.code==="unexpected_error"?500:409,contentType:"application/json",body:JSON.stringify(error)});const command=route.request().postDataJSON();return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{contractVersion:"lead-identity-review-decision-result.v1",outcome:"hold",disposition:"held_for_review",reviewId:held.reviewCaseId,leadId:held.leadId,contactId:null,companyId:null,leadVersion:1,reviewVersion:2,replayed:false,requestId:randomUUID(),nextView:{kind:"identity_review_detail",leadId:held.leadId,reviewId:held.reviewCaseId}}})})});
 await page.goto(`/crm/identity-reviews/${held.leadId}`);for(let attempt=0;attempt<4;attempt++){await page.getByRole("button",{name:"Hold for review"}).click();if(attempt<3)await expect(page.getByRole("status")).toBeFocused()}await expect(page.getByRole("heading",{name:/Review remains Pending/})).toBeVisible();const keys=requests.map(request=>request.headers()["idempotency-key"]);expect(keys[1]).toBe(keys[0]);expect(keys[2]).toBe(keys[1]);expect(keys[3]).not.toBe(keys[2]);
});

for(const authorityCode of ["authentication_required","resource_not_found"]as const)test(`GET refresh ${authorityCode} removes protected detail and focuses generic state`,async({page})=>{const fixture=await browserFixture(page),email=`refresh-authority-${randomUUID()}@example.test`;await database.query(`insert into contacts(workspace_id,display_name,person_name_normalized,email_display,email_normalized) values($1,'Refresh Authority','refresh authority',$2,$2)`,[fixture.workspaceId,email]);const held=await submitLeadInquiryV1(database,{actor:fixture.actor,idempotencyKey:randomUUID(),command:{contractVersion:"lead-inquiry-intake.v1",intakeChannel:"manual",person:{displayName:"Refresh Authority",email},inquiry:{receivedAt:"2026-08-25T12:00:00.000Z"},source:{sourceCategory:"manual",sourceMedium:"unknown",sourceDetail:{},campaignContext:{},attributionContractVersion:"p1a-attribution-v1"}}});await page.goto(`/crm/identity-reviews/${held.leadId}`);await page.route("**/api/workspaces/*/leads/*/identity-review",route=>route.request().method()==="POST"?route.fulfill({status:409,contentType:"application/json",body:JSON.stringify(p1aError("stale_version"))}):route.fulfill({status:authorityCode==="authentication_required"?401:404,contentType:"application/json",body:JSON.stringify(p1aError(authorityCode))}));await page.getByRole("radio",{name:/Refresh Authority/}).check();await page.getByRole("radio",{name:/Dismiss company candidates/}).check();await page.getByRole("button",{name:"Apply identity decision"}).click();const state=page.getByRole("alert").filter({hasText:"Review no longer available"});await expect(state).toBeFocused();await expect(page.getByText("Refresh Authority",{exact:true})).toHaveCount(0);await expect(page.getByRole("radio")).toHaveCount(0)});

test("initial unavailable review discloses no protected detail",async({page})=>{await browserFixture(page);await page.goto("/crm/identity-reviews/30000000-0000-4000-8000-000000000099");await expect(page.getByText(/This page could not be found|not found/i)).toBeVisible();await expect(page.getByText(/candidate|matches exactly after normalization/i)).toHaveCount(0)});

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

test("populated queue preserves cursor filters, forward/back recovery, and focused retained-state errors", async ({page})=>{
 const fixture=await browserFixture(page),reviewA="40000000-0000-4000-8000-000000000001",leadA="40000000-0000-4000-8000-000000000002",reviewB="40000000-0000-4000-8000-000000000003",leadB="40000000-0000-4000-8000-000000000004",requestId="40000000-0000-4000-8000-000000000005";
 const item=(name:string,reviewId:string,leadId:string)=>({reviewId,leadId,lead:{displayName:name,companyName:null,receivedAt:"2026-08-25T12:00:00.000Z"},originalAttribution:{sourceCategory:"manual",sourcePlatform:null,sourceMedium:"unknown",intakeChannel:"manual"},assignment:{responsibleMembershipId:null,responsibleTeamId:null,visibility:"workspace"},versions:{lead:1,review:1,intake:1},candidateSummary:{strong:0,supplementary:0,probable:0},capabilities:{canCreateContact:true,canCreateCompany:false,canLinkContact:false,canLinkCompany:false,canDismiss:true,canHold:true,canResolve:true},reconciliation:{status:"current",retryable:false,action:"none"},updatedAt:"2026-08-25T12:00:00.000Z",nextView:{kind:"identity_review_detail",leadId,reviewId}});
 let fail=false;await page.goto("/crm/identity-reviews");await page.route("**/api/workspaces/*/identity-reviews?*",async route=>{if(fail)return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify(p1aError("intake_unavailable"))});const cursor=new URL(route.request().url()).searchParams.get("cursor");return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{contractVersion:"lead-identity-review-queue.v1",requestId,items:[cursor?item("Beta Lead",reviewB,leadB):item("Alpha Lead",reviewA,leadA)],nextCursor:cursor?null:"cursor_one"}})})});
 await page.getByRole("button",{name:"Apply filters"}).click();await expect(page.getByText("Alpha Lead")).toBeVisible();await page.getByRole("button",{name:"Next page"}).click();await expect(page.getByText("Beta Lead")).toBeVisible();await expect(page.getByRole("status")).toContainText("Page 2");await page.getByRole("button",{name:"Previous page"}).click();await expect(page.getByText("Alpha Lead")).toBeVisible();await expect(page.getByText("Beta Lead")).toHaveCount(0);fail=true;await page.getByRole("button",{name:"Apply filters"}).click();const error=page.getByRole("alert").filter({hasText:"remain on screen"});await expect(error).toBeFocused();await expect(error).toContainText("remain on screen");await expect(page.getByText("Alpha Lead")).toBeVisible();expect(fixture.workspaceId).toBeTruthy();
});

test("P1A surfaces retain focus and semantic boundaries under dark, forced colours, and reduced motion", async ({ page }, testInfo) => {
  await browserFixture(page);
  await page.emulateMedia({ colorScheme: "dark", forcedColors: "active", reducedMotion: "reduce" });
  await page.goto("/crm/leads/new");
  const create = page.getByRole("button", { name: "Create lead" });
  await create.focus();
  await expect(create).toBeFocused();
  await expect(page.locator(".ds-readonly").getByText("Manual", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).not.toBe("smooth");
  await page.screenshot({ path: testInfo.outputPath("manual-intake-dark-forced-reduced.png"), fullPage: true });
});
