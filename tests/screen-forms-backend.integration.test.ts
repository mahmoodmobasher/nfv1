import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import {
  createLeadScreenV2,
  contactScreenCreateCommandV2Schema,
  contactScreenEditCommandV2Schema,
  editLeadScreenV2,
  getScreenFormBootstrapV1,
  getScreenFormSelectedOptionV1,
  getScreenProfileV1,
  listScreenFormOptionsV1,
} from "../src/backend/modules/screen-forms";
import {
  createCompany,
  createContact,
} from "../src/backend/modules/customer-graph";
import { getWorkspaceNavigationCapabilitiesV1 } from "../src/backend/modules/navigation";
import { getIdentityReviewCandidatesV1, resolveLeadIdentityReviewV1, submitLeadInquiryV1 }
  from "../src/backend/modules/leads";
import { createSession } from "../src/server/security/session";
import { getServerEnv } from "../src/server/env";

const suite = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow",
});
const env = getServerEnv();
const address = {
  street: null,
  city: null,
  stateProvince: null,
  postalCode: null,
  country: null,
};
const assignment = {
  responsibleMembershipId: null,
  responsibleMembershipVersion: null,
  responsibleTeamId: null,
  responsibleTeamVersion: null,
  visibility: "workspace" as const,
  visibleTeamIds: [],
  visibleTeamVersions: {},
};

async function fixture() {
  const email = `screen-${randomUUID()}@test.local`;
  const user = (
    await pool.query<{ id: string }>(
      `insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)
     values($1,$1,'Screen Owner','active',now()) returning id`,
      [email],
    )
  ).rows[0];
  const workspace = (
    await pool.query<{ id: string }>(
      `insert into workspaces(name,slug,status,plan_code,billing_cadence,created_by_user_id)
     values('Screen Forms',$1,'active','growth','monthly',$2) returning id`,
      [`screen-${randomUUID()}`, user.id],
    )
  ).rows[0];
  const role = (
    await pool.query<{ id: string }>(
      `insert into roles(workspace_id,code,permissions,is_system) values($1,'owner','{}',true) returning id`,
      [workspace.id],
    )
  ).rows[0];
  const membership = (
    await pool.query<{ id: string }>(
      `insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active') returning id`,
      [workspace.id, user.id, role.id],
    )
  ).rows[0];
  const session = await createSession(pool, {
    userId: user.id,
    securityVersion: 1,
    secret: env.SESSION_SECRET,
    idleMinutes: 30,
    absoluteHours: 24,
  });
  const operationId = randomUUID();
  const company = (
    await pool.query<{ id: string; version: number }>(
      `insert into companies(workspace_id,display_name,name_normalized,normalization_version,status,visibility,
       governing_operation_id,created_by_membership_id,updated_by_membership_id,authority_contract_version)
     values($1,'Explicit Company','explicit company','customer-graph-v1','active','workspace',$2,$3,$3,'customer-graph-v1')
     returning id,version`,
      [workspace.id, operationId, membership.id],
    )
  ).rows[0];
  const stages = (
    await pool.query<{ id: string; updatedAt: Date }>(
      `insert into pipeline_stages(workspace_id,name,position) values($1,'Not contacted',0),($1,'Contacted',1)
     returning id,updated_at "updatedAt"`,
      [workspace.id],
    )
  ).rows;
  return {
    actor: {
      userId: user.id,
      sessionId: session.id,
      workspaceId: workspace.id,
      membershipId: membership.id,
      role: "owner" as const,
    },
    company,
    stages,
  };
}

async function memberActor(workspaceId: string) {
  const email = `screen-member-${randomUUID()}@test.local`;
  const user = (
    await pool.query<{ id: string }>(
      `insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at)
     values($1,$1,'Screen Member','active',now()) returning id`,
      [email],
    )
  ).rows[0];
  const role = (
    await pool.query<{ id: string }>(
      `insert into roles(workspace_id,code,permissions,is_system) values($1,'member','{}',true)
     on conflict(workspace_id,code) do update set code=excluded.code returning id`,
      [workspaceId],
    )
  ).rows[0];
  const membership = (
    await pool.query<{ id: string }>(
      `insert into workspace_memberships(workspace_id,user_id,role_id,status) values($1,$2,$3,'active') returning id`,
      [workspaceId, user.id, role.id],
    )
  ).rows[0];
  const session = await createSession(pool, {
    userId: user.id,
    securityVersion: 1,
    secret: env.SESSION_SECRET,
    idleMinutes: 30,
    absoluteHours: 24,
  });
  return {
    userId: user.id,
    sessionId: session.id,
    workspaceId,
    membershipId: membership.id,
    role: "member" as const,
  };
}

function command(
  f: Awaited<ReturnType<typeof fixture>>,
  email = `lead-${randomUUID()}@example.test`,
) {
  return {
    contractVersion: "lead-screen-create.v2" as const,
    contactDisposition: "dismiss" as const,
    profile: {
      salutation: null,
      firstName: "Ada",
      lastName: "Lovelace",
      company: {
        snapshotName: "Explicit Company",
        companyId: f.company.id,
        companyVersion: f.company.version,
      },
      jobTitle: null,
      primaryEmail: email,
      secondaryEmail: null,
      officePhone: null,
      mobilePhone: null,
      fax: null,
      website: null,
      twitterHandle: null,
      promotionalEmailOptOut: false,
      source: "manual" as const,
      stageId: f.stages[0].id,
      stageUpdatedAt: f.stages[0].updatedAt.toISOString(),
      rating: "warm" as const,
      industry: null,
      annualRevenue: null,
      employeeCount: null,
      address,
    },
    assignment,
  };
}

