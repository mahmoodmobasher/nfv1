import { describe, expect, it } from "vitest";
import {
  companyScreenCreateCommandV2Schema,
  contactScreenCreateCommandV2Schema,
  leadScreenCreateCommandV2Schema,
  screenFormBootstrapV1Schema,
  screenFormSelectedOptionQueryV1Schema,
  screenFormSelectedOptionV1Schema,
  screenFormsErrorEnvelopeV1Schema,
  screenProfileResultV1Schema,
} from "../src/backend/modules/screen-forms/contracts/screen-forms.contract";

const id = () => crypto.randomUUID();
const address = { street: null, city: null, stateProvince: null, postalCode: null, country: null };
const assignment = {
  responsibleMembershipId: null,
  responsibleMembershipVersion: null,
  responsibleTeamId: null,
  responsibleTeamVersion: null,
  visibility: "workspace" as const,
  visibleTeamIds: [],
  visibleTeamVersions: {},
};

describe("SCREEN-FORMS-01 strict transport", () => {
  it("returns a versioned Company selection for explicit Lead quick-create", () => {
    const recordId = id(), result = {
      contractVersion: "screen-profile-result.v1" as const,
      kind: "company" as const,
      recordId,
      version: 1,
      replayed: false,
      requestId: id(),
      selection: { id: recordId, label: "Northwind", target: { kind: "version" as const, version: 1 } },
    };
    expect(screenProfileResultV1Schema.parse(result)).toEqual(result);
    expect(screenProfileResultV1Schema.safeParse({ ...result, selection: { ...result.selection, id: id() } }).success).toBe(false);
  });

  it("publishes only the minimized server-owned Lead identity review outcome", () => {
    const result = {
      contractVersion: "screen-profile-result.v1" as const,
      kind: "lead" as const,
      recordId: id(),
      version: 1,
      replayed: false,
      requestId: id(),
      identityReview: { companyDimension: "resolved" as const, contactDimension: "pending" as const },
    };
    const parsed = screenProfileResultV1Schema.parse(result);
    expect(parsed.kind).toBe("lead");
    if (parsed.kind !== "lead") throw new Error("expected Lead result");
    expect(parsed.identityReview.contactDimension).toBe("pending");
    expect(screenProfileResultV1Schema.safeParse({...result, identityReview:{...result.identityReview, candidates:[]}}).success).toBe(false);
  });

  it("keeps Company revenue exact and distinct from Deal numeric values", () => {
    const command = {
      contractVersion: "company-screen-create.v2" as const,
      profile: {
        name: "Northwind",
        domain: null,
        website: "https://northwind.example",
        industry: "Distribution",
        sizeBand: "medium" as const,
        employeeCount: 250,
        annualRevenue: { amountMinor: "90071992547409919999", currencyCode: "CAD" as const, currencyExponent: 2 as const },
        parentCompanyId: null,
        parentCompanyVersion: null,
        phone: null,
        address,
      },
      assignment,
    };
    expect(companyScreenCreateCommandV2Schema.parse(command).profile.annualRevenue?.amountMinor)
      .toBe("90071992547409919999");
    expect(companyScreenCreateCommandV2Schema.safeParse({
      ...command,
      profile: { ...command.profile, annualRevenue: { amountMinor: 10, currencyCode: "CAD", currencyExponent: 2 } },
    }).success).toBe(false);
    expect(companyScreenCreateCommandV2Schema.safeParse({
      ...command,
      profile: { ...command.profile, annualRevenue: { amountMinor: "10", currencyCode: "EUR", currencyExponent: 2 } },
    }).success).toBe(false);
  });

  it("enforces required Contact identity fields and bounded sensitive values", () => {
    const command = {
      contractVersion: "contact-screen-create.v2" as const,
      profile: {
        salutation: null,
        firstName: "Ada",
        lastName: "Lovelace",
        jobTitle: null,
        department: null,
        primaryEmail: "ada@example.test",
        secondaryEmail: null,
        directPhone: null,
        mobilePhone: null,
        linkedinUrl: null,
        lifecycleStage: "lead" as const,
        company: null,
        address,
      },
      assignment,
    };
    expect(contactScreenCreateCommandV2Schema.parse(command).profile.primaryEmail).toBe("ada@example.test");
    expect(contactScreenCreateCommandV2Schema.safeParse({
      ...command,
      profile: { ...command.profile, firstName: "" },
    }).success).toBe(false);
    expect(contactScreenCreateCommandV2Schema.safeParse({ ...command, initialNote: "A cross-owner shortcut" }).success).toBe(false);
    expect(contactScreenCreateCommandV2Schema.safeParse({
      ...command,
      profile: { ...command.profile, linkedinUrl: "http://linkedin.com/in/ada" },
    }).success).toBe(false);
  });

  it("keeps Lead stage, lifecycle, rating, consent, and Company semantics separate", () => {
    const command = {
      contractVersion: "lead-screen-create.v2" as const,
      contactDisposition: "dismiss" as const,
      profile: {
        salutation: null,
        firstName: "Grace",
        lastName: "Hopper",
        company: { snapshotName: "Navy", companyId: id(), companyVersion: 1 },
        jobTitle: null,
        primaryEmail: "grace@example.test",
        secondaryEmail: null,
        officePhone: null,
        mobilePhone: null,
        fax: null,
        website: null,
        twitterHandle: "@ghopper",
        promotionalEmailOptOut: true,
        source: "manual" as const,
        stageId: id(),
        stageUpdatedAt: new Date().toISOString(),
        rating: "hot" as const,
        industry: null,
        annualRevenue: null,
        employeeCount: null,
        address,
      },
      assignment,
    };
    expect(leadScreenCreateCommandV2Schema.parse(command).profile).toMatchObject({
      stageId: command.profile.stageId,
      promotionalEmailOptOut: true,
      rating: "hot",
    });
    expect(leadScreenCreateCommandV2Schema.parse({
      ...command,
      profile: { ...command.profile, promotionalEmailOptOut: null },
    }).profile.promotionalEmailOptOut).toBeNull();
    expect(leadScreenCreateCommandV2Schema.safeParse({
      ...command,
      profile: { ...command.profile, status: "won" },
    }).success).toBe(false);
    expect(leadScreenCreateCommandV2Schema.safeParse({
      ...command,
      profile: { ...command.profile, lifecycle: "converted" },
    }).success).toBe(false);
    expect(leadScreenCreateCommandV2Schema.safeParse({
      ...command,
      profile: { ...command.profile, rating: "active" },
    }).success).toBe(false);
  });

  it("keeps bootstrap PII-free, bounded, and strict", () => {
    const bootstrap = {
      contractVersion: "screen-form-bootstrap.v1" as const,
      kind: "lead" as const,
      capabilities: { canCreate: true, canCreateCompany: true, canManageAssignment: true, canWriteSensitiveProfile: true },
      requestId: id(),
    };
    expect(screenFormBootstrapV1Schema.parse(bootstrap)).toEqual(bootstrap);
    expect(screenFormBootstrapV1Schema.safeParse({ ...bootstrap, email: "secret@example.test" }).success).toBe(false);
    expect(screenFormBootstrapV1Schema.safeParse({ ...bootstrap, options: { companies: [] } }).success).toBe(false);
  });

  it("requires a strict zero-partial-effects failure envelope", () => {
    const failure = {
      error: {
        code: "stale_version" as const,
        message: "Reload the latest record.",
        retryable: false,
        reconciliation: { required: true, action: "refetch_record" as const },
        fields: ["profile.address.postalCode"],
        zeroPartialEffects: true as const,
      },
      requestId: id(),
    };
    expect(screenFormsErrorEnvelopeV1Schema.parse(failure)).toEqual(failure);
    expect(screenFormsErrorEnvelopeV1Schema.safeParse({
      ...failure,
      error: { ...failure.error, requestBody: { primaryEmail: "secret@example.test" } },
    }).success).toBe(false);
    expect(screenFormsErrorEnvelopeV1Schema.safeParse({
      ...failure,
      error: { ...failure.error, zeroPartialEffects: false },
    }).success).toBe(false);
  });

  it("reconciles one selected option independently of the search page and label", () => {
    const stageId=id(), submitted={id:stageId,target:{kind:"updated_at" as const,updatedAt:"2026-08-26T12:00:00.000Z"}};
    expect(screenFormSelectedOptionQueryV1Schema.parse({kind:"lead",optionKind:"lead_stage",...submitted})).toEqual({kind:"lead",optionKind:"lead_stage",...submitted});
    const unchanged={contractVersion:"screen-form-selected-option.v1" as const,kind:"lead" as const,optionKind:"lead_stage" as const,selected:{submitted,outcome:"unchanged" as const,current:{id:stageId,label:"Replacement label",target:submitted.target}},requestId:id()};
    expect(screenFormSelectedOptionV1Schema.parse(unchanged)).toEqual(unchanged);
    expect(screenFormSelectedOptionV1Schema.safeParse({...unchanged,selected:{...unchanged.selected,current:{...unchanged.selected.current,target:{kind:"updated_at",updatedAt:"2026-08-26T12:01:00.000Z"}}}}).success).toBe(false);
    expect(screenFormSelectedOptionQueryV1Schema.safeParse({kind:"lead",optionKind:"lead_stage",id:stageId,target:{kind:"version",version:1}}).success).toBe(false);
  });

  it("requires field-specific changed or unavailable selection reconciliation", () => {
    const submitted={id:id(),target:{kind:"version" as const,version:1}};
    const base={error:{code:"selection_unavailable" as const,message:"The selected Company changed.",retryable:false,reconciliation:{required:true,action:"refetch_bootstrap" as const},fields:["profile.company"],zeroPartialEffects:true as const},requestId:id()};
    const changed={...base,error:{...base.error,selection:{field:"profile.company" as const,optionKind:"company" as const,submitted,outcome:"changed" as const,currentTarget:{kind:"version" as const,version:2}}}};
    expect(screenFormsErrorEnvelopeV1Schema.parse(changed)).toEqual(changed);
    const unavailable={...base,error:{...base.error,selection:{field:"profile.company" as const,optionKind:"company" as const,submitted,outcome:"unavailable" as const}}};
    expect(screenFormsErrorEnvelopeV1Schema.parse(unavailable)).toEqual(unavailable);
    expect(screenFormsErrorEnvelopeV1Schema.safeParse(base).success).toBe(false);
    expect(screenFormsErrorEnvelopeV1Schema.safeParse({...unavailable,error:{...unavailable.error,selection:{...unavailable.error.selection,currentTarget:{kind:"version",version:2}}}}).success).toBe(false);
    expect(screenFormsErrorEnvelopeV1Schema.safeParse({...changed,error:{...changed.error,fields:["profile.stageId"]}}).success).toBe(false);
  });
});
