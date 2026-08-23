import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Pool } from "pg";
import { expect, test, type Locator, type Page } from "playwright/test";
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

async function setServerAppearance(userId: string, appearance: "light" | "dark" | "system") {
  await database.query(`insert into user_preferences(user_id,appearance) values($1,$2) on conflict(user_id) do update set appearance=$2,version=user_preferences.version+1,updated_at=now()`, [userId, appearance]);
}

async function seedVisualCrm(fixture: Awaited<ReturnType<typeof tenantBrowserFixture>>) {
  const stage = (await database.query<{ id: string }>("insert into pipeline_stages(workspace_id,name,position) values($1,'Qualified',0) returning id", [fixture.workspace.id])).rows[0];
  await database.query(`insert into leads(workspace_id,first_name,last_name,email_normalized,email_display,company,source,status,stage_id,owner_membership_id,visibility,created_at,updated_at) values($1,'Jordan','Lee','jordan.visual@example.test','jordan.visual@example.test','Acme North','website','open',$2,$3,'workspace','2026-08-20T12:00:00Z','2026-08-20T12:00:00Z')`, [fixture.workspace.id, stage.id, fixture.members[0].id]);
}

async function seedVisualPipeline(fixture: Awaited<ReturnType<typeof tenantBrowserFixture>>) {
  const stages = (await database.query<{ id: string; name: string }>("insert into pipeline_stages(workspace_id,name,position) values($1,'New',0),($1,'Qualified',1),($1,'Proposal',2) returning id,name", [fixture.workspace.id])).rows;
  const stage = (name: string) => stages.find(item => item.name === name)!.id;
  await database.query(`insert into leads(workspace_id,first_name,last_name,email_normalized,email_display,company,source,status,stage_id,owner_membership_id,visibility,created_at,updated_at) values($1,'Jordan','Lee','jordan.pipeline@example.test','jordan.pipeline@example.test','Acme North','website','open',$2,$4,'workspace','2026-08-20T12:00:00Z','2026-08-20T12:00:00Z'),($1,'Avery','Chen','avery.pipeline@example.test','avery.pipeline@example.test','Meridian Studio','referral','open',$3,$4,'workspace','2026-08-21T12:00:00Z','2026-08-21T12:00:00Z')`, [fixture.workspace.id, stage("New"), stage("Qualified"), fixture.members[0].id]);
}

async function visualBaseline(page: Page, name: string) {
  await page.locator("nextjs-portal").evaluateAll(portals => portals.forEach(portal => portal.remove()));
  await expect(page).toHaveScreenshot(name, { fullPage: true, animations: "disabled" });
}

async function tabTo(page: Page, target: Locator) {
  for (let index = 0; index < 50; index += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate(element => element === document.activeElement).catch(() => false)) return;
  }
  throw new Error("Keyboard traversal did not reach the requested control.");
}

function rgb(value: string) {
  return value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
}

function colorContrast(foreground: string, background: string) {
  const channel = (value: number) => { const normalized = value / 255; return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4; };
  const luminance = (value: string) => { const [red, green, blue] = rgb(value).map(channel); return .2126 * red + .7152 * green + .0722 * blue; };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + .05) / (darker + .05);
}

async function expectVisibleFocus(target: Locator, surface: Locator) {
  const style = await target.evaluate(element => ({ color: getComputedStyle(element).outlineColor, width: getComputedStyle(element).outlineWidth, offset: getComputedStyle(element).outlineOffset }));
  const background = await surface.evaluate(element => getComputedStyle(element).backgroundColor);
  expect(style.width).toBe("2px");
  expect(style.offset).toBe("2px");
  expect(colorContrast(style.color, background)).toBeGreaterThanOrEqual(3);
}

async function renderedTextContrast(target: Locator, surface: Locator) {
  const style = await target.evaluate(element => ({ color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }));
  const fallback = await surface.evaluate(element => getComputedStyle(element).backgroundColor);
  return colorContrast(style.color, /rgba\([^)]*,\s*0\)/.test(style.background) ? fallback : style.background);
}

