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
    let background = "transparent";
    while (node) {
      background = getComputedStyle(node).backgroundColor;
      if (background !== "transparent" && !/rgba\([^)]*,\s*0(?:\.0+)?\)/.test(background)) break;
      node = node.parentElement;
    }
    return { foreground, background };
  });
  return contrast(colors.foreground, colors.background);
}

async function assertPlanValueContrast(page: Page) {
  for (const value of ["$24", "$57", "$107", "Custom"] as const) {
    const target = page.getByText(value, { exact: true });
    await expect(target).toBeVisible();
    expect(await textContrast(target), value).toBeGreaterThanOrEqual(4.5);
  }
  expect(await page.getByText("$57", { exact: true }).evaluate((element) => element.closest(".plan-card")?.classList.contains("selected"))).toBe(true);
  for (const value of ["$24", "$107", "Custom"] as const) expect(await page.getByText(value, { exact: true }).evaluate((element) => element.closest(".plan-card")?.classList.contains("selected"))).toBe(false);
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
  const slug = `northstar-${crypto.randomUUID()}`;
  const workspace = (await database.query<{ id: string }>(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id) values('Northstar Revenue', $1, 'active', 'growth', 'monthly', $2) returning id`, [slug, user.id])).rows[0];
  const owner = (await database.query<{ id: string }>(`insert into roles(workspace_id,code,permissions,is_system,policy_version) values($1,'owner','{}',true,'tenant-admin-v1') returning id`, [workspace.id])).rows[0];
  const membership = (await database.query<{ id: string }>(`insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active') returning id`, [workspace.id, user.id, owner.id])).rows[0];
  await database.query(`insert into workspace_entitlement_snapshots(workspace_id,plan_code,catalog_version,effective_feature_flags,effective_limits) values($1,'growth','phase4-visual','{}','{"activeSeats":5}')`, [workspace.id]);
  await database.query(`update onboarding_progress set workspace_id=$2,current_step='complete',completed_at=now(),version=version+1 where user_id=$1`, [user.id, workspace.id]);
  await database.query(`update sessions set active_workspace_id=$2 where user_id=$1 and revoked_at is null`, [user.id, workspace.id]);
  return { ...workspace, slug, membershipId: membership.id };
}

async function addChooserWorkspace(user: VisualUser) {
  const slug = `atlas-${crypto.randomUUID()}`;
  const workspace = (await database.query<{ id: string }>(`insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id) values('Atlas Services', $1, 'active', 'growth', 'monthly', $2) returning id`, [slug, user.id])).rows[0];
  const owner = (await database.query<{ id: string }>(`insert into roles(workspace_id,code,permissions,is_system,policy_version) values($1,'owner','{}',true,'tenant-admin-v1') returning id`, [workspace.id])).rows[0];
  const membership = (await database.query<{ id: string }>(`insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active') returning id`, [workspace.id, user.id, owner.id])).rows[0];
  return { ...workspace, slug, membershipId: membership.id };
}

async function installWebsiteStateSheet(page: Page) {
  await page.locator("#website-main").evaluate((element) => {
    element.innerHTML = `<section class="spectrum-state-sheet" aria-label="Website component state sheet">
      <h1>Website component states</h1>
      <article><h2>Plan values</h2><div class="plan-card"><p class="plan-price"><b>$24</b><span>Unselected</span></p></div><div class="plan-card selected"><p class="plan-price"><b>$57</b><span>Selected</span></p></div><div class="plan-card"><p class="plan-price"><b>$107</b><span>Unselected</span></p></div><div class="plan-card"><p class="plan-price"><b>Custom</b><span>Enterprise</span></p></div></article>
      <article><h2>Selection</h2><div class="cadence"><a href="#monthly">Monthly</a><a class="active" href="#annual">Annual · Selected</a></div><span class="selected-label">✓ Selected plan</span></article>
      <article><h2>Actions</h2><button class="primary">Primary action</button><button class="primary" disabled>Primary disabled</button><button class="secondary">Secondary action</button><button class="secondary" disabled>Secondary disabled</button></article>
      <article><h2>Fields</h2><label class="field"><span>Company name</span><input value="Northstar Revenue" readonly></label><label class="field"><span>Invalid company name</span><input aria-invalid="true" value="" readonly></label></article>
      <article><h2>Feedback</h2><div class="alert info">Plan details loaded.</div><div class="alert success">Workspace ready.</div><div class="alert error">Workspace creation failed.</div></article>
      <article><h2>Panel and table</h2><div class="owner-panel"><b>Sole initial Owner</b><p>Owner is included in active seats.</p></div><table class="state-table"><thead><tr><th>Workspace</th><th>Role</th></tr></thead><tbody><tr><td>Northstar Revenue</td><td>Owner</td></tr></tbody></table></article>
    </section>`;
  });
}

test.beforeAll(async () => {
  await database.query(`insert into plan_catalog_entries(code,catalog_version,name,status,allowed_cadences,included_active_seats,feature_flags,trial_days,effective_from) values('growth','phase4-visual','Growth','active','["monthly","annual"]',5,'{}',14,'2026-08-24T00:00:00Z') on conflict(code,catalog_version) do update set name='Growth',status='active',allowed_cadences='["monthly","annual"]',included_active_seats=5,trial_days=14,effective_from='2026-08-24T00:00:00Z',effective_to=null`);
});

test.afterAll(async () => database.end());

test("plan selection has paired responsive, System, forced-colours, focus, and contrast evidence", async ({ context, page }) => {
  const user = await seedVisualUser("Spectrum Plan Owner");
  await useSession(context, user.token);
  const viewports = [["desktop", 1280, 900], ["tablet", 768, 1024], ["mobile320", 320, 640], ["zoom200", 640, 720]] as const;
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
      await assertPlanValueContrast(page);
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
    await assertPlanValueContrast(page);
    await screenshot(page, `phase4-plan-system-${effective}.png`);
  }
  expect((await database.query<{ appearance: string }>("select appearance from user_preferences where user_id=$1", [user.id])).rows[0].appearance).toBe("system");

  await page.emulateMedia({ colorScheme: "light", forcedColors: "active" });
  for (const [label, width, height] of [["desktop", 1280, 900], ["mobile320", 320, 640]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/select-plan?plan=growth&cadence=annual");
    const selected = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Growth" }) });
    expect(await selected.evaluate((element) => getComputedStyle(element).borderStyle)).not.toBe("none");
    await keyboardFocus(page, page.getByRole("link", { name: "Start with Growth" }), selected);
    await assertNoOverflow(page);
    await screenshot(page, `phase4-plan-forced-colors-${label}.png`);
  }
});

test("P4-11 through P4-15 Workspace states have exact paired responsive evidence", async ({ context, page }) => {
  const user = await seedVisualUser("Spectrum Workspace Owner");
  await useSession(context, user.token);
  const journeyViewports = [["desktop", 1280, 900], ["tablet", 768, 1024], ["mobile320", 320, 640], ["zoom200", 640, 720]] as const;
  const stateViewports = [["desktop", 1280, 900], ["mobile320", 320, 640]] as const;

  for (const theme of ["light", "dark"] as const) {
    await setAppearance(user.id, theme);
    await page.emulateMedia({ colorScheme: theme === "light" ? "dark" : "light", forcedColors: "none" });
    for (const [label, width, height] of journeyViewports) {
      await page.setViewportSize({ width, height });
      await page.goto("/workspace/create");
      const field = page.getByLabel("Company or Workspace name");
      await keyboardFocus(page, field, page.locator(".flow-card"));
      expect(await textContrast(page.getByText("Your subscription includes one Workspace for this company.", { exact: false }))).toBeGreaterThanOrEqual(4.5);
      await assertNoOverflow(page);
      await screenshot(page, `phase4-workspace-create-${theme}-${label}.png`);
    }

    for (const [label, width, height] of stateViewports) {
      await page.setViewportSize({ width, height });
      await page.goto("/workspace/create");
      await page.getByLabel("Company or Workspace name").fill("Northstar Revenue");
      let releaseBusy!: () => void;
      const busyGate = new Promise<void>((resolve) => { releaseBusy = resolve; });
      await page.route("**/api/workspaces", async (route) => { await busyGate; await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "provisioning_failed" }) }); }, { times: 1 });
      await page.getByRole("button", { name: "Create company Workspace" }).click();
      await expect(page.getByRole("button", { name: "Creating Workspace…" })).toBeDisabled();
      await assertNoOverflow(page);
      await screenshot(page, `phase4-workspace-create-busy-${theme}-${label}.png`);
      releaseBusy();
      await expect(page.locator(".error-summary[role='alert']")).toBeVisible();
      await page.unroute("**/api/workspaces");

      for (const [state, code, status, message] of [["entitlement-used", "not_eligible", 400, "already has its company Workspace"], ["recoverable-failure", "provisioning_failed", 500, "name and saved plan are unchanged"]] as const) {
        await page.route("**/api/workspaces", (route) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ code }) }), { times: 1 });
        await page.goto("/workspace/create");
        const name = page.getByLabel("Company or Workspace name");
        await name.fill("Northstar Revenue");
        await page.getByRole("button", { name: "Create company Workspace" }).click();
        const errorSummary = page.locator(".error-summary[role='alert']");
        await expect(errorSummary).toContainText(message);
        await expect(name).toHaveValue("Northstar Revenue");
        expect(await textContrast(errorSummary)).toBeGreaterThanOrEqual(4.5);
        await assertNoOverflow(page);
        await screenshot(page, `phase4-workspace-create-${state}-${theme}-${label}.png`);
        await page.unroute("**/api/workspaces");
      }
    }
  }

  await setAppearance(user.id, "system");
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const effective of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: effective, forcedColors: "none" });
    await page.goto("/workspace/create");
    await expect(page.locator("html")).toHaveAttribute("data-theme-preference", "system");
    await expect(page.locator("html")).toHaveAttribute("data-theme", effective);
    await assertNoOverflow(page);
    await screenshot(page, `phase4-workspace-create-system-${effective}.png`);
  }
  expect((await database.query<{ appearance: string }>("select appearance from user_preferences where user_id=$1", [user.id])).rows[0].appearance).toBe("system");

  const current = await provisionReadyWorkspace(user);
  for (const theme of ["light", "dark"] as const) {
    await setAppearance(user.id, theme);
    await page.emulateMedia({ colorScheme: theme === "light" ? "dark" : "light", forcedColors: "none" });
    for (const [label, width, height] of journeyViewports) {
      await page.setViewportSize({ width, height });
      await page.goto("/workspace/ready");
      const action = page.getByRole("link", { name: "Add your first lead" });
      await keyboardFocus(page, action, page.locator(".flow-card"));
      expect(await textContrast(action)).toBeGreaterThanOrEqual(4.5);
      await assertNoOverflow(page);
      await screenshot(page, `phase4-workspace-ready-${theme}-${label}.png`);
    }
  }

  const alternate = await addChooserWorkspace(user);
  for (const theme of ["light", "dark"] as const) {
    await setAppearance(user.id, theme);
    await page.emulateMedia({ colorScheme: theme === "light" ? "dark" : "light", forcedColors: "none" });
    for (const [label, width, height] of [["desktop", 1280, 900], ["tablet", 768, 1024], ["mobile390", 390, 844], ["mobile320", 320, 640], ["zoom200-focused", 640, 720]] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/workspace/switch");
      const action = page.getByRole("button", { name: "Switch to Atlas Services" });
      await keyboardFocus(page, action, page.getByRole("listitem").filter({ hasText: "Atlas Services" }));
      expect(await textContrast(action)).toBeGreaterThanOrEqual(4.5);
      await assertNoOverflow(page);
      await screenshot(page, `phase4-workspace-chooser-${theme}-${label}.png`);
    }

    for (const [label, width, height] of stateViewports) {
      await page.setViewportSize({ width, height });

      await page.goto("/workspace/switch");
      let releaseSwitch!: () => void;
      const switchGate = new Promise<void>((resolve) => { releaseSwitch = resolve; });
      await page.route("**/api/workspaces/switch", async (route) => { await switchGate; await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "switch_failed" }) }); }, { times: 1 });
      await page.getByRole("button", { name: "Switch to Atlas Services" }).click();
      await expect(page.getByRole("button", { name: "Switching…" })).toBeDisabled();
      await screenshot(page, `phase4-workspace-chooser-switching-${theme}-${label}.png`);
      releaseSwitch();
      await expect(page.locator(".alert[role='alert']")).toBeVisible();
      await page.unroute("**/api/workspaces/switch");

      await page.goto("/workspace/switch");
      await page.route("**/api/workspaces/switch", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "switch_failed" }) }), { times: 1 });
      await page.getByRole("button", { name: "Switch to Atlas Services" }).click();
      const failure = page.locator(".alert[role='alert']");
      await expect(failure).toContainText("current workspace is unchanged");
      expect(await textContrast(failure)).toBeGreaterThanOrEqual(4.5);
      await screenshot(page, `phase4-workspace-chooser-failure-${theme}-${label}.png`);
      await page.unroute("**/api/workspaces/switch");
      await page.getByRole("button", { name: "Reload latest" }).click();
      await expect(page.getByRole("status")).toContainText("Latest workspace access loaded");
      await screenshot(page, `phase4-workspace-chooser-reload-${theme}-${label}.png`);

      await page.goto("/workspace/switch");
      await database.query("update workspace_memberships set status='removed' where id=$1", [alternate.membershipId]);
      await page.getByRole("button", { name: "Switch to Atlas Services" }).click();
      await expect(page.locator(".alert[role='alert']")).toContainText("access to that workspace changed");
      await expect(page.getByText("Atlas Services", { exact: true })).toHaveCount(0);
      await screenshot(page, `phase4-workspace-chooser-stale-${theme}-${label}.png`);
      await database.query("update workspace_memberships set status='active' where id=$1", [alternate.membershipId]);
      await database.query("update sessions set active_workspace_id=$2 where user_id=$1 and revoked_at is null", [user.id, current.id]);
    }
  }
});

test("P4-22 website component-state sheet has paired desktop and 320 reflow evidence", async ({ context, page }) => {
  const user = await seedVisualUser("Spectrum State Sheet Owner");
  await useSession(context, user.token);
  for (const theme of ["light", "dark"] as const) {
    await setAppearance(user.id, theme);
    await page.emulateMedia({ colorScheme: theme === "light" ? "dark" : "light", forcedColors: "none" });
    for (const [label, width, height] of [["desktop", 1280, 900], ["mobile320", 320, 640]] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/select-plan?plan=growth&cadence=annual");
      await installWebsiteStateSheet(page);
      await assertPlanValueContrast(page);
      for (const text of ["Primary action", "Secondary action", "Plan details loaded.", "Workspace ready.", "Workspace creation failed.", "Sole initial Owner", "Northstar Revenue"] as const) expect(await textContrast(page.getByText(text, { exact: true }).first()), text).toBeGreaterThanOrEqual(4.5);
      await keyboardFocus(page, page.getByRole("button", { name: "Primary action" }), page.locator(".spectrum-state-sheet"));
      await assertNoOverflow(page);
      await screenshot(page, `phase4-website-component-states-${theme}-${label}.png`);
    }
  }
});