async function canonicalResolvedLead(
  f: Awaited<ReturnType<typeof fixture>>,
  contactAction: "create" | "link" | "dismiss",
) {
  const email = `canonical-${contactAction}-${randomUUID()}@example.test`;
  let linkedContactId: string | null = null;
  if (contactAction === "link") {
    const contact = await createContact(pool, { actor: f.actor, key: `canonical-contact-${randomUUID()}`,
      requestId: randomUUID(), command: { contractVersion: "contact-create.v1", firstName: "Canonical",
        lastName: "Contact", email, phone: null,
        affiliation: { companyId: f.company.id, roleCode: "decision_maker" },
        responsibleMembershipId: f.actor.membershipId, responsibleTeamId: null,
        visibility: "workspace", visibleTeamIds: [] } });
    linkedContactId = contact.contactId;
  }
  const held = await submitLeadInquiryV1(pool, { actor: f.actor, idempotencyKey: `canonical-lead-${randomUUID()}`,
    command: { contractVersion: "lead-inquiry-intake.v1", intakeChannel: "manual",
      person: { displayName: "Canonical Contact", firstName: "Canonical", lastName: "Contact", email },
      organization: { name: "Explicit Company" },
      inquiry: { receivedAt: "2026-08-27T12:00:00.000Z" },
      source: { sourceCategory: "manual", sourceMedium: "unknown", sourceDetail: {}, campaignContext: {},
        attributionContractVersion: "p1a-attribution-v1" },
      requestedAssignment: { responsibleMembershipId: f.actor.membershipId } } });
  const review = await getIdentityReviewCandidatesV1(pool, f.actor, held.leadId);
  const companyCandidate = review.candidates.find(candidate => candidate.targetType === "company")!;
  const contactCandidate = review.candidates.find(candidate => candidate.targetType === "contact");
  const contact = contactAction === "link" ? { action: "link" as const, candidateId: contactCandidate!.candidateId,
    targetId: linkedContactId!, expectedTargetVersion: contactCandidate!.targetVersion } : { action: contactAction };
  const resolved = await resolveLeadIdentityReviewV1(pool, { actor: f.actor, leadId: held.leadId,
    idempotencyKey: `canonical-resolution-${randomUUID()}`, command: {
      contractVersion: "lead-identity-review-decision.v1", outcome: "resolve",
      expectedLeadVersion: review.leadVersion, expectedReviewVersion: review.reviewVersion,
      expectedIntakeVersion: review.intakeVersion, contact,
      company: { action: "link", candidateId: companyCandidate.candidateId, targetId: f.company.id,
        expectedTargetVersion: companyCandidate.targetVersion } } });
  return { leadId: held.leadId, reviewId: review.reviewId, contactId: resolved.contactId };
}

