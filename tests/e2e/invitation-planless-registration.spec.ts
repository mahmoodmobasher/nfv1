import { Pool } from "pg";
import { expect, test } from "playwright/test";
import { keyedHash } from "../../src/server/security/crypto";

const database = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });
const secret = "local-only-session-secret-change-me-32chars";

test("an invitation creates a planless account and only accepts its token-bound Membership", async ({ page }) => {
  const suffix = crypto.randomUUID(), email = `invited-${suffix}@example.test`, token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const owner = (await database.query("insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at) values($1,$1,'Invitation Owner','active',now()) returning id", [`owner-${suffix}@example.test`])).rows[0];
  const workspace = (await database.query("insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id) values('Invitation Journey',$1,'active','growth','monthly',$2) returning id", [`invitation-journey-${suffix}`, owner.id])).rows[0];
  const roles = (await database.query("insert into roles(workspace_id,code,permissions,is_system,policy_version) values($1,'owner','{}',true,'tenant-admin-v1'),($1,'member','{}',true,'tenant-admin-v1') returning id,code", [workspace.id])).rows;
  const ownerRole = roles.find((role) => role.code === "owner")!, memberRole = roles.find((role) => role.code === "member")!;
  const ownerMembership = (await database.query("insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active') returning id", [workspace.id, owner.id, ownerRole.id])).rows[0];
  await database.query("insert into workspace_entitlement_snapshots(workspace_id,plan_code,catalog_version,effective_feature_flags,effective_limits) values($1,'growth','invitation-e2e','{}','{\"activeSeats\":2}')", [workspace.id]);
  await database.query("insert into workspace_invitations(workspace_id,email_normalized,email_display,role_id,token_hash,expires_at,last_sent_at,invited_by_membership_id) values($1,$2,$2,$3,$4,now()+interval '7 days',now(),$5)", [workspace.id, email, memberRole.id, keyedHash(`workspace_invitation:v1:${token}`, secret), ownerMembership.id]);

  await page.goto(`/workspace/invitations/accept?token=${token}`);
  await expect(page).toHaveURL(/\/workspace\/invitations\/accept$/);
  expect(page.url()).not.toContain(token);
  await expect(page.getByRole("heading", { name: "Join Invitation Journey?" })).toBeVisible();
  await page.getByRole("link", { name: "Create account to continue" }).click();
  await expect(page).toHaveURL(/\/register\?next=\/workspace\/invitations\/accept$/);
  await expect(page.getByRole("heading", { name: "Create your account to join a Workspace" })).toBeVisible();
  await expect(page.getByText("No Workspace, Owner role, subscription, or plan selection is created by this account registration.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();
  await page.getByLabel("Full name").fill("Invited Member");
  await page.getByLabel("Work email").fill(email);
  await page.locator("#password").fill("Invitation-password-123!");
  const clientFailures: string[] = [], pageErrors: Error[] = [];
  page.on("response", (value) => { if (new URL(value.url()).pathname.startsWith("/_next/") && value.status() >= 400) clientFailures.push(`${value.status()} ${value.url()}`); });
  page.on("pageerror", (error) => pageErrors.push(error));
  await expect(page.locator("#password")).toHaveValue("Invitation-password-123!");
  await expect(page.locator(".requirements .met")).toHaveCount(3);
  const requests: string[] = [];
  page.on("request", (value) => { if (new URL(value.url()).pathname === "/api/auth/register" && value.method() === "POST") requests.push(value.postData() ?? ""); });
  const response = page.waitForResponse((value) => new URL(value.url()).pathname === "/api/auth/register" && value.request().method() === "POST");
  await page.getByRole("button", { name: "Create account" }).click();
  expect((await response).status()).toBe(202);
  expect(requests).toHaveLength(1);
  expect(JSON.parse(requests[0])).toMatchObject({ email, continuation: "/workspace/invitations/accept" });
  expect(JSON.parse(requests[0])).not.toHaveProperty("planCode");
  expect(JSON.parse(requests[0])).not.toHaveProperty("cadence");
  expect(clientFailures).toEqual([]);
  expect(pageErrors).toEqual([]);

  const invitee = (await database.query("select id from users where primary_email_normalized=$1", [email])).rows[0];
  const verificationToken = `verify-${crypto.randomUUID()}`;
  await database.query("update identity_tokens set token_hash=$1 where user_id=$2 and purpose='email_verification'", [keyedHash(verificationToken, secret), invitee.id]);
  await page.goto(`/verify-email/capture?token=${verificationToken}&next=/workspace/invitations/accept`);
  await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
  await expect(page.getByText("Invitation account verification")).toBeVisible();
  await expect(page.getByText("Your selection")).toHaveCount(0);
  await page.getByRole("link", { name: "Continue to sign in" }).click();
  await page.getByLabel("Email").fill(email);
  await page.locator("#password").fill("Invitation-password-123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Join Invitation Journey?" })).toBeVisible();
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page.getByRole("heading", { name: "You joined Invitation Journey as Member" })).toBeVisible();

  expect((await database.query("select count(*)::int count from workspace_memberships where workspace_id=$1 and user_id=$2", [workspace.id, invitee.id])).rows[0].count).toBe(1);
  expect((await database.query("select count(*)::int count from workspaces where created_by_user_id=$1", [invitee.id])).rows[0].count).toBe(0);
  expect((await database.query("select count(*)::int count from workspace_memberships m join roles r on r.id=m.role_id where m.user_id=$1 and r.code='owner'", [invitee.id])).rows[0].count).toBe(0);
  expect((await database.query("select selected_plan_code,billing_cadence,workspace_id from onboarding_progress where user_id=$1", [invitee.id])).rows[0]).toEqual({ selected_plan_code: null, billing_cadence: null, workspace_id: null });
  expect((await database.query("select count(*)::int count from workspace_memberships where workspace_id=$1 and status='active'", [workspace.id])).rows[0].count).toBe(2);
});

test.afterAll(async () => { await database.end(); });
