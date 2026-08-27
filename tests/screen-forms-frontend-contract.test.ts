import { describe, expect, it } from "vitest";
import {
  contactScreenEditCommandV2Schema,
  leadScreenCreateCommandV2Schema,
  leadIdentityReviewOutcomeV1Schema,
  screenProfileResultV1Schema,
  leadScreenProfileV2Schema,
  screenFormsErrorEnvelopeV1Schema,
  screenFormSelectedOptionQueryV1Schema,
  screenFormSelectedOptionV1Schema,
  screenProfileDetailV1Schema,
} from "../src/frontend/features/screen-forms/contracts/screen-forms.contracts";
import {
  contactInternalNoteAddCommandV1Schema,
  contactInternalNoteErrorV1Schema,
  contactInternalNoteListQueryV1Schema,
} from "../src/frontend/features/screen-forms/contracts/contact-note.contracts";

const id = "10000000-0000-4000-8000-000000000001";
const assignment = { responsibleMembershipId: null, responsibleMembershipVersion: null,
  responsibleTeamId: null, responsibleTeamVersion: null, visibility: "workspace" as const,
  visibleTeamIds: [], visibleTeamVersions: {} };
const profile = { salutation: null, firstName: "Ari", lastName: "Lane",
  company: { snapshotName: "Current Company", companyId: id, companyVersion: 1 }, jobTitle: null,
  primaryEmail: "ari@example.test", secondaryEmail: null, officePhone: null, mobilePhone: null,
  fax: null, website: null, twitterHandle: null, promotionalEmailOptOut: null,
  source: "manual" as const, stageId: id, stageUpdatedAt: "2026-08-26T12:00:00.000Z",
  rating: null, industry: null, annualRevenue: null, employeeCount: null,
  address: { street: null, city: null, stateProvince: null, postalCode: null, country: null } };

