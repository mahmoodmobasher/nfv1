import { Pool } from "pg";
import { expect, test, type Locator, type Page } from "playwright/test";
import { keyedHash } from "../../src/server/security/crypto";

const database = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow",
});
const sessionSecret = "local-only-session-secret-change-me-32chars";

async function screenshot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page
    .locator("nextjs-portal")
    .evaluateAll((portals) => portals.forEach((portal) => portal.remove()));
  await expect(page).toHaveScreenshot(name, {
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });
}

async function tabTo(page: Page, target: Locator) {
  await page.locator("body").press("Home").catch(() => undefined);
  for (let index = 0; index < 30; index += 1) {
    await page.keyboard.press("Tab");
    if (
      await target
        .evaluate((element) => element === document.activeElement)
        .catch(() => false)
    )
      return;
  }
  throw new Error("Keyboard traversal did not reach the invitation control.");
}

async function expectFocusAndReflow(page: Page, target: Locator) {
  await expect(target).toBeFocused();
  expect(
    await target.evaluate(
      (element) => Number.parseFloat(getComputedStyle(element).outlineWidth),
    ),
  ).toBeGreaterThanOrEqual(2);
  const box = await target.boundingBox(), viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function cleanAcceptanceFixture() {
  await database.query(
    `delete from audit_events where actor_user_id in (
      select id from users where primary_email_normalized like 'p4-visual-%@example.test'
    )`,
  );
  await database.query("delete from workspaces where slug like 'p4-visual-%'");
  await database.query(
    "delete from users where primary_email_normalized like 'p4-visual-%@example.test'",
  );
}

async function seedAcceptance() {
  await cleanAcceptanceFixture();
  const users = (
    await database.query<{ id: string }>(
      `insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)
       values('p4-visual-owner@example.test','p4-visual-owner@example.test','Northstar Owner','active',now()),
             ('p4-visual-invitee@example.test','p4-visual-invitee@example.test','Taylor Morgan','active',now())
       returning id`,
    )
  ).rows;
  const workspace = (
    await database.query<{ id: string }>(
      `insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
       values('Northstar Studio','p4-visual-northstar','active','growth','monthly',$1) returning id`,
      [users[0].id],
    )
  ).rows[0];
  const roles = (
    await database.query<{ id: string; code: "owner" | "admin" | "member" }>(
      `insert into roles(workspace_id,code,permissions,is_system,policy_version)
       values($1,'owner','{}',true,'tenant-admin-v1'),($1,'admin','{}',true,'tenant-admin-v1'),($1,'member','{}',true,'tenant-admin-v1') returning id,code`,
      [workspace.id],
    )
  ).rows;
  const role = (code: "owner" | "admin" | "member") =>
    roles.find((item) => item.code === code)!.id;
  const owner = (
    await database.query<{ id: string }>(
      "insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active') returning id",
      [workspace.id, users[0].id, role("owner")],
    )
  ).rows[0];
  await database.query(
    `insert into workspace_entitlement_snapshots(workspace_id,plan_code,catalog_version,effective_feature_flags,effective_limits)
     values($1,'growth','p4-visual','{}','{"activeSeats":1}')`,
    [workspace.id],
  );
  const invitationToken =
    "p4-visual-invitation-token-000000000000000000000000";
  await database.query(
    `insert into workspace_invitations(workspace_id,email_normalized,email_display,role_id,token_hash,expires_at,last_sent_at,invited_by_membership_id)
     values($1,'p4-visual-invitee@example.test','p4-visual-invitee@example.test',$2,$3,'2030-09-15T12:00:00Z','2026-08-24T12:00:00Z',$4)`,
    [
      workspace.id,
      role("member"),
      keyedHash(`workspace_invitation:v1:${invitationToken}`, sessionSecret),
      owner.id,
    ],
  );
  const sessionToken =
    "p4-visual-session-token-0000000000000000000000000000";
  await database.query(
    `insert into sessions(user_id,session_hash,security_version,idle_expires_at,absolute_expires_at,authenticated_at,auth_method)
     values($1,$2,1,now()+interval '1 hour',now()+interval '1 day',now(),'password')`,
    [users[1].id, keyedHash(sessionToken, sessionSecret)],
  );
  await database.query(
    "insert into user_preferences(user_id,appearance) values($1,'light')",
    [users[1].id],
  );
  return { invitationToken, sessionToken, inviteeId: users[1].id };
}

test.beforeAll(async () => {
  await database.query("select 1");
});

test.afterAll(async () => {
  await cleanAcceptanceFixture();
  await database.end();
});

test("invitation preview has paired responsive Light and Dark evidence", async ({
  page,
}) => {
  const viewports = [
    ["desktop", { width: 1280, height: 900 }],
    ["tablet", { width: 768, height: 900 }],
    ["mobile", { width: 320, height: 700 }],
    ["zoom200", { width: 640, height: 720 }],
  ] as const;
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/invite?plan=growth");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.getByLabel("Work email").fill("member.preview@example.test");
    await page.getByRole("button", { name: "Add preview entry" }).click();
    await page.getByLabel("Preview role").selectOption("Admin");
    await page.getByLabel("Work email").fill("admin.preview@example.test");
    await page.getByRole("button", { name: "Add preview entry" }).click();
    await expect(page.getByLabel("Preview role").locator("option")).toHaveText([
      "Member",
      "Admin",
    ]);
    await expect(
      page.getByLabel("Preview role").locator("option", { hasText: "Owner" }),
    ).toHaveCount(0);
    await expect(page.getByText("The Owner uses one", { exact: false })).toBeVisible();
    for (const [size, viewport] of viewports) {
      await page.setViewportSize(viewport);
      const email = page.getByLabel("Work email");
      await email.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expectFocusAndReflow(page, email);
      await screenshot(
        page,
        `spectrum-p4-invitation-preview-${theme}-${size}.png`,
      );
    }
  }
});

