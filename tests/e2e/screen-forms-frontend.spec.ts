import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "playwright/test";
import { Pool } from "pg";
import { keyedHash } from "../../src/server/security/crypto";

const database = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow",
});
const sessionSecret = "local-only-session-secret-change-me-32chars";

async function fixture(page: Page) {
  const suffix = randomUUID();
  const user = (
    await database.query<{ id: string }>(
      `insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at) values($1,$1,'Forms Owner','active',now()) returning id`,
      [`forms-${suffix}@example.test`],
    )
  ).rows[0];
  const workspace = (
    await database.query<{ id: string }>(
      `insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id) values('Forms Workspace',$1,'active','growth','monthly',$2) returning id`,
      [`forms-${suffix}`, user.id],
    )
  ).rows[0];
  const role = (
    await database.query<{ id: string }>(
      `insert into roles(workspace_id,code,permissions,is_system) values($1,'owner','{}',true) returning id`,
      [workspace.id],
    )
  ).rows[0];
  await database.query(
    `insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active')`,
    [workspace.id, user.id, role.id],
  );
  const token = `forms-${suffix}`;
  await database.query(
    `insert into sessions(user_id,session_hash,active_workspace_id,idle_expires_at,absolute_expires_at,authenticated_at,auth_method) values($1,$2,$3,now()+interval '1 hour',now()+interval '1 day',now(),'password')`,
    [user.id, keyedHash(token, sessionSecret), workspace.id],
  );
  await page.context().addCookies([
    {
      name: "nexaflow_session",
      value: token,
      url: test.info().project.use.baseURL as string,
    },
  ]);
  return workspace.id;
}

function navigation(workspaceId: string) {
  return {
    contractVersion: "workspace-navigation-capabilities.v1",
    workspaceId,
    requestId: randomUUID(),
    capabilities: {
      home: { canView: true },
      companies: { canView: true, canCreate: true },
      contacts: { canView: true, canCreate: true },
      leads: { canView: true, canCreate: true },
      identityReview: { canView: false },
      deals: { canView: false, canCreate: false },
      pipeline: { canView: false },
      settings: {
        canViewPersonal: false,
        canViewWorkspace: false,
        canManagePeople: false,
        canManageInvitations: false,
        canManageTeams: false,
      },
    },
  };
}

async function mockAuthority(page: Page, workspaceId: string, allowed = true) {
  await page.route("**/api/workspaces/*/navigation-capabilities", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: navigation(workspaceId) }),
    }),
  );
  await page.route("**/api/workspaces/*/screen-form-bootstrap?*", (route) =>
    route.fulfill({
      status: allowed ? 200 : 403,
      contentType: "application/json",
      body: JSON.stringify(
        allowed
          ? {
              data: {
                contractVersion: "screen-form-bootstrap.v1",
                kind: new URL(route.request().url()).searchParams.get("kind"),
                capabilities: {
                  canCreate: true,
                  canCreateCompany:
                    new URL(route.request().url()).searchParams.get("kind") ===
                    "lead",
                  canManageAssignment: true,
                  canWriteSensitiveProfile: true,
                },
                requestId: randomUUID(),
              },
            }
          : {
              error: {
                code: "permission_required",
                message: "Form unavailable.",
                retryable: false,
                reconciliation: {
                  required: true,
                  action: "clear_protected_state",
                },
                zeroPartialEffects: true,
              },
              requestId: randomUUID(),
            },
      ),
    }),
  );
  await page.route("**/api/workspaces/*/screen-form-options?*", (route) => {
    const url = new URL(route.request().url()),
      kind = url.searchParams.get("kind"),
      optionKind = url.searchParams.get("optionKind");
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          contractVersion: "screen-form-options.v1",
          kind,
          optionKind,
          items: [],
          nextCursor: null,
          requestId: randomUUID(),
        },
      }),
    });
  });
}

test.afterAll(async () => database.end());

