import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Pool } from "pg";
import { expect, test, type Page } from "playwright/test";
import { keyedHash } from "../../src/server/security/crypto";

const run = promisify(execFile);
const database = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow",
});
const password = "Browser-password-123!";

async function runWorker() {
  return run("npm", ["run", "email:worker"], { cwd: process.cwd(), timeout: 30_000 });
}

async function mailLink(email: string, path: "verify-email" | "reset-password") {
  await expect.poll(async () => {
    const response = await fetch("http://127.0.0.1:8025/api/v1/messages");
    const data = await response.json() as { messages: Array<{ To: Array<{ Address: string }>; Snippet: string }> };
    return data.messages.find((message) => message.To.some((recipient) => recipient.Address === email) && message.Snippet.includes(`/${path}?token=`))?.Snippet ?? "";
  }, { timeout: 10_000 }).toContain(`/${path}?token=`);
  const response = await fetch("http://127.0.0.1:8025/api/v1/messages");
  const data = await response.json() as { messages: Array<{ To: Array<{ Address: string }>; Snippet: string }> };
  const snippet = data.messages.find((message) => message.To.some((recipient) => recipient.Address === email) && message.Snippet.includes(`/${path}?token=`))!.Snippet;
  return snippet.match(/http:\/\/127\.0\.0\.1:3000\/[^\s]+/)![0];
}