test("invitation acceptance has paired, unavailable, capacity, and forced-colors evidence", async ({
  page,
}) => {
  const fixture = await seedAcceptance();
  await page.context().addCookies([
    {
      name: "nexaflow_session",
      value: fixture.sessionToken,
      url: "http://127.0.0.1:3000",
    },
  ]);
  await page.goto(
    `/workspace/invitations/accept?token=${fixture.invitationToken}`,
  );
  await expect(page).toHaveURL(/\/workspace\/invitations\/accept$/);
  const accept = page.getByRole("button", { name: "Accept invitation" });
  await expect(page.getByRole("heading", { name: "Join Northstar Studio?" })).toBeVisible();
  await expect(page.getByText("Member", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Member", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Owner", { exact: true })).toHaveCount(0);

  for (const theme of ["light", "dark"] as const) {
    await database.query(
      "update user_preferences set appearance=$2,version=version+1,updated_at=now() where user_id=$1",
      [fixture.inviteeId, theme],
    );
    for (const [size, viewport] of [
      ["desktop", { width: 1280, height: 900 }],
      ["mobile", { width: 320, height: 700 }],
    ] as const) {
      await page.setViewportSize(viewport);
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await tabTo(page, accept);
      await expectFocusAndReflow(page, accept);
      await screenshot(
        page,
        `spectrum-p4-invitation-accept-${theme}-${size}.png`,
      );
    }
  }

  await page.emulateMedia({ forcedColors: "active" });
  await page.setViewportSize({ width: 768, height: 900 });
  await page.reload();
  await tabTo(page, accept);
  await expectFocusAndReflow(page, accept);
  await screenshot(page, "spectrum-p4-invitation-accept-forced-colors.png");
  await page.emulateMedia({ forcedColors: "none" });

  await database.query(
    "update user_preferences set appearance='light',version=version+1,updated_at=now() where user_id=$1",
    [fixture.inviteeId],
  );
  await page.setViewportSize({ width: 768, height: 900 });
  await page.reload();
  await accept.click();
  await expect(
    page.getByText(
      "This Workspace has no available active seats. Ask its Owner or an authorized Admin to make capacity available.",
    ),
  ).toBeVisible();
  await screenshot(page, "spectrum-p4-invitation-seat-unavailable-light.png");

  const invalidToken = "p4-visual-invalid-token-00000000000000000000000000";
  await page.goto(`/workspace/invitations/accept?token=${invalidToken}`);
  await expect(page).toHaveURL(/\/workspace\/invitations\/accept$/);
  await expect(
    page.getByRole("heading", { name: "This invitation isn’t available" }),
  ).toBeVisible();
  await expect(accept).toHaveCount(0);
  await screenshot(page, "spectrum-p4-invitation-unavailable-light.png");
});
