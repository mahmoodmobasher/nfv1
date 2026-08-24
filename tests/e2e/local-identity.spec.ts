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
  return run("npm", ["run", "email:worker"], {
    cwd: process.cwd(),
    timeout: 30_000,
  });
}

async function mailLink(
  email: string,
  path: "verify-email" | "reset-password",
) {
  await expect
    .poll(
      async () => {
        const response = await fetch("http://127.0.0.1:8025/api/v1/messages");
        const data = (await response.json()) as {
          messages: Array<{ To: Array<{ Address: string }>; Snippet: string }>;
        };
        return (
          data.messages.find(
            (message) =>
              message.To.some((recipient) => recipient.Address === email) &&
              message.Snippet.includes(`/${path}/capture?token=`),
          )?.Snippet ?? ""
        );
      },
      { timeout: 10_000 },
    )
    .toContain(`/${path}/capture?token=`);
  const response = await fetch("http://127.0.0.1:8025/api/v1/messages");
  const data = (await response.json()) as {
    messages: Array<{ To: Array<{ Address: string }>; Snippet: string }>;
  };
  const snippet = data.messages.find(
    (message) =>
      message.To.some((recipient) => recipient.Address === email) &&
      message.Snippet.includes(`/${path}/capture?token=`),
  )!.Snippet;
  return snippet.match(/http:\/\/127\.0\.0\.1:3000\/[^\s]+/)![0];
}

async function securePost(page: Page, path: string, body: unknown) {
  return page.evaluate(
    async ({ path, body }) => {
      const csrf = await fetch("/api/auth/csrf", { cache: "no-store" });
      const { token } = await csrf.json();
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": token },
        body: JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() };
    },
    { path, body },
  );
}

async function register(page: Page, email: string) {
  await page.goto("/register?plan=growth&cadence=monthly");
  await expect(
    page.getByText(
      "Identity and password security are server-backed. Do not reuse a password from another service.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByLabel("Full name").fill("Browser Test");
  await page.getByLabel("Work email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
}

async function activate(page: Page, email: string) {
  await register(page, email);
  await runWorker();
  const link = await mailLink(email, "verify-email");
  await page.goto(link);
  await expect(
    page.getByRole("heading", { name: "Email verified" }),
  ).toBeVisible();
  return link;
}

async function login(page: Page, email: string, value = password) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.locator("#password").fill(value);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Create your company Workspace",
      exact: true,
    }),
  ).toBeVisible();
}

async function tenantBrowserFixture(page: Page, seats = 6) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    emails = {
      owner: `owner-${suffix}@example.test`,
      member: `member-${suffix}@example.test`,
      admin: `admin-${suffix}@example.test`,
      invitee: `invitee-${suffix}@example.test`,
    },
    users = (
      await database.query(
        `insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)values($1,$1,'Browser Owner','active',now()),($2,$2,'Browser Member','active',now()),($3,$3,'Browser Admin','active',now()),($4,$4,'Browser Invitee','active',now())returning id`,
        Object.values(emails),
      )
    ).rows,
    workspace = (
      await database.query(
        `insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)values('Slice 4 Completion',$1,'active','growth','monthly',$2)returning id`,
        [`slice4-${suffix}`, users[0].id],
      )
    ).rows[0],
    roles = (
      await database.query(
        `insert into roles(workspace_id,code,permissions,is_system,policy_version)values($1,'owner','{}',true,'tenant-admin-v1'),($1,'admin','{}',true,'tenant-admin-v1'),($1,'member','{}',true,'tenant-admin-v1')returning id,code`,
        [workspace.id],
      )
    ).rows,
    role = (code: string) => roles.find((value) => value.code === code).id,
    members = (
      await database.query(
        `insert into workspace_memberships(workspace_id,user_id,role_id,status)values($1,$2,$5,'active'),($1,$3,$6,'active'),($1,$4,$7,'active')returning id,user_id,version`,
        [
          workspace.id,
          users[0].id,
          users[1].id,
          users[2].id,
          role("owner"),
          role("member"),
          role("admin"),
        ],
      )
    ).rows;
  await database.query(
    `insert into workspace_entitlement_snapshots(workspace_id,plan_code,catalog_version,effective_feature_flags,effective_limits)values($1,'growth','e2e','{}',$2)`,
    [workspace.id, JSON.stringify({ activeSeats: seats })],
  );
  const token = `browser-owner-${crypto.randomUUID()}`,
    session = (
      await database.query(
        `insert into sessions(user_id,session_hash,security_version,idle_expires_at,absolute_expires_at,authenticated_at,auth_method)values($1,$2,1,now()+interval '1 hour',now()+interval '1 day',now(),'password')returning id`,
        [
          users[0].id,
          keyedHash(token, "local-only-session-secret-change-me-32chars"),
        ],
      )
    ).rows[0];
  await page
    .context()
    .addCookies([
      { name: "nexaflow_session", value: token, url: "http://127.0.0.1:3000" },
    ]);
  return { emails, users, workspace, roles, members, token, session };
}

async function setServerAppearance(
  userId: string,
  appearance: "light" | "dark" | "system",
) {
  await database.query(
    `insert into user_preferences(user_id,appearance) values($1,$2) on conflict(user_id) do update set appearance=$2,version=user_preferences.version+1,updated_at=now()`,
    [userId, appearance],
  );
}

async function seedVisualCrm(
  fixture: Awaited<ReturnType<typeof tenantBrowserFixture>>,
) {
  const stage = (
    await database.query<{ id: string }>(
      "insert into pipeline_stages(workspace_id,name,position) values($1,'Qualified',0) returning id",
      [fixture.workspace.id],
    )
  ).rows[0];
  await database.query(
    `insert into leads(workspace_id,first_name,last_name,email_normalized,email_display,company,source,status,stage_id,owner_membership_id,visibility,created_at,updated_at) values($1,'Jordan','Lee','jordan.visual@example.test','jordan.visual@example.test','Acme North','website','open',$2,$3,'workspace','2026-08-20T12:00:00Z','2026-08-20T12:00:00Z')`,
    [fixture.workspace.id, stage.id, fixture.members[0].id],
  );
}

async function seedVisualPipeline(
  fixture: Awaited<ReturnType<typeof tenantBrowserFixture>>,
) {
  const stages = (
    await database.query<{ id: string; name: string }>(
      "insert into pipeline_stages(workspace_id,name,position) values($1,'New',0),($1,'Qualified',1),($1,'Proposal',2) returning id,name",
      [fixture.workspace.id],
    )
  ).rows;
  const stage = (name: string) => stages.find((item) => item.name === name)!.id;
  const leads = await database.query<{ id: string; first_name: string }>(
    `insert into leads(workspace_id,first_name,last_name,email_normalized,email_display,company,source,status,stage_id,owner_membership_id,visibility,created_at,updated_at) values($1,'Jordan','Lee','jordan.pipeline@example.test','jordan.pipeline@example.test','Acme North','website','open',$2,$4,'workspace','2026-08-20T12:00:00Z','2026-08-20T12:00:00Z'),($1,'Avery','Chen','avery.pipeline@example.test','avery.pipeline@example.test','Meridian Studio','referral','open',$3,$4,'workspace','2026-08-21T12:00:00Z','2026-08-21T12:00:00Z') returning id,first_name`,
    [
      fixture.workspace.id,
      stage("New"),
      stage("Qualified"),
      fixture.members[0].id,
    ],
  );
  const jordanId = leads.rows.find((lead) => lead.first_name === "Jordan")!.id;
  const averyId = leads.rows.find((lead) => lead.first_name === "Avery")!.id;
  const team = (
    await database.query<{ id: string }>(
      `insert into teams(workspace_id,name,name_normalized,status,created_by_membership_id) values($1,'Sales','sales','active',$2) returning id`,
      [fixture.workspace.id, fixture.members[0].id],
    )
  ).rows[0];
  await database.query(
    `insert into lead_activities(workspace_id,lead_id,kind,body,created_by_membership_id,created_at) values($1,$2,'created','Lead created.',$3,'2026-08-20T12:00:00Z'),($1,$2,'note','Requested a pricing follow-up.',$3,'2026-08-21T10:30:00Z')`,
    [fixture.workspace.id, jordanId, fixture.members[0].id],
  );
  return { jordanId, averyId, teamId: team.id };
}

async function visualBaseline(page: Page, name: string) {
  await page
    .locator("nextjs-portal")
    .evaluateAll((portals) => portals.forEach((portal) => portal.remove()));
  await expect(page).toHaveScreenshot(name, {
    fullPage: true,
    animations: "disabled",
  });
}

async function visualViewportBaseline(page: Page, name: string) {
  await page
    .locator("nextjs-portal")
    .evaluateAll((portals) => portals.forEach((portal) => portal.remove()));
  await expect(page).toHaveScreenshot(name, {
    fullPage: false,
    animations: "disabled",
  });
}

async function stabilizeCrmHome(page: Page) {
  await page
    .locator(".dashboard-section-heading>p")
    .first()
    .evaluate((element) => {
      element.textContent = "Generated Aug 24, 2026, 1:00 a.m. UTC";
    });
}