test("authenticated server theme is authoritative over empty, correct, stale, and unavailable cache", async ({ page }) => {
  const fixture = await tenantBrowserFixture(page);
  await setServerAppearance(fixture.users[0].id, "light");
  let response = await page.goto("/crm");
  expect(await response!.text()).toContain('data-theme-preference="light"');
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("nexaflow-theme"))).toBe("light");

  await setServerAppearance(fixture.users[0].id, "dark");
  response = await page.reload();
  expect(await response!.text()).toContain('data-theme-preference="dark"');
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.evaluate(() => localStorage.setItem("nexaflow-theme", "light"));
  response = await page.reload();
  expect(await response!.text()).toContain('data-theme-preference="dark"');
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await setServerAppearance(fixture.users[0].id, "system");
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => localStorage.setItem("nexaflow-theme", "dark"));
  response = await page.reload();
  expect(await response!.text()).toContain('data-theme-preference="system"');
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.addInitScript(() => Object.defineProperty(Storage.prototype, "getItem", { configurable: true, value: () => { throw new Error("storage unavailable"); } }));
  await setServerAppearance(fixture.users[0].id, "dark");
  response = await page.reload();
  expect(await response!.text()).toContain('data-theme-preference="dark"');
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/workspace/switch");
  await page.waitForURL(/\/crm\/home$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.evaluate(() => history.pushState(null, "", "/workspace/switch"));
  await page.goBack();
  await page.waitForURL(/\/crm\/home$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("strict CSP authorizes only the matching nonce", async ({ page }) => {
  await page.setContent(`<meta http-equiv="Content-Security-Policy" content="script-src 'nonce-correct'"><script nonce="wrong">window.wrongNonceRan=true</script><script nonce="correct">window.correctNonceRan=true</script>`);
  expect(await page.evaluate(() => ({ wrong: (window as typeof window & { wrongNonceRan?: boolean }).wrongNonceRan, correct: (window as typeof window & { correctNonceRan?: boolean }).correctNonceRan }))).toEqual({ wrong: undefined, correct: true });
});

test("personal settings theme, paired baselines, keyboard focus, and responsive shells", async ({ page }) => {
  const fixture = await tenantBrowserFixture(page);
  await seedVisualCrm(fixture);
  const consoleFailures: string[] = [];
  page.on("console", message => { if (/Content Security Policy|hydration|recoverable/i.test(message.text())) consoleFailures.push(message.text()); });
  const response = await page.goto("/crm");
  const csp = response!.headers()["content-security-policy"];
  expect(csp).toContain("'strict-dynamic'");
  expect(csp.match(/script-src[^;]+/)?.[0]).not.toContain("'unsafe-inline'");
  expect(response!.headers()["cache-control"]).toMatch(/no-cache|no-store/);
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  expect(await page.locator("#nexaflow-theme").evaluate((script: HTMLScriptElement) => script.nonce)).toBe(nonce);
  await expect(page.getByRole("link", { name: "Personal settings" })).toBeVisible();
  await page.getByRole("link", { name: "Personal settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Personal settings" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Display name" })).toHaveValue("Browser Owner");
  await page.getByRole("combobox", { name: "Theme" }).selectOption("light");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status")).toContainText("Preferences updated.");
  await visualBaseline(page, "design-system-personal-settings-light.png");
  expect(await page.locator(".eyebrow").first().evaluate(element => getComputedStyle(element).fontWeight)).toBe("550");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("combobox", { name: "Theme" }).selectOption("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.route("**/api/account/preferences", async route => route.request().method() === "PATCH" ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "test_failure" }) }) : route.continue());
  await page.getByRole("combobox", { name: "Theme" }).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status")).toContainText("last saved theme has been restored");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.unroute("**/api/account/preferences");

  await page.getByRole("combobox", { name: "Theme" }).selectOption("dark");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status")).toHaveText("Preferences updated.");
  await expect.poll(async () => (await database.query<{ appearance: string }>("select appearance from user_preferences where user_id=$1", [fixture.users[0].id])).rows[0]?.appearance).toBe("dark");
  await visualBaseline(page, "design-system-personal-settings-dark.png");
  await page.goto("/crm");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Jordan Lee" })).toBeVisible();
  await visualBaseline(page, "design-system-crm-dark.png");
  await page.goto("/workspace/settings");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await visualBaseline(page, "design-system-workspace-admin-dark.png");

  await setServerAppearance(fixture.users[0].id, "light");
  await page.goto("/crm");
  await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Jordan Lee" })).toBeVisible();
  await visualBaseline(page, "design-system-crm-light.png");
  await page.goto("/workspace/settings");
  await visualBaseline(page, "design-system-workspace-admin-light.png");

  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  const focusStyle = await focused.evaluate(element => ({ width: getComputedStyle(element).outlineWidth, offset: getComputedStyle(element).outlineOffset }));
  expect(focusStyle).toEqual({ width: "2px", offset: "2px" });
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const menu = page.getByRole("button", { name: "Open workspace navigation" });
  const box = await menu.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("link", { name: "CRM overview" })).toBeFocused();
  await visualBaseline(page, "design-system-mobile-drawer-light.png");
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await setServerAppearance(fixture.users[0].id, "dark");
  await page.reload();
  await page.getByRole("button", { name: "Open workspace navigation" }).click();
  await visualBaseline(page, "design-system-mobile-drawer-dark.png");

  await page.setViewportSize({ width: 640, height: 720 });
  await page.goto("/settings");
  await page.getByRole("textbox", { name: "Display name" }).focus();
  const focusBox = await page.getByRole("textbox", { name: "Display name" }).boundingBox();
  expect(focusBox!.x).toBeGreaterThanOrEqual(0);
  expect(focusBox!.x + focusBox!.width).toBeLessThanOrEqual(640);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(consoleFailures).toEqual([]);
});

test("Workspace navigation states and representative controls retain keyboard focus in both themes", async ({ page }) => {
  const fixture = await tenantBrowserFixture(page);
  for (const theme of ["light", "dark"] as const) {
    await setServerAppearance(fixture.users[0].id, theme);
    await page.goto("/crm");
    await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
    await page.goto("/workspace/settings");
    await expect(page.getByRole("heading", { name: "Workspace settings" })).toBeVisible();
    const aside = page.locator(".admin-shell>aside");
    const nav = aside.getByRole("navigation", { name: "Workspace navigation" });
    const defaultLink = nav.getByRole("link", { name: "CRM overview" });
    const activeLink = nav.getByRole("link", { name: "Workspace settings" });
    expect(await renderedTextContrast(defaultLink, aside)).toBeGreaterThanOrEqual(4.5);
    expect(await renderedTextContrast(defaultLink, aside)).toBeGreaterThanOrEqual(4.5);
    expect(await activeLink.getAttribute("aria-current")).toBe("page");
    expect(await renderedTextContrast(activeLink, aside)).toBeGreaterThanOrEqual(4.5);
    await defaultLink.hover();
    expect(await renderedTextContrast(defaultLink, aside)).toBeGreaterThanOrEqual(4.5);
    const box = await defaultLink.boundingBox();
    await page.mouse.move(box!.x + 8, box!.y + 8);
    await page.mouse.down();
    expect(await renderedTextContrast(defaultLink, aside)).toBeGreaterThanOrEqual(4.5);
    await page.mouse.move(0, 0);
    await page.mouse.up();
    await defaultLink.evaluate(element => element.setAttribute("aria-disabled", "true"));
    expect(await renderedTextContrast(defaultLink, aside)).toBeGreaterThanOrEqual(4.5);
    await defaultLink.evaluate(element => element.removeAttribute("aria-disabled"));
    await page.locator("body").press("Home").catch(() => undefined);
    await tabTo(page, defaultLink);
    await expectVisibleFocus(defaultLink, aside);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Personal settings" })).toBeVisible();
    const pageSurface = page.locator(".account-shell");
    const targets = [
      page.getByRole("link", { name: "Back to CRM" }),
      page.getByRole("textbox", { name: "Display name" }),
      page.getByRole("button", { name: "Save profile" }),
      page.getByRole("combobox", { name: "Theme" }),
      page.getByRole("button", { name: "Show passwords" }),
    ];
    for (const target of targets) {
      await tabTo(page, target);
      await expectVisibleFocus(target, pageSurface);
      await target.scrollIntoViewIfNeeded();
      const focusedBox = await target.evaluate(element => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; });
      const focusName = await target.evaluate(element => element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName);
      expect(focusedBox!.y, focusName).toBeGreaterThanOrEqual(0);
      expect(focusedBox!.y + focusedBox!.height, focusName).toBeLessThanOrEqual(900);
    }
    expect(await targets[2].getAttribute("class")).toContain("primary");
    expect(await targets[4].getAttribute("class")).toContain("secondary");
    await page.setViewportSize({ width: 640, height: 720 });
    await page.goto("/settings");
    const zoomProxyInput = page.getByRole("textbox", { name: "Display name" });
    await tabTo(page, zoomProxyInput);
    await expectVisibleFocus(zoomProxyInput, page.locator(".account-shell"));
    await zoomProxyInput.scrollIntoViewIfNeeded();
    const zoomProxyBox = await zoomProxyInput.evaluate(element => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; });
    expect(zoomProxyBox!.x).toBeGreaterThanOrEqual(0);
    expect(zoomProxyBox!.x + zoomProxyBox!.width).toBeLessThanOrEqual(640);
    expect(zoomProxyBox!.y).toBeGreaterThanOrEqual(0);
    expect(zoomProxyBox!.y + zoomProxyBox!.height).toBeLessThanOrEqual(720);
    await page.setViewportSize({ width: 1280, height: 720 });
  }
});

test("Pipeline semantic surfaces retain paired contrast, interaction, and responsive behavior", async ({ page }) => {
  const fixture = await tenantBrowserFixture(page);
  await seedVisualPipeline(fixture);
  for (const theme of ["light", "dark"] as const) {
    await setServerAppearance(fixture.users[0].id, theme);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/crm/pipeline");
    await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Jordan Lee" })).toBeVisible();
    const populatedStage = page.getByRole("region", { name: /New/ });
    const emptyStage = page.getByRole("region", { name: /Proposal/ });
    const card = populatedStage.locator(".pipeline-lead-card");
    const count = populatedStage.locator(".pipeline-count");
    const changeStage = card.getByRole("link", { name: "Change stage" });
    expect(await renderedTextContrast(populatedStage.getByRole("heading", { name: /New/ }), populatedStage)).toBeGreaterThanOrEqual(4.5);
    expect(await renderedTextContrast(count, populatedStage)).toBeGreaterThanOrEqual(4.5);
    expect(await renderedTextContrast(card.getByRole("link", { name: "Jordan Lee" }), card)).toBeGreaterThanOrEqual(4.5);
    expect(await renderedTextContrast(card.locator(".pipeline-company"), card)).toBeGreaterThanOrEqual(4.5);
    expect(await renderedTextContrast(card.locator(".pipeline-owner"), card)).toBeGreaterThanOrEqual(4.5);
    expect(await renderedTextContrast(card.locator(".pipeline-visibility"), card)).toBeGreaterThanOrEqual(4.5);
    expect(await renderedTextContrast(emptyStage.locator(".pipeline-empty-stage"), emptyStage)).toBeGreaterThanOrEqual(4.5);
    expect(await renderedTextContrast(page.locator(".crm-preview>aside .brand b"), page.locator(".crm-preview>aside"))).toBeGreaterThanOrEqual(4.5);
    expect(await renderedTextContrast(page.locator(".crm-preview>aside .admin-workspace b"), page.locator(".crm-preview>aside .admin-workspace"))).toBeGreaterThanOrEqual(4.5);
    const defaultCardBorder = await card.evaluate(element => getComputedStyle(element).borderColor);
    await card.hover();
    expect(await card.evaluate(element => getComputedStyle(element).borderColor)).not.toBe(defaultCardBorder);
    await page.mouse.move(0, 0);
    await tabTo(page, changeStage);
    await expectVisibleFocus(changeStage, card);
    expect(await renderedTextContrast(changeStage, card)).toBeGreaterThanOrEqual(4.5);
    await visualBaseline(page, `design-system-pipeline-${theme}.png`);

    await page.goto("/crm/pipeline?q=not-a-real-lead");
    const empty = page.locator(".empty");
    await expect(page.getByRole("heading", { name: "No leads match these filters." })).toBeVisible();
    expect(await renderedTextContrast(empty.getByRole("heading"), empty)).toBeGreaterThanOrEqual(4.5);

    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/crm/pipeline");
    await expect(page.getByRole("link", { name: "Jordan Lee" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const mobileCard = page.locator(".pipeline-lead-card").first();
    const mobileBox = await mobileCard.boundingBox();
    expect(mobileBox!.x).toBeGreaterThanOrEqual(0);
    expect(mobileBox!.x + mobileBox!.width).toBeLessThanOrEqual(320);
    const mobileAction = mobileCard.getByRole("link", { name: "Change stage" });
    expect((await mobileAction.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await page.setViewportSize({ width: 640, height: 720 });
    await page.goto("/crm/pipeline");
    await expect(page.getByRole("link", { name: "Jordan Lee" })).toBeVisible();
    const zoomAction = page.locator(".pipeline-lead-card").first().getByRole("link", { name: "Change stage" });
    await tabTo(page, zoomAction);
    await zoomAction.scrollIntoViewIfNeeded();
    await expectVisibleFocus(zoomAction, page.locator(".pipeline-lead-card").first());
    const zoomBox = await zoomAction.boundingBox();
    expect(zoomBox!.x).toBeGreaterThanOrEqual(0);
    expect(zoomBox!.x + zoomBox!.width).toBeLessThanOrEqual(640);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
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