async function securePost(page: Page, path: string, body: unknown) {
  return page.evaluate(async ({ path, body }) => {
    const csrf = await fetch("/api/auth/csrf", { cache: "no-store" });
    const { token } = await csrf.json();
    const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": token }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  }, { path, body });
}

async function register(page: Page, email: string) {
  await page.goto("/register?plan=growth&cadence=monthly");
  await expect(page.getByText("LOCAL NON-PRODUCTION ENVIRONMENT.")).toBeVisible();
  await page.getByLabel("Full name").fill("Browser Test");
  await page.getByLabel("Work email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
}

async function activate(page: Page, email: string) {
  await register(page, email);
  await runWorker();
  const link = await mailLink(email, "verify-email");
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
  return link;
}

async function login(page: Page, email: string, value = password) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.locator("#password").fill(value);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Create your workspace" })).toBeVisible();
}

async function tenantBrowserFixture(page:Page,seats=6){const suffix=`${Date.now()}-${Math.floor(Math.random()*10000)}`,emails={owner:`owner-${suffix}@example.test`,member:`member-${suffix}@example.test`,admin:`admin-${suffix}@example.test`,invitee:`invitee-${suffix}@example.test`},users=(await database.query(`insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)values($1,$1,'Browser Owner','active',now()),($2,$2,'Browser Member','active',now()),($3,$3,'Browser Admin','active',now()),($4,$4,'Browser Invitee','active',now())returning id`,Object.values(emails))).rows,workspace=(await database.query(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)values('Slice 4 Completion',$1,'active','growth','monthly',$2)returning id`,[`slice4-${suffix}`,users[0].id])).rows[0],roles=(await database.query(`insert into roles(workspace_id,code,permissions,is_system,policy_version)values($1,'owner','{}',true,'tenant-admin-v1'),($1,'admin','{}',true,'tenant-admin-v1'),($1,'member','{}',true,'tenant-admin-v1')returning id,code`,[workspace.id])).rows,role=(code:string)=>roles.find(value=>value.code===code).id,members=(await database.query(`insert into workspace_memberships(workspace_id,user_id,role_id,status)values($1,$2,$5,'active'),($1,$3,$6,'active'),($1,$4,$7,'active')returning id,user_id,version`,[workspace.id,users[0].id,users[1].id,users[2].id,role("owner"),role("member"),role("admin")])).rows;await database.query(`insert into workspace_entitlement_snapshots(workspace_id,plan_code,catalog_version,effective_feature_flags,effective_limits)values($1,'growth','e2e','{}',$2)`,[workspace.id,JSON.stringify({activeSeats:seats})]);const token=`browser-owner-${crypto.randomUUID()}`,session=(await database.query(`insert into sessions(user_id,session_hash,security_version,idle_expires_at,absolute_expires_at,authenticated_at,auth_method)values($1,$2,1,now()+interval '1 hour',now()+interval '1 day',now(),'password')returning id`,[users[0].id,keyedHash(token,"local-only-session-secret-change-me-32chars")])).rows[0];await page.context().addCookies([{name:"nexaflow_session",value:token,url:"http://127.0.0.1:3000"}]);return{emails,users,workspace,roles,members,token,session}}

test("personal settings are globally scoped and preference changes remain available at mobile width", async ({ page }) => {
  await tenantBrowserFixture(page);
  await page.goto("/crm");
  await expect(page.getByRole("link", { name: "Personal settings" })).toBeVisible();
  await page.getByRole("link", { name: "Personal settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Personal settings" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Display name" })).toHaveValue("Browser Owner");
  await expect(page).toHaveScreenshot("design-system-light-personal-settings.png", { fullPage: true, animations: "disabled" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("combobox", { name: "Theme" }).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme-preference", "dark");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status")).toContainText("Preferences updated.");
  await page.goto("/crm");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/workspace/settings");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const focusColor = await page.getByRole("link", { name: "CRM overview" }).evaluate(element => {
    element.focus();
    return getComputedStyle(element).outlineColor;
  });
  expect(focusColor).not.toBe("rgba(0, 0, 0, 0)");
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const menu = page.getByRole("button", { name: "Open workspace navigation" });
  const box = await menu.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await expect(page).toHaveScreenshot("design-system-dark-admin-mobile.png", { fullPage: true, animations: "disabled" });
});

test.beforeEach(async () => {
  await database.query("delete from rate_limit_windows");
  await database.query(`insert into plan_catalog_entries(code,catalog_version,name,status,allowed_cadences,included_active_seats,feature_flags,trial_days,effective_from) values ('growth','e2e','Growth','active','["monthly","annual"]',5,'{}',14,now()-interval '1 day') on conflict(code,catalog_version) do update set status='active'`);
});

test.afterAll(async () => { await database.end(); });

test("local OIDC cancellation and protocol failure return safely without creating a workspace", async ({ page }) => {
  await page.goto("/api/auth/oidc/fixture?cancel=1&redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fapi%2Fauth%2Foidc%2Fcallback");
  await expect(page).toHaveURL(/\/login\?oidc=cancelled/);
  await page.goto("/api/auth/oidc/callback?state=invalid&code=invalid");
  await expect(page).toHaveURL(/\/login\?oidc=failed/);
});

test("local OIDC fixture provisions a server-derived sole-Owner workspace and survives refresh", async ({ page }) => {
  await database.query("truncate users cascade");
  await page.goto("/login");
  await page.getByRole("link", { name: /Continue with local Google fixture/ }).click();
  await expect(page.getByRole("heading", { name: "Create your workspace" })).toBeVisible();
  await page.getByLabel("Workspace name").fill("OIDC Browser Workspace");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("heading", { name: "Your workspace is ready" })).toBeVisible();
  await expect(page.getByText("OIDC Browser Workspace", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Workspace Owner", { exact: true })).toBeVisible();
  const evidence=await database.query(`select count(*)::int owners from workspace_memberships m join roles r on r.id=m.role_id where r.code='owner' and m.status='active' and m.workspace_id=(select id from workspaces where name='OIDC Browser Workspace')`);
  expect(evidence.rows[0].owners).toBe(1);
  await page.goto("/crm");
  await page.setViewportSize({ width: 320, height: 640 });
  const menuTrigger = page.getByRole("button", { name: "Open CRM navigation" });
  await expect(menuTrigger).toBeVisible();
  const triggerBox = await menuTrigger.boundingBox();
  expect(triggerBox?.width).toBeGreaterThanOrEqual(44);
  expect(triggerBox?.height).toBeGreaterThanOrEqual(44);
  await menuTrigger.click();
  const mobileMenu = page.locator("#crm-menu");
  await expect(mobileMenu.getByRole("link", { name: "Workspace settings" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(mobileMenu).toBeHidden();
  await expect(menuTrigger).toBeFocused();
  await menuTrigger.click();
  await mobileMenu.getByRole("link", { name: "Workspace settings" }).click();
  await expect(page).toHaveURL(/\/workspace\/settings/);
  await expect(page.getByText(/LOCAL SERVER · Workspace settings/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto("/crm");
  await page.getByRole("button", { name: "Open CRM navigation" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login\?signedOut=1/);
  await page.goto("/crm");
  await expect(page).toHaveURL(/\/login\?next=\/crm/);
});

test("registration survives an interrupted worker lease, verifies once, logs in, and enters the protected preview", async ({ page }) => {
  const email = `e2e-complete-${Date.now()}@example.test`;
  await register(page, email);
  await database.query("update outbox_messages set status='processing', lease_until=now()+interval '5 minutes' where aggregate_id=(select id from users where primary_email_normalized=$1)", [email]);
  await runWorker();
  expect((await database.query("select status from outbox_messages where aggregate_id=(select id from users where primary_email_normalized=$1)", [email])).rows[0].status).toBe("processing");
  await database.query("update outbox_messages set status='processing', lease_until=now()-interval '1 second' where aggregate_id=(select id from users where primary_email_normalized=$1)", [email]);
  await runWorker();
  expect((await database.query("select status from outbox_messages where aggregate_id=(select id from users where primary_email_normalized=$1)", [email])).rows[0].status).toBe("delivered");
  const link = await mailLink(email, "verify-email");
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "This verification link is no longer valid" })).toBeVisible();
  await login(page, email);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Create your workspace" })).toBeVisible();
});

test("rejects invalid and expired verification and reset links", async ({ page }) => {
  await page.goto(`/verify-email?token=${"x".repeat(43)}`);
  await expect(page.getByRole("heading", { name: "This verification link is no longer valid" })).toBeVisible();

  const email = `e2e-expired-${Date.now()}@example.test`;
  await register(page, email);
  await runWorker();
  const verification = await mailLink(email, "verify-email");
  await database.query("update identity_tokens set expires_at=now()-interval '1 second' where user_id=(select id from users where primary_email_normalized=$1) and purpose='email_verification'", [email]);
  await page.goto(verification);
  await expect(page.getByRole("heading", { name: "This verification link is no longer valid" })).toBeVisible();

  await page.goto(`/reset-password?token=${"y".repeat(43)}`);
  await page.locator("#password").fill("Changed-password-123!");
  await page.getByLabel("Confirm new password").fill("Changed-password-123!");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.locator(".alert.error:not(.error-summary)")).toContainText("invalid, expired, or already used");

  const resetEmail = `e2e-reset-expired-${Date.now()}@example.test`;
  await activate(page, resetEmail);
  expect((await securePost(page, "/api/auth/reset-request", { email: resetEmail })).status).toBe(202);
  await runWorker();
  const expiredReset = await mailLink(resetEmail, "reset-password");
  await database.query("update identity_tokens set expires_at=now()-interval '1 second' where user_id=(select id from users where primary_email_normalized=$1) and purpose='password_reset'", [resetEmail]);
  await page.goto(expiredReset);
  await page.locator("#password").fill("Changed-password-123!");
  await page.getByLabel("Confirm new password").fill("Changed-password-123!");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.locator(".alert.error:not(.error-summary)")).toContainText("invalid, expired, or already used");
});

test("current-device logout preserves another device; all-device logout and back navigation remain protected", async ({ browser, page }) => {
  const email = `e2e-logout-${Date.now()}@example.test`;
  await activate(page, email);
  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  await login(page, email);
  await login(second, email);

  expect((await securePost(page, "/api/auth/logout", { scope: "current" })).status).toBe(200);
  await page.goto("/workspace/create");
  await expect(page).toHaveURL(/\/login/);
  await second.goto("/workspace/create");
  await expect(second.getByRole("heading", { name: "Create your workspace" })).toBeVisible();

  expect((await securePost(second, "/api/auth/logout", { scope: "all" })).status).toBe(200);
  await second.goto("/workspace/create");
  await expect(second).toHaveURL(/\/login/);
  await second.goBack();
  await expect(second).toHaveURL(/\/login/);
  await secondContext.close();
});

test("session expiry and successful reset revoke protected access; reset token replay fails", async ({ page }) => {
  const email = `e2e-reset-${Date.now()}@example.test`;
  await activate(page, email);
  await login(page, email);
  const sessionCookie = (await page.context().cookies()).find((item) => item.name === "nexaflow_session")!;
  const sessionHash = keyedHash(sessionCookie.value, "local-only-session-secret-change-me-32chars");
  await database.query("update sessions set last_seen_at=now()-interval '2 minutes',idle_expires_at=now()+interval '1 minute',absolute_expires_at=now()+interval '2 hours' where session_hash=$1", [sessionHash]);
  expect(await page.evaluate(async()=>((await fetch("/api/auth/session")).json()))).toMatchObject({authenticated:true});
  const touched = await database.query("select idle_expires_at > now()+interval '20 minutes' refreshed from sessions where session_hash=$1", [sessionHash]);
  expect(touched.rows[0].refreshed).toBe(true);
  await database.query("update sessions set idle_expires_at=now()-interval '1 second' where session_hash=$1", [sessionHash]);
  await page.goto("/workspace/create");
  await expect(page).toHaveURL(/\/login/);

  await login(page, email);
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("Check your email.")).toBeVisible();
  await runWorker();
  const resetLink = await mailLink(email, "reset-password");
  await page.goto(resetLink);
  await page.locator("#password").fill("Changed-password-123!");
  await page.getByLabel("Confirm new password").fill("Changed-password-123!");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("Password updated and existing sessions revoked.")).toBeVisible();
  await page.goto("/workspace/create");
  await expect(page).toHaveURL(/\/login/);
  await page.goto(resetLink);
  await page.locator("#password").fill("Another-password-123!");
  await page.getByLabel("Confirm new password").fill("Another-password-123!");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.locator(".alert.error:not(.error-summary)")).toContainText("invalid, expired, or already used");
});

test("redirects unauthenticated workspace entry to local sign in", async ({ page }) => {
  await page.goto("/workspace/create");
  await expect(page).toHaveURL(/\/login/);
});

test("Owner invites a verified Member through server settings, Mailpit, and token acceptance", async ({ page }) => {
  const suffix=Date.now(),ownerEmail=`slice4-owner-${suffix}@example.test`,inviteeEmail=`slice4-member-${suffix}@example.test`;
  const users=(await database.query(`insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)values($1,$1,'Slice 4 Owner','active',now()),($2,$2,'Slice 4 Member','active',now())returning id`,[ownerEmail,inviteeEmail])).rows;
  const workspace=(await database.query(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)values('Slice 4 Browser',$1,'active','growth','monthly',$2)returning id`,[`slice-4-${suffix}`,users[0].id])).rows[0];
  const roles=(await database.query(`insert into roles(workspace_id,code,permissions,is_system,policy_version)values($1,'owner','{}',true,'tenant-admin-v1'),($1,'admin','{}',true,'tenant-admin-v1'),($1,'member','{}',true,'tenant-admin-v1')returning id,code`,[workspace.id])).rows;
  const ownerRole=roles.find(row=>row.code==="owner").id;
  const ownerMembership=(await database.query(`insert into workspace_memberships(workspace_id,user_id,role_id,status)values($1,$2,$3,'active')returning id`,[workspace.id,users[0].id,ownerRole])).rows[0];
  await database.query(`insert into workspace_entitlement_snapshots(workspace_id,plan_code,catalog_version,effective_feature_flags,effective_limits)values($1,'growth','e2e','{}','{"activeSeats":5}')`,[workspace.id]);
  const ownerToken=`owner-${crypto.randomUUID()}`,ownerSession=(await database.query(`insert into sessions(user_id,session_hash,security_version,idle_expires_at,absolute_expires_at,authenticated_at,auth_method)values($1,$2,1,now()+interval '1 hour',now()+interval '1 day',now(),'password')returning id`,[users[0].id,keyedHash(ownerToken,"local-only-session-secret-change-me-32chars")])).rows[0];
  expect(ownerMembership.id).toBeTruthy();expect(ownerSession.id).toBeTruthy();
  await page.context().addCookies([{name:"nexaflow_session",value:ownerToken,url:"http://127.0.0.1:3000"}]);
  await page.goto("/workspace/settings/invite");
  await expect(page.getByRole("heading",{name:"Invite your team"})).toBeVisible();
  await page.getByLabel("Work email").fill(inviteeEmail);
  await page.getByRole("button",{name:"Send invitations"}).click();
  await expect(page.getByText(/Invitations sent/)).toBeVisible();
  await runWorker();
  await expect.poll(async()=>{const response=await fetch("http://127.0.0.1:8025/api/v1/messages"),data=await response.json() as {messages:Array<{To:Array<{Address:string}>;Snippet:string}>};return data.messages.find(message=>message.To.some(recipient=>recipient.Address===inviteeEmail)&&message.Snippet.includes("/workspace/invitations/accept?token="))?.Snippet.match(/http:\/\/127\.0\.0\.1:3000\/workspace\/invitations\/accept\?token=[^\s]+/)?.[0]??""},{timeout:10_000}).not.toBe("");
  const messages=await (await fetch("http://127.0.0.1:8025/api/v1/messages")).json() as {messages:Array<{To:Array<{Address:string}>;Snippet:string}>};
  const inviteLink=messages.messages.find(message=>message.To.some(recipient=>recipient.Address===inviteeEmail)&&message.Snippet.includes("/workspace/invitations/accept?token="))!.Snippet.match(/http:\/\/127\.0\.0\.1:3000\/workspace\/invitations\/accept\?token=[^\s]+/)![0];
  expect(inviteLink).toContain("token=");
  const inviteeToken=`invitee-${crypto.randomUUID()}`;
  await database.query(`insert into sessions(user_id,session_hash,security_version,idle_expires_at,absolute_expires_at,authenticated_at,auth_method)values($1,$2,1,now()+interval '1 hour',now()+interval '1 day',now(),'password')`,[users[1].id,keyedHash(inviteeToken,"local-only-session-secret-change-me-32chars")]);
  await page.context().clearCookies();await page.context().addCookies([{name:"nexaflow_session",value:inviteeToken,url:"http://127.0.0.1:3000"}]);
  await page.goto(inviteLink);
  await page.getByRole("button",{name:"Accept invitation"}).click();
  await expect(page.getByRole("heading",{name:"You joined Slice 4 Browser."})).toBeVisible();
  await page.getByRole("link",{name:"Open workspace"}).click();
  await expect(page).toHaveURL(/\/crm$/);
  await expect(page.getByRole("heading",{name:"Leads"})).toBeVisible();
  expect((await database.query(`select count(*)::int count from workspace_memberships where workspace_id=$1 and user_id=$2`,[workspace.id,users[1].id])).rows[0].count).toBe(1);
});