async function crmHomeResponsiveBaselines(page: Page, theme: "light" | "dark") {
  for (const [name, viewport] of [
    ["desktop", { width: 1280, height: 900 }],
    ["tablet", { width: 768, height: 900 }],
    ["mobile", { width: 320, height: 640 }],
    ["zoom200", { width: 640, height: 720 }],
  ] as const) {
    await page.setViewportSize(viewport);
    await visualBaseline(page, `spectrum-crm-home-${theme}-${name}.png`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

async function tabTo(page: Page, target: Locator) {
  for (let index = 0; index < 50; index += 1) {
    await page.keyboard.press("Tab");
    if (
      await target
        .evaluate((element) => element === document.activeElement)
        .catch(() => false)
    )
      return;
  }
  throw new Error("Keyboard traversal did not reach the requested control.");
}

function rgb(value: string) {
  return value
    .match(/[\d.]+/g)!
    .slice(0, 3)
    .map(Number);
}

function colorContrast(foreground: string, background: string) {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (value: string) => {
    const [red, green, blue] = rgb(value).map(channel);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

async function expectVisibleFocus(target: Locator, surface: Locator) {
  const style = await target.evaluate((element) => ({
    color: getComputedStyle(element).outlineColor,
    width: getComputedStyle(element).outlineWidth,
    offset: getComputedStyle(element).outlineOffset,
  }));
  const background = await surface.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(Number.parseFloat(style.width)).toBeGreaterThanOrEqual(2);
  expect(Number.parseFloat(style.offset)).toBeGreaterThanOrEqual(2);
  expect(colorContrast(style.color, background)).toBeGreaterThanOrEqual(3);
}

async function renderedTextContrast(target: Locator, surface: Locator) {
  const color = await target.evaluate(
    (element) => getComputedStyle(element).color,
  );
  const background = await surface.evaluate((element) => {
    let current: Element | null = element;
    while (current) {
      const value = getComputedStyle(current).backgroundColor;
      if (value !== "transparent" && !/rgba\([^)]*,\s*0(?:\.0+)?\)/.test(value))
        return value;
      current = current.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor;
  });
  return colorContrast(color, background);
}

async function installSpectrumStateSheet(page: Page) {
  await page.locator("#product-main").evaluate((element) => {
    element.innerHTML = `<section class="spectrum-state-sheet" aria-label="Spectrum component state sheet">
      <h1>Component states</h1>
      <article><h2>Primary buttons</h2><button class="primary">Primary default</button><button class="primary" data-state="hover">Primary hover</button><button class="primary" data-state="pressed">Primary pressed</button><button class="primary" data-state="focus">Primary focus</button><button class="primary" disabled>Primary disabled</button><button class="primary" disabled aria-busy="true">Saving…</button></article>
      <article><h2>Secondary buttons</h2><button class="secondary">Secondary default</button><button class="secondary" data-state="hover">Secondary hover</button><button class="secondary" data-state="pressed">Secondary pressed</button><button class="secondary" data-state="focus">Secondary focus</button><button class="secondary" disabled>Secondary disabled</button></article>
      <article><h2>Danger buttons</h2><button class="danger">Danger default</button><button class="danger" data-state="hover">Danger hover</button><button class="danger" data-state="pressed">Danger pressed</button><button class="danger" data-state="focus">Danger focus</button><button class="danger" disabled>Danger disabled</button></article>
      <article><h2>Links and compact controls</h2><a class="state-link" href="#default">Link default</a><a class="state-link" data-state="hover" href="#hover">Link hover</a><a class="state-link" data-state="pressed" href="#pressed">Link pressed</a><a class="state-link" data-state="focus" href="#focus">Link focus</a><a class="state-link" aria-disabled="true">Link disabled</a><button class="product-icon-action" aria-label="Icon default">×</button><button class="product-icon-action" data-state="hover" aria-label="Icon hover">×</button><button class="product-icon-action" data-state="pressed" aria-label="Icon pressed">×</button><button class="product-icon-action" data-state="focus" aria-label="Icon focus">×</button><button class="product-icon-action" aria-label="Icon disabled" aria-disabled="true">×</button><button class="menu-button" aria-label="Menu default">Menu default</button><button class="menu-button" data-state="hover" aria-label="Menu hover">Menu hover</button><button class="menu-button" data-state="pressed" aria-label="Menu pressed">Menu pressed</button><button class="menu-button" data-state="focus" aria-label="Menu focus">Menu focus</button><button class="menu-button" aria-label="Menu disabled" disabled>Menu disabled</button></article>
      <article><h2>Fields</h2><label class="field"><span>Input default</span><input value="Default" readonly></label><label class="field"><span>Input focus</span><input data-state="focus" value="Focused" readonly></label><label class="field"><span>Input invalid</span><input aria-invalid="true" value="Invalid" readonly></label><label class="field"><span>Input disabled</span><input value="Disabled" disabled></label><label class="field"><span>Select default</span><select><option>Selected</option></select></label><label class="field"><span>Select disabled</span><select disabled><option>Unavailable</option></select></label></article>
      <article><h2>Feedback</h2><div class="alert">Review this warning.</div><div class="alert success">Saved successfully.</div><div class="alert error">Action could not be completed.</div><div class="alert info">Additional information.</div></article>
      <article><h2>Badges</h2><span class="live-badge">Live</span><span class="demo-badge">Preview</span><span class="lead-status">Open</span><span class="lead-status won">Won</span><span class="lead-status lost">Lost</span></article>
      <article><h2>Panel</h2><div class="state-panel"><strong>Panel title</strong><p>Supporting panel metadata remains readable.</p></div></article>
      <article><h2>Table</h2><table class="state-table"><thead><tr><th>Customer</th><th>Status</th></tr></thead><tbody><tr><td>Acme North</td><td>Active</td></tr></tbody></table></article>
    </section>`;
  });
}

test("authenticated server theme is authoritative over empty, correct, stale, and unavailable cache", async ({
  page,
}) => {
  const fixture = await tenantBrowserFixture(page);
  await setServerAppearance(fixture.users[0].id, "light");
  let response = await page.goto("/crm");
  expect(await response!.text()).toContain('data-theme-preference="light"');
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("nexaflow-theme")))
    .toBe("light");

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

  await page.addInitScript(() =>
    Object.defineProperty(Storage.prototype, "getItem", {
      configurable: true,
      value: () => {
        throw new Error("storage unavailable");
      },
    }),
  );
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
  await page.setContent(
    `<meta http-equiv="Content-Security-Policy" content="script-src 'nonce-correct'"><script nonce="wrong">window.wrongNonceRan=true</script><script nonce="correct">window.correctNonceRan=true</script>`,
  );
  expect(
    await page.evaluate(() => ({
      wrong: (window as typeof window & { wrongNonceRan?: boolean })
        .wrongNonceRan,
      correct: (window as typeof window & { correctNonceRan?: boolean })
        .correctNonceRan,
    })),
  ).toEqual({ wrong: undefined, correct: true });
});

test("personal settings theme, paired baselines, keyboard focus, and responsive shells", async ({
  page,
}) => {
  const fixture = await tenantBrowserFixture(page);
  await seedVisualCrm(fixture);
  const consoleFailures: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|hydration|recoverable/i.test(message.text()))
      consoleFailures.push(message.text());
  });
  const response = await page.goto("/crm");
  const csp = response!.headers()["content-security-policy"];
  expect(csp).toContain("'strict-dynamic'");
  expect(csp.match(/script-src[^;]+/)?.[0]).not.toContain("'unsafe-inline'");
  expect(response!.headers()["cache-control"]).toMatch(/no-cache|no-store/);
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  expect(
    await page
      .locator("#nexaflow-theme")
      .evaluate((script: HTMLScriptElement) => script.nonce),
  ).toBe(nonce);
  await expect(
    page.getByRole("link", { name: "Personal settings" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Personal settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(
    page.getByRole("heading", { name: "Personal settings" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Display name" })).toHaveValue(
    "Browser Owner",
  );
  await page.getByRole("combobox", { name: "Theme" }).selectOption("light");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status")).toContainText("Preferences updated.");
  await visualBaseline(page, "design-system-personal-settings-light.png");
  await page.setViewportSize({ width: 320, height: 640 });
  await visualBaseline(page, "spectrum-personal-settings-light-mobile.png");
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(
    await page
      .locator(".eyebrow")
      .first()
      .evaluate((element) => getComputedStyle(element).fontWeight),
  ).toBe("500");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("combobox", { name: "Theme" }).selectOption("system");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status")).toHaveText("Preferences updated.");
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-preference",
    "system",
  );
  await expect
    .poll(
      async () =>
        (
          await database.query<{ appearance: string }>(
            "select appearance from user_preferences where user_id=$1",
            [fixture.users[0].id],
          )
        ).rows[0]?.appearance,
    )
    .toBe("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-preference",
    "system",
  );

  await page.route("**/api/account/preferences", async (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ code: "test_failure" }),
        })
      : route.continue(),
  );
  await page.getByRole("combobox", { name: "Theme" }).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status")).toContainText(
    "last saved theme has been restored",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.unroute("**/api/account/preferences");

  await page.getByRole("combobox", { name: "Theme" }).selectOption("dark");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status")).toHaveText("Preferences updated.");
  await expect
    .poll(
      async () =>
        (
          await database.query<{ appearance: string }>(
            "select appearance from user_preferences where user_id=$1",
            [fixture.users[0].id],
          )
        ).rows[0]?.appearance,
    )
    .toBe("dark");
  await visualBaseline(page, "design-system-personal-settings-dark.png");
  await page.setViewportSize({ width: 320, height: 640 });
  await visualBaseline(page, "spectrum-personal-settings-dark-mobile.png");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/crm");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Jordan Lee" })).toBeVisible();
  await visualBaseline(page, "design-system-crm-dark.png");
  await page.goto("/crm/home");
  await expect(page.getByRole("heading", { name: "CRM home" })).toBeVisible();
  await stabilizeCrmHome(page);
  await crmHomeResponsiveBaselines(page, "dark");
  await page.goto("/crm");
  await expect(page.getByRole("link", { name: "Jordan Lee" })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 640 });
  await visualBaseline(page, "spectrum-crm-shell-dark-mobile.png");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/workspace/settings");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await visualBaseline(page, "design-system-workspace-admin-dark.png");
  await page.setViewportSize({ width: 320, height: 640 });
  await visualBaseline(page, "spectrum-admin-shell-dark-mobile.png");
  await page.setViewportSize({ width: 768, height: 900 });
  await visualBaseline(page, "spectrum-admin-shell-dark-tablet.png");
  await page.getByRole("button", { name: "Open workspace navigation" }).click();
  await visualViewportBaseline(page, "spectrum-admin-drawer-dark-tablet.png");
  await page
    .getByRole("button", { name: "Close workspace navigation" })
    .last()
    .click();

  await setServerAppearance(fixture.users[0].id, "light");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/crm");
  await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Jordan Lee" })).toBeVisible();
  await visualBaseline(page, "design-system-crm-light.png");
  await page.goto("/crm/home");
  await expect(page.getByRole("heading", { name: "CRM home" })).toBeVisible();
  await stabilizeCrmHome(page);
  await crmHomeResponsiveBaselines(page, "light");
  await page.goto("/crm");
  await expect(page.getByRole("link", { name: "Jordan Lee" })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 640 });
  await visualBaseline(page, "spectrum-crm-shell-light-mobile.png");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/workspace/settings");
  await visualBaseline(page, "design-system-workspace-admin-light.png");
  await page.setViewportSize({ width: 320, height: 640 });
  await visualBaseline(page, "spectrum-admin-shell-light-mobile.png");
  await page.setViewportSize({ width: 768, height: 900 });
  await visualBaseline(page, "spectrum-admin-shell-light-tablet.png");
  await page.getByRole("button", { name: "Open workspace navigation" }).click();
  await visualViewportBaseline(page, "spectrum-admin-drawer-light-tablet.png");
  await page
    .getByRole("button", { name: "Close workspace navigation" })
    .last()
    .click();

  const tabletMenu = page.getByRole("button", {
    name: "Open workspace navigation",
  });
  await expect(tabletMenu).toBeFocused();
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  const focusStyle = await focused.evaluate((element) => ({
    width: getComputedStyle(element).outlineWidth,
    offset: getComputedStyle(element).outlineOffset,
  }));
  expect(focusStyle).toEqual({ width: "2px", offset: "2px" });
  await page.setViewportSize({ width: 320, height: 640 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const menu = page.getByRole("button", { name: "Open workspace navigation" });
  const box = await menu.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Close workspace navigation" }).last(),
  ).toBeFocused();
  await visualViewportBaseline(page, "design-system-mobile-drawer-light.png");
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await setServerAppearance(fixture.users[0].id, "dark");
  await page.reload();
  await page.getByRole("button", { name: "Open workspace navigation" }).click();
  await visualViewportBaseline(page, "design-system-mobile-drawer-dark.png");

  await page.setViewportSize({ width: 640, height: 720 });
  await page.goto("/settings");
  await page.getByRole("textbox", { name: "Display name" }).focus();
  const focusBox = await page
    .getByRole("textbox", { name: "Display name" })
    .boundingBox();
  expect(focusBox!.x).toBeGreaterThanOrEqual(0);
  expect(focusBox!.x + focusBox!.width).toBeLessThanOrEqual(640);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(consoleFailures).toEqual([]);
});

