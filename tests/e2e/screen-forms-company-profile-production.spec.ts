import { randomUUID } from "node:crypto";
import { expect, test } from "playwright/test";
import { Pool } from "pg";
import { keyedHash } from "../../src/server/security/crypto";

const database = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow",
});
const sessionSecret = "local-only-session-secret-change-me-32chars";

test.afterAll(async () => database.end());

test("the production bundle returns strict Company and Contact screen results and immediately reads their profiles", async ({ request }) => {
  const suffix = randomUUID(), csrf = `csrf-${suffix}`, token = `screen-bundle-${suffix}`;
  const user = (await database.query<{ id: string }>(
    `insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)
     values($1,$1,'Screen Bundle Owner','active',now()) returning id`,
    [`screen-bundle-${suffix}@example.test`],
  )).rows[0];
  const workspace = (await database.query<{ id: string }>(
      `insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
       values('Screen Bundle',$1,'active','growth','monthly',$2) returning id`,
      [`screen-bundle-${suffix}`, user.id],
    )).rows[0];
    const role = (await database.query<{ id: string }>(
      `insert into roles(workspace_id,code,permissions,is_system) values($1,'owner','{}',true) returning id`,
      [workspace.id],
    )).rows[0];
    await database.query(
      `insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active')`,
      [workspace.id, user.id, role.id],
    );
    await database.query(
      `insert into sessions(user_id,session_hash,active_workspace_id,idle_expires_at,absolute_expires_at,authenticated_at,auth_method)
       values($1,$2,$3,now()+interval '1 hour',now()+interval '1 day',now(),'password')`,
      [user.id, keyedHash(token, sessionSecret), workspace.id],
    );
    const cookie = `nexaflow_session=${token}; nexaflow_csrf=${csrf}`;
    const created = await request.post(`/api/workspaces/${workspace.id}/companies`, {
      headers: { cookie, origin: "http://127.0.0.1:3012", "x-csrf-token": csrf, "idempotency-key": randomUUID() },
      data: {
        contractVersion: "company-screen-create.v2",
        profile: { name: "Bundle Route Company", domain: null, website: null, industry: null, sizeBand: null,
          employeeCount: null, annualRevenue: null, parentCompanyId: null, parentCompanyVersion: null, phone: null,
          address: { street: null, city: null, stateProvince: null, postalCode: null, country: null } },
        assignment: { responsibleMembershipId: null, responsibleMembershipVersion: null, responsibleTeamId: null,
          responsibleTeamVersion: null, visibility: "workspace", visibleTeamIds: [], visibleTeamVersions: {} },
      },
    });
    expect(created.status()).toBe(201);
    const result = (await created.json()).data;
    expect(result).toMatchObject({ contractVersion: "screen-profile-result.v1", kind: "company", version: 1, replayed: false });
    expect(result.recordId).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.headers()["cache-control"]).toContain("private, no-store");
    expect(created.headers().vary?.toLowerCase()).toContain("cookie");

    const profile = await request.get(`/api/workspaces/${workspace.id}/companies/${result.recordId}/profile`, { headers: { cookie } });
    expect(profile.status()).toBe(200);
    expect((await profile.json()).data).toMatchObject({ contractVersion: "screen-profile-detail.v1", kind: "company", recordId: result.recordId });
  expect(profile.headers()["cache-control"]).toContain("private, no-store");
  expect(profile.headers().vary?.toLowerCase()).toContain("cookie");

  const contactCreated = await request.post(`/api/workspaces/${workspace.id}/contacts`, {
    headers: { cookie, origin: "http://127.0.0.1:3012", "x-csrf-token": csrf, "idempotency-key": randomUUID() },
    data: {
      contractVersion: "contact-screen-create.v2",
      profile: { salutation: null, firstName: "Bundle", lastName: "Contact", jobTitle: null, department: null,
        primaryEmail: `bundle-contact-${suffix}@example.test`, secondaryEmail: null, directPhone: null, mobilePhone: null,
        linkedinUrl: null, lifecycleStage: "lead", company: null,
        address: { street: null, city: null, stateProvince: null, postalCode: null, country: null } },
      assignment: { responsibleMembershipId: null, responsibleMembershipVersion: null, responsibleTeamId: null,
        responsibleTeamVersion: null, visibility: "workspace", visibleTeamIds: [], visibleTeamVersions: {} },
    },
  });
  expect(contactCreated.status()).toBe(201);
  const contactResult = (await contactCreated.json()).data;
  expect(contactResult).toMatchObject({ contractVersion: "screen-profile-result.v1", kind: "contact", version: 1, replayed: false });
  expect(contactResult.recordId).toMatch(/^[0-9a-f-]{36}$/);
  expect(contactCreated.headers()["cache-control"]).toContain("private, no-store");
  expect(contactCreated.headers().vary?.toLowerCase()).toContain("cookie");

  const contactProfile = await request.get(`/api/workspaces/${workspace.id}/contacts/${contactResult.recordId}/profile`, { headers: { cookie } });
  expect(contactProfile.status()).toBe(200);
  expect((await contactProfile.json()).data).toMatchObject({ contractVersion: "screen-profile-detail.v1", kind: "contact", recordId: contactResult.recordId });
  expect(contactProfile.headers()["cache-control"]).toContain("private, no-store");
  expect(contactProfile.headers().vary?.toLowerCase()).toContain("cookie");
});