for (const entry of [
  {
    path: "/crm/companies/new",
    heading: "Add Company",
    required: ["Company name"],
  },
  {
    path: "/crm/contacts/new",
    heading: "Add Contact",
    required: ["First name", "Last name", "Primary email"],
  },
  {
    path: "/crm/leads/new",
    heading: "Add Lead",
    required: ["First name", "Last name", "Company", "Primary email", "Status"],
  },
])
  test(`${entry.heading} is capability-gated, accessible, and contained at 320px`, async ({
    page,
  }) => {
    const workspaceId = await fixture(page);
    await mockAuthority(page, workspaceId);
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(entry.path);
    await expect(
      page.getByRole("heading", { level: 1, name: entry.heading }),
    ).toBeVisible();
    for (const label of entry.required) {
      const name = new RegExp(`^${label} required$`);
      await expect(
        ["Company", "Status"].includes(label)
          ? page.getByRole("combobox", { name })
          : page.getByLabel(name),
      ).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Cancel" })).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: new RegExp(`Save ${entry.heading.split(" ")[1]}`),
      }),
    ).toBeVisible();
    expect(
      await page
        .locator("body")
        .evaluate((node) => node.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

test("direct new authority denial never mounts protected fields", async ({
  page,
}) => {
  const workspaceId = await fixture(page);
  await mockAuthority(page, workspaceId, false);
  await page.goto("/crm/contacts/new");
  await expect(
    page.getByRole("alert").filter({ hasText: "form unavailable" }),
  ).toContainText("Current authority no longer permits this form");
  await expect(page.getByLabel(/Primary email/)).toHaveCount(0);
});

test("filled submission authority loss clears protected form state and focuses the safe alert", async ({
  page,
}) => {
  const workspaceId = await fixture(page);
  await mockAuthority(page, workspaceId);
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: "csrf-test-token" }),
    }),
  );
  let submittedBody = "";
  await page.route("**/api/workspaces/*/companies", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    submittedBody = route.request().postData() ?? "";
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "permission_required",
          message: "Authority changed.",
          retryable: false,
          reconciliation: { required: true, action: "clear_protected_state" },
          zeroPartialEffects: true,
        },
        requestId: randomUUID(),
      }),
    });
  });
  await page.goto("/crm/companies/new");
  await page
    .getByLabel(/^Company name required$/)
    .fill("Protected Example Company");
  await page.getByLabel(/^Phone optional$/).fill("+14165550100");
  await page.getByRole("button", { name: "Save Company" }).click();
  await expect.poll(() => submittedBody).toContain("Protected Example Company");
  const safe = page
    .getByRole("alert")
    .filter({ hasText: "Company form unavailable" });
  await expect(safe).toBeFocused();
  expect(
    await page
      .locator("input,textarea,select")
      .evaluateAll((nodes) =>
        nodes.some((node) =>
          ["Protected Example Company", "+14165550100"].includes(
            (node as HTMLInputElement).value,
          ),
        ),
      ),
  ).toBe(false);
  await expect(page.getByRole("button", { name: "Save Company" })).toHaveCount(
    0,
  );
});

test("field summary links focus real invalid controls and generic failures are not links", async ({
  page,
}) => {
  const workspaceId = await fixture(page);
  await mockAuthority(page, workspaceId);
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: "csrf-test-token" }),
    }),
  );
  await page.goto("/crm/companies/new");
  await page.getByRole("button", { name: "Save Company" }).click();
  const summary = page.locator(".error-summary");
  await expect(summary).toBeFocused();
  const links = summary.getByRole("link"),
    count = await links.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const link = links.nth(index),
      href = await link.getAttribute("href");
    expect(href).toMatch(/^#[A-Za-z]/);
    await link.click();
    await expect(page.locator(href!)).toBeFocused();
  }
  await page.goto("/crm/companies/new");
  await page
    .getByLabel(/^Company name required$/)
    .fill("Generic Failure Company");
  await page.route("**/api/workspaces/*/companies", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
  );
  await page.getByRole("button", { name: "Save Company" }).click();
  await expect(summary).toContainText("Try again safely.");
  await expect(
    summary.getByRole("link", { name: "Try again safely." }),
  ).toHaveCount(0);
  await expect(page.locator('a[href="#_form"]')).toHaveCount(0);
});

test("assignment visibility errors focus the labelled visibility group", async ({
  page,
}) => {
  const workspaceId = await fixture(page);
  await mockAuthority(page, workspaceId);
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: "csrf-test-token" }),
    }),
  );
  await page.route("**/api/workspaces/*/companies", (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "validation_failed",
          message: "Choose an authorized visibility.",
          retryable: false,
          reconciliation: { required: false, action: "none" },
          fields: ["assignment.visibility"],
          zeroPartialEffects: true,
        },
        requestId: randomUUID(),
      }),
    }),
  );
  await page.goto("/crm/companies/new");
  await page
    .getByLabel(/^Company name required$/)
    .fill("Visibility Failure Company");
  await page.getByRole("button", { name: "Save Company" }).click();
  await page
    .locator(".error-summary")
    .getByRole("link", { name: "Choose an authorized visibility." })
    .click();
  await expect(page.locator("#visibility")).toBeFocused();
});