test("Workspace navigation states and representative controls retain keyboard focus in both themes", async ({
  page,
}) => {
  const fixture = await tenantBrowserFixture(page);
  for (const theme of ["light", "dark"] as const) {
    await setServerAppearance(fixture.users[0].id, theme);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/crm");
    await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
    await page.goto("/workspace/settings");
    await expect(
      page.getByRole("heading", { name: "Workspace settings" }),
    ).toBeVisible();
    const aside = page.locator(".admin-shell>aside");
    const nav = aside.getByRole("navigation", { name: "Workspace navigation" });
    const defaultLink = nav.getByRole("link", { name: "CRM overview" });
    const activeLink = nav.getByRole("link", { name: "Workspace settings" });
    expect(
      await renderedTextContrast(defaultLink, aside),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      await renderedTextContrast(defaultLink, aside),
    ).toBeGreaterThanOrEqual(4.5);
    expect(await activeLink.getAttribute("aria-current")).toBe("page");
    expect(
      await renderedTextContrast(activeLink, aside),
    ).toBeGreaterThanOrEqual(4.5);
    await defaultLink.hover();
    expect(
      await renderedTextContrast(defaultLink, aside),
    ).toBeGreaterThanOrEqual(4.5);
    const box = await defaultLink.boundingBox();
    await page.mouse.move(box!.x + 8, box!.y + 8);
    await page.mouse.down();
    expect(
      await renderedTextContrast(defaultLink, aside),
    ).toBeGreaterThanOrEqual(4.5);
    await page.mouse.move(0, 0);
    await page.mouse.up();
    await defaultLink.evaluate((element) =>
      element.setAttribute("aria-disabled", "true"),
    );
    expect(
      await renderedTextContrast(defaultLink, aside),
    ).toBeGreaterThanOrEqual(4.5);
    await defaultLink.evaluate((element) =>
      element.removeAttribute("aria-disabled"),
    );
    await page
      .locator("body")
      .press("Home")
      .catch(() => undefined);
    await tabTo(page, defaultLink);
    await expectVisibleFocus(defaultLink, aside);

    const accountTrigger = page
      .locator(".product-topbar")
      .getByRole("button", { name: "Account menu" });
    expect((await accountTrigger.boundingBox())!.height).toBeGreaterThanOrEqual(
      44,
    );
    await tabTo(page, accountTrigger);
    await accountTrigger.press("Enter");
    const accountMenu = page.getByRole("menu", { name: "Account menu" });
    const personalSettings = accountMenu.getByRole("menuitem", {
      name: "Personal settings",
    });
    const signOut = accountMenu.getByRole("menuitem", { name: "Sign out" });
    await expect(personalSettings).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(signOut).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(accountMenu).toBeHidden();
    await expect(accountTrigger).toBeFocused();
    await accountTrigger.click();
    await visualViewportBaseline(
      page,
      `spectrum-account-menu-${theme}-desktop.png`,
    );
    await page.getByRole("heading", { name: "Workspace settings" }).click();
    await expect(accountMenu).toBeHidden();
    await expect(accountTrigger).toBeFocused();
    await accountTrigger.click();
    await page.route(
      "**/api/auth/logout",
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "unexpected_error" } }),
        });
      },
      { times: 1 },
    );
    await accountMenu.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(
      accountMenu.getByRole("menuitem", { name: "Signing out…" }),
    ).toBeDisabled();
    await expect(accountMenu.getByRole("alert")).toContainText(
      "session remains active",
    );
    await visualViewportBaseline(
      page,
      `spectrum-account-menu-${theme}-error.png`,
    );
    await page.unroute("**/api/auth/logout");
    await accountMenu.getByRole("menuitem", { name: "Personal settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(
      page.getByRole("heading", { name: "Personal settings" }),
    ).toBeVisible();

    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "Personal settings" }),
    ).toBeVisible();
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
      const focusedBox = await target.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      });
      const focusName = await target.evaluate(
        (element) =>
          element.getAttribute("aria-label") ||
          element.textContent?.trim() ||
          element.tagName,
      );
      expect(focusedBox!.y, focusName).toBeGreaterThanOrEqual(0);
      expect(focusedBox!.y + focusedBox!.height, focusName).toBeLessThanOrEqual(
        900,
      );
    }
    expect(await targets[2].getAttribute("class")).toContain("primary");
    expect(await targets[4].getAttribute("class")).toContain("secondary");
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto("/crm");
    const mobileAccount = page
      .locator(".product-mobile")
      .getByRole("button", { name: "Account menu" });
    expect((await mobileAccount.boundingBox())!.height).toBeGreaterThanOrEqual(
      44,
    );
    await mobileAccount.click();
    await expect(
      page.getByRole("menu", { name: "Account menu" }),
    ).toBeVisible();
    await visualViewportBaseline(
      page,
      `spectrum-account-menu-${theme}-mobile.png`,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(mobileAccount).toBeFocused();
    await page.setViewportSize({ width: 640, height: 720 });
    await page.goto("/settings");
    const zoomProxyInput = page.getByRole("textbox", { name: "Display name" });
    await tabTo(page, zoomProxyInput);
    await expectVisibleFocus(zoomProxyInput, page.locator(".account-shell"));
    await zoomProxyInput.scrollIntoViewIfNeeded();
    const zoomProxyBox = await zoomProxyInput.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    });
    expect(zoomProxyBox!.x).toBeGreaterThanOrEqual(0);
    expect(zoomProxyBox!.x + zoomProxyBox!.width).toBeLessThanOrEqual(640);
    expect(zoomProxyBox!.y).toBeGreaterThanOrEqual(0);
    expect(zoomProxyBox!.y + zoomProxyBox!.height).toBeLessThanOrEqual(720);
    await page.setViewportSize({ width: 1280, height: 720 });
  }
});

test("server-filtered navigation reconciles persisted Owner, Member, and Admin roles", async ({
  page,
}) => {
  const fixture = await tenantBrowserFixture(page);
  const roleId = (code: string) =>
    fixture.roles.find((item) => item.code === code)!.id;
  await page.goto("/crm");
  await expect(
    page.getByRole("link", { name: "Workspace settings" }),
  ).toBeVisible();
  await database.query(
    "update workspace_memberships set role_id=$1,version=version+1 where id=$2",
    [roleId("member"), fixture.members[0].id],
  );
  await page.reload();
  await expect(page.getByText("member", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Workspace settings" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Personal settings" }),
  ).toBeVisible();
  await database.query(
    "update workspace_memberships set role_id=$1,version=version+1 where id=$2",
    [roleId("admin"), fixture.members[0].id],
  );
  await page.reload();
  await expect(page.getByText("admin", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "People and roles" }),
  ).toBeVisible();
});

test("skip link is first, visibly focused, and reaches the stable main landmark", async ({
  page,
}) => {
  const fixture = await tenantBrowserFixture(page);
  for (const theme of ["light", "dark"] as const) {
    await setServerAppearance(fixture.users[0].id, theme);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 760 });
      await page.goto("/crm");
      await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
      await page.waitForLoadState("networkidle");
      await page
        .locator("nextjs-portal")
        .evaluateAll((portals) => portals.forEach((portal) => portal.remove()));
      await page.evaluate(() =>
        (document.activeElement as HTMLElement | null)?.blur(),
      );
      const skip = page.getByRole("link", { name: "Skip to main content" });
      expect(
        await page.evaluate(() =>
          Array.from(
            document.querySelectorAll<HTMLElement>(
              'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
            ),
          )
            .find((element) => element.getClientRects().length > 0)
            ?.classList.contains("skip-link"),
        ),
      ).toBe(true);
      await tabTo(page, skip);
      await expect(skip).toBeFocused();
      await expectVisibleFocus(skip, page.locator("body"));
      await page.keyboard.press("Enter");
      await expect(page.locator("#product-main")).toBeFocused();
    }
  }
});

