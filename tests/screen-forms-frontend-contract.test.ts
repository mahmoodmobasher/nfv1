import { describe, expect, it } from "vitest";
import {
  leadScreenCreateCommandV2Schema,
  leadIdentityReviewOutcomeV1Schema,
  screenProfileResultV1Schema,
  leadScreenProfileV2Schema,
  screenFormsErrorEnvelopeV1Schema,
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

  it("binds Notes writes to a positive Contact version", () => {
    expect(contactInternalNoteAddCommandV1Schema.safeParse({ contractVersion: "contact-internal-note-add.v1", expectedContactVersion: 2, body: "Follow up next week." }).success).toBe(true);
    expect(contactInternalNoteAddCommandV1Schema.safeParse({ contractVersion: "contact-internal-note-add.v1", expectedContactVersion: 0, body: "Follow up." }).success).toBe(false);
  });

  it("keeps Notes list queries strict and stale reconciliation owned", () => {
    expect(contactInternalNoteListQueryV1Schema.safeParse({ limit: 25, extra: true }).success).toBe(false);
    expect(contactInternalNoteErrorV1Schema.safeParse({ error: { code: "stale_version", message: "Contact changed.", retryable: false,
      reconciliation: { required: true, action: "refetch_contact" }, zeroPartialEffects: true }, requestId: id }).success).toBe(true);
  });

  it("rejects incorrect Screen Forms reconciliation combinations", () => {
    expect(screenFormsErrorEnvelopeV1Schema.safeParse({ error: { code: "selection_unavailable", message: "Selection changed.", retryable: false,
      reconciliation: { required: true, action: "retry_same_request" }, zeroPartialEffects: true }, requestId: id }).success).toBe(false);
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