test("multi-entry invitations preserve per-row state and expose partial retry",async({page})=>{const fixture=await tenantBrowserFixture(page),fresh=`fresh-${Date.now()}@example.test`;await page.goto("/workspace/settings/invite");await page.getByLabel("Work email").fill(`${fresh}, ${fixture.emails.owner}`);await page.getByRole("button",{name:"Add"}).click();await expect(page.getByText(fresh,{exact:true})).toBeVisible();await expect(page.getByText(fixture.emails.owner,{exact:true})).toBeVisible();const rows=page.locator('[aria-label="Invitation entries"] article');await rows.filter({hasText:fresh}).getByLabel("Role").selectOption("admin");await page.getByRole("button",{name:"Send invitations"}).click();await expect(page.getByText("Some invitations were sent; others need attention.")).toBeVisible();await expect(page.getByRole("button",{name:`Retry ${fixture.emails.owner}`})).toBeVisible()});

test("People and roles confirms suspend, restore, and remove with server state and audit refresh",async({page})=>{const fixture=await tenantBrowserFixture(page);await page.goto("/workspace/settings/people");const ownerRow=page.getByRole("row").filter({hasText:"Browser Owner"}),memberRow=page.getByRole("row").filter({hasText:"Browser Member"});await expect(ownerRow.getByRole("button",{name:"Suspend"})).toBeDisabled();await memberRow.getByRole("button",{name:"Suspend"}).click();await expect(page.getByRole("alertdialog",{name:"Suspend Browser Member?"})).toBeVisible();await page.getByRole("button",{name:"Suspend member"}).click();await expect(page.getByText("Browser Member was suspended.")).toBeVisible();await expect(memberRow.getByText("suspended",{exact:true})).toBeVisible();expect((await database.query("select status from workspace_memberships where id=$1",[fixture.members[1].id])).rows[0].status).toBe("suspended");await memberRow.getByRole("button",{name:"Restore access"}).click();await page.getByRole("button",{name:"Restore access"}).last().click();await expect(page.getByText("Browser Member’s access was restored.")).toBeVisible();await expect(memberRow.getByText("active",{exact:true})).toBeVisible();await memberRow.getByRole("button",{name:"Remove"}).click();await page.getByRole("button",{name:"Remove from workspace"}).click();await expect(page.getByText("Browser Member was removed from the workspace.")).toBeVisible();await expect(memberRow.getByText("removed",{exact:true})).toBeVisible();await expect(memberRow.getByText("Invite this person again to restore access.")).toBeVisible();expect((await database.query(`select action from audit_events where target_id=$1 and outcome='success' order by occurred_at`,[fixture.members[1].id])).rows.map(row=>row.action)).toEqual(["workspace.membership_changed","workspace.membership_restored","workspace.membership_changed"])});