test("modal drawer isolates, scroll-locks, closes, and cleans up at phone and tablet widths", async ({
  page,
}) => {
  const fixture = await tenantBrowserFixture(page);
  const backgroundSelectors = [
    ".skip-link",
    ".product-rail",
    ".product-topbar",
    ".product-mobile>div:first-child",
    ".product-mobile>.menu-button",
    "#product-main",
  ];
  const backgroundState = () =>
    page.locator(backgroundSelectors.join(",")).evaluateAll((elements) =>
      elements.map((element) => ({
        selector: element.id || Array.from(element.classList).sort().join("."),
        inert: (element as HTMLElement).inert,
        ariaHidden: element.getAttribute("aria-hidden"),
        tabindex: element.getAttribute("tabindex"),
        descendants: Array.from(
          element.querySelectorAll<HTMLElement>(
            "a[href],button,input,select,textarea,[tabindex]",
          ),
        ).map((node) => node.getAttribute("tabindex")),
      })),
    );
  const assertRestored = async (
    original: Awaited<ReturnType<typeof backgroundState>>,
  ) => {
    await expect.poll(backgroundState).toEqual(original);
    expect(
      await page.evaluate(() => ({
        body: document.body.style.overflow,
        html: document.documentElement.style.overflow,
      })),
    ).toEqual({ body: "", html: "" });
  };
  const assertCleanRouteState = async () => {
    for (const item of await backgroundState()) {
      expect(item.inert, item.selector).toBe(false);
      expect(item.ariaHidden, item.selector).toBeNull();
      expect(
        item.descendants.every((tabindex) => tabindex === null),
        item.selector,
      ).toBe(true);
    }
    expect(
      await page.evaluate(() => ({
        body: document.body.style.overflow,
        html: document.documentElement.style.overflow,
      })),
    ).toEqual({ body: "", html: "" });
  };
  for (const theme of ["light", "dark"] as const) {
    await setServerAppearance(fixture.users[0].id, theme);
    for (const viewport of [
      { width: 320, height: 640 },
      { width: 768, height: 500 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/crm");
      const trigger = page.getByRole("button", { name: "Open CRM navigation" });
      const original = await backgroundState();
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "CRM navigation" });
      const closeButton = dialog.getByRole("button", {
        name: "Close CRM navigation",
      });
      await expect(closeButton).toBeFocused();
      const closeBox = await closeButton.boundingBox();
      expect(closeBox!.width).toBeGreaterThanOrEqual(44);
      expect(closeBox!.height).toBeGreaterThanOrEqual(44);
      for (const selector of backgroundSelectors) {
        const element = page.locator(selector);
        await expect(element).toHaveAttribute("aria-hidden", "true");
        expect(
          await element.evaluate((node) => (node as HTMLElement).inert),
          selector,
        ).toBe(true);
        if (
          await element.evaluate((node) => node.matches("a,button,[tabindex]"))
        )
          await expect(element).toHaveAttribute("tabindex", "-1");
        expect(
          await element.evaluate((node) =>
            Array.from(
              node.querySelectorAll<HTMLElement>(
                "a[href],button,input,select,textarea,[tabindex]",
              ),
            ).every((focusable) => focusable.getAttribute("tabindex") === "-1"),
          ),
          selector,
        ).toBe(true);
      }
      const escapedFocus = await page.evaluate((selectors) => {
        const escaped: string[] = [];
        for (const selector of selectors) {
          const root = document.querySelector<HTMLElement>(selector);
          if (!root) continue;
          const candidates = [
            ...(root.matches("a[href],button,input,select,textarea,[tabindex]")
              ? [root]
              : []),
            ...root.querySelectorAll<HTMLElement>(
              "a[href],button,input,select,textarea,[tabindex]",
            ),
          ];
          for (const candidate of candidates) {
            candidate.focus();
            if (document.activeElement === candidate) escaped.push(selector);
          }
        }
        return escaped;
      }, backgroundSelectors);
      expect(escapedFocus).toEqual([]);
      await expect(closeButton).toBeFocused();
      const closeColors = async () =>
        closeButton.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            color: style.color,
            background: style.backgroundColor,
            border: style.borderColor,
          };
        });
      let colors = await closeColors();
      expect(
        colorContrast(colors.color, colors.background),
      ).toBeGreaterThanOrEqual(3);
      await closeButton.hover();
      colors = await closeColors();
      expect(
        colorContrast(colors.color, colors.background),
      ).toBeGreaterThanOrEqual(3);
      const closeCenter = await closeButton.boundingBox();
      await page.mouse.move(closeCenter!.x + 22, closeCenter!.y + 22);
      await page.mouse.down();
      colors = await closeColors();
      expect(
        colorContrast(colors.color, colors.background),
      ).toBeGreaterThanOrEqual(3);
      await page.mouse.move(0, 0);
      await page.mouse.up();
      await closeButton.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(closeButton).toBeFocused();
      await expectVisibleFocus(closeButton, dialog);
      await closeButton.evaluate((element) => {
        (element as HTMLButtonElement).disabled = true;
      });
      colors = await closeColors();
      expect(
        colorContrast(colors.color, colors.background),
      ).toBeGreaterThanOrEqual(3);
      await closeButton.evaluate((element) => {
        (element as HTMLButtonElement).disabled = false;
      });
      await closeButton.focus();
      expect(
        await page.evaluate(() => ({
          body: document.body.style.overflow,
          html: document.documentElement.style.overflow,
        })),
      ).toEqual({ body: "hidden", html: "hidden" });
      const pageScroll = await page.evaluate(() => scrollY);
      await page.mouse.wheel(0, 500);
      expect(await page.evaluate(() => scrollY)).toBe(pageScroll);
      const panelScroll = await dialog.evaluate((element) => {
        const scrollable = element.scrollHeight > element.clientHeight;
        element.scrollTop = element.scrollHeight;
        return {
          overflow: getComputedStyle(element).overflowY,
          scrollable,
          top: element.scrollTop,
        };
      });
      expect(["auto", "scroll"]).toContain(panelScroll.overflow);
      if (panelScroll.scrollable) expect(panelScroll.top).toBeGreaterThan(0);
      await page
        .locator("#product-main a[href='/crm/leads/new']")
        .first()
        .evaluate((element) => (element as HTMLElement).focus());
      await expect(closeButton).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(
        dialog.getByRole("button", { name: "Sign out" }),
      ).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(closeButton).toBeFocused();
      await closeButton.click();
      await expect(trigger).toBeFocused();
      await assertRestored(original);

      await trigger.click();
      await page.locator(".menu-backdrop").click({ position: { x: 4, y: 4 } });
      await expect(trigger).toBeFocused();
      await assertRestored(original);
      await trigger.click();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await assertRestored(original);
      await trigger.click();
      await dialog.getByRole("link", { name: "Home" }).click();
      await expect(page).toHaveURL(/\/crm\/home$/);
      await expect(dialog).toHaveCount(0);
      await expect(trigger).not.toBeFocused();
      await assertCleanRouteState();
      await page.goto("/crm");
      await page.getByRole("button", { name: "Open CRM navigation" }).click();
      await page.evaluate(() => history.pushState({}, "", "/crm/pipeline"));
      await expect(dialog).toHaveCount(0);
      await expect(trigger).not.toBeFocused();
      expect(
        await page
          .locator("#product-main")
          .evaluate((element) => (element as HTMLElement).inert),
      ).toBe(false);
      expect(
        await page.evaluate(() => document.documentElement.style.overflow),
      ).toBe("");
      await assertCleanRouteState();
      await page.goto("/crm");
      await page.getByRole("button", { name: "Open CRM navigation" }).click();
      await page.goto("/settings");
      await expect(
        page.getByRole("heading", { name: "Personal settings" }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => ({
          body: document.body.style.overflow,
          html: document.documentElement.style.overflow,
        })),
      ).toEqual({ body: "", html: "" });
      await expect(page.locator(".skip-link")).toHaveCount(0);
    }
  }
  await page.emulateMedia({ forcedColors: "active" });
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/crm");
  await page.getByRole("button", { name: "Open CRM navigation" }).click();
  const forcedClose = page
    .getByRole("dialog", { name: "CRM navigation" })
    .getByRole("button", { name: "Close CRM navigation" });
  expect(
    await forcedClose.evaluate((element) => ({
      border: getComputedStyle(element).borderStyle,
      stroke: getComputedStyle(element.querySelector("svg")!).stroke,
    })),
  ).toEqual(
    expect.objectContaining({ border: expect.not.stringMatching(/^none$/) }),
  );
  expect(
    await forcedClose.evaluate(
      (element) => getComputedStyle(element.querySelector("svg")!).stroke,
    ),
  ).not.toBe("none");
});

