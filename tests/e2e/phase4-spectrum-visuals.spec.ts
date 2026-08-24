import { Pool } from "pg";
import { expect, test, type BrowserContext, type Locator, type Page } from "playwright/test";
import { keyedHash } from "../../src/server/security/crypto";

const database = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });
const sessionSecret = "local-only-session-secret-change-me-32chars";
test.use({ baseURL: process.env.PHASE4_VISUAL_BASE_URL ?? "http://127.0.0.1:3000" });

type VisualUser = { id: string; token: string };

async function seedVisualUser(label: string): Promise<VisualUser> {
  const suffix = crypto.randomUUID();
  const user = (await database.query<{ id: string }>(`insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at) values($1,$1,$2,'active',now()) returning id`, [`phase4-visual-${suffix}@example.test`, label])).rows[0];
  await database.query(`insert into user_preferences(user_id,appearance,locale,time_zone) values($1,'light','en-CA','America/Toronto')`, [user.id]);
  await database.query(`insert into onboarding_progress(user_id,selected_plan_code,billing_cadence,current_step) values($1,'growth','monthly','workspace')`, [user.id]);
  const token = `phase4-visual-${suffix}`;
  await database.query(`insert into sessions(user_id,session_hash,security_version,idle_expires_at,absolute_expires_at,authenticated_at,auth_method) values($1,$2,1,now()+interval '1 hour',now()+interval '1 day',now(),'password')`, [user.id, keyedHash(token, sessionSecret)]);
  return { id: user.id, token };
}

async function useSession(context: BrowserContext, token: string) {
  await context.clearCookies();
  await context.addCookies([{ name: "nexaflow_session", value: token, url: "http://127.0.0.1:3000" }]);
}

async function setAppearance(userId: string, appearance: "light" | "dark" | "system") {
  await database.query(`update user_preferences set appearance=$2,version=version+1,updated_at=now() where user_id=$1`, [userId, appearance]);
}

async function removeDevOverlay(page: Page) {
  await page.locator("nextjs-portal").evaluateAll((portals) => portals.forEach((portal) => portal.remove()));
}

async function screenshot(page: Page, name: string) {
  await removeDevOverlay(page);
  await expect(page).toHaveScreenshot(name, { fullPage: true, animations: "disabled" });
}

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

function rgb(value: string) {
  return value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
}

function contrast(foreground: string, background: string) {
  const channel = (value: number) => { const normalized = value / 255; return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4; };
  const luminance = (value: string) => { const [red, green, blue] = rgb(value).map(channel); return 0.2126 * red + 0.7152 * green + 0.0722 * blue; };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

async function textContrast(target: Locator) {
  const colors = await target.evaluate((element) => {
    const foreground = getComputedStyle(element).color;
    let node: Element | null = element;
    let background = "rgba(0, 0, 0, 0)";
    while (node && /rgba?\([^)]*,\s*0\)$/.test(background)) { background = getComputedStyle(node).backgroundColor; node = node.parentElement; }
    return { foreground, background };
  });
  return contrast(colors.foreground, colors.background);
}

async function keyboardFocus(page: Page, target: Locator, surface: Locator) {
  await target.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(target).toBeFocused();
  const focus = await target.evaluate((element) => ({ color: getComputedStyle(element).outlineColor, width: Number.parseFloat(getComputedStyle(element).outlineWidth), offset: Number.parseFloat(getComputedStyle(element).outlineOffset) }));
  const background = await surface.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(focus.width).toBeGreaterThanOrEqual(2);
  expect(focus.offset).toBeGreaterThanOrEqual(2);
  expect(contrast(focus.color, background)).toBeGreaterThanOrEqual(3);
}