test("team membership editing confirms removal, reports stale writes, enforces Admin ceilings, and suspended access ends immediately",async({page})=>{const fixture=await tenantBrowserFixture(page);await page.goto("/workspace/settings/teams");await page.getByLabel("Team name").fill("Customer Success");await page.getByRole("button",{name:"Create team"}).click();await expect(page.getByText("Team created.")).toBeVisible();const card=page.locator("article").filter({hasText:"Customer Success"});await card.getByLabel("Browser Member").check();await card.getByRole("button",{name:"Save members"}).click();await expect(page.getByText("Team members updated.")).toBeVisible();expect((await database.query(`select count(*)::int count from team_memberships tm join workspace_memberships m on m.id=tm.workspace_membership_id where m.user_id=$1`,[fixture.users[1].id])).rows[0].count).toBe(1);const memberCheckbox=card.getByLabel("Browser Member");await memberCheckbox.click();const removeDialog=page.getByRole("alertdialog",{name:"Remove Browser Member from Customer Success?"});await expect(removeDialog).toBeVisible();await expect(removeDialog.getByRole("button",{name:"Cancel"})).toBeFocused();await removeDialog.getByRole("button",{name:"Remove from team"}).click();await expect(memberCheckbox).not.toBeChecked();await page.reload();const refreshedCard=page.locator("article").filter({hasText:"Customer Success"});await page.route("**/memberships/*/teams",route=>route.fulfill({status:409,contentType:"application/json",body:JSON.stringify({error:{code:"stale_version"}})}),{times:1});await refreshedCard.getByLabel("Browser Admin").check();await refreshedCard.getByRole("button",{name:"Save members"}).click();await expect(page.getByText(/This changed while you were editing/)).toBeVisible();const adminToken=`browser-admin-${crypto.randomUUID()}`;await database.query(`insert into sessions(user_id,session_hash,security_version,idle_expires_at,absolute_expires_at,authenticated_at,auth_method)values($1,$2,1,now()+interval '1 hour',now()+interval '1 day',now(),'password')`,[fixture.users[2].id,keyedHash(adminToken,"local-only-session-secret-change-me-32chars")]);await page.context().clearCookies();await page.context().addCookies([{name:"nexaflow_session",value:adminToken,url:"http://127.0.0.1:3000"}]);await page.goto("/workspace/settings/people");await expect(page.getByRole("row").filter({hasText:"Browser Owner"}).getByRole("combobox")).toHaveCount(0);await expect(page.getByRole("row").filter({hasText:"Browser Admin"}).getByRole("combobox")).toHaveCount(0);await expect(page.getByRole("row").filter({hasText:"Browser Member"}).getByRole("combobox")).toHaveCount(0);await expect(page.getByRole("row").filter({hasText:"Browser Member"}).getByRole("button",{name:"Suspend"})).toBeEnabled();const memberToken=`browser-member-${crypto.randomUUID()}`;await database.query(`insert into sessions(user_id,session_hash,security_version,idle_expires_at,absolute_expires_at,authenticated_at,auth_method)values($1,$2,1,now()+interval '1 hour',now()+interval '1 day',now(),'password')`,[fixture.users[1].id,keyedHash(memberToken,"local-only-session-secret-change-me-32chars")]);await page.context().clearCookies();await page.context().addCookies([{name:"nexaflow_session",value:memberToken,url:"http://127.0.0.1:3000"}]);await database.query("update workspace_memberships set status='suspended' where user_id=$1 and workspace_id=$2",[fixture.users[1].id,fixture.workspace.id]);await page.goto("/crm");await expect(page).not.toHaveURL(/\/crm$/)});

