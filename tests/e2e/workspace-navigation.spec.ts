import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "playwright/test";
import { Pool } from "pg";
import { keyedHash } from "../../src/server/security/crypto";

const database = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });
const sessionSecret = "local-only-session-secret-change-me-32chars";

async function fixture(page: Page) {
  const suffix = randomUUID();
  const user = (await database.query<{ id: string }>(`insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at) values($1,$1,'Navigation Owner','active',now()) returning id`, [`navigation-${suffix}@example.test`])).rows[0];
  const workspace = (await database.query<{ id: string }>(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id) values('Navigation Workspace',$1,'active','growth','monthly',$2) returning id`, [`navigation-${suffix}`, user.id])).rows[0];
  const role = (await database.query<{ id: string }>(`insert into roles(workspace_id,code,permissions,is_system) values($1,'owner','{}',true) returning id`, [workspace.id])).rows[0];
  await database.query(`insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active')`, [workspace.id, user.id, role.id]);
  await database.query(`insert into pipeline_stages(workspace_id,name,position,status) values($1,'New',0,'active')`, [workspace.id]);
  const token = `navigation-${suffix}`;
  await database.query(`insert into sessions(user_id,session_hash,active_workspace_id,idle_expires_at,absolute_expires_at,authenticated_at,auth_method) values($1,$2,$3,now()+interval '1 hour',now()+interval '1 day',now(),'password')`, [user.id, keyedHash(token, sessionSecret), workspace.id]);
  await page.context().addCookies([{ name: "nexaflow_session", value: token, url: test.info().project.use.baseURL as string }]);
  return workspace.id;
}

const capabilities = (workspaceId: string) => ({
  contractVersion: "workspace-navigation-capabilities.v1", workspaceId, requestId: randomUUID(),
  capabilities: {
    home: { canView: true }, companies: { canView: true, canCreate: true }, contacts: { canView: true, canCreate: true },
    leads: { canView: true, canCreate: true }, identityReview: { canView: true }, deals: { canView: true, canCreate: true },
    pipeline: { canView: true }, settings: { canViewPersonal: true, canViewWorkspace: true, canManagePeople: true, canManageInvitations: true, canManageTeams: true },
  },
});

test.afterAll(async () => database.end());

test("capability navigation owns routes, collapses groups, and clears protected shell state", async ({ page }) => {
  const workspaceId = await fixture(page);
  let denied = false;
  await page.route("**/api/workspaces/*/navigation-capabilities", (route) => route.fulfill({
    status: denied ? 404 : 200, contentType: "application/json",
    body: JSON.stringify(denied ? { error: { code: "resource_not_found", message: "Workspace unavailable.", retryable: false, reconciliation: { required: true, action: "clear_navigation_state" } }, requestId: randomUUID() } : { data: capabilities(workspaceId) }),
  }));
  await page.goto("/crm/deals/board");
  const rail = page.locator(".product-rail");
  await expect(rail.getByRole("link", { name: "Deal pipeline", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(rail.getByRole("link", { name: "Deals", exact: true })).not.toHaveAttribute("aria-current", "page");
  const sales = rail.getByRole("button", { name: "Sales" });
  await expect(sales).toHaveAttribute("aria-expanded", "true");
  await sales.click();
  await expect(sales).toHaveAttribute("aria-expanded", "false");
  await sales.press("Enter");
  await expect(sales).toHaveAttribute("aria-expanded", "true");
  expect(await page.locator("body").evaluate((node) => node.scrollWidth <= window.innerWidth)).toBe(true);
  denied = true;
  await page.reload();
  const cleared = page.getByRole("alert").filter({ hasText: "Workspace access is unavailable" });
  await expect(cleared).toBeVisible();
  await expect(page.getByText("Navigation Workspace", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "CRM navigation" })).toHaveCount(0);
});

test("320px drawer focuses Close, contains focus, and restores the trigger", async ({ page }) => {
  const workspaceId = await fixture(page);
  await page.route("**/api/workspaces/*/navigation-capabilities", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: capabilities(workspaceId) }) }));
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/crm");
  const trigger = page.getByRole("button", { name: "Open CRM navigation" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "CRM navigation" }), close = dialog.getByRole("button", { name: "Close CRM navigation" });
  await expect(close).toBeFocused();
  await expect(dialog.getByRole("link", { name: "Leads", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(dialog.locator('a[aria-current="page"]')).toHaveCount(1);
  await expect(page.locator(".product-rail")).toHaveAttribute("aria-hidden", "true");
  await dialog.getByRole("button", { name: "Sales" }).click();
  const visibleControls = dialog.locator('a[href]:visible,button:not([disabled]):visible,input:not([disabled]):visible,select:not([disabled]):visible,textarea:not([disabled]):visible');
  const last = visibleControls.last();
  await last.focus();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(last).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await close.click();
  await expect(trigger).toBeFocused();
  expect(await page.locator("body").evaluate((node) => node.scrollWidth <= window.innerWidth)).toBe(true);
});

test("missing protected success data fails closed", async ({ page }) => {
  await fixture(page);
  await page.route("**/api/workspaces/*/navigation-capabilities", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ contractVersion: "workspace-navigation-capabilities.v1" }) }));
  await page.goto("/crm");
  await expect(page.getByRole("alert").filter({ hasText: "Workspace access is unavailable" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "CRM navigation" })).toHaveCount(0);
});