async function provisionReadyWorkspace(user: VisualUser) {
  const workspace = (await database.query<{ id: string }>(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id) values('Northstar Revenue', $1, 'active', 'growth', 'monthly', $2) returning id`, [`northstar-${crypto.randomUUID()}`, user.id])).rows[0];
  const owner = (await database.query<{ id: string }>(`insert into roles(workspace_id,code,permissions,is_system,policy_version) values($1,'owner','{}',true,'tenant-admin-v1') returning id`, [workspace.id])).rows[0];
  await database.query(`insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active')`, [workspace.id, user.id, owner.id]);
  await database.query(`insert into workspace_entitlement_snapshots(workspace_id,plan_code,catalog_version,effective_feature_flags,effective_limits) values($1,'growth','phase4-visual','{}','{"activeSeats":5}')`, [workspace.id]);
  await database.query(`update onboarding_progress set workspace_id=$2,current_step='complete',completed_at=now(),version=version+1 where user_id=$1`, [user.id, workspace.id]);
  await database.query(`update sessions set active_workspace_id=$2 where user_id=$1 and revoked_at is null`, [user.id, workspace.id]);
  return workspace;
}

async function addChooserWorkspace(user: VisualUser) {
  const workspace = (await database.query<{ id: string }>(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id) values('Atlas Services', $1, 'active', 'growth', 'monthly', $2) returning id`, [`atlas-${crypto.randomUUID()}`, user.id])).rows[0];
  const owner = (await database.query<{ id: string }>(`insert into roles(workspace_id,code,permissions,is_system,policy_version) values($1,'owner','{}',true,'tenant-admin-v1') returning id`, [workspace.id])).rows[0];
  await database.query(`insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active')`, [workspace.id, user.id, owner.id]);
}

test.beforeAll(async () => {
  await database.query(`insert into plan_catalog_entries(code,catalog_version,name,status,allowed_cadences,included_active_seats,feature_flags,trial_days,effective_from) values('growth','phase4-visual','Growth','active','["monthly","annual"]',5,'{}',14,'2026-08-24T00:00:00Z') on conflict(code,catalog_version) do update set name='Growth',status='active',allowed_cadences='["monthly","annual"]',included_active_seats=5,trial_days=14,effective_from='2026-08-24T00:00:00Z',effective_to=null`);
});

test.afterAll(async () => database.end());

test("plan selection has paired responsive, System, forced-colours, focus, and contrast evidence", async ({ context, page }) => {
  const user = await seedVisualUser("Spectrum Plan Owner");
  await useSession(context, user.token);
  const viewports = [["desktop", 1280, 900], ["tablet", 768, 900], ["mobile", 320, 700], ["zoom200", 640, 720]] as const;
  for (const theme of ["light", "dark"] as const) {
    await setAppearance(user.id, theme);
    await page.emulateMedia({ colorScheme: theme === "light" ? "dark" : "light", forcedColors: "none" });
    for (const [label, width, height] of viewports) {
      await page.setViewportSize({ width, height });
      await page.goto("/select-plan?plan=growth&cadence=annual");
      await expect(page.locator("html")).toHaveAttribute("data-theme-preference", theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const action = page.getByRole("link", { name: "Start with Growth" });
      await keyboardFocus(page, action, page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Growth" }) }));
      expect(await textContrast(action)).toBeGreaterThanOrEqual(4.5);
      await assertNoOverflow(page);
      await screenshot(page, `phase4-plan-${theme}-${label}.png`);
    }
  }

  await setAppearance(user.id, "system");
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const effective of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: effective, forcedColors: "none" });
    await page.goto("/select-plan?plan=growth&cadence=annual");
    await expect(page.locator("html")).toHaveAttribute("data-theme-preference", "system");
    await expect(page.locator("html")).toHaveAttribute("data-theme", effective);
    await screenshot(page, `phase4-plan-system-${effective}.png`);
  }
  expect((await database.query<{ appearance: string }>("select appearance from user_preferences where user_id=$1", [user.id])).rows[0].appearance).toBe("system");

  await page.emulateMedia({ colorScheme: "light", forcedColors: "active" });
  await page.goto("/select-plan?plan=growth&cadence=annual");
  const selected = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Growth" }) });
  expect(await selected.evaluate((element) => getComputedStyle(element).borderStyle)).not.toBe("none");
  await keyboardFocus(page, page.getByRole("link", { name: "Start with Growth" }), selected);
  await assertNoOverflow(page);
  await screenshot(page, "phase4-plan-forced-colors.png");
});

test("authenticated Workspace create, ready, and chooser have paired desktop/mobile evidence", async ({ context, page }) => {
  const user = await seedVisualUser("Spectrum Workspace Owner");
  await useSession(context, user.token);
  const paired = [["desktop", 1280, 900], ["mobile", 320, 700]] as const;

  for (const theme of ["light", "dark"] as const) {
    await setAppearance(user.id, theme);
    await page.emulateMedia({ colorScheme: theme === "light" ? "dark" : "light", forcedColors: "none" });
    for (const [label, width, height] of paired) {
      await page.setViewportSize({ width, height });
      await page.goto("/workspace/create");
      const field = page.getByLabel("Company or Workspace name");
      await keyboardFocus(page, field, page.locator(".flow-card"));
      expect(await textContrast(page.getByText("Your subscription includes one Workspace for this company.", { exact: false }))).toBeGreaterThanOrEqual(4.5);
      await assertNoOverflow(page);
      await screenshot(page, `phase4-workspace-create-${theme}-${label}.png`);
    }
  }

  await provisionReadyWorkspace(user);
  for (const theme of ["light", "dark"] as const) {
    await setAppearance(user.id, theme);
    for (const [label, width, height] of paired) {
      await page.setViewportSize({ width, height });
      await page.goto("/workspace/ready");
      const action = page.getByRole("link", { name: "Add your first lead" });
      await keyboardFocus(page, action, page.locator(".flow-card"));
      expect(await textContrast(action)).toBeGreaterThanOrEqual(4.5);
      await assertNoOverflow(page);
      await screenshot(page, `phase4-workspace-ready-${theme}-${label}.png`);
    }
  }

  await addChooserWorkspace(user);
  for (const theme of ["light", "dark"] as const) {
    await setAppearance(user.id, theme);
    for (const [label, width, height] of paired) {
      await page.setViewportSize({ width, height });
      await page.goto("/workspace/switch");
      const action = page.getByRole("button", { name: "Switch to Atlas Services" });
      await keyboardFocus(page, action, page.getByRole("listitem").filter({ hasText: "Atlas Services" }));
      expect(await textContrast(action)).toBeGreaterThanOrEqual(4.5);
      await assertNoOverflow(page);
      await screenshot(page, `phase4-workspace-chooser-${theme}-${label}.png`);
    }
  }
});
