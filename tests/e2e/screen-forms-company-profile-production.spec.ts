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
    const membership = (await database.query<{ id: string }>(
      `insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active') returning id`,
      [workspace.id, user.id, role.id],
    )).rows[0];
    const stage = (await database.query<{ id: string; updatedAt: string }>(
      `insert into pipeline_stages(workspace_id,name,position,status) values($1,'Not contacted',1,'active') returning id,updated_at::text "updatedAt"`,
      [workspace.id],
    )).rows[0];
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
    expect(result.selection).toEqual({ id: result.recordId, label: "Bundle Route Company", target: { kind: "version", version: 1 } });
    expect(created.headers()["cache-control"]).toContain("private, no-store");
    expect(created.headers().vary?.toLowerCase()).toContain("cookie");

    const profile = await request.get(`/api/workspaces/${workspace.id}/companies/${result.recordId}/profile`, { headers: { cookie } });
    expect(profile.status()).toBe(200);
    expect((await profile.json()).data).toMatchObject({ contractVersion: "screen-profile-detail.v1", kind: "company", recordId: result.recordId });
  expect(profile.headers()["cache-control"]).toContain("private, no-store");
  expect(profile.headers().vary?.toLowerCase()).toContain("cookie");

  const companyView = await request.get(`/api/workspaces/${workspace.id}/companies/${result.recordId}`, { headers: { cookie } });
  expect(companyView.status()).toBe(200);
  const companyViewData = (await companyView.json()).data;
  expect(companyViewData).toMatchObject({ contractVersion: "customer-graph-detail.v1", kind: "company", record: { id: result.recordId, version: 1 } });
  expect(companyViewData.record.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(new Date(companyViewData.record.updatedAt).toISOString()).toBe(companyViewData.record.updatedAt);
  expect(companyView.headers()["cache-control"]).toContain("private, no-store");
  expect(companyView.headers().vary?.toLowerCase()).toContain("cookie");

  const companyEditKey = randomUUID(), companyEdit = {
    contractVersion: "company-screen-edit.v2",
    expectedVersion: 1,
    profile: { name: "Bundle Route Company Edited", domain: null, website: null, industry: "Software", sizeBand: null,
      employeeCount: null, annualRevenue: null, parentCompanyId: null, parentCompanyVersion: null, phone: null,
      address: { street: null, city: null, stateProvince: null, postalCode: null, country: null } },
    assignment: { responsibleMembershipId: null, responsibleMembershipVersion: null, responsibleTeamId: null,
      responsibleTeamVersion: null, visibility: "workspace", visibleTeamIds: [], visibleTeamVersions: {} },
  };
  const companyEdited = await request.patch(`/api/workspaces/${workspace.id}/companies/${result.recordId}/profile`, {
    headers: { cookie, origin: "http://127.0.0.1:3012", "x-csrf-token": csrf, "idempotency-key": companyEditKey }, data: companyEdit,
  });
  expect(companyEdited.status()).toBe(200);
  expect((await companyEdited.json()).data).toEqual({ contractVersion: "screen-profile-result.v1", kind: "company",
    recordId: result.recordId, version: 2, replayed: false, requestId: expect.any(String),
    selection: { id: result.recordId, label: "Bundle Route Company Edited", target: { kind: "version", version: 2 } } });
  expect(companyEdited.headers()["cache-control"]).toContain("private, no-store");
  expect(companyEdited.headers().vary?.toLowerCase()).toContain("cookie");
  const companyReplay = await request.patch(`/api/workspaces/${workspace.id}/companies/${result.recordId}/profile`, {
    headers: { cookie, origin: "http://127.0.0.1:3012", "x-csrf-token": csrf, "idempotency-key": companyEditKey }, data: companyEdit,
  });
  expect(companyReplay.status()).toBe(200);
  expect((await companyReplay.json()).data).toMatchObject({ recordId: result.recordId, version: 2, replayed: true });
  const staleCompany = await request.patch(`/api/workspaces/${workspace.id}/companies/${result.recordId}/profile`, {
    headers: { cookie, origin: "http://127.0.0.1:3012", "x-csrf-token": csrf, "idempotency-key": randomUUID() },
    data: { ...companyEdit, profile: { ...companyEdit.profile, name: "Stale Company" } },
  });
  expect(staleCompany.status()).toBe(409);
  expect((await staleCompany.json()).error).toMatchObject({ code: "stale_version", reconciliation: { action: "refetch_record" }, zeroPartialEffects: true });
  const companyViewAfterEdit = await request.get(`/api/workspaces/${workspace.id}/companies/${result.recordId}`, { headers: { cookie } });
  expect((await companyViewAfterEdit.json()).data.record).toMatchObject({ id: result.recordId, displayName: "Bundle Route Company Edited", version: 2 });

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

  const contactView = await request.get(`/api/workspaces/${workspace.id}/contacts/${contactResult.recordId}`, { headers: { cookie } });
  expect(contactView.status()).toBe(200);
  const contactViewData = (await contactView.json()).data;
  expect(contactViewData).toMatchObject({ contractVersion: "customer-graph-detail.v1", kind: "contact", record: { id: contactResult.recordId, version: 1 } });
  expect(new Date(contactViewData.record.updatedAt).toISOString()).toBe(contactViewData.record.updatedAt);

  const contactEditKey = randomUUID(), contactEdit = {
    contractVersion: "contact-screen-edit.v2",
    expectedVersion: 1,
    profile: { salutation: null, firstName: "Bundle", lastName: "Contact Edited", jobTitle: "Director", department: null,
      primaryEmail: `bundle-contact-${suffix}@example.test`, secondaryEmail: null, directPhone: null, mobilePhone: null,
      linkedinUrl: null, lifecycleStage: "lead", company: null,
      address: { street: null, city: null, stateProvince: null, postalCode: null, country: null } },
    assignment: { responsibleMembershipId: null, responsibleMembershipVersion: null, responsibleTeamId: null,
      responsibleTeamVersion: null, visibility: "workspace", visibleTeamIds: [], visibleTeamVersions: {} },
  };
  const contactEdited = await request.patch(`/api/workspaces/${workspace.id}/contacts/${contactResult.recordId}/profile`, {
    headers: { cookie, origin: "http://127.0.0.1:3012", "x-csrf-token": csrf, "idempotency-key": contactEditKey }, data: contactEdit,
  });
  expect(contactEdited.status()).toBe(200);
  expect((await contactEdited.json()).data).toMatchObject({ contractVersion: "screen-profile-result.v1", kind: "contact",
    recordId: contactResult.recordId, version: 2, replayed: false });
  expect(contactEdited.headers()["cache-control"]).toContain("private, no-store");
  expect(contactEdited.headers().vary?.toLowerCase()).toContain("cookie");
  const contactReplay = await request.patch(`/api/workspaces/${workspace.id}/contacts/${contactResult.recordId}/profile`, {
    headers: { cookie, origin: "http://127.0.0.1:3012", "x-csrf-token": csrf, "idempotency-key": contactEditKey }, data: contactEdit,
  });
  expect(contactReplay.status()).toBe(200);
  expect((await contactReplay.json()).data).toMatchObject({ recordId: contactResult.recordId, version: 2, replayed: true });
  const staleContact = await request.patch(`/api/workspaces/${workspace.id}/contacts/${contactResult.recordId}/profile`, {
    headers: { cookie, origin: "http://127.0.0.1:3012", "x-csrf-token": csrf, "idempotency-key": randomUUID() },
    data: { ...contactEdit, profile: { ...contactEdit.profile, lastName: "Stale" } },
  });
  expect(staleContact.status()).toBe(409);
  expect((await staleContact.json()).error).toMatchObject({ code: "stale_version", reconciliation: { action: "refetch_record" }, zeroPartialEffects: true });
  const contactProfileAfterEdit = await request.get(`/api/workspaces/${workspace.id}/contacts/${contactResult.recordId}/profile`, { headers: { cookie } });
  expect((await contactProfileAfterEdit.json()).data).toMatchObject({ recordId: contactResult.recordId, version: 2,
    base: { lastName: "Contact Edited", jobTitle: "Director" } });

  for (const [kind, recordId] of [["companies", result.recordId], ["contacts", contactResult.recordId]] as const) {
    const archive = await request.post(`/api/workspaces/${workspace.id}/${kind}/${recordId}/archive`, {
      headers: { cookie, origin: "http://127.0.0.1:3012", "x-csrf-token": csrf, "idempotency-key": randomUUID() },
      data: { contractVersion: kind === "companies" ? "company-lifecycle.v1" : "contact-lifecycle.v1", expectedVersion: 2 },
    });
    expect(archive.status()).toBe(200);
    expect((await archive.json()).data).toMatchObject({ version: 3, replayed: false });
    const archived = await request.get(`/api/workspaces/${workspace.id}/${kind}?status=archived&limit=25`, { headers: { cookie } });
    expect(archived.status()).toBe(200);
    expect((await archived.json()).data.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: recordId, status: "archived", version: 3 })]));
    const restore = await request.post(`/api/workspaces/${workspace.id}/${kind}/${recordId}/restore`, {
      headers: { cookie, origin: "http://127.0.0.1:3012", "x-csrf-token": csrf, "idempotency-key": randomUUID() },
      data: { contractVersion: kind === "companies" ? "company-lifecycle.v1" : "contact-lifecycle.v1", expectedVersion: 3 },
    });
    expect(restore.status()).toBe(200);
    expect((await restore.json()).data).toMatchObject({ version: 4, replayed: false });
  }

  const denied = await request.get(`/api/workspaces/${workspace.id}/companies/${result.recordId}`);
  expect(denied.status()).toBe(401);
  expect((await denied.json()).error).toMatchObject({ code: "authentication_required" });
  expect(denied.headers()["cache-control"]).toContain("private, no-store");
  expect(denied.headers().vary?.toLowerCase()).toContain("cookie");

  const leadKey = randomUUID(), leadProfile = {
    salutation: null, firstName: "Bundle", lastName: "Lead",
    company: { snapshotName: "Bundle Route Company Edited", companyId: result.selection.id, companyVersion: 4 },
    jobTitle: null, primaryEmail: `bundle-lead-${suffix}@example.test`, secondaryEmail: null,
    officePhone: null, mobilePhone: null, fax: null, website: null, twitterHandle: null,
    promotionalEmailOptOut: null, source: "social_media", stageId: stage.id,
    stageUpdatedAt: new Date(stage.updatedAt).toISOString(), rating: null, industry: null,
    annualRevenue: null, employeeCount: null,
    address: { street: null, city: null, stateProvince: null, postalCode: null, country: null },
  }, leadCommand = {
    contractVersion: "lead-screen-create.v2", contactDisposition: "dismiss",
    profile: { ...leadProfile, sourcePlatform: "linkedin" },
    assignment: { responsibleMembershipId: membership.id, responsibleMembershipVersion: 1,
      responsibleTeamId: null, responsibleTeamVersion: null, visibility: "workspace",
      visibleTeamIds: [], visibleTeamVersions: {} },
  };
  const missingPlatform = await request.post(`/api/workspaces/${workspace.id}/leads`, {
    headers: { cookie, origin: "http://127.0.0.1:3012", "x-csrf-token": csrf, "idempotency-key": leadKey },
    data: { ...leadCommand, profile: leadProfile },
  });
  expect(missingPlatform.status()).toBe(400);
  expect((await missingPlatform.json()).error).toMatchObject({ code: "validation_failed", zeroPartialEffects: true });

  const leadCreated = await request.post(`/api/workspaces/${workspace.id}/leads`, {
    headers: { cookie, origin: "http://127.0.0.1:3012", "x-csrf-token": csrf, "idempotency-key": leadKey }, data: leadCommand,
  });
  expect(leadCreated.status()).toBe(201);
  const leadResult = (await leadCreated.json()).data;
  expect(leadResult).toMatchObject({ contractVersion: "screen-profile-result.v1", kind: "lead", version: 1, replayed: false });
  const leadReplay = await request.post(`/api/workspaces/${workspace.id}/leads`, {
    headers: { cookie, origin: "http://127.0.0.1:3012", "x-csrf-token": csrf, "idempotency-key": leadKey }, data: leadCommand,
  });
  expect(leadReplay.status()).toBe(201);
  expect((await leadReplay.json()).data).toMatchObject({ recordId: leadResult.recordId, version: 1, replayed: true });
  const selectedStageQuery = new URLSearchParams({
    kind: "lead",
    optionKind: "lead_stage",
    id: stage.id,
    targetKind: "updated_at",
    target: new Date(stage.updatedAt).toISOString(),
  });
  const selectedStage = await request.get(
    `/api/workspaces/${workspace.id}/screen-form-options/selected?${selectedStageQuery}`,
    { headers: { cookie } },
  );
  expect(selectedStage.status()).toBe(200);
  expect((await selectedStage.json()).data).toMatchObject({
    contractVersion: "screen-form-selected-option.v1",
    kind: "lead",
    optionKind: "lead_stage",
    selected: { outcome: "unchanged", submitted: { id: stage.id }, current: { id: stage.id } },
  });
  expect(selectedStage.headers()["cache-control"]).toContain("private, no-store");
  expect(selectedStage.headers().vary?.toLowerCase()).toContain("cookie");
  const attribution = (await database.query(
    `select l.original_source_platform "leadPlatform",i.source_platform "intakePlatform"
     from leads l join lead_intakes i on i.workspace_id=l.workspace_id and i.lead_id=l.id
     where l.workspace_id=$1 and l.id=$2`, [workspace.id, leadResult.recordId],
  )).rows[0];
  expect(attribution).toEqual({ leadPlatform: "linkedin", intakePlatform: "linkedin" });
});
