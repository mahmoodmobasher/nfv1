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

function leadProfileDetail({
  leadId,
  companyId,
  stageId,
  stageUpdatedAt,
}: {
  leadId: string;
  companyId: string;
  stageId: string;
  stageUpdatedAt: string;
}) {
  return {
    contractVersion: "screen-profile-detail.v1",
    kind: "lead",
    recordId: leadId,
    version: 1,
    capabilities: { canEdit: true, canManageAssignment: true, canWriteSensitiveProfile: true },
    base: {
      salutation: null,
      firstName: "Ada",
      lastName: "Lovelace",
      jobTitle: null,
      source: "manual",
      sourcePlatform: null,
      stageId,
      stageUpdatedAt,
      rating: null,
      industry: null,
      employeeCount: null,
    },
    identityReview: { companyDimension: "resolved", contactDimension: "resolved" },
    categories: {
      channels: { disclosure: "full", value: { primaryEmail: "ada@example.test", secondaryEmail: null, officePhone: null, mobilePhone: null, fax: null, website: null, twitterHandle: null } },
      address: { disclosure: "full", value: { street: null, city: null, stateProvince: null, postalCode: null, country: null } },
      revenue: { disclosure: "full", value: null },
      consent: { disclosure: "full", value: null },
      hierarchy: { disclosure: "full", value: { company: { id: companyId, label: "Analytical Engines", version: 1 } } },
    },
    assignment: { disclosure: "full", value: { responsibleMembershipId: null, responsibleMembershipVersion: null, responsibleTeamId: null, responsibleTeamVersion: null, visibility: "workspace", visibleTeams: [] } },
    requestId: randomUUID(),
  };
}