suite("SCREEN-FORMS-01 backend", () => {
  beforeAll(async () => {
    await pool.query("select 1");
  });
  beforeEach(async () => {
    await pool.query("truncate users cascade");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("commits Company profile, exact revenue, hierarchy and governing evidence atomically", async () => {
    const f = await fixture(),
      key = `company-screen-${randomUUID()}`;
    const result = await createCompany(pool, {
      actor: f.actor,
      key,
      requestId: randomUUID(),
      command: {
        contractVersion: "company-screen-create.v2",
        profile: {
          name: "Child Company",
          domain: "child.example",
          website: "https://child.example",
          industry: "Software",
          sizeBand: "small",
          employeeCount: 42,
          annualRevenue: {
            amountMinor: "12345678901234567890",
            currencyCode: "CAD",
            currencyExponent: 2,
          },
          parentCompanyId: f.company.id,
          parentCompanyVersion: f.company.version,
          phone: "+14165550100",
          address: {
            street: "1 Main St",
            city: "Toronto",
            stateProvince: "ON",
            postalCode: "M5V 1A1",
            country: "CA",
          },
        },
        assignment,
      },
    });
    const row = (
      await pool.query(
        `select parent_company_id "parentCompanyId",annual_revenue_minor::text "amountMinor",
        annual_revenue_currency_code "currencyCode",annual_revenue_currency_exponent "exponent",website_url "website",
        (select count(*)::int from audit_events where workspace_id=c.workspace_id and target_id=c.id) audits,
        (select count(*)::int from outbox_messages where workspace_id=c.workspace_id and aggregate_id=c.id) outbox,
        (select count(*)::int from idempotency_records where principal_key=$3 and idempotency_key=$4) receipts
       from companies c where c.workspace_id=$1 and c.id=$2`,
        [
          f.actor.workspaceId,
          result.companyId,
          `workspace:${f.actor.workspaceId}:membership:${f.actor.membershipId}`,
          key,
        ],
      )
    ).rows[0];
    expect(row).toMatchObject({
      parentCompanyId: f.company.id,
      amountMinor: "12345678901234567890",
      currencyCode: "CAD",
      exponent: 2,
      website: "https://child.example",
      audits: 1,
      outbox: 1,
      receipts: 1,
    });
  });

  it("commits Contact profile with kind-compatible channel usage and explicit affiliation", async () => {
    const f = await fixture(),
      result = await createContact(pool, {
        actor: f.actor,
        key: `contact-screen-${randomUUID()}`,
        requestId: randomUUID(),
        command: {
          contractVersion: "contact-screen-create.v2",
          profile: {
            salutation: "Dr",
            firstName: "Grace",
            lastName: "Hopper",
            jobTitle: "Engineer",
            department: "Research",
            primaryEmail: "grace@example.test",
            secondaryEmail: "g.hopper@example.test",
            directPhone: "+14165550101",
            mobilePhone: "+14165550102",
            linkedinUrl: "https://linkedin.com/in/grace",
            lifecycleStage: "customer",
            company: {
              companyId: f.company.id,
              companyVersion: f.company.version,
              roleCode: "employee",
              isPrimary: true,
            },
            address: {
              street: "2 Main St",
              city: "Toronto",
              stateProvince: "ON",
              postalCode: "M5V 1A2",
              country: "CA",
            },
          },
          assignment,
        },
      });
    const usages = (
      await pool.query(
        `select kind,channel_usage "usage",is_primary "primary" from contact_identity_points
        where workspace_id=$1 and contact_id=$2 and lifecycle='active' order by channel_usage`,
        [f.actor.workspaceId, result.contactId],
      )
    ).rows;
    expect(usages).toEqual([
      { kind: "email", usage: "email_primary", primary: true },
      { kind: "email", usage: "email_secondary", primary: false },
      { kind: "phone", usage: "phone_direct", primary: false },
      { kind: "phone", usage: "phone_mobile", primary: false },
    ]);
    expect(
      (
        await pool.query(
          `select company_id "companyId",role_code "roleCode",is_primary "primary" from contact_company_affiliations
       where workspace_id=$1 and contact_id=$2 and lifecycle='active'`,
          [f.actor.workspaceId, result.contactId],
        )
      ).rows[0],
    ).toEqual({ companyId: f.company.id, roleCode: "employee", primary: true });
  });

  it("rejects duplicate normalized Contact channels before persistence with zero effects", async () => {
    const f = await fixture(),
      before = (
        await pool.query<{ contacts: number; points: number }>(
          `select (select count(*)::int from contacts where workspace_id=$1) contacts,
                  (select count(*)::int from contact_identity_points where workspace_id=$1) points`,
          [f.actor.workspaceId],
        )
      ).rows[0],
      command = {
        contractVersion: "contact-screen-create.v2" as const,
        profile: {
          salutation: null,
          firstName: "Duplicate",
          lastName: "Channels",
          jobTitle: null,
          department: null,
          primaryEmail: "same@example.test",
          secondaryEmail: " SAME@example.test ",
          directPhone: "+14165550123",
          mobilePhone: " +14165550123 ",
          linkedinUrl: null,
          lifecycleStage: "lead" as const,
          company: null,
          address,
        },
        assignment,
      },
      parsed = contactScreenCreateCommandV2Schema.safeParse(command);
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(parsed.error.issues.map((issue) => issue.path.join("."))).toEqual(
        expect.arrayContaining([
          "profile.primaryEmail",
          "profile.secondaryEmail",
          "profile.directPhone",
          "profile.mobilePhone",
        ]),
      );
    const after = (
      await pool.query<{ contacts: number; points: number }>(
        `select (select count(*)::int from contacts where workspace_id=$1) contacts,
                (select count(*)::int from contact_identity_points where workspace_id=$1) points`,
        [f.actor.workspaceId],
      )
    ).rows[0];
    expect(after).toEqual(before);
  });

  it("represents legacy-null lifecycle only on authorized detail and still requires it on edit", async () => {
    const f = await fixture(),
      created = await createContact(pool, {
        actor: f.actor,
        key: `legacy-null-contact-${randomUUID()}`,
        requestId: randomUUID(),
        command: {
          contractVersion: "contact-create.v1",
          firstName: "Legacy",
          lastName: "Lifecycle",
          email: "legacy.lifecycle@example.test",
          phone: null,
          affiliation: null,
          responsibleMembershipId: f.actor.membershipId,
          responsibleTeamId: null,
          visibility: "workspace",
          visibleTeamIds: [],
        },
      }),
      detail = await getScreenProfileV1(
        pool,
        f.actor,
        "contact",
        created.contactId,
        randomUUID(),
      );
    expect(detail.kind).toBe("contact");
    if (detail.kind !== "contact") throw new Error("expected Contact detail");
    expect(detail.base.lifecycleStage).toBeNull();
    const invalidEdit = contactScreenEditCommandV2Schema.safeParse({
      contractVersion: "contact-screen-edit.v2",
      expectedVersion: created.version,
      profile: {
        salutation: null,
        firstName: "Legacy",
        lastName: "Lifecycle",
        jobTitle: null,
        department: null,
        primaryEmail: "legacy.lifecycle@example.test",
        secondaryEmail: null,
        directPhone: null,
        mobilePhone: null,
        linkedinUrl: null,
        lifecycleStage: null,
        company: null,
        address,
      },
      assignment: {
        ...assignment,
        responsibleMembershipId: f.actor.membershipId,
        responsibleMembershipVersion: 1,
      },
    });
    expect(invalidEdit.success).toBe(false);
    const duplicateEdit = contactScreenEditCommandV2Schema.safeParse({
      contractVersion: "contact-screen-edit.v2",
      expectedVersion: created.version,
      profile: {
        salutation: null,
        firstName: "Legacy",
        lastName: "Lifecycle",
        jobTitle: null,
        department: null,
        primaryEmail: "legacy.lifecycle@example.test",
        secondaryEmail: " LEGACY.LIFECYCLE@example.test ",
        directPhone: null,
        mobilePhone: null,
        linkedinUrl: null,
        lifecycleStage: "lead",
        company: null,
        address,
      },
      assignment: {
        ...assignment,
        responsibleMembershipId: f.actor.membershipId,
        responsibleMembershipVersion: 1,
      },
    });
    expect(duplicateEdit.success).toBe(false);
    expect(
      (
        await pool.query<{ version: number }>(
          `select version from contacts where workspace_id=$1 and id=$2`,
          [f.actor.workspaceId, created.contactId],
        )
      ).rows[0].version,
    ).toBe(created.version);
    await pool.query(
      `update workspace_memberships set status='suspended',version=version+1 where workspace_id=$1 and id=$2`,
      [f.actor.workspaceId, f.actor.membershipId],
    );
    await expect(
      getScreenProfileV1(pool, f.actor, "contact", created.contactId, randomUUID()),
    ).rejects.toMatchObject({ code: "resource_not_found", status: 404 });
  });

  it("serializes sensitive Contact profile categories from current authority without leaking raw channels to Members", async () => {
    const f = await fixture(),
      member = await memberActor(f.actor.workspaceId);
    const created = await createContact(pool, {
      actor: f.actor,
      key: `contact-detail-${randomUUID()}`,
      requestId: randomUUID(),
      command: {
        contractVersion: "contact-screen-create.v2",
        profile: {
          salutation: null,
          firstName: "Private",
          lastName: "Person",
          jobTitle: null,
          department: null,
          primaryEmail: "private.person@example.test",
          secondaryEmail: null,
          directPhone: "+14165550123",
          mobilePhone: null,
          linkedinUrl: null,
          lifecycleStage: "lead",
          company: null,
          address,
        },
        assignment,
      },
    });
    const ownerView = await getScreenProfileV1(
      pool,
      f.actor,
      "contact",
      created.contactId,
      randomUUID(),
    );
    expect(ownerView).toMatchObject({
      kind: "contact",
      categories: {
        channels: { disclosure: "full" },
        address: { disclosure: "full" },
        notes: { disclosure: "full" },
      },
      assignment: { disclosure: "full" },
    });
    const memberView = await getScreenProfileV1(
      pool,
      member,
      "contact",
      created.contactId,
      randomUUID(),
    );
    expect(memberView).toMatchObject({
      kind: "contact",
      categories: {
        channels: { disclosure: "masked" },
        address: { disclosure: "withheld" },
        notes: { disclosure: "withheld" },
        hierarchy: { disclosure: "withheld" },
      },
      assignment: { disclosure: "withheld" },
      capabilities: { canEdit: false },
    });
    expect(JSON.stringify(memberView)).not.toContain(
      "private.person@example.test",
    );
    expect(JSON.stringify(memberView)).not.toContain("+14165550123");
  });

  it("issues NAV-01 create and settings capabilities only from current server authority", async () => {
    const f = await fixture(),
      member = await memberActor(f.actor.workspaceId);
    const owner = await getWorkspaceNavigationCapabilitiesV1(
      pool,
      f.actor,
      f.actor.workspaceId,
      randomUUID(),
    );
    expect(owner.capabilities).toMatchObject({
      home: { canView: true },
      companies: { canView: true, canCreate: true },
      contacts: { canView: true, canCreate: true },
      leads: { canView: true, canCreate: true },
      deals: { canView: true, canCreate: true },
      settings: { canViewWorkspace: true, canManageTeams: true },
    });
    const restricted = await getWorkspaceNavigationCapabilitiesV1(
      pool,
      member,
      member.workspaceId,
      randomUUID(),
    );
    expect(restricted.capabilities).toMatchObject({
      home: { canView: true },
      companies: { canView: true, canCreate: false },
      contacts: { canView: true, canCreate: false },
      leads: { canView: true, canCreate: false },
      deals: { canView: true, canCreate: false },
      settings: {
        canViewPersonal: true,
        canViewWorkspace: false,
        canManageTeams: false,
      },
    });
  });

  it("keeps direct-new bootstrap PII-free and paginates versioned options without gaps at label ties", async () => {
    const f = await fixture(),
      operationId = randomUUID();
    for (let index = 0; index < 3; index++)
      await pool.query(
        `insert into companies(workspace_id,display_name,name_normalized,normalization_version,status,visibility,
       governing_operation_id,created_by_membership_id,updated_by_membership_id,authority_contract_version)
       values($1,'Tie Company','tie company','customer-graph-v1','active','workspace',$2,$3,$3,'customer-graph-v1')`,
        [f.actor.workspaceId, operationId, f.actor.membershipId],
      );
    const bootstrap = await getScreenFormBootstrapV1(
      pool,
      f.actor,
      "lead",
      randomUUID(),
    );
    expect(bootstrap).toMatchObject({
      kind: "lead",
      capabilities: { canCreate: true, canCreateCompany: true },
    });
    expect(JSON.stringify(bootstrap)).not.toContain("Explicit Company");
    const first = await listScreenFormOptionsV1(
      pool,
      f.actor,
      { kind: "lead", optionKind: "company", query: "Tie Company", limit: 2 },
      randomUUID(),
    );
    const second = await listScreenFormOptionsV1(
      pool,
      f.actor,
      {
        kind: "lead",
        optionKind: "company",
        query: "Tie Company",
        limit: 2,
        cursor: first.nextCursor ?? undefined,
      },
      randomUUID(),
    );
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    expect(
      new Set([...first.items, ...second.items].map((item) => item.id)).size,
    ).toBe(3);
    expect(
      [...first.items, ...second.items].every(
        (item) => item.target.kind === "version",
      ),
    ).toBe(true);
    expect(second.nextCursor).toBeNull();
  });

  it("reconciles a current Lead stage independently of the first option page and ignores label presentation", async () => {
    const f = await fixture();
    const inserted = (
      await pool.query<{ id: string; updatedAt: Date }>(
        `insert into pipeline_stages(workspace_id,name,position)
         select $1,'ZZ Stage '||lpad(value::text,2,'0'),100+value from generate_series(1,30) value
         returning id,updated_at "updatedAt"`,
        [f.actor.workspaceId],
      )
    ).rows;
    const selected = inserted.at(-1)!;
    const firstPage = await listScreenFormOptionsV1(
      pool,
      f.actor,
      { kind: "lead", optionKind: "lead_stage", query: "", limit: 25 },
      randomUUID(),
    );
    expect(firstPage.items).toHaveLength(25);
    expect(firstPage.items.some((item) => item.id === selected.id)).toBe(false);
    const current = await getScreenFormSelectedOptionV1(
      pool,
      f.actor,
      {
        kind: "lead",
        optionKind: "lead_stage",
        id: selected.id,
        target: { kind: "updated_at", updatedAt: selected.updatedAt.toISOString() },
      },
      randomUUID(),
    );
    expect(current.selected).toMatchObject({
      outcome: "unchanged",
      submitted: { id: selected.id },
      current: { id: selected.id, label: "ZZ Stage 30" },
    });
  });

  it("returns changed or unavailable selected targets without cross-Workspace disclosure", async () => {
    const f = await fixture(), foreign = await fixture();
    await pool.query(
      `update companies set version=version+1,updated_at=now() where workspace_id=$1 and id=$2`,
      [f.actor.workspaceId, f.company.id],
    );
    const changed = await getScreenFormSelectedOptionV1(
      pool,
      f.actor,
      { kind: "lead", optionKind: "company", id: f.company.id,
        target: { kind: "version", version: f.company.version } },
      randomUUID(),
    );
    expect(changed.selected).toMatchObject({
      outcome: "changed",
      submitted: { id: f.company.id, target: { kind: "version", version: 1 } },
      current: { id: f.company.id, target: { kind: "version", version: 2 } },
    });
    const unavailable = await getScreenFormSelectedOptionV1(
      pool,
      f.actor,
      { kind: "lead", optionKind: "company", id: foreign.company.id,
        target: { kind: "version", version: foreign.company.version } },
      randomUUID(),
    );
    expect(unavailable.selected).toEqual({
      outcome: "unavailable",
      submitted: { id: foreign.company.id, target: { kind: "version", version: 1 } },
    });
    expect(JSON.stringify(unavailable)).not.toContain("Explicit Company");
  });

  it("locks reversed visible-Team selections in canonical order without deadlock", async () => {
    const f = await fixture(), operationId = randomUUID();
    const secondCompany = (
      await pool.query<{ id: string; version: number }>(
        `insert into companies(workspace_id,display_name,name_normalized,normalization_version,status,visibility,
         governing_operation_id,created_by_membership_id,updated_by_membership_id,authority_contract_version)
         values($1,'Second Explicit Company','second explicit company','customer-graph-v1','active','workspace',$2,$3,$3,'customer-graph-v1')
         returning id,version`,
        [f.actor.workspaceId, operationId, f.actor.membershipId],
      )
    ).rows[0];
    const teams = (
      await pool.query<{ id: string; version: number }>(
        `insert into teams(workspace_id,name,name_normalized,status,created_by_membership_id)
         values($1,'Canonical Team A','canonical team a','active',$2),
               ($1,'Canonical Team B','canonical team b','active',$2)
         returning id,version`,
        [f.actor.workspaceId, f.actor.membershipId],
      )
    ).rows.sort((left, right) => left.id.localeCompare(right.id));
    const versions = Object.fromEntries(teams.map((team) => [team.id, team.version]));
    const firstBase = command(f, `canonical-first-${randomUUID()}@example.test`),
      secondBase = command(f, `canonical-second-${randomUUID()}@example.test`),
      first = {
        ...firstBase,
        assignment: {
          ...assignment,
          visibility: "teams" as const,
          visibleTeamIds: [teams[1].id, teams[0].id],
          visibleTeamVersions: versions,
        },
      },
      second = {
        ...secondBase,
        profile: {
          ...secondBase.profile,
          company: {
            snapshotName: "Second Explicit Company",
            companyId: secondCompany.id,
            companyVersion: secondCompany.version,
          },
          stageId: f.stages[1].id,
          stageUpdatedAt: f.stages[1].updatedAt.toISOString(),
        },
        assignment: {
          ...assignment,
          visibility: "teams" as const,
          visibleTeamIds: [teams[0].id, teams[1].id],
          visibleTeamVersions: versions,
        },
      };
    const outcomes = await Promise.all([
      createLeadScreenV2(pool, { actor: f.actor, command: first,
        key: `canonical-first-${randomUUID()}`, requestId: randomUUID() }),
      createLeadScreenV2(pool, { actor: f.actor, command: second,
        key: `canonical-second-${randomUUID()}`, requestId: randomUUID() }),
    ]);
    expect(outcomes).toHaveLength(2);
    expect(new Set(outcomes.map((outcome) => outcome.recordId)).size).toBe(2);
  });

  it("supports a fresh Workspace Company quick-create, option refresh, explicit Lead selection, and independent failure", async () => {
    const f = await fixture();
    await pool.query(`delete from companies where workspace_id=$1`, [f.actor.workspaceId]);
    const navigation = await getWorkspaceNavigationCapabilitiesV1(pool, f.actor, f.actor.workspaceId, randomUUID());
    expect(navigation.capabilities.companies).toEqual({canView:true,canCreate:true});
    const bootstrap = await getScreenFormBootstrapV1(pool, f.actor, "lead", randomUUID());
    expect(bootstrap.capabilities).toMatchObject({canCreate:true,canCreateCompany:true});
    const empty = await listScreenFormOptionsV1(pool, f.actor, {kind:"lead",optionKind:"company",query:"",limit:25}, randomUUID());
    expect(empty).toMatchObject({items:[],nextCursor:null});
    const created = await createCompany(pool, {actor:f.actor,key:`quick-company-${randomUUID()}`,requestId:randomUUID(),command:{
      contractVersion:"company-screen-create.v2",profile:{name:"Quick Company",domain:null,website:null,industry:null,sizeBand:null,
        employeeCount:null,annualRevenue:null,parentCompanyId:null,parentCompanyVersion:null,phone:null,address},assignment,
    }});
    const refreshed = await listScreenFormOptionsV1(pool, f.actor, {kind:"lead",optionKind:"company",query:"Quick Company",limit:25}, randomUUID());
    expect(refreshed.items).toEqual([{id:created.companyId,label:"Quick Company",target:{kind:"version",version:created.version}}]);
    const selected = {...f,company:{id:created.companyId,version:created.version}};
    const leadKey=`quick-lead-${randomUUID()}`, leadCommand={
      ...command(selected),profile:{...command(selected).profile,source:"social_media" as const,sourcePlatform:"linkedin" as const,
        company:{snapshotName:"Quick Company",companyId:created.companyId,companyVersion:created.version}},
    };
    const createdLead = await createLeadScreenV2(pool,{actor:f.actor,key:leadKey,requestId:randomUUID(),command:leadCommand});
    expect(createdLead).toMatchObject({kind:"lead",version:1});
    const replayedLead=await createLeadScreenV2(pool,{actor:f.actor,key:leadKey,requestId:randomUUID(),command:leadCommand});
    expect(replayedLead).toMatchObject({recordId:createdLead.recordId,version:1,replayed:true});
    const attribution=(await pool.query(`select l.original_source_category "leadSource",l.original_source_platform "leadPlatform",
      i.source_category "intakeSource",i.source_platform "intakePlatform"
      from leads l join lead_intakes i on i.workspace_id=l.workspace_id and i.lead_id=l.id
      where l.workspace_id=$1 and l.id=$2`,[f.actor.workspaceId,createdLead.recordId])).rows[0];
    expect(attribution).toEqual({leadSource:"social_media",leadPlatform:"linkedin",intakeSource:"social_media",intakePlatform:"linkedin"});
    expect((await pool.query(`select count(*)::int count from leads where workspace_id=$1 and id=$2`,[f.actor.workspaceId,createdLead.recordId])).rows[0].count).toBe(1);
    await expect(createLeadScreenV2(pool,{actor:f.actor,key:`quick-lead-fail-${randomUUID()}`,requestId:randomUUID(),command:{
      ...command(selected),profile:{...command(selected).profile,primaryEmail:`failed-${randomUUID()}@example.test`,company:{snapshotName:"Quick Company",companyId:created.companyId,companyVersion:created.version+1}},
    }})).rejects.toMatchObject({code:"selection_unavailable",fields:["profile.company"],selection:{
      field:"profile.company",optionKind:"company",submitted:{id:created.companyId,target:{kind:"version",version:created.version+1}},
      outcome:"changed",currentTarget:{kind:"version",version:created.version},
    }});
    expect((await pool.query(`select count(*)::int count from companies where workspace_id=$1 and id=$2`,[f.actor.workspaceId,created.companyId])).rows[0].count).toBe(1);
  });

  it("atomically creates a Lead, explicit Company decision, evidence and receipt without lifecycle or Contact effects", async () => {
    const f = await fixture(),
      key = `screen-create-${randomUUID()}`,
      requestId = randomUUID();
    const result = await createLeadScreenV2(pool, {
      actor: f.actor,
      command: command(f),
      key,
      requestId,
    });
    expect(result).toMatchObject({
      kind: "lead",
      version: 1,
      replayed: false,
      identityReview: { companyDimension: "resolved", contactDimension: "resolved" },
    });
    const state = (
      await pool.query(
        `select l.status,d.code lifecycle,l.stage_id "stageId",l.company_id "companyId",l.contact_id "contactId",
        l.identity_review_status "reviewStatus",
        (select count(*)::int from lead_identity_reviews where workspace_id=l.workspace_id and lead_id=l.id and state='resolved') resolved,
        (select count(*)::int from lead_identity_decisions x join lead_identity_reviews r
          on r.workspace_id=x.workspace_id and r.id=x.review_id where r.workspace_id=l.workspace_id and r.lead_id=l.id) decisions,
        (select count(*)::int from lead_deal_conversion_lineage where workspace_id=l.workspace_id and lead_record_id=l.id) lineage,
        (select count(*)::int from audit_events where workspace_id=l.workspace_id and target_id=l.id and action='crm.lead.profile_created') audits,
        (select count(*)::int from outbox_messages where workspace_id=l.workspace_id and aggregate_id=l.id and topic='crm.lead.profile_created.v1') outbox,
        (select count(*)::int from idempotency_records where principal_key=$2 and operation='lead-screen-create.v2' and idempotency_key=$3) receipts
       from leads l join lead_lifecycle_definitions d on d.id=l.lifecycle_definition_id where l.workspace_id=$1 and l.id=$4`,
        [
          f.actor.workspaceId,
          `workspace:${f.actor.workspaceId}:membership:${f.actor.membershipId}`,
          key,
          result.recordId,
        ],
      )
    ).rows[0];
    expect(state).toMatchObject({
      status: "open",
      lifecycle: "new",
      stageId: f.stages[0].id,
      companyId: f.company.id,
      contactId: null,
      reviewStatus: "resolved",
      resolved: 1,
      decisions: 1,
      lineage: 0,
      audits: 1,
      outbox: 1,
      receipts: 1,
    });
    await expect(
      createLeadScreenV2(pool, {
        actor: f.actor,
        command: command(f),
        key,
        requestId,
      }),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
  });

  it("holds only the Contact dimension when current Contact identity evidence is ambiguous", async () => {
    const f = await fixture(),
      email = "candidate@example.test",
      operationId = randomUUID();
    const contact = (
      await pool.query<{ id: string }>(
        `insert into contacts(workspace_id,display_name,person_name_normalized,first_name,last_name,email_display,email_normalized,
       normalization_version,status,visibility,governing_operation_id,created_by_membership_id,updated_by_membership_id,authority_contract_version)
       values($1,'Candidate Person','candidate person','Candidate','Person',$2,$2,'customer-graph-v1','active','workspace',$3,$4,$4,'customer-graph-v1') returning id`,
        [f.actor.workspaceId, email, operationId, f.actor.membershipId],
      )
    ).rows[0];
    await pool.query(
      `insert into contact_identity_points(workspace_id,contact_id,kind,channel_usage,display_value,normalized_value,
       normalization_version,is_primary,source,governing_operation_id,created_by_membership_id)
       values($1,$2,'email','email_primary',$3,$3,'customer-graph-v1',true,'manual',$4,$5)`,
      [
        f.actor.workspaceId,
        contact.id,
        email,
        operationId,
        f.actor.membershipId,
      ],
    );
    const result = await createLeadScreenV2(pool, {
      actor: f.actor,
      command: command(f, email),
      key: `screen-held-${randomUUID()}`,
      requestId: randomUUID(),
    });
    expect(result).toMatchObject({
      identityReview: { companyDimension: "resolved", contactDimension: "pending" },
    });
    const detail = await getScreenProfileV1(
      pool,
      f.actor,
      "lead",
      result.recordId,
      randomUUID(),
    );
    expect(detail).toMatchObject({
      identityReview: { companyDimension: "resolved", contactDimension: "pending" },
    });
    const state = (
      await pool.query(
        `select l.identity_review_status "reviewStatus",l.company_id "companyId",l.contact_id "contactId",d.code lifecycle,l.status,
        (select count(*)::int from lead_identity_reviews where workspace_id=l.workspace_id and lead_id=l.id and state='pending') pending,
        (select count(*)::int from lead_identity_reviews where workspace_id=l.workspace_id and lead_id=l.id and state='resolved') resolved,
        (select count(*)::int from lead_identity_candidates where workspace_id=l.workspace_id and review_id in
          (select id from lead_identity_reviews where workspace_id=l.workspace_id and lead_id=l.id) and company_id=$3) company_candidates,
        (select count(*)::int from lead_identity_candidates c join lead_identity_reviews r
          on r.workspace_id=c.workspace_id and r.id=c.review_id
          where r.workspace_id=l.workspace_id and r.lead_id=l.id and r.state='pending' and c.contact_id=$4) pending_contact_candidates,
        (select count(*)::int from lead_identity_decisions x join lead_identity_reviews r
          on r.workspace_id=x.workspace_id and r.id=x.review_id
          where r.workspace_id=l.workspace_id and r.lead_id=l.id and r.state='resolved'
            and x.governing_outcome='resolve' and x.company_action='link' and x.company_id=$3
            and x.company_target_version=$5 and x.contact_action='dismiss' and x.contact_id is null) company_resolutions,
        (select count(*)::int from lead_identity_decision_heads h join lead_identity_decisions x
          on x.workspace_id=h.workspace_id and x.intake_id=h.intake_id and x.id=h.decision_id
          join lead_identity_reviews r on r.workspace_id=x.workspace_id and r.id=x.review_id
          where r.workspace_id=l.workspace_id and r.lead_id=l.id and r.state='resolved'
            and x.company_id=$3) company_resolution_heads
       from leads l join lead_lifecycle_definitions d on d.id=l.lifecycle_definition_id where l.workspace_id=$1 and l.id=$2`,
        [
          f.actor.workspaceId,
          result.recordId,
          f.company.id,
          contact.id,
          f.company.version,
        ],
      )
    ).rows[0];
    expect(state).toMatchObject({
      reviewStatus: "pending",
      companyId: f.company.id,
      contactId: null,
      lifecycle: "new",
      status: "open",
      pending: 1,
      resolved: 1,
      company_candidates: 1,
      pending_contact_candidates: 1,
      company_resolutions: 1,
      company_resolution_heads: 1,
    });
  });

  it("changes only operational stage/profile facts and preserves lifecycle, status, review and conversion lineage", async () => {
    const f = await fixture(),
      created = await createLeadScreenV2(pool, {
        actor: f.actor,
        command: command(f),
        key: `screen-create-${randomUUID()}`,
        requestId: randomUUID(),
      });
    const edit = command(f);
    edit.contractVersion = "lead-screen-create.v2";
    const editCommand = {
      contractVersion: "lead-screen-edit.v2" as const,
      expectedVersion: created.version,
      profile: {
        ...edit.profile,
        stageId: f.stages[1].id,
        stageUpdatedAt: f.stages[1].updatedAt.toISOString(),
        rating: "hot" as const,
      },
      assignment,
    };
    const result = await editLeadScreenV2(pool, {
      actor: f.actor,
      leadId: created.recordId,
      command: editCommand,
      key: `screen-edit-${randomUUID()}`,
      requestId: randomUUID(),
    });
    expect(result).toMatchObject({
      version: 2,
      identityReview: { companyDimension: "resolved", contactDimension: "resolved" },
    });
    const row = (
      await pool.query(
        `select l.status,d.code lifecycle,l.stage_id "stageId",l.identity_review_status "reviewStatus",
        (select count(*)::int from lead_deal_conversion_lineage where workspace_id=l.workspace_id and lead_record_id=l.id) lineage
       from leads l join lead_lifecycle_definitions d on d.id=l.lifecycle_definition_id where l.id=$1`,
        [created.recordId],
      )
    ).rows[0];
    expect(row).toMatchObject({
      status: "open",
      lifecycle: "new",
      stageId: f.stages[1].id,
      reviewStatus: "resolved",
      lineage: 0,
    });
  });

  it("edits only the current source tuple and preserves original Lead and intake provenance", async () => {
    const f=await fixture(),base=command(f),created=await createLeadScreenV2(pool,{actor:f.actor,key:`source-create-${randomUUID()}`,requestId:randomUUID(),
      command:{...base,profile:{...base.profile,source:"social_media",sourcePlatform:"linkedin"}}});
    const cleared=await editLeadScreenV2(pool,{actor:f.actor,leadId:created.recordId,key:`source-clear-${randomUUID()}`,requestId:randomUUID(),command:{
      contractVersion:"lead-screen-edit.v2",expectedVersion:created.version,profile:{...base.profile,source:"manual",sourcePlatform:null},assignment}});
    const clearedDetail=await getScreenProfileV1(pool,f.actor,"lead",created.recordId,randomUUID());
    expect(clearedDetail.kind).toBe("lead");
    if(clearedDetail.kind!=="lead")throw new Error("expected Lead detail");
    expect(clearedDetail.base).toMatchObject({source:"manual",sourcePlatform:null});
    const social=await editLeadScreenV2(pool,{actor:f.actor,leadId:created.recordId,key:`source-social-${randomUUID()}`,requestId:randomUUID(),command:{
      contractVersion:"lead-screen-edit.v2",expectedVersion:cleared.version,profile:{...base.profile,source:"social_media",sourcePlatform:"instagram"},assignment}});
    expect(social.version).toBe(3);
    const facts=(await pool.query(`select l.source "currentSource",l.source_platform "currentPlatform",
      l.original_source_category "originalSource",l.original_source_platform "originalPlatform",
      i.source_category "intakeSource",i.source_platform "intakePlatform" from leads l join lead_intakes i
      on i.workspace_id=l.workspace_id and i.lead_id=l.id where l.workspace_id=$1 and l.id=$2`,[f.actor.workspaceId,created.recordId])).rows[0];
    expect(facts).toEqual({currentSource:"social_media",currentPlatform:"instagram",originalSource:"social_media",originalPlatform:"linkedin",intakeSource:"social_media",intakePlatform:"linkedin"});
    const detail=await getScreenProfileV1(pool,f.actor,"lead",created.recordId,randomUUID());
    expect(detail.kind).toBe("lead");
    if(detail.kind!=="lead")throw new Error("expected Lead detail");
    expect(detail.base).toMatchObject({source:"social_media",sourcePlatform:"instagram"});
  });

  it("reads legacy unknown Lead consent and preserves it during an unrelated edit without fabricating evidence", async () => {
    const f = await fixture(),
      baseCommand = command(f),
      createCommand = {
        ...baseCommand,
        profile: { ...baseCommand.profile, promotionalEmailOptOut: null },
      };
    const created = await createLeadScreenV2(pool, {
      actor: f.actor,
      command: createCommand,
      key: `screen-null-consent-${randomUUID()}`,
      requestId: randomUUID(),
    });
    const view = await getScreenProfileV1(
      pool,
      f.actor,
      "lead",
      created.recordId,
      randomUUID(),
    );
    expect(view).toMatchObject({
      kind: "lead",
      categories: { consent: { disclosure: "full", value: null } },
    });

    const editCommand = {
      contractVersion: "lead-screen-edit.v2" as const,
      expectedVersion: created.version,
      profile: {
        ...createCommand.profile,
        jobTitle: "Analytical Engine Programmer",
      },
      assignment,
    };
    await editLeadScreenV2(pool, {
      actor: f.actor,
      leadId: created.recordId,
      command: editCommand,
      key: `screen-edit-null-consent-${randomUUID()}`,
      requestId: randomUUID(),
    });
    expect((await pool.query(
      `select promotional_email_opt_out "value",promotional_email_opt_out_recorded_at "recordedAt",
        promotional_email_opt_out_source "source" from leads where workspace_id=$1 and id=$2`,
      [f.actor.workspaceId, created.recordId],
    )).rows[0]).toEqual({ value: null, recordedAt: null, source: null });
  });

  it("fails Lead review presentation closed on missing heads and legacy not-required roots", async () => {
    const first = await fixture();
    const missingHead = await createLeadScreenV2(pool, {
      actor: first.actor,
      command: command(first),
      key: `screen-missing-head-${randomUUID()}`,
      requestId: randomUUID(),
    });
    await pool.query(
      `delete from lead_identity_decision_heads where workspace_id=$1 and intake_id in
       (select intake_id from lead_identity_reviews where workspace_id=$1 and lead_id=$2)`,
      [first.actor.workspaceId, missingHead.recordId],
    );
    await expect(getScreenProfileV1(
      pool, first.actor, "lead", missingHead.recordId, randomUUID(),
    )).rejects.toMatchObject({ code: "authority_conflict" });

    const second = await fixture();
    const inconsistent = await createLeadScreenV2(pool, {
      actor: second.actor,
      command: command(second),
      key: `screen-not-required-${randomUUID()}`,
      requestId: randomUUID(),
    });
    await pool.query(
      `update leads set identity_review_status='not_required' where workspace_id=$1 and id=$2`,
      [second.actor.workspaceId, inconsistent.recordId],
    );
    await expect(getScreenProfileV1(
      pool, second.actor, "lead", inconsistent.recordId, randomUUID(),
    )).rejects.toMatchObject({ code: "authority_conflict" });

    const third = await fixture();
    const mismatched = await createLeadScreenV2(pool, {
      actor: third.actor,
      command: command(third),
      key: `screen-company-mismatch-${randomUUID()}`,
      requestId: randomUUID(),
    });
    const otherCompany = (await pool.query<{ id: string }>(
      `insert into companies(workspace_id,display_name,name_normalized,normalization_version,status,visibility,
       governing_operation_id,created_by_membership_id,updated_by_membership_id,authority_contract_version)
       values($1,'Other Company','other company','customer-graph-v1','active','workspace',$2,$3,$3,'customer-graph-v1') returning id`,
      [third.actor.workspaceId, randomUUID(), third.actor.membershipId],
    )).rows[0];
    await pool.query(
      `update leads set company_id=$3,company='Other Company' where workspace_id=$1 and id=$2`,
      [third.actor.workspaceId, mismatched.recordId, otherCompany.id],
    );
    await expect(getScreenProfileV1(
      pool, third.actor, "lead", mismatched.recordId, randomUUID(),
    )).rejects.toMatchObject({ code: "authority_conflict" });
  });

  it.each(["create", "link", "dismiss"] as const)(
    "opens a canonical resolved Lead with Contact %s lineage",
    async contactAction => {
      const f = await fixture(), resolved = await canonicalResolvedLead(f, contactAction);
      const profile = await getScreenProfileV1(pool, f.actor, "lead", resolved.leadId, randomUUID());
      expect(profile).toMatchObject({ kind: "lead", recordId: resolved.leadId,
        identityReview: { companyDimension: "resolved", contactDimension: "resolved" } });
    },
  );

  it("fails canonical resolved Lead presentation closed on Contact and candidate lineage mismatch", async () => {
    const first = await fixture(), contactMismatch = await canonicalResolvedLead(first, "create");
    await pool.query("update leads set contact_id=null where workspace_id=$1 and id=$2",
      [first.actor.workspaceId, contactMismatch.leadId]);
    await expect(getScreenProfileV1(pool, first.actor, "lead", contactMismatch.leadId, randomUUID()))
      .rejects.toMatchObject({ code: "authority_conflict" });

    const second = await fixture(), candidateMismatch = await canonicalResolvedLead(second, "link");
    const corruption = await pool.connect();
    try {
      await corruption.query("set session_replication_role=replica");
      await corruption.query(`update lead_identity_candidates set target_version=target_version+1
        where workspace_id=$1 and review_id=$2 and contact_id=$3`,
      [second.actor.workspaceId, candidateMismatch.reviewId, candidateMismatch.contactId]);
    } finally {
      await corruption.query("set session_replication_role=origin");
      corruption.release();
    }
    await expect(getScreenProfileV1(pool, second.actor, "lead", candidateMismatch.leadId, randomUUID()))
      .rejects.toMatchObject({ code: "authority_conflict" });
  });

  it("rolls back all Lead effects when the selected Company version is stale", async () => {
    const f = await fixture(),
      stale = command(f);
    await pool.query(
      `update companies set version=version+1,updated_at=now() where workspace_id=$1 and id=$2`,
      [f.actor.workspaceId, f.company.id],
    );
    await expect(
      createLeadScreenV2(pool, {
        actor: f.actor,
        command: stale,
        key: `screen-stale-${randomUUID()}`,
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: "selection_unavailable",
      fields: ["profile.company"],
      selection: {
        field: "profile.company",
        optionKind: "company",
        submitted: {
          id: f.company.id,
          target: { kind: "version", version: 1 },
        },
        outcome: "changed",
        currentTarget: { kind: "version", version: 2 },
      },
    });
    expect(
      (
        await pool.query(
          `select count(*)::int count from leads where workspace_id=$1`,
          [f.actor.workspaceId],
        )
      ).rows[0].count,
    ).toBe(0);
    expect(
      (
        await pool.query(
          `select count(*)::int count from idempotency_records where principal_key like $1`,
          [`workspace:${f.actor.workspaceId}:%`],
        )
      ).rows[0].count,
    ).toBe(0);
  });
});