test("in-place option authority loss clears the mounted draft and option state", async ({
  page,
}) => {
  const workspaceId = await fixture(page);
  await mockAuthority(page, workspaceId);
  let denyOptions = false;
  await page.route("**/api/workspaces/*/screen-form-options?*", (route) => {
    const url = new URL(route.request().url()),
      kind = url.searchParams.get("kind"),
      optionKind = url.searchParams.get("optionKind");
    return route.fulfill({
      status: denyOptions ? 403 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        denyOptions
          ? {
              error: {
                code: "permission_required",
                message: "Options no longer authorized.",
                retryable: false,
                reconciliation: {
                  required: true,
                  action: "clear_protected_state",
                },
                zeroPartialEffects: true,
              },
              requestId: randomUUID(),
            }
          : {
              data: {
                contractVersion: "screen-form-options.v1",
                kind,
                optionKind,
                items: [],
                nextCursor: null,
                requestId: randomUUID(),
              },
            },
      ),
    });
  });
  await page.goto("/crm/companies/new");
  await page
    .getByLabel(/^Company name required$/)
    .fill("Option Protected Company");
  denyOptions = true;
  const optionField = page
    .locator(".screen-option-field")
    .filter({ has: page.getByLabel(/^Search parent company$/) });
  await optionField
    .getByRole("button", { name: "Search", exact: true })
    .click();
  const safe = page
    .getByRole("alert")
    .filter({ hasText: "Company form unavailable" });
  await expect(safe).toBeFocused();
  await expect(page.getByText("Option Protected Company")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save Company" })).toHaveCount(
    0,
  );
});

test("delayed visible-Team option authority loss clears a draft mounted in place", async ({
  page,
}) => {
  const workspaceId = await fixture(page);
  await mockAuthority(page, workspaceId);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/api/workspaces/*/screen-form-options?*",
    async (route) => {
      const url = new URL(route.request().url()),
        kind = url.searchParams.get("kind"),
        optionKind = url.searchParams.get("optionKind");
      if (optionKind === "assignment_team") {
        await gate;
        return route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "permission_required",
              message: "Team options no longer authorized.",
              retryable: false,
              reconciliation: {
                required: true,
                action: "clear_protected_state",
              },
              zeroPartialEffects: true,
            },
            requestId: randomUUID(),
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            contractVersion: "screen-form-options.v1",
            kind,
            optionKind,
            items: [],
            nextCursor: null,
            requestId: randomUUID(),
          },
        }),
      });
    },
  );
  await page.goto("/crm/companies/new");
  await page
    .getByLabel(/^Company name required$/)
    .fill("Delayed Team Protected Company");
  release();
  const safe = page
    .getByRole("alert")
    .filter({ hasText: "Company form unavailable" });
  await expect(safe).toBeFocused();
  await expect(page.getByText("Delayed Team Protected Company")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Visible Teams" })).toHaveCount(
    0,
  );
});

test("Contact Notes authority loss remains terminal after the Contact commits", async ({
  page,
}) => {
  const workspaceId = await fixture(page),
    contactId = randomUUID();
  await mockAuthority(page, workspaceId);
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: "csrf-test-token" }),
    }),
  );
  await page.route("**/api/workspaces/*/contacts", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          contractVersion: "screen-profile-result.v1",
          kind: "contact",
          recordId: contactId,
          version: 1,
          replayed: false,
          requestId: randomUUID(),
        },
      }),
    }),
  );
  await page.route("**/api/workspaces/*/contacts/*/notes", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "permission_required",
          message: "Notes authority changed.",
          retryable: false,
          reconciliation: { required: true, action: "clear_protected_state" },
          zeroPartialEffects: true,
        },
        requestId: randomUUID(),
      }),
    }),
  );
  await page.goto("/crm/contacts/new");
  await page.getByLabel(/^First name required$/).fill("Protected");
  await page.getByLabel(/^Last name required$/).fill("Contact");
  await page
    .getByLabel(/^Primary email required$/)
    .fill("protected.contact@example.test");
  await page
    .getByLabel(/Add internal note/)
    .fill("Sensitive internal note body");
  await page.getByRole("button", { name: "Save Contact" }).click();
  const safe = page
    .getByRole("alert")
    .filter({ hasText: "Contact form unavailable" });
  await expect(safe).toBeFocused();
  await expect(page.getByText("Sensitive internal note body")).toHaveCount(0);
  await expect(
    page.getByText(/Contact saved; internal note was not saved/),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View Contact" })).toHaveCount(0);
  await expect(page.locator(`a[href*="${contactId}"]`)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save Contact" })).toHaveCount(
    0,
  );
});