function contactProfileDetail(contactId: string) {
  return {
    contractVersion: "screen-profile-detail.v1",
    kind: "contact",
    recordId: contactId,
    version: 2,
    capabilities: { canEdit: true, canManageAssignment: true, canWriteSensitiveProfile: true },
    base: { salutation: null, firstName: "Legacy", lastName: "Contact", jobTitle: null, department: null, lifecycleStage: null },
    categories: {
      channels: { disclosure: "full", value: { primaryEmail: "legacy@example.test", secondaryEmail: null, directPhone: null, mobilePhone: null, linkedinUrl: null } },
      address: { disclosure: "full", value: { street: null, city: null, stateProvince: null, postalCode: null, country: null } },
      notes: { disclosure: "full", value: { listRoute: `/api/workspaces/10000000-0000-4000-8000-000000000001/contacts/${contactId}/notes` } },
      hierarchy: { disclosure: "full", value: { company: null } },
    },
    assignment: { disclosure: "full", value: { responsibleMembershipId: null, responsibleMembershipVersion: null, responsibleTeamId: null, responsibleTeamVersion: null, visibility: "workspace", visibleTeams: [] } },
    requestId: randomUUID(),
  };
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

test("Company and Contact choice labels provide shared 44px targets at desktop and 320px", async ({ page }) => {
  const workspaceId = await fixture(page);
  await mockAuthority(page, workspaceId);
  for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 720 }]) {
    await page.setViewportSize(viewport);
    for (const path of ["/crm/companies/new", "/crm/contacts/new"]) {
      await page.goto(path);
      const label = page.locator('label.check:has(input[name="visibility"][value="workspace"])');
      const input = label.locator('input[type="radio"]');
      await expect(label).toBeVisible();
      await expect(input).toBeVisible();
      const labelBox = await label.boundingBox();
      const inputBox = await input.boundingBox();
      expect(labelBox, `${path} ${viewport.width}px label box`).not.toBeNull();
      expect(inputBox, `${path} ${viewport.width}px input box`).not.toBeNull();
      expect(labelBox!.height).toBeGreaterThanOrEqual(44);
      expect(labelBox!.width).toBeGreaterThanOrEqual(44);
      expect(inputBox!.height).toBeGreaterThanOrEqual(16);
      expect(inputBox!.height).toBeLessThan(44);
      expect(inputBox!.width).toBeGreaterThanOrEqual(16);
      expect(inputBox!.width).toBeLessThan(44);
      await label.click();
      await expect(input).toBeChecked();
      expect(await page.locator("body").evaluate((node) => node.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
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

test("Add Contact blocks duplicate channels and missing lifecycle with keyboard-linked recovery", async ({ page }) => {
  const workspaceId = await fixture(page);
  await mockAuthority(page, workspaceId);
  let posts = 0;
  await page.route("**/api/workspaces/*/contacts", (route) => {
    posts += 1;
    return route.abort();
  });
  await page.goto("/crm/contacts/new");
  await page.getByLabel(/^First name required$/).fill("Create");
  await page.getByLabel(/^Last name required$/).fill("Contact");
  await page.getByLabel(/^Primary email required$/).fill("CREATE@example.test");
  await page.getByLabel(/^Secondary email/).fill(" create@example.test ");
  await page.getByLabel(/^Direct phone/).fill("+14165550123");
  await page.getByLabel(/^Mobile/).fill(" +14165550123 ");
  await page.getByRole("button", { name: "Save Contact" }).click();

  const summary = page.getByRole("alert").filter({ hasText: "Please correct the following" });
  await expect(summary).toBeFocused();
  await expect(summary.locator('a[href="#primaryEmail"]')).toBeVisible();
  await expect(summary.locator('a[href="#secondaryEmail"]')).toBeVisible();
  await expect(summary.locator('a[href="#directPhone"]')).toBeVisible();
  await expect(summary.locator('a[href="#mobilePhone"]')).toBeVisible();
  const lifecycleLink = summary.locator('a[href="#lifecycleStage"]');
  await lifecycleLink.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#lifecycleStage")).toBeFocused();
  expect(posts).toBe(0);
});

test("Contact duplicate channels and legacy-null lifecycle retain the draft with linked focus and safe references", async ({ page }) => {
  const workspaceId = await fixture(page), contactId = randomUUID(), safeRequestId = randomUUID();
  await mockAuthority(page, workspaceId);
  await page.route("**/api/auth/csrf", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ token: "csrf-test-token" }),
  }));
  let patchAttempts = 0, patchBody: Record<string, unknown> | null = null;
  await page.route(`**/api/workspaces/*/contacts/${contactId}/profile`, (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: contactProfileDetail(contactId) }) });
    patchAttempts += 1;
    patchBody = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "unexpected_error", message: "The request could not be completed.", retryable: true,
          reconciliation: { required: true, action: "retry_same_request" }, zeroPartialEffects: true },
        requestId: safeRequestId,
      }),
    });
  });

  await page.goto(`/crm/contacts/${contactId}/edit`);
  const lifecycle = page.locator("#lifecycleStage");
  await expect(lifecycle).toHaveAttribute("aria-required", "true");
  await expect(lifecycle).toHaveValue("");
  await page.getByLabel(/^Secondary email/).fill(" LEGACY@EXAMPLE.TEST ");
  await page.getByLabel(/^Direct phone/).fill("+14165550123");
  await page.getByLabel(/^Mobile/).fill(" +14165550123 ");
  await page.getByRole("button", { name: "Save Contact" }).click();

  const summary = page.getByRole("alert").filter({ hasText: "Please correct the following" });
  await expect(summary).toBeFocused();
  await expect(summary.getByRole("link", { name: "Choose a lifecycle stage." })).toBeVisible();
  await expect(summary.getByRole("link", { name: "Primary and secondary email must be different." })).toHaveCount(2);
  await expect(summary.getByRole("link", { name: "Direct and mobile phone must be different." })).toHaveCount(2);
  expect(patchAttempts).toBe(0);
  await summary.locator('a[href="#secondaryEmail"]').click();
  await expect(page.getByLabel(/^Secondary email/)).toBeFocused();
  await expect(page.getByLabel(/^Secondary email/)).toHaveValue("LEGACY@EXAMPLE.TEST");

  await page.getByLabel(/^Secondary email/).fill("other@example.test");
  await page.getByLabel(/^Mobile/).fill("+14165550124");
  await lifecycle.selectOption("customer");
  await page.getByRole("button", { name: "Save Contact" }).click();
  await expect(summary).toBeFocused();
  await expect(summary).toContainText("The request could not be completed.");
  await expect(page.getByText(`Reference: ${safeRequestId}`)).toBeVisible();
  await expect(page.getByLabel(/^First name required$/)).toHaveValue("Legacy");
  await expect(page.getByLabel(/^Secondary email/)).toHaveValue("other@example.test");
  await expect(page.getByLabel(/^Direct phone/)).toHaveValue("+14165550123");
  await expect(page.getByLabel(/^Mobile/)).toHaveValue("+14165550124");
  await expect(lifecycle).toHaveValue("customer");
  expect(patchAttempts).toBe(1);
  expect(patchBody).toMatchObject({
    contractVersion: "contact-screen-edit.v2",
    expectedVersion: 2,
    profile: { lifecycleStage: "customer" },
  });
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
  await page.locator("#lifecycleStage").selectOption("lead");
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