describe("SCREEN-FORMS revised frontend transport parity", () => {
  it("preserves unknown consent and requires the explicit Contact-dismiss intent", () => {
    expect(leadScreenProfileV2Schema.parse(profile).promotionalEmailOptOut).toBeNull();
    expect(leadScreenCreateCommandV2Schema.safeParse({ contractVersion: "lead-screen-create.v2", contactDisposition: "dismiss", profile, assignment }).success).toBe(true);
    expect(leadScreenCreateCommandV2Schema.safeParse({ contractVersion: "lead-screen-create.v2", profile, assignment }).success).toBe(false);
  });

  it("requires a governed platform only for Social media attribution", () => {
    expect(leadScreenProfileV2Schema.safeParse({ ...profile, source: "social_media", sourcePlatform: null }).success).toBe(false);
    expect(leadScreenProfileV2Schema.safeParse({ ...profile, source: "social_media", sourcePlatform: "linkedin" }).success).toBe(true);
    expect(leadScreenProfileV2Schema.safeParse({ ...profile, source: "social_media", sourcePlatform: "other_social" }).success).toBe(false);
    expect(leadScreenProfileV2Schema.safeParse({ ...profile, source: "manual", sourcePlatform: "linkedin" }).success).toBe(false);
    expect(leadScreenProfileV2Schema.parse(profile).sourcePlatform).toBeUndefined();
  });

  it("binds Notes writes to a positive Contact version", () => {
    expect(contactInternalNoteAddCommandV1Schema.safeParse({ contractVersion: "contact-internal-note-add.v1", expectedContactVersion: 2, body: "Follow up next week." }).success).toBe(true);
    expect(contactInternalNoteAddCommandV1Schema.safeParse({ contractVersion: "contact-internal-note-add.v1", expectedContactVersion: 0, body: "Follow up." }).success).toBe(false);
  });

  it("accepts legacy-null Contact lifecycle only on reads and never on writes", () => {
    const detail = {
      contractVersion: "screen-profile-detail.v1",
      kind: "contact",
      recordId: id,
      version: 2,
      base: { salutation: null, firstName: "Ada", lastName: "Lovelace", jobTitle: null, department: null, lifecycleStage: null },
      categories: {
        channels: { disclosure: "full", value: { primaryEmail: "ada@example.test", secondaryEmail: null, directPhone: null, mobilePhone: null, linkedinUrl: null } },
        address: { disclosure: "full", value: { street: null, city: null, stateProvince: null, postalCode: null, country: null } },
        notes: { disclosure: "full", value: { listRoute: `/api/workspaces/${id}/contacts/${id}/notes` } },
        hierarchy: { disclosure: "full", value: { company: null } },
      },
      assignment: { disclosure: "full", value: { responsibleMembershipId: null, responsibleMembershipVersion: null, responsibleTeamId: null, responsibleTeamVersion: null, visibility: "workspace", visibleTeams: [] } },
      capabilities: { canEdit: true, canManageAssignment: true, canWriteSensitiveProfile: true },
      requestId: id,
    };
    expect(screenProfileDetailV1Schema.safeParse(detail).success).toBe(true);
    expect(contactScreenEditCommandV2Schema.safeParse({
      contractVersion: "contact-screen-edit.v2",
      expectedVersion: 2,
      profile: { salutation: null, firstName: "Ada", lastName: "Lovelace", jobTitle: null, department: null,
        primaryEmail: "ada@example.test", secondaryEmail: null, directPhone: null, mobilePhone: null, linkedinUrl: null,
        lifecycleStage: null, company: null, address: { street: null, city: null, stateProvince: null, postalCode: null, country: null } },
      assignment,
    }).success).toBe(false);
  });

  it("keeps Notes list queries strict and stale reconciliation owned", () => {
    expect(contactInternalNoteListQueryV1Schema.safeParse({ limit: 25, extra: true }).success).toBe(false);
    expect(contactInternalNoteErrorV1Schema.safeParse({ error: { code: "stale_version", message: "Contact changed.", retryable: false,
      reconciliation: { required: true, action: "refetch_contact" }, zeroPartialEffects: true }, requestId: id }).success).toBe(true);
  });

  it("rejects incorrect Screen Forms reconciliation combinations", () => {
    const submitted={id,target:{kind:"version" as const,version:1}};
    expect(screenFormsErrorEnvelopeV1Schema.safeParse({ error: { code: "selection_unavailable", message: "Selection changed.", retryable: false,
      reconciliation: { required: true, action: "retry_same_request" }, fields:["profile.company"], selection:{field:"profile.company",optionKind:"company",submitted,outcome:"changed",currentTarget:{kind:"version",version:2}}, zeroPartialEffects: true }, requestId: id }).success).toBe(false);
  });

  it("mirrors targeted selected-option identity and field reconciliation", () => {
    const submitted={id,target:{kind:"version" as const,version:1}};
    expect(screenFormSelectedOptionQueryV1Schema.safeParse({kind:"lead",optionKind:"company",...submitted}).success).toBe(true);
    const unchanged={contractVersion:"screen-form-selected-option.v1",kind:"lead",optionKind:"company",selected:{submitted,outcome:"unchanged",current:{id,label:"Updated presentation",target:submitted.target}},requestId:id};
    expect(screenFormSelectedOptionV1Schema.safeParse(unchanged).success).toBe(true);
    expect(screenFormSelectedOptionV1Schema.safeParse({...unchanged,selected:{...unchanged.selected,current:{...unchanged.selected.current,target:{kind:"version",version:2}}}}).success).toBe(false);
    expect(screenFormsErrorEnvelopeV1Schema.safeParse({error:{code:"selection_unavailable",message:"Selection unavailable.",retryable:false,reconciliation:{required:true,action:"refetch_bootstrap"},fields:["profile.company"],selection:{field:"profile.company",optionKind:"company",submitted,outcome:"unavailable"},zeroPartialEffects:true},requestId:id}).success).toBe(true);
  });

  it("accepts only the owner-presented split Identity Review outcome", () => {
    expect(leadIdentityReviewOutcomeV1Schema.safeParse({ companyDimension: "resolved", contactDimension: "pending" }).success).toBe(true);
    expect(leadIdentityReviewOutcomeV1Schema.safeParse({ companyDimension: "resolved", contactDimension: "resolved" }).success).toBe(true);
    expect(leadIdentityReviewOutcomeV1Schema.safeParse({ companyDimension: "not_required", contactDimension: "resolved" }).success).toBe(false);
    const base = { contractVersion: "screen-profile-result.v1", kind: "lead", recordId: id, version: 1, replayed: false, requestId: id };
    expect(screenProfileResultV1Schema.safeParse(base).success).toBe(false);
    expect(screenProfileResultV1Schema.safeParse({ ...base, identityReview: { companyDimension: "resolved", contactDimension: "pending" } }).success).toBe(true);
  });
});