test("CRM Home preview is semantically contained and reflows without clipping", async ({
  page,
}) => {
  const fixture = await tenantBrowserFixture(page);
  for (const theme of ["light", "dark"] as const) {
    await setServerAppearance(fixture.users[0].id, theme);
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 768, height: 900 },
      { width: 320, height: 640 },
      { width: 640, height: 720 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/crm/home");
      await expect(
        page.getByRole("heading", { name: "CRM home" }),
      ).toBeVisible();
      const region = page.locator(".demo-region");
      const card = region.locator("article").first();
      const welcome = page.locator(".dashboard-welcome");
      await expect(
        region.getByRole("heading", { name: "Coming next" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `${theme} ${viewport.width}`,
      ).toBe(true);
      expect(
        await region.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const textNodes = element.querySelectorAll<HTMLElement>(
            "h2,h3,strong,p,small,.demo-badge,.coming-label",
          );
          return {
            withinViewport: box.left >= 0 && box.right <= window.innerWidth + 1,
            unclipped: Array.from(textNodes).every(
              (node) =>
                node.scrollWidth <= node.clientWidth + 1 &&
                node.scrollHeight <= node.clientHeight + 1,
            ),
          };
        }),
      ).toEqual({ withinViewport: true, unclipped: true });
      expect(
        await welcome.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const clipped = Array.from(
            element.querySelectorAll<HTMLElement>("h2,p,a,strong,span"),
          )
            .filter((node) => node.scrollWidth > node.clientWidth + 1)
            .map((node) => `${node.tagName}:${node.textContent?.trim()}`);
          return {
            withinViewport: box.left >= 0 && box.right <= window.innerWidth + 1,
            clipped,
          };
        }),
      ).toEqual({ withinViewport: true, clipped: [] });
      const main = page.locator(".product-main");
      for (const target of [
        region.getByRole("heading", { name: "Coming next" }),
        card.getByRole("heading").first(),
        card.locator("strong"),
        card.locator("p"),
        card.locator("small"),
        card.locator(".demo-badge"),
        card.locator(".coming-label"),
      ]) {
        expect(
          await renderedTextContrast(target, target),
          `${theme} ${viewport.width} ${await target.textContent()}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      const boundary = await card.evaluate((element) => ({
        border: getComputedStyle(element).borderColor,
        background: getComputedStyle(element).backgroundColor,
      }));
      const adjacent = await main.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      expect(
        Math.min(
          colorContrast(boundary.border, boundary.background),
          colorContrast(boundary.border, adjacent),
        ),
      ).toBeGreaterThanOrEqual(3);
    }
  }
});

test("shared Spectrum component sheet covers S09 interaction and feedback states", async ({
  page,
}) => {
  const fixture = await tenantBrowserFixture(page);
  for (const theme of ["light", "dark"] as const) {
    await setServerAppearance(fixture.users[0].id, theme);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/crm");
    await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await installSpectrumStateSheet(page);
    const surface = page.locator(".spectrum-state-sheet");
    for (const name of [
      "Primary default",
      "Primary hover",
      "Primary pressed",
      "Primary focus",
      "Primary disabled",
      "Saving…",
      "Secondary default",
      "Secondary hover",
      "Secondary pressed",
      "Secondary focus",
      "Secondary disabled",
      "Danger default",
      "Danger hover",
      "Danger pressed",
      "Danger focus",
      "Danger disabled",
      "Icon disabled",
      "Menu disabled",
    ]) {
      const control = page.getByRole(
        name === "Icon disabled" ? "button" : "button",
        { name },
      );
      const styles = await control.evaluate((element) => ({
        opacity: getComputedStyle(element).opacity,
        color: getComputedStyle(element).color,
        background: getComputedStyle(element).backgroundColor,
        border: getComputedStyle(element).borderColor,
      }));
      expect(styles.opacity).toBe("1");
      expect(
        colorContrast(styles.color, styles.background),
        name,
      ).toBeGreaterThanOrEqual(4.5);
      const parentBackground = await surface.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      expect(
        colorContrast(styles.border, parentBackground),
        name,
      ).toBeGreaterThanOrEqual(3);
    }
    for (const name of [
      "Icon default",
      "Icon hover",
      "Icon pressed",
      "Icon focus",
      "Menu default",
      "Menu hover",
      "Menu pressed",
      "Menu focus",
    ]) {
      const control = page.getByRole("button", { name });
      expect(
        await renderedTextContrast(control, control),
        name,
      ).toBeGreaterThanOrEqual(4.5);
    }
    for (const name of [
      "Link default",
      "Link hover",
      "Link pressed",
      "Link focus",
      "Link disabled",
    ]) {
      const link = page.getByText(name, { exact: true });
      expect(
        await renderedTextContrast(link, link),
        name,
      ).toBeGreaterThanOrEqual(4.5);
    }
    for (const label of [
      "Input default",
      "Input focus",
      "Input invalid",
      "Input disabled",
      "Select default",
      "Select disabled",
    ]) {
      const field = page.getByLabel(label);
      expect(
        await renderedTextContrast(field, field),
        label,
      ).toBeGreaterThanOrEqual(4.5);
      const fieldBoundary = await field.evaluate((element) => ({
        border: getComputedStyle(element).borderColor,
        background: getComputedStyle(element).backgroundColor,
        adjacent: getComputedStyle(element.closest("article")!).backgroundColor,
      }));
      expect(
        Math.min(
          colorContrast(fieldBoundary.border, fieldBoundary.background),
          colorContrast(fieldBoundary.border, fieldBoundary.adjacent),
        ),
        `${label} boundary`,
      ).toBeGreaterThanOrEqual(3);
    }
    for (const text of [
      "Review this warning.",
      "Saved successfully.",
      "Action could not be completed.",
      "Additional information.",
      "Live",
      "Preview",
      "Open",
      "Won",
      "Lost",
      "Panel title",
      "Supporting panel metadata remains readable.",
      "Customer",
      "Acme North",
    ]) {
      const target = page.getByText(text, { exact: true });
      expect(
        await renderedTextContrast(target, target),
        text,
      ).toBeGreaterThanOrEqual(4.5);
    }
    for (const name of [
      "Primary focus",
      "Secondary focus",
      "Danger focus",
      "Link focus",
      "Icon focus",
      "Menu focus",
    ]) {
      const target = /^(?:Icon|Menu)/.test(name)
        ? page.getByRole("button", { name })
        : page.getByText(name, { exact: true });
      await expectVisibleFocus(target, surface);
    }
    for (const selector of [".state-panel", ".state-table th", ".alert"]) {
      const component = surface.locator(selector).first();
      const boundary = await component.evaluate((element) => ({
        border: getComputedStyle(element).borderColor,
        background: getComputedStyle(element).backgroundColor,
        adjacent: getComputedStyle(element.parentElement!).backgroundColor,
      }));
      expect(
        Math.max(
          colorContrast(boundary.border, boundary.background),
          colorContrast(boundary.border, boundary.adjacent),
        ),
        selector,
      ).toBeGreaterThanOrEqual(3);
    }
    await visualBaseline(page, `spectrum-component-states-${theme}.png`);
  }
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/crm");
  await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await installSpectrumStateSheet(page);
  const forcedSheet = page.locator(".spectrum-state-sheet");
  await visualBaseline(page, "spectrum-component-states-forced-colors.png");
  const forced = page.getByRole("button", { name: "Primary disabled" });
  expect(
    await forced.evaluate((element) => getComputedStyle(element).borderStyle),
  ).not.toBe("none");
  expect(
    await forced.evaluate((element) => getComputedStyle(element).opacity),
  ).toBe("1");
  for (const selector of [
    "button",
    "input",
    "select",
    ".alert",
    ".state-panel",
    ".state-table th",
  ]) {
    expect(
      await forcedSheet
        .locator(selector)
        .first()
        .evaluate((element) => getComputedStyle(element).borderStyle),
      selector,
    ).not.toBe("none");
  }
});

test("shell reflows across required breakpoints and orientation changes", async ({
  page,
}) => {
  await tenantBrowserFixture(page);
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 600, height: 800 },
    { width: 390, height: 844 },
    { width: 360, height: 800 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/crm");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      JSON.stringify(viewport),
    ).toBe(true);
    const menu = page.getByRole("button", { name: "Open CRM navigation" });
    if (viewport.width <= 900) await expect(menu).toBeVisible();
    else await expect(menu).toBeHidden();
  }
});

test("Spectrum shell honors forced colours and reduced motion", async ({
  page,
}) => {
  await tenantBrowserFixture(page);
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.goto("/crm");
  const current = page
    .getByRole("navigation", { name: "CRM navigation" })
    .getByRole("link", { name: "Leads" });
  expect(
    await current.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).not.toBe("none");
  const transition = await current.evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );
  expect(
    transition.split(",").every((value) => Number.parseFloat(value) <= 0.01),
  ).toBe(true);
  const account = page
    .locator(".product-topbar")
    .getByRole("button", { name: "Account menu" });
  await account.click();
  const accountMenu = page.getByRole("menu", { name: "Account menu" });
  await expect(accountMenu).toBeVisible();
  expect(
    await account.evaluate(
      (element) => getComputedStyle(element).borderTopStyle,
    ),
  ).not.toBe("none");
  expect(
    await accountMenu.evaluate(
      (element) => getComputedStyle(element).borderTopStyle,
    ),
  ).not.toBe("none");
});

test("Pipeline semantic surfaces retain paired contrast, interaction, and responsive behavior", async ({
  page,
}) => {
  const fixture = await tenantBrowserFixture(page);
  const visual = await seedVisualPipeline(fixture);
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
    expect(
      await renderedTextContrast(
        populatedStage.getByRole("heading", { name: /New/ }),
        populatedStage,
      ),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      await renderedTextContrast(count, populatedStage),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      await renderedTextContrast(
        card.getByRole("link", { name: "Jordan Lee" }),
        card,
      ),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      await renderedTextContrast(card.locator(".pipeline-company"), card),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      await renderedTextContrast(card.locator(".pipeline-owner"), card),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      await renderedTextContrast(card.locator(".pipeline-visibility"), card),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      await renderedTextContrast(
        emptyStage.locator(".pipeline-empty-stage"),
        emptyStage,
      ),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      await renderedTextContrast(
        page.locator(".crm-preview>aside .brand b"),
        page.locator(".crm-preview>aside"),
      ),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      await renderedTextContrast(
        page.locator(".crm-preview>.product-topbar .admin-workspace b"),
        page.locator(".crm-preview>.product-topbar"),
      ),
    ).toBeGreaterThanOrEqual(4.5);
    const defaultCardBorder = await card.evaluate(
      (element) => getComputedStyle(element).borderColor,
    );
    await card.hover();
    expect(
      await card.evaluate((element) => getComputedStyle(element).borderColor),
    ).not.toBe(defaultCardBorder);
    await page.mouse.move(0, 0);
    await tabTo(page, changeStage);
    await expectVisibleFocus(changeStage, card);
    expect(
      await renderedTextContrast(changeStage, card),
    ).toBeGreaterThanOrEqual(4.5);
    await visualBaseline(page, `design-system-pipeline-${theme}.png`);

    await page.goto("/crm/pipeline?q=not-a-real-lead");
    const empty = page.locator(".empty");
    await expect(
      page.getByRole("heading", { name: "No leads match these filters." }),
    ).toBeVisible();
    expect(
      await renderedTextContrast(empty.getByRole("heading"), empty),
    ).toBeGreaterThanOrEqual(4.5);

    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/crm/pipeline");
    await expect(page.getByRole("link", { name: "Jordan Lee" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const mobileCard = page.locator(".pipeline-lead-card").first();
    const mobileBox = await mobileCard.boundingBox();
    expect(mobileBox!.x).toBeGreaterThanOrEqual(0);
    expect(mobileBox!.x + mobileBox!.width).toBeLessThanOrEqual(320);
    const mobileAction = mobileCard.getByRole("link", { name: "Change stage" });
    expect((await mobileAction.boundingBox())!.height).toBeGreaterThanOrEqual(
      44,
    );
    await visualBaseline(page, `spectrum-pipeline-${theme}-mobile.png`);

    await page.setViewportSize({ width: 640, height: 720 });
    await page.goto("/crm/pipeline");
    await expect(page.getByRole("link", { name: "Jordan Lee" })).toBeVisible();
    const zoomAction = page
      .locator(".pipeline-lead-card")
      .first()
      .getByRole("link", { name: "Change stage" });
    await tabTo(page, zoomAction);
    await zoomAction.scrollIntoViewIfNeeded();
    await expectVisibleFocus(
      zoomAction,
      page.locator(".pipeline-lead-card").first(),
    );
    const zoomBox = await zoomAction.boundingBox();
    expect(zoomBox!.x).toBeGreaterThanOrEqual(0);
    expect(zoomBox!.x + zoomBox!.width).toBeLessThanOrEqual(640);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    for (const width of [768, 640]) {
      await page.setViewportSize({ width, height: 820 });
      await page.goto("/crm");
      await expect(page.getByRole("link", { name: "Jordan Lee" })).toBeVisible();
      const leadAction = page.getByRole("link", { name: "Add lead" });
      await tabTo(page, leadAction);
      await expectVisibleFocus(leadAction, page.locator(".admin-content"));
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await visualViewportBaseline(
        page,
        `spectrum-leads-${theme}-${width === 768 ? "tablet" : "zoom200"}.png`,
      );
      await page.goto("/crm/pipeline");
      await expect(page.getByRole("link", { name: "Jordan Lee" })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await visualViewportBaseline(
        page,
        `spectrum-pipeline-${theme}-${width === 768 ? "tablet" : "zoom200"}.png`,
      );
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/crm/leads/new");
    await page.getByLabel("First name").fill("Morgan");
    await page.getByLabel("Last name").fill("Reed");
    await page.getByLabel("Work email").fill("morgan.reed@example.test");
    await page.getByLabel("Company").fill("Northstar Labs");
    await page.getByLabel("Phone").fill("+1 416 555 0100");
    await page.getByLabel("Lead source").selectOption("website");
    await page.getByLabel("First note").fill("Requested a product walkthrough.");
    await page.getByLabel("Owner, admins, and selected teams").check();
    await page.getByRole("checkbox", { name: "Sales" }).check();
    const createInput = page.getByLabel("First name");
    await createInput.focus();
    await expectVisibleFocus(createInput, page.locator(".admin-content"));
    expect(
      await renderedTextContrast(
        page.getByText("Visibility", { exact: true }),
        page.locator("fieldset"),
      ),
    ).toBeGreaterThanOrEqual(4.5);
    await visualViewportBaseline(page, `spectrum-lead-create-${theme}-filled.png`);

    await page.goto("/crm/leads/new");
    await page.getByRole("button", { name: "Save lead" }).click();
    await expect(page.locator("#lead-errors")).toBeFocused();
    await expect(page.getByLabel("Work email")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await visualViewportBaseline(page, `spectrum-lead-create-${theme}-invalid.png`);

    await page.getByLabel("First name").fill("Morgan");
    await page.getByLabel("Last name").fill("Reed");
    await page.getByLabel("Work email").fill("morgan.reed@example.test");
    await page.getByLabel("Company").fill("Northstar Labs");
    await page.getByLabel("Lead source").selectOption("website");
    let releaseCreateFailure!: () => void;
    const createFailureGate = new Promise<void>((resolve) => {
      releaseCreateFailure = resolve;
    });
    await page.route(
      "**/api/workspaces/*/leads",
      async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        await createFailureGate;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "unexpected_error" } }),
        });
      },
      { times: 1 },
    );
    await page.getByRole("button", { name: "Save lead" }).click();
    const savingLead = page.getByRole("button", { name: "Saving lead…" });
    await expect(savingLead).toBeDisabled();
    await savingLead.evaluate((element) => {
      document.documentElement.style.scrollBehavior = "auto";
      element.scrollIntoView({ block: "center" });
    });
    await visualViewportBaseline(page, `spectrum-lead-create-${theme}-busy.png`);
    releaseCreateFailure();
    await expect(page.getByText("We couldn’t save this lead. Your entries are still here.")).toBeVisible();
    await expect(page.getByLabel("Company")).toHaveValue("Northstar Labs");
    await page.getByRole("button", { name: "Save lead" }).focus();
    await page.getByText("We couldn’t save this lead. Your entries are still here.").evaluate(
      (element) => {
        document.documentElement.style.scrollBehavior = "auto";
        element.scrollIntoView({ block: "center" });
      },
    );
    await visualViewportBaseline(page, `spectrum-lead-create-${theme}-recovery.png`);
    await page.unroute("**/api/workspaces/*/leads");

    await page.goto(`/crm/leads/${visual.jordanId}`);
    await expect(page.getByRole("heading", { name: "Jordan Lee" })).toBeVisible();
    await expect(page.locator("#ownerMembershipId")).toContainText("owner");
    await expect(page.getByText("Requested a pricing follow-up.")).toBeVisible();
    expect(
      await renderedTextContrast(
        page.locator(".activity-meta").first(),
        page.locator(".activity-list li").first(),
      ),
    ).toBeGreaterThanOrEqual(4.5);
    await visualBaseline(page, `spectrum-lead-detail-${theme}-populated.png`);
    await page.getByLabel("Status").selectOption("lost");
    const saveChanges = page.getByRole("button", { name: "Save changes" });
    await saveChanges.click();
    const dialog = page.getByRole("alertdialog", {
      name: "Mark Jordan Lee as Lost?",
    });
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await visualViewportBaseline(page, `spectrum-lead-detail-${theme}-confirm.png`);
    await page.keyboard.press("Escape");
    await expect(saveChanges).toBeFocused();

    await page.reload();
    await page.getByLabel("Company").fill("Northstar Labs");
    await page.route("**/api/workspaces/*/leads/*", async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { id: visual.jordanId, version: 2 } }),
      });
    }, { times: 1 });
    await page.getByRole("button", { name: "Save changes" }).click();
    const savedFeedback = page.getByText("Lead updated.");
    await expect(savedFeedback).toBeVisible();
    await expect(page.getByLabel("Pipeline stage")).toBeFocused();
    await savedFeedback.evaluate((element) => {
      document.documentElement.style.scrollBehavior = "auto";
      element.scrollIntoView({ block: "center" });
    });
    await visualViewportBaseline(page, `spectrum-lead-detail-${theme}-saved.png`);
    await page.unroute("**/api/workspaces/*/leads/*");

    await page.getByLabel("Add a note").fill("Confirmed budget and timeline.");
    let releaseActivityFailure!: () => void;
    const activityFailureGate = new Promise<void>((resolve) => {
      releaseActivityFailure = resolve;
    });
    await page.route(
      "**/api/workspaces/*/leads/*/activities",
      async (route) => {
        await activityFailureGate;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "unexpected_error" } }),
        });
      },
      { times: 1 },
    );
    await page.getByRole("button", { name: "Add note" }).click();
    const addingNote = page.getByRole("button", { name: "Adding note…" });
    await expect(addingNote).toBeDisabled();
    await addingNote.evaluate((element) => {
      document.documentElement.style.scrollBehavior = "auto";
      element.scrollIntoView({ block: "center" });
    });
    await visualViewportBaseline(page, `spectrum-activity-${theme}-loading.png`);
    releaseActivityFailure();
    const noteError = page.getByText(/We couldn’t add that note/);
    await expect(noteError).toBeVisible();
    await noteError.evaluate((element) => {
      document.documentElement.style.scrollBehavior = "auto";
      element.scrollIntoView({ block: "center" });
    });
    await visualViewportBaseline(page, `spectrum-activity-${theme}-error.png`);
    await page.unroute("**/api/workspaces/*/leads/*/activities");
    await page.route(
      "**/api/workspaces/*/leads/*/activities",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              id: "00000000-0000-4000-8000-000000000123",
              kind: "note",
              body: "Confirmed budget and timeline.",
              created_at: "2026-08-22T09:00:00Z",
            },
          }),
        }),
      { times: 1 },
    );
    await page.getByRole("button", { name: "Try again" }).click();
    const noteSuccess = page.getByText("Note added.");
    await expect(noteSuccess).toBeVisible();
    await noteSuccess.evaluate((element) => {
      document.documentElement.style.scrollBehavior = "auto";
      element.scrollIntoView({ block: "center" });
    });
    await visualViewportBaseline(page, `spectrum-activity-${theme}-success.png`);
    await page.unroute("**/api/workspaces/*/leads/*/activities");

    await page.goto(`/crm/leads/${visual.averyId}`);
    await expect(page.getByRole("heading", { name: "Avery Chen" })).toBeVisible();
    await expect(page.locator(".activity-list li")).toHaveCount(0);
    await visualBaseline(page, `spectrum-activity-${theme}-empty.png`);
  }

  await setServerAppearance(fixture.users[0].id, "system");
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const effective of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: effective });
    await page.goto(`/crm/leads/${visual.jordanId}`);
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme-preference",
      "system",
    );
    await expect(page.locator("html")).toHaveAttribute("data-theme", effective);
    await visualViewportBaseline(
      page,
      `spectrum-lead-detail-system-${effective}.png`,
    );
    expect(
      (
        await database.query<{ appearance: string }>(
          "select appearance from user_preferences where user_id=$1",
          [fixture.users[0].id],
        )
      ).rows[0].appearance,
    ).toBe("system");
  }
});

test.beforeEach(async () => {
  await database.query("delete from rate_limit_windows");
  await database.query(
    `insert into plan_catalog_entries(code,catalog_version,name,status,allowed_cadences,included_active_seats,feature_flags,trial_days,effective_from) values ('growth','e2e','Growth','active','["monthly","annual"]',5,'{}',14,now()-interval '1 day') on conflict(code,catalog_version) do update set status='active'`,
  );
});

test.afterAll(async () => {
  await database.end();
});

test("local OIDC cancellation and protocol failure return safely without creating a workspace", async ({
  page,
}) => {
  await page.goto(
    "/api/auth/oidc/fixture?cancel=1&redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fapi%2Fauth%2Foidc%2Fcallback",
  );
  await expect(page).toHaveURL(/\/login\?oidc=cancelled/);
  await page.goto("/api/auth/oidc/callback?state=invalid&code=invalid");
  await expect(page).toHaveURL(/\/login\?oidc=failed/);
});

test("local OIDC fixture provisions a server-derived sole-Owner workspace and survives refresh", async ({
  page,
}) => {
  await database.query("truncate users cascade");
  await page.goto("/login");
  await page
    .getByRole("link", { name: /Continue with local Google fixture/ })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Create your company Workspace",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Company or Workspace name").fill("OIDC Browser Workspace");
  await page.getByRole("button", { name: "Create company Workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Your company Workspace is ready" }),
  ).toBeVisible();
  await expect(
    page.getByText("OIDC Browser Workspace", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Owner", { exact: true }),
  ).toBeVisible();
  const evidence = await database.query(
    `select count(*)::int owners from workspace_memberships m join roles r on r.id=m.role_id where r.code='owner' and m.status='active' and m.workspace_id=(select id from workspaces where name='OIDC Browser Workspace')`,
  );
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
  await expect(
    mobileMenu.getByRole("link", { name: "Workspace settings" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(mobileMenu).toBeHidden();
  await expect(menuTrigger).toBeFocused();
  await menuTrigger.click();
  await mobileMenu.getByRole("link", { name: "Workspace settings" }).click();
  await expect(page).toHaveURL(/\/workspace\/settings/);
  await expect(
    page.getByText(/LOCAL SERVER · Workspace settings/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto("/crm");
  await page.getByRole("button", { name: "Open CRM navigation" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login\?signedOut=1/);
  await page.goto("/crm");
  await expect(page).toHaveURL(/\/login\?next=\/crm/);
});

test("registration survives an interrupted worker lease, verifies once, logs in, and enters the protected preview", async ({
  page,
}) => {
  const email = `e2e-complete-${Date.now()}@example.test`;
  await register(page, email);
  await database.query(
    "update outbox_messages set status='processing', lease_until=now()+interval '5 minutes' where aggregate_id=(select id from users where primary_email_normalized=$1)",
    [email],
  );
  await runWorker();
  expect(
    (
      await database.query(
        "select status from outbox_messages where aggregate_id=(select id from users where primary_email_normalized=$1)",
        [email],
      )
    ).rows[0].status,
  ).toBe("processing");
  await database.query(
    "update outbox_messages set status='processing', lease_until=now()-interval '1 second' where aggregate_id=(select id from users where primary_email_normalized=$1)",
    [email],
  );
  await runWorker();
  expect(
    (
      await database.query(
        "select status from outbox_messages where aggregate_id=(select id from users where primary_email_normalized=$1)",
        [email],
      )
    ).rows[0].status,
  ).toBe("delivered");
  const link = await mailLink(email, "verify-email");
  await page.goto(link);
  await expect(
    page.getByRole("heading", { name: "Email verified" }),
  ).toBeVisible();
  await page.goto(link);
  await expect(
    page.getByRole("heading", {
      name: "This verification link is no longer valid",
    }),
  ).toBeVisible();
  await login(page, email);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Create your company Workspace",
      exact: true,
    }),
  ).toBeVisible();
});

test("rejects invalid and expired verification and reset links", async ({
  page,
}) => {
  const invalidVerification="x".repeat(43);
  await page.goto("/login");
  await page.goto(`/verify-email?token=${invalidVerification}`);
  await expect(page).toHaveURL(/\/verify-email$/);
  expect(await page.content()).not.toContain(invalidVerification);
  expect(await page.evaluate(token=>![...Object.values(localStorage),...Object.values(sessionStorage)].includes(token),invalidVerification)).toBe(true);
  await expect(
    page.getByRole("heading", {
      name: "This verification link is no longer valid",
    }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);

  const email = `e2e-expired-${Date.now()}@example.test`;
  await register(page, email);
  await runWorker();
  const verification = await mailLink(email, "verify-email");
  await database.query(
    "update identity_tokens set expires_at=now()-interval '1 second' where user_id=(select id from users where primary_email_normalized=$1) and purpose='email_verification'",
    [email],
  );
  await page.goto(verification);
  await expect(
    page.getByRole("heading", {
      name: "This verification link is no longer valid",
    }),
  ).toBeVisible();

  const invalidReset="y".repeat(43);
  await page.goto(`/reset-password?token=${invalidReset}`);
  await expect(page).toHaveURL(/\/reset-password$/);
  expect(await page.content()).not.toContain(invalidReset);
  const resetIntent=(await page.context().cookies()).find(cookie=>cookie.name==="nexaflow_password_reset_intent");
  expect(resetIntent).toMatchObject({httpOnly:true,path:"/reset-password"});
  expect(resetIntent?.value).not.toContain(invalidReset);
  await page.locator("#password").fill("Changed-password-123!");
  await page.getByLabel("Confirm new password").fill("Changed-password-123!");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.locator(".alert.error:not(.error-summary)")).toContainText(
    "invalid, expired, replaced, or already used",
  );
  expect((await page.context().cookies()).some(cookie=>cookie.name==="nexaflow_password_reset_intent")).toBe(false);

  const resetEmail = `e2e-reset-expired-${Date.now()}@example.test`;
  await activate(page, resetEmail);
  expect(
    (await securePost(page, "/api/auth/reset-request", { email: resetEmail }))
      .status,
  ).toBe(202);
  await runWorker();
  const expiredReset = await mailLink(resetEmail, "reset-password");
  await database.query(
    "update identity_tokens set expires_at=now()-interval '1 second' where user_id=(select id from users where primary_email_normalized=$1) and purpose='password_reset'",
    [resetEmail],
  );
  await page.goto(expiredReset);
  await page.locator("#password").fill("Changed-password-123!");
  await page.getByLabel("Confirm new password").fill("Changed-password-123!");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.locator(".alert.error:not(.error-summary)")).toContainText(
    "invalid, expired, replaced, or already used",
  );
});

test("current-device logout preserves another device; all-device logout and back navigation remain protected", async ({
  browser,
  page,
}) => {
  const email = `e2e-logout-${Date.now()}@example.test`;
  await activate(page, email);
  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  await login(page, email);
  await login(second, email);

  expect(
    (await securePost(page, "/api/auth/logout", { scope: "current" })).status,
  ).toBe(200);
  await page.goto("/workspace/create");
  await expect(page).toHaveURL(/\/login/);
  await second.goto("/workspace/create");
  await expect(
    second.getByRole("heading", {
      name: "Create your company Workspace",
      exact: true,
    }),
  ).toBeVisible();

  expect(
    (await securePost(second, "/api/auth/logout", { scope: "all" })).status,
  ).toBe(200);
  await second.goto("/workspace/create");
  await expect(second).toHaveURL(/\/login/);
  await second.goBack();
  expect(second.url()).not.toMatch(/\/(?:workspace\/create|crm(?:\/|$))/);
  await expect(second.getByRole("heading", { name: "Create your company Workspace", exact: true })).toHaveCount(0);
  await second.goto("/workspace/create");
  await expect(second).toHaveURL(/\/login/);
  await secondContext.close();
});

test("session expiry and successful reset revoke protected access; reset token replay fails", async ({
  page,
}) => {
  const email = `e2e-reset-${Date.now()}@example.test`;
  await activate(page, email);
  await login(page, email);
  const sessionCookie = (await page.context().cookies()).find(
    (item) => item.name === "nexaflow_session",
  )!;
  const sessionHash = keyedHash(
    sessionCookie.value,
    "local-only-session-secret-change-me-32chars",
  );
  await database.query(
    "update sessions set last_seen_at=now()-interval '2 minutes',idle_expires_at=now()+interval '1 minute',absolute_expires_at=now()+interval '2 hours' where session_hash=$1",
    [sessionHash],
  );
  expect(
    await page.evaluate(async () => (await fetch("/api/auth/session")).json()),
  ).toMatchObject({ authenticated: true });
  const touched = await database.query(
    "select idle_expires_at > now()+interval '20 minutes' refreshed from sessions where session_hash=$1",
    [sessionHash],
  );
  expect(touched.rows[0].refreshed).toBe(true);
  await database.query(
    "update sessions set idle_expires_at=now()-interval '1 second' where session_hash=$1",
    [sessionHash],
  );
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
  await expect(
    page.getByText("Password updated. Existing sessions were revoked.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/workspace/create");
  await expect(page).toHaveURL(/\/login/);
  await page.goto(resetLink);
  await page.locator("#password").fill("Another-password-123!");
  await page.getByLabel("Confirm new password").fill("Another-password-123!");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.locator(".alert.error:not(.error-summary)")).toContainText(
    "invalid, expired, replaced, or already used",
  );
});

test("redirects unauthenticated workspace entry to local sign in", async ({
  page,
}) => {
  await page.goto("/workspace/create");
  await expect(page).toHaveURL(/\/login/);
});

test("Owner invites a verified Member through server settings, Mailpit, and token acceptance", async ({
  page,
}) => {
  const suffix = Date.now(),
    ownerEmail = `slice4-owner-${suffix}@example.test`,
    inviteeEmail = `slice4-member-${suffix}@example.test`;
  const users = (
    await database.query(
      `insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)values($1,$1,'Slice 4 Owner','active',now()),($2,$2,'Slice 4 Member','active',now())returning id`,
      [ownerEmail, inviteeEmail],
    )
  ).rows;
  const workspace = (
    await database.query(
      `insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)values('Slice 4 Browser',$1,'active','growth','monthly',$2)returning id`,
      [`slice-4-${suffix}`, users[0].id],
    )
  ).rows[0];
  const roles = (
    await database.query(
      `insert into roles(workspace_id,code,permissions,is_system,policy_version)values($1,'owner','{}',true,'tenant-admin-v1'),($1,'admin','{}',true,'tenant-admin-v1'),($1,'member','{}',true,'tenant-admin-v1')returning id,code`,
      [workspace.id],
    )
  ).rows;
  const ownerRole = roles.find((row) => row.code === "owner").id;
  const ownerMembership = (
    await database.query(
      `insert into workspace_memberships(workspace_id,user_id,role_id,status)values($1,$2,$3,'active')returning id`,
      [workspace.id, users[0].id, ownerRole],
    )
  ).rows[0];
  await database.query(
    `insert into workspace_entitlement_snapshots(workspace_id,plan_code,catalog_version,effective_feature_flags,effective_limits)values($1,'growth','e2e','{}','{"activeSeats":5}')`,
    [workspace.id],
  );
  const ownerToken = `owner-${crypto.randomUUID()}`,
    ownerSession = (
      await database.query(
        `insert into sessions(user_id,session_hash,security_version,idle_expires_at,absolute_expires_at,authenticated_at,auth_method)values($1,$2,1,now()+interval '1 hour',now()+interval '1 day',now(),'password')returning id`,
        [
          users[0].id,
          keyedHash(ownerToken, "local-only-session-secret-change-me-32chars"),
        ],
      )
    ).rows[0];
  expect(ownerMembership.id).toBeTruthy();
  expect(ownerSession.id).toBeTruthy();
  await page.context().addCookies([
    {
      name: "nexaflow_session",
      value: ownerToken,
      url: "http://127.0.0.1:3000",
    },
  ]);
  await page.goto("/workspace/settings/invite");
  await expect(
    page.getByRole("heading", { name: "Invite your team" }),
  ).toBeVisible();
  await page.getByLabel("Work email").fill(inviteeEmail);
  await page.getByRole("button", { name: "Send invitations" }).click();
  await expect(page.getByText(/Invitations sent/)).toBeVisible();
  await runWorker();
  await expect
    .poll(
      async () => {
        const response = await fetch("http://127.0.0.1:8025/api/v1/messages"),
          data = (await response.json()) as {
            messages: Array<{
              To: Array<{ Address: string }>;
              Snippet: string;
            }>;
          };
        return (
          data.messages
            .find(
              (message) =>
                message.To.some(
                  (recipient) => recipient.Address === inviteeEmail,
                ) &&
                message.Snippet.includes(
                  "/workspace/invitations/accept?token=",
                ),
            )
            ?.Snippet.match(
              /http:\/\/127\.0\.0\.1:3000\/workspace\/invitations\/accept\?token=[^\s]+/,
            )?.[0] ?? ""
        );
      },
      { timeout: 10_000 },
    )
    .not.toBe("");
  const messages = (await (
    await fetch("http://127.0.0.1:8025/api/v1/messages")
  ).json()) as {
    messages: Array<{ To: Array<{ Address: string }>; Snippet: string }>;
  };
  const inviteLink = messages.messages
    .find(
      (message) =>
        message.To.some((recipient) => recipient.Address === inviteeEmail) &&
        message.Snippet.includes("/workspace/invitations/accept?token="),
    )!
    .Snippet.match(
      /http:\/\/127\.0\.0\.1:3000\/workspace\/invitations\/accept\?token=[^\s]+/,
    )![0];
  expect(inviteLink).toContain("token=");
  const generatedToken = new URL(inviteLink).searchParams.get("token")!;
  const captureResponse = await page.request.get(inviteLink, {
    maxRedirects: 0,
    headers: { RSC: "1" },
  });
  expect(captureResponse.status()).toBe(303);
  expect(captureResponse.headers()["location"]).toBe(
    "/workspace/invitations/accept",
  );
  expect(captureResponse.headers()["cache-control"]).toBe("private, no-store");
  expect(captureResponse.headers()["referrer-policy"]).toBe("no-referrer");
  for (const output of [
    await captureResponse.text(),
    captureResponse.headers()["location"] ?? "",
    captureResponse.headers()["set-cookie"] ?? "",
  ]) {
    expect(output).not.toContain(generatedToken);
    expect(output).not.toContain(encodeURIComponent(generatedToken));
  }

  await page.context().clearCookies();
  await page.goto(inviteLink);
  await expect(page).toHaveURL(/\/workspace\/invitations\/accept$/);
  await expect(
    page.getByRole("heading", { name: "Join Slice 4 Browser?" }),
  ).toBeVisible();
  expect(await page.content()).not.toContain(generatedToken);
  expect(JSON.stringify(await page.evaluate(() => history.state))).not.toContain(
    generatedToken,
  );
  expect(
    JSON.stringify(
      await page.evaluate(() => ({
        local: Object.entries(localStorage),
        session: Object.entries(sessionStorage),
      })),
    ),
  ).not.toContain(generatedToken);
  await page.getByRole("link", { name: "Sign in to continue" }).click();
  await expect(page).toHaveURL(
    /\/login\?next=\/workspace\/invitations\/accept$/,
  );
  expect(page.url()).not.toContain(generatedToken);
  await page.goBack();
  await expect(page).toHaveURL(/\/workspace\/invitations\/accept$/);
  await page.getByRole("link", { name: "Create account to continue" }).click();
  await expect(page).toHaveURL(
    /\/register\?next=\/workspace\/invitations\/accept$/,
  );
  expect(page.url()).not.toContain(generatedToken);

  const inviteeToken = `invitee-${crypto.randomUUID()}`;
  await database.query(
    `insert into sessions(user_id,session_hash,security_version,idle_expires_at,absolute_expires_at,authenticated_at,auth_method)values($1,$2,1,now()+interval '1 hour',now()+interval '1 day',now(),'password')`,
    [
      users[1].id,
      keyedHash(inviteeToken, "local-only-session-secret-change-me-32chars"),
    ],
  );
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: "nexaflow_session",
      value: inviteeToken,
      url: "http://127.0.0.1:3000",
    },
  ]);
  await page.goto(inviteLink);
  await expect(page).toHaveURL(/\/workspace\/invitations\/accept$/);
  await expect(
    page.getByRole("heading", { name: "Join Slice 4 Browser?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(
    page.getByRole("heading", {
      name: "You joined Slice 4 Browser as Member",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open Workspace" }).click();
  await expect(page).toHaveURL(/\/crm\/home$/);
  await expect(page.getByRole("heading", { name: "CRM Home" })).toBeVisible();
  expect(
    (
      await database.query(
        `select count(*)::int count from workspace_memberships where workspace_id=$1 and user_id=$2`,
        [workspace.id, users[1].id],
      )
    ).rows[0].count,
  ).toBe(1);
});

test("multi-entry invitations preserve per-row state and expose partial retry", async ({
  page,
}) => {
  const fixture = await tenantBrowserFixture(page),
    fresh = `fresh-${Date.now()}@example.test`;
  await page.goto("/workspace/settings/invite");
  await page.getByLabel("Work email").fill(`${fresh}, ${fixture.emails.owner}`);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(fresh, { exact: true })).toBeVisible();
  await expect(
    page.getByText(fixture.emails.owner, { exact: true }),
  ).toBeVisible();
  const rows = page.locator('[aria-label="Invitation entries"] article');
  await rows
    .filter({ hasText: fresh })
    .getByLabel("Role")
    .selectOption("admin");
  await page.getByRole("button", { name: "Send invitations" }).click();
  await expect(
    page.getByText("Some invitations were sent; others need attention."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Retry ${fixture.emails.owner}` }),
  ).toBeVisible();
});

