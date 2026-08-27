import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "playwright/test";
import { Pool } from "pg";
import { keyedHash } from "../../src/server/security/crypto";

const database = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });
const sessionSecret = "local-only-session-secret-change-me-32chars";

async function fixture(page: Page) {
  const suffix = randomUUID(), user = (await database.query<{ id: string }>(`insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at) values($1,$1,'Directory Owner','active',now()) returning id`, [`directory-${suffix}@example.test`])).rows[0],
    workspace = (await database.query<{ id: string }>(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id) values('Directory Workspace',$1,'active','growth','monthly',$2) returning id`, [`directory-${suffix}`, user.id])).rows[0],
    role = (await database.query<{ id: string }>(`insert into roles(workspace_id,code,permissions,is_system) values($1,'owner','{}',true) returning id`, [workspace.id])).rows[0];
  await database.query(`insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active')`, [workspace.id, user.id, role.id]);
  const token = `directory-${suffix}`;
  await database.query(`insert into sessions(user_id,session_hash,active_workspace_id,idle_expires_at,absolute_expires_at,authenticated_at,auth_method) values($1,$2,$3,now()+interval '1 hour',now()+interval '1 day',now(),'password')`, [user.id, keyedHash(token, sessionSecret), workspace.id]);
  await page.context().addCookies([{ name: "nexaflow_session", value: token, url: test.info().project.use.baseURL as string }]);
  return workspace.id;
}

const row = (name: string, status: "active" | "archived", capabilities: { canArchive: boolean; canRestore: boolean }) => ({ id: randomUUID(), displayName: name, status, version: 1, updatedAt: "2026-08-27T01:00:00.000Z", capabilities: { canEdit: true, ...capabilities }, reconciliation: { required: false, action: "none" } });

async function mock(page: Page, workspaceId: string) {
  const active = row("Northwind Holdings", "active", { canArchive: true, canRestore: false }), archived = row("Retained Industries", "archived", { canArchive: false, canRestore: true });
  await page.route("**/api/workspaces/*/navigation-capabilities", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { contractVersion: "workspace-navigation-capabilities.v1", workspaceId, capabilities: { home: { canView: true }, companies: { canView: true, canCreate: true }, contacts: { canView: true, canCreate: true }, leads: { canView: false, canCreate: false }, identityReview: { canView: false }, deals: { canView: false, canCreate: false }, pipeline: { canView: false }, settings: { canViewPersonal: false, canViewWorkspace: false, canManagePeople: false, canManageInvitations: false, canManageTeams: false } }, requestId: randomUUID() } }) }));
  await page.route("**/api/workspaces/*/companies?*", route => {
    const status = new URL(route.request().url()).searchParams.get("status") as "active" | "archived";
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { contractVersion: "customer-graph-list.v1", kind: "company", capabilities: { canCreate: true }, items: [status === "archived" ? archived : active], nextCursor: null, requestId: randomUUID() } }) });
  });
  await page.route("**/api/workspaces/*/contacts?*", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { contractVersion: "customer-graph-list.v1", kind: "contact", capabilities: { canCreate: true }, items: [row("Visible Contact", "active", { canArchive: false, canRestore: false })], nextCursor: null, requestId: randomUUID() } }) }));
}

test.afterAll(async () => database.end());

test("Companies and Contacts use disclosure-safe responsive directories", async ({ page }) => {
  const workspaceId = await fixture(page); await mock(page, workspaceId);
  await page.goto("/crm/companies");
  await expect(page.getByRole("heading", { name: "Companies", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add company" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Northwind Holdings" })).toBeVisible();
  const archive = page.getByRole("button", { name: "Archive Northwind Holdings" });
  await archive.focus(); await archive.click();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(archive).toBeFocused();
  await archive.click(); await page.getByRole("button", { name: "Cancel" }).click(); await expect(archive).toBeFocused();
  await page.getByRole("checkbox", { name: "Include archived" }).check();
  await expect(page.getByRole("link", { name: "Retained Industries" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search loaded companies" }).fill("missing");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("heading", { name: /No loaded companies match/ })).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).last().click();
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 320);
  await page.goto("/crm/contacts");
  await expect(page.getByText("Visible Contact")).toBeVisible();
  await expect(page.getByText(/email|phone|company unavailable/i)).toHaveCount(0);
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 320);
});

for (const scenario of [
  { kind: "company", path: "/crm/companies", plural: "companies", recoveredName: "Recovered Company" },
  { kind: "contact", path: "/crm/contacts", plural: "contacts", recoveredName: null },
] as const) test(`${scenario.kind} archived failure precedes truthful combined empty`, async ({ page }) => {
  const workspaceId = await fixture(page);
  await page.route("**/api/workspaces/*/navigation-capabilities", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { contractVersion: "workspace-navigation-capabilities.v1", workspaceId, capabilities: { home: { canView: true }, companies: { canView: true, canCreate: true }, contacts: { canView: true, canCreate: true }, leads: { canView: false, canCreate: false }, identityReview: { canView: false }, deals: { canView: false, canCreate: false }, pipeline: { canView: false }, settings: { canViewPersonal: false, canViewWorkspace: false, canManagePeople: false, canManageInvitations: false, canManageTeams: false } }, requestId: randomUUID() } }) }));
  let archivedAttempts = 0;
  await page.route(`**/api/workspaces/*/${scenario.plural}?*`, route => {
    const status = new URL(route.request().url()).searchParams.get("status");
    if (status === "archived" && archivedAttempts++ === 0) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "customer_graph_unavailable", message: "Archived records are temporarily unavailable.", retryable: true, reconciliation: { required: true, action: "retry_same_request" } }, requestId: randomUUID() }) });
    const items = status === "archived" && scenario.recoveredName ? [row(scenario.recoveredName, "archived", { canArchive: false, canRestore: true })] : [];
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { contractVersion: "customer-graph-list.v1", kind: scenario.kind, capabilities: { canCreate: true }, items, nextCursor: null, requestId: randomUUID() } }) });
  });
  await page.goto(scenario.path);
  await page.getByRole("checkbox", { name: "Include archived" }).check();
  const warning = page.getByRole("heading", { name: `Archived ${scenario.plural} could not be loaded` });
  await expect(warning).toBeVisible(); await expect(page.getByRole("button", { name: `Retry archived ${scenario.plural}` })).toBeFocused();
  await expect(page.getByText(`No active or archived ${scenario.plural} are currently visible.`)).toHaveCount(0);
  await page.getByRole("button", { name: `Retry archived ${scenario.plural}` }).click();
  if (scenario.recoveredName) await expect(page.getByRole("link", { name: scenario.recoveredName })).toBeVisible();
  else await expect(page.getByText(`No active or archived ${scenario.plural} are currently visible.`)).toBeVisible();
});