for (const selectedOutcome of ["unchanged", "changed"] as const)
  test(`selected stage retry ${selectedOutcome} blocks mutation until authority reconciliation`, async ({ page }) => {
    const workspaceId = await fixture(page),
      leadId = randomUUID(),
      companyId = randomUUID(),
      stageId = randomUUID(),
      submittedAt = "2026-08-26T12:00:00.000Z",
      currentAt = selectedOutcome === "changed" ? "2026-08-27T12:00:00.000Z" : submittedAt;
    await mockAuthority(page, workspaceId);
    await page.route(`**/api/workspaces/*/leads/${leadId}/profile`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: leadProfileDetail({ leadId, companyId, stageId, stageUpdatedAt: submittedAt }) }),
      }),
    );
    let stageChecks = 0,
      mutations = 0,
      submittedBody = "";
    await page.route("**/api/workspaces/*/screen-form-options/selected?*", (route) => {
      const url = new URL(route.request().url()),
        optionKind = url.searchParams.get("optionKind"),
        id = url.searchParams.get("id")!;
      if (optionKind === "lead_stage" && stageChecks++ === 0)
        return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
      const target = optionKind === "lead_stage"
        ? { kind: "updated_at", updatedAt: url.searchParams.get("target")! }
        : { kind: "version", version: Number(url.searchParams.get("target")) };
      const currentTarget = optionKind === "lead_stage"
        ? { kind: "updated_at", updatedAt: currentAt }
        : target;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: {
          contractVersion: "screen-form-selected-option.v1",
          kind: "lead",
          optionKind,
          selected: {
            submitted: { id, target },
            outcome: optionKind === "lead_stage" ? selectedOutcome : "unchanged",
            current: { id, label: optionKind === "lead_stage" ? "Not contacted" : "Analytical Engines", target: currentTarget },
          },
          requestId: randomUUID(),
        } }),
      });
    });
    await page.route("**/api/auth/csrf", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "csrf-test-token" }) }),
    );
    await page.route(`**/api/workspaces/*/leads/${leadId}/profile`, async (route) => {
      if (route.request().method() === "GET") return route.fallback();
      mutations += 1;
      submittedBody = route.request().postData() ?? "";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { contractVersion: "screen-profile-result.v1", kind: "lead", recordId: leadId, version: 2, replayed: false, identityReview: { companyDimension: "resolved", contactDimension: "resolved" }, requestId: randomUUID() } }),
      });
    });

    await page.goto(`/crm/leads/${leadId}/edit`);
    const retry = page.getByRole("button", { name: "Retry checking status" });
    await expect(retry).toBeFocused();
    await page.getByLabel(/Job title/).fill("Mathematician");
    const save = page.getByRole("button", { name: "Save changes" });
    await expect(save).toBeDisabled();
    await expect(retry).toBeVisible();
    expect(mutations).toBe(0);
    await retry.click();
    await expect(page.getByLabel(/Job title/)).toHaveValue("Mathematician");
    if (selectedOutcome === "changed") {
      await expect(save).toBeDisabled();
      await expect(page.getByRole("button", { name: "Use current status" })).toBeVisible();
      expect(mutations).toBe(0);
      await page.getByRole("button", { name: "Use current status" }).click();
    }
    await expect(save).toBeEnabled();
    await save.click();
    await expect.poll(() => mutations).toBe(1);
    expect(JSON.parse(submittedBody).profile.stageUpdatedAt).toBe(currentAt);
  });