test("People and roles confirms suspend, restore, and remove with server state and audit refresh", async ({
  page,
}) => {
  const fixture = await tenantBrowserFixture(page);
  await page.goto("/workspace/settings/people");
  const ownerRow = page.getByRole("row").filter({ hasText: "Browser Owner" }),
    memberRow = page.getByRole("row").filter({ hasText: "Browser Member" });
  await expect(
    ownerRow.getByRole("button", { name: "Suspend" }),
  ).toBeDisabled();
  await memberRow.getByRole("button", { name: "Suspend" }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Suspend Browser Member?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Suspend member" }).click();
  await expect(page.getByText("Browser Member was suspended.")).toBeVisible();
  await expect(memberRow.getByText("suspended", { exact: true })).toBeVisible();
  expect(
    (
      await database.query(
        "select status from workspace_memberships where id=$1",
        [fixture.members[1].id],
      )
    ).rows[0].status,
  ).toBe("suspended");
  await memberRow.getByRole("button", { name: "Restore access" }).click();
  await page.getByRole("button", { name: "Restore access" }).last().click();
  await expect(
    page.getByText("Browser Member’s access was restored."),
  ).toBeVisible();
  await expect(memberRow.getByText("active", { exact: true })).toBeVisible();
  await memberRow.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Remove from workspace" }).click();
  await expect(
    page.getByText("Browser Member was removed from the workspace."),
  ).toBeVisible();
  await expect(memberRow.getByText("removed", { exact: true })).toBeVisible();
  await expect(
    memberRow.getByText("Invite this person again to restore access."),
  ).toBeVisible();
  expect(
    (
      await database.query(
        `select action from audit_events where target_id=$1 and outcome='success' order by occurred_at`,
        [fixture.members[1].id],
      )
    ).rows.map((row) => row.action),
  ).toEqual([
    "workspace.membership_changed",
    "workspace.membership_restored",
    "workspace.membership_changed",
  ]);
});

test("team membership editing confirms removal, reports stale writes, enforces Admin ceilings, and suspended access ends immediately", async ({
  page,
}) => {
  const fixture = await tenantBrowserFixture(page);
  await page.goto("/workspace/settings/teams");
  await page.getByLabel("Team name").fill("Customer Success");
  await page.getByRole("button", { name: "Create team" }).click();
  await expect(page.getByText("Team created.")).toBeVisible();
  const card = page.locator("article").filter({ hasText: "Customer Success" });
  await card.getByLabel("Browser Member").check();
  await card.getByRole("button", { name: "Save members" }).click();
  await expect(page.getByText("Team members updated.")).toBeVisible();
  expect(
    (
      await database.query(
        `select count(*)::int count from team_memberships tm join workspace_memberships m on m.id=tm.workspace_membership_id where m.user_id=$1`,
        [fixture.users[1].id],
      )
    ).rows[0].count,
  ).toBe(1);
  const memberCheckbox = card.getByLabel("Browser Member");
  await memberCheckbox.click();
  const removeDialog = page.getByRole("alertdialog", {
    name: "Remove Browser Member from Customer Success?",
  });
  await expect(removeDialog).toBeVisible();
  await expect(
    removeDialog.getByRole("button", { name: "Cancel" }),
  ).toBeFocused();
  await removeDialog.getByRole("button", { name: "Remove from team" }).click();
  await expect(memberCheckbox).not.toBeChecked();
  await page.reload();
  const refreshedCard = page
    .locator("article")
    .filter({ hasText: "Customer Success" });
  await page.route(
    "**/memberships/*/teams",
    (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "stale_version" } }),
      }),
    { times: 1 },
  );
  await refreshedCard.getByLabel("Browser Admin").check();
  await refreshedCard.getByRole("button", { name: "Save members" }).click();
  await expect(
    page.getByText(/This changed while you were editing/),
  ).toBeVisible();
  const adminToken = `browser-admin-${crypto.randomUUID()}`;
  await database.query(
    `insert into sessions(user_id,session_hash,security_version,idle_expires_at,absolute_expires_at,authenticated_at,auth_method)values($1,$2,1,now()+interval '1 hour',now()+interval '1 day',now(),'password')`,
    [
      fixture.users[2].id,
      keyedHash(adminToken, "local-only-session-secret-change-me-32chars"),
    ],
  );
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: "nexaflow_session",
      value: adminToken,
      url: "http://127.0.0.1:3000",
    },
  ]);
  await page.goto("/workspace/settings/people");
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "Browser Owner" })
      .getByRole("combobox"),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "Browser Admin" })
      .getByRole("combobox"),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "Browser Member" })
      .getByRole("combobox"),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "Browser Member" })
      .getByRole("button", { name: "Suspend" }),
  ).toBeEnabled();
  const memberToken = `browser-member-${crypto.randomUUID()}`;
  await database.query(
    `insert into sessions(user_id,session_hash,security_version,idle_expires_at,absolute_expires_at,authenticated_at,auth_method)values($1,$2,1,now()+interval '1 hour',now()+interval '1 day',now(),'password')`,
    [
      fixture.users[1].id,
      keyedHash(memberToken, "local-only-session-secret-change-me-32chars"),
    ],
  );
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: "nexaflow_session",
      value: memberToken,
      url: "http://127.0.0.1:3000",
    },
  ]);
  await database.query(
    "update workspace_memberships set status='suspended' where user_id=$1 and workspace_id=$2",
    [fixture.users[1].id, fixture.workspace.id],
  );
  await page.goto("/crm");
  await expect(page).not.toHaveURL(/\/crm$/);
});

