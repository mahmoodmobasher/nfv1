import { describe, expect, it } from "vitest";
import { leadInquiryIntakeCommandV1Schema } from "../src/backend/modules/leads";
import { identityReviewDecisionCommandV1Schema } from "../src/backend/modules/identity-review";
import { canonicalRequestHash } from "../src/backend/platform/idempotency";

const base = { contractVersion: "lead-inquiry-intake.v1", intakeChannel: "manual", person: { displayName: "Ada Lovelace", email: "ADA@Example.test" },
  inquiry: { receivedAt: "2026-08-25T12:00:00.000Z" }, source: { sourceCategory: "manual", sourceMedium: "unknown", attributionContractVersion: "p1a-attribution-v1" } };

describe("lead-inquiry-intake.v1 contract", () => {
  it("accepts manual minimum identity and rejects disabled channels", () => {
    expect(leadInquiryIntakeCommandV1Schema.safeParse(base).success).toBe(true);
    expect(leadInquiryIntakeCommandV1Schema.safeParse({ ...base, intakeChannel: "web_form" }).success).toBe(false);
    expect(leadInquiryIntakeCommandV1Schema.safeParse({ ...base, person: { displayName: "No identity" } }).success).toBe(false);
  });
  it("validates social attribution as one controlled unit", () => {
    expect(leadInquiryIntakeCommandV1Schema.safeParse({ ...base, source: { sourceCategory: "social_media", sourcePlatform: "instagram", sourceMedium: "organic" } }).success).toBe(true);
    expect(leadInquiryIntakeCommandV1Schema.safeParse({ ...base, source: { sourceCategory: "social_media", sourceMedium: "unknown" } }).success).toBe(false);
    expect(leadInquiryIntakeCommandV1Schema.safeParse({ ...base, source: { sourceCategory: "manual", sourcePlatform: "instagram", sourceMedium: "unknown" } }).success).toBe(false);
    expect(leadInquiryIntakeCommandV1Schema.safeParse({ ...base, source: { sourceCategory: "social_media", sourcePlatform: "other_social", sourceMedium: "unknown", sourceDetail: { operator_context: "Community" } } }).success).toBe(true);
  });
  it("hashes objects deterministically and distinguishes changed attribution", () => {
    expect(canonicalRequestHash({ b: 2, a: 1 })).toBe(canonicalRequestHash({ a: 1, b: 2 }));
    expect(canonicalRequestHash(base)).not.toBe(canonicalRequestHash({ ...base, source: { ...base.source, sourceCategory: "referral" } }));
  });
  it("fixtures explicit non-mutating Hold separately from complete Resolve", () => {
    const expected = { contractVersion: "lead-identity-review-decision.v1", expectedLeadVersion: 1,
      expectedReviewVersion: 1, expectedIntakeVersion: 2 };
    expect(identityReviewDecisionCommandV1Schema.safeParse({ ...expected, outcome: "hold" }).success).toBe(true);
    expect(identityReviewDecisionCommandV1Schema.safeParse({ ...expected, outcome: "hold", contact: { action: "create" } }).success).toBe(false);
    expect(identityReviewDecisionCommandV1Schema.safeParse({ ...expected, outcome: "resolve",
      contact: { action: "dismiss" }, company: { action: "dismiss" } }).success).toBe(true);
    expect(identityReviewDecisionCommandV1Schema.safeParse({ ...expected, outcome: "resolve",
      contact: { action: "dismiss" } }).success).toBe(false);
  });
});