test("resend invalidates the old link, seat denial stays generic, and fixture re-auth transfers with a rotated session",async({page})=>{const fixture=await tenantBrowserFixture(page,3);await database.query("delete from identity_credentials where provider='google' and provider_subject='local-google-sub'");await database.query(`insert into identity_credentials(user_id,provider,provider_subject)values($1,'google','local-google-sub')`,[fixture.users[0].id]);await page.goto("/workspace/settings/invite");await page.getByLabel("Work email").fill(fixture.emails.invitee);await page.getByRole("button",{name:"Send invitations"}).click();await expect(page.getByText(/Invitations sent/)).toBeVisible();await runWorker();const oldLink=await expect.poll(async()=>{const messages=await(await fetch("http://127.0.0.1:8025/api/v1/messages")).json() as{messages:Array<{To:Array<{Address:string}>;Snippet:string}>};return messages.messages.find(message=>message.To.some(value=>value.Address===fixture.emails.invitee)&&message.Snippet.includes("/workspace/invitations/accept?token="))?.Snippet.match(/http:\/\/127\.0\.0\.1:3000\/workspace\/invitations\/accept\?token=[^\s]+/)?.[0]??""},{timeout:10000}).not.toBe("");expect(oldLink).toBeUndefined();const messages=await(await fetch("http://127.0.0.1:8025/api/v1/messages")).json() as{messages:Array<{To:Array<{Address:string}>;Snippet:string}>};const first=messages.messages.find(message=>message.To.some(value=>value.Address===fixture.emails.invitee)&&message.Snippet.includes("/workspace/invitations/accept?token="))!.Snippet.match(/http:\/\/127\.0\.0\.1:3000\/workspace\/invitations\/accept\?token=[^\s]+/)![0];await database.query("update workspace_invitations set last_sent_at=now()-interval '2 minutes' where workspace_id=$1 and email_normalized=$2",[fixture.workspace.id,fixture.emails.invitee]);await page.goto("/workspace/settings/invitations");await page.getByRole("button",{name:"Resend"}).click();await expect(page.getByText(/Invitation resent/)).toBeVisible();await runWorker();const inviteeToken=`browser-invitee-${crypto.randomUUID()}`;await database.query(`insert into sessions(user_id,session_hash,security_version,idle_expires_at,absolute_expires_at,authenticated_at,auth_method)values($1,$2,1,now()+interval '1 hour',now()+interval '1 day',now(),'password')`,[fixture.users[3].id,keyedHash(inviteeToken,"local-only-session-secret-change-me-32chars")]);await page.context().clearCookies();await page.context().addCookies([{name:"nexaflow_session",value:inviteeToken,url:"http://127.0.0.1:3000"}]);await page.goto(first);await page.getByRole("button",{name:"Accept invitation"}).click();await expect(page.getByText("This invitation isn’t available.")).toBeVisible();const resentMessages=await(await fetch("http://127.0.0.1:8025/api/v1/messages")).json() as{messages:Array<{To:Array<{Address:string}>;Snippet:string}>};const current=resentMessages.messages.map(message=>message.To.some(value=>value.Address===fixture.emails.invitee)?message.Snippet.match(/http:\/\/127\.0\.0\.1:3000\/workspace\/invitations\/accept\?token=[^\s]+/)?.[0]:undefined).find(link=>link&&link!==first)!;await page.goto(current);await page.getByRole("button",{name:"Accept invitation"}).click();await expect(page.getByText("There are no available seats for this invitation.")).toBeVisible();await page.context().clearCookies();await page.context().addCookies([{name:"nexaflow_session",value:fixture.token,url:"http://127.0.0.1:3000"}]);await page.goto("/workspace/settings/transfer-ownership");await page.getByRole("link",{name:"Confirm with local Google fixture"}).click();await expect(page).toHaveURL(/recent=confirmed/);await page.getByLabel("Choose successor").selectOption({label:"Browser Member"});await page.getByRole("button",{name:"Continue to confirmation"}).click();await page.getByRole("button",{name:"Transfer ownership"}).click();await expect(page.getByText(/Your refreshed authorization is active/)).toBeVisible();await page.goto("/workspace/settings");await expect(page.getByText("admin",{exact:true})).toBeVisible()});