test("resend invalidates the old link, seat denial stays generic, and fixture re-auth transfers with a rotated session", async ({
  page,
}) => {
  const fixture = await tenantBrowserFixture(page, 3);
  await database.query(
    "delete from identity_credentials where provider='google' and provider_subject='local-google-sub'",
  );
  await database.query(
    `insert into identity_credentials(user_id,provider,provider_subject)values($1,'google','local-google-sub')`,
    [fixture.users[0].id],
  );
  await page.goto("/workspace/settings/invite");
  await page.getByLabel("Work email").fill(fixture.emails.invitee);
  await page.getByRole("button", { name: "Send invitations" }).click();
  await expect(page.getByText(/Invitations sent/)).toBeVisible();
  await runWorker();
  const oldLink = await expect
    .poll(
      async () => {
        const messages = (await (
          await fetch("http://127.0.0.1:8025/api/v1/messages")
        ).json()) as {
          messages: Array<{ To: Array<{ Address: string }>; Snippet: string }>;
        };
        return (
          messages.messages
            .find(
              (message) =>
                message.To.some(
                  (value) => value.Address === fixture.emails.invitee,
                ) &&
                message.Snippet.includes(
                  "/workspace/invitations/accept?token=",
                ),
            )
            ?.Snippet.match(
              /http:\/\/127\.0\.0\.1:3000\/workspace\/invitations\/accept\?token=[^\s]+/,
            )?.[0] ?? ""
        );
      },
      { timeout: 10000 },
    )
    .not.toBe("");
  expect(oldLink).toBeUndefined();
  const messages = (await (
    await fetch("http://127.0.0.1:8025/api/v1/messages")
  ).json()) as {
    messages: Array<{ To: Array<{ Address: string }>; Snippet: string }>;
  };
  const first = messages.messages
    .find(
      (message) =>
        message.To.some((value) => value.Address === fixture.emails.invitee) &&
        message.Snippet.includes("/workspace/invitations/accept?token="),
    )!
    .Snippet.match(
      /http:\/\/127\.0\.0\.1:3000\/workspace\/invitations\/accept\?token=[^\s]+/,
    )![0];
  await database.query(
    "update workspace_invitations set last_sent_at=now()-interval '2 minutes' where workspace_id=$1 and email_normalized=$2",
    [fixture.workspace.id, fixture.emails.invitee],
  );
  await page.goto("/workspace/settings/invitations");
  await page.getByRole("button", { name: "Resend" }).click();
  await expect(page.getByText(/Invitation resent/)).toBeVisible();
  await runWorker();
  const inviteeToken = `browser-invitee-${crypto.randomUUID()}`;
  await database.query(
    `insert into sessions(user_id,session_hash,security_version,idle_expires_at,absolute_expires_at,authenticated_at,auth_method)values($1,$2,1,now()+interval '1 hour',now()+interval '1 day',now(),'password')`,
    [
      fixture.users[3].id,
      keyedHash(inviteeToken, "local-only-session-secret-change-me-32chars"),
    ],
  );
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: "nexaflow_session",
      value: inviteeToken,
      url: "http://127.0.0.1:3000",
    },
  ]);
  await page.goto(first);
  await expect(page).toHaveURL(/\/workspace\/invitations\/accept$/);
  await expect(
    page.getByRole("heading", { name: "This invitation isn’t available" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
  const resentMessages = (await (
    await fetch("http://127.0.0.1:8025/api/v1/messages")
  ).json()) as {
    messages: Array<{ To: Array<{ Address: string }>; Snippet: string }>;
  };
  const current = resentMessages.messages
    .map((message) =>
      message.To.some((value) => value.Address === fixture.emails.invitee)
        ? message.Snippet.match(
            /http:\/\/127\.0\.0\.1:3000\/workspace\/invitations\/accept\?token=[^\s]+/,
          )?.[0]
        : undefined,
    )
    .find((link) => link && link !== first)!;
  await page.goto(current);
  await expect(page).toHaveURL(/\/workspace\/invitations\/accept$/);
  await expect(
    page.getByRole("heading", { name: "Join Slice 4 Completion?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(
    page.getByText(
      "This Workspace has no available active seats. Ask its Owner or an authorized Admin to make capacity available.",
    ),
  ).toBeVisible();
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: "nexaflow_session",
      value: fixture.token,
      url: "http://127.0.0.1:3000",
    },
  ]);
  await page.goto("/workspace/settings/transfer-ownership");
  await page
    .getByRole("link", { name: "Confirm with local Google fixture" })
    .click();
  await expect(page).toHaveURL(/recent=confirmed/);
  await page.waitForLoadState("networkidle");
  const successor = page.getByLabel("Choose successor"),
    continueButton = page.getByRole("button", {
      name: "Continue to confirmation",
    });
  await expect(successor).toBeEnabled();
  await successor.selectOption({ label: "Browser Member" });
  await expect(successor).toHaveValue(fixture.members[1].id);
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await page.getByRole("button", { name: "Transfer ownership" }).click();
  await expect(
    page.getByText(/Your refreshed authorization is active/),
  ).toBeVisible();
  await page.goto("/workspace/settings");
  await expect(page.getByText("admin", { exact: true })).toBeVisible();
});