test("submit reconciliation failure focuses targeted retry and preserves the draft until changed-token confirmation", async ({ page }) => {
  const workspaceId = await fixture(page),
    leadId = randomUUID(),
    companyId = randomUUID(),
    stageId = randomUUID(),
    submittedAt = "2026-08-26T12:00:00.000Z",
    currentAt = "2026-08-27T12:00:00.000Z";
  await mockAuthority(page, workspaceId);
  await page.route(`**/api/workspaces/*/leads/${leadId}/profile`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: leadProfileDetail({ leadId, companyId, stageId, stageUpdatedAt: submittedAt }) }),
    }),
  );
  let stageChecks = 0,
    mutations = 0;
  await page.route("**/api/workspaces/*/screen-form-options/selected?*", (route) => {
    const url = new URL(route.request().url()),
      optionKind = url.searchParams.get("optionKind"),
      id = url.searchParams.get("id")!,
      target = optionKind === "lead_stage"
        ? { kind: "updated_at", updatedAt: url.searchParams.get("target")! }
        : { kind: "version", version: Number(url.searchParams.get("target")) };
    if (optionKind === "lead_stage" && stageChecks++ === 1)
      return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    const changed = optionKind === "lead_stage" && stageChecks > 2;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: {
        contractVersion: "screen-form-selected-option.v1",
        kind: "lead",
        optionKind,
        selected: {
          submitted: { id, target },
          outcome: changed ? "changed" : "unchanged",
          current: {
            id,
            label: optionKind === "lead_stage" ? "Not contacted" : "Analytical Engines",
            target: changed ? { kind: "updated_at", updatedAt: currentAt } : target,
          },
        },
        requestId: randomUUID(),
      } }),
    });
  });
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "csrf-test-token" }) }),
  );
  await page.route(`**/api/workspaces/*/leads/${leadId}/profile`, async (route) => {
    if (route.request().method() === "GET") return route.fallback();
    mutations += 1;
    return route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "selection_unavailable",
          message: "Status changed.",
          retryable: false,
          reconciliation: { required: true, action: "refetch_bootstrap" },
          fields: ["profile.stageId"],
          selection: {
            field: "profile.stageId",
            optionKind: "lead_stage",
            submitted: { id: stageId, target: { kind: "updated_at", updatedAt: submittedAt } },
            outcome: "changed",
            currentTarget: { kind: "updated_at", updatedAt: currentAt },
          },
          zeroPartialEffects: true,
        },
        requestId: randomUUID(),
      }),
    });
  });

  await page.goto(`/crm/leads/${leadId}/edit`);
  const save = page.getByRole("button", { name: "Save changes" });
  await expect(save).toBeEnabled();
  await page.getByLabel(/Job title/).fill("Mathematician");
  await save.click();
  await expect.poll(() => mutations).toBe(1);
  const retry = page.getByRole("button", { name: "Retry checking status" });
  await expect(retry).toBeFocused();
  await expect(page.getByLabel(/Job title/)).toHaveValue("Mathematician");
  await expect(save).toBeDisabled();
  await retry.click();
  await expect(page.locator("#stageId-status")).toBeFocused();
  await expect(page.getByRole("button", { name: "Use current status" })).toBeVisible();
  await page.getByRole("button", { name: "Use current status" }).click();
  await expect(page.locator("#stageId")).toBeFocused();
  await expect(save).toBeEnabled();
  expect(mutations).toBe(1);
});