test("fresh Workspace quick-creates an exact Company selection and then saves the still-mounted Lead", async ({
  page,
}) => {
  const workspaceId = await fixture(page),
    companyId = randomUUID(),
    leadId = randomUUID(),
    stageId = randomUUID(),
    stageUpdatedAt = new Date().toISOString();
  await mockAuthority(page, workspaceId);
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: "csrf-test-token" }),
    }),
  );
  await page.route("**/api/workspaces/*/screen-form-options?*", (route) => {
    const url = new URL(route.request().url()),
      kind = url.searchParams.get("kind"),
      optionKind = url.searchParams.get("optionKind");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          contractVersion: "screen-form-options.v1",
          kind,
          optionKind,
          items:
            optionKind === "lead_stage"
              ? [
                  {
                    id: stageId,
                    label: "Not contacted",
                    target: { kind: "updated_at", updatedAt: stageUpdatedAt },
                  },
                ]
              : [],
          nextCursor: null,
          requestId: randomUUID(),
        },
      }),
    });
  });
  let leadBody = "",
    leadAttempts = 0;
  await page.route("**/api/workspaces/*/companies", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          contractVersion: "screen-profile-result.v1",
          kind: "company",
          recordId: companyId,
          version: 1,
          replayed: false,
          selection: {
            id: companyId,
            label: "Northwind Demo",
            target: { kind: "version", version: 1 },
          },
          requestId: randomUUID(),
        },
      }),
    }),
  );
  await page.route("**/api/workspaces/*/leads", async (route) => {
    leadAttempts += 1;
    leadBody = route.request().postData() ?? "";
    if (leadAttempts === 1)
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: "{}",
      });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          contractVersion: "screen-profile-result.v1",
          kind: "lead",
          recordId: leadId,
          version: 1,
          replayed: false,
          identityReview: {
            companyDimension: "resolved",
            contactDimension: "resolved",
          },
          requestId: randomUUID(),
        },
      }),
    });
  });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/crm/leads/new");
  await page.getByRole("button", { name: "Open CRM navigation" }).click();
  await expect(page.getByRole("link", { name: "Companies" })).toBeVisible();
  await page.getByRole("button", { name: "Close CRM navigation" }).last().click();
  await page.getByLabel(/^First name required$/).fill("Ada");
  await page.getByLabel(/^Last name required$/).fill("Lovelace");
  await page.getByLabel(/^Primary email required$/).fill("ada@example.test");
  await expect(page.getByRole("heading", { name: "Create a Company first" })).toBeVisible();
  await page.screenshot({
    path: "artifacts/onboarding-lead-01-empty-320.png",
    fullPage: true,
  });
  const trigger = page.getByRole("button", { name: "Quick create company" });
  await trigger.click();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByLabel(/^Company name required$/).fill("Northwind Demo");
  await page.getByRole("button", { name: "Create company", exact: true }).click();
  await expect(
    page.getByText(
      "Company created and selected. Your Lead has not been saved yet.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByLabel(/Company required/)).toHaveValue(
    new RegExp(companyId),
  );
  await expect(page.getByLabel(/^First name required$/)).toHaveValue("Ada");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "artifacts/onboarding-lead-01-selected-dark.png",
    fullPage: true,
  });
  await page.getByLabel(/Company required/).focus();
  await page.getByLabel(/Company required/).evaluate((node) =>
    node.scrollIntoView({ block: "start" }),
  );
  await page.screenshot({
    path: "artifacts/onboarding-lead-01-scrolled-focus-dark.png",
  });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "artifacts/onboarding-lead-01-selected-light.png",
    fullPage: true,
  });
  await page.locator("#stageId").selectOption({ label: "Not contacted" });
  await page.locator("#source").selectOption("social_media");
  await expect(page.locator("#sourcePlatform")).toBeVisible();
  await page.getByRole("button", { name: "Save Lead" }).click();
  const platformError = page.getByRole("link", {
    name: "Select the social platform.",
  });
  await expect(platformError).toBeVisible();
  await platformError.click();
  await expect(page.locator("#sourcePlatform")).toBeFocused();
  await expect(page.getByLabel(/Company required/)).toHaveValue(new RegExp(companyId));
  await expect(page.getByLabel(/^First name required$/)).toHaveValue("Ada");
  expect(leadAttempts).toBe(0);
  await page.locator("#sourcePlatform").selectOption("linkedin");
  await page.locator("#source").selectOption("manual");
  await expect(page.locator("#sourcePlatform")).toHaveCount(0);
  await page.locator("#source").selectOption("social_media");
  await expect(page.locator("#sourcePlatform")).toHaveValue("");
  await page.locator("#sourcePlatform").selectOption("linkedin");
  await page.getByRole("button", { name: "Save Lead" }).click();
  await expect.poll(() => leadBody).toContain(companyId);
  expect(JSON.parse(leadBody).profile).toMatchObject({
    source: "social_media",
    sourcePlatform: "linkedin",
  });
  await expect(page.getByText(/The Company was created; the Lead was not saved/)).toBeVisible();
  await expect(page.getByLabel(/Company required/)).toHaveValue(new RegExp(companyId));
  await page.getByRole("button", { name: "Save Lead" }).click();
  await expect(page.getByRole("heading", { name: "Lead saved" })).toBeVisible();
  expect(
    await page.locator("body").evaluate((node) => node.scrollWidth <= innerWidth),
  ).toBe(true);
});
