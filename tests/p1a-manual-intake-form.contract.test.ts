import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapServerFields, serverFieldControls } from "../src/frontend/features/leads/components/manual-lead-intake-form";

const editableCanonicalFields = [
  "person", "person.displayName", "person.firstName", "person.lastName", "person.email", "person.phone",
  "person.phoneCountryOverride", "organization.name", "organization.domain", "inquiry.subject", "inquiry.message",
  "source.sourceCategory", "source.sourcePlatform", "source.sourceMedium", "source.sourceDetail",
  "source.sourceDetail.operator_context", "source.sourceDetail.page", "source.sourceDetail.account",
  "source.sourceDetail.campaign", "source.sourceDetail.ad", "source.sourceDetail.form", "source.sourceDetail.post",
  "source.campaignContext.page", "source.campaignContext.account", "source.campaignContext.campaign",
  "source.campaignContext.ad", "source.campaignContext.form", "source.campaignContext.post",
] as const;

describe("manual intake server validation presentation", () => {
  it("maps every backend-editable canonical validation path to its intended real control", () => {
    expect(Object.keys(serverFieldControls).sort()).toEqual([...editableCanonicalFields].sort());
    for (const path of editableCanonicalFields) {
      const errors = mapServerFields([path]);
      const control=serverFieldControls[path],message=control==="phone"?"Enter a valid phone number in one of the supported formats.":control==="phoneCountry"?"Choose Canada or United States for a national phone number.":"Check this value.";
      expect(errors).toEqual({ [control]: message });
      expect(serverFieldControls[path]).not.toBe("_form");
    }
  });

  it("retains a safe, announced form-level error for unknown or non-editable server paths", () => {
    expect(mapServerFields(["contractVersion"])).toEqual({
      _form: "Some submitted information could not be matched to an editable field. Review the form and try again.",
    });
    expect(mapServerFields(["person.email", "future.canonicalField"])).toEqual({
      email: "Check this value.",
      _form: "Some submitted information could not be matched to an editable field. Review the form and try again.",
    });
  });

  it("keeps stable error IDs, descriptions, summary focus, and change clearing in the rendered component", () => {
    const source = readFileSync("src/frontend/features/leads/components/manual-lead-intake-form.tsx", "utf8");
    const controls = [...new Set(Object.values(serverFieldControls))].filter(control =>
      !["page", "account", "campaign", "ad", "form", "post"].includes(control));
    for (const control of controls) {
      expect(source).toContain(`id=\"${control}-error\"`);
      expect(source).toContain(`described(\"${control}\"`);
    }
    expect(source).toContain("id={`${name}-error`}");
    expect(source).toContain("aria-describedby={described(name)}");
    expect(source).toContain("tabIndex={-1}");
    expect(source).toContain("summary.current?.focus()");
    expect(source).toContain("delete next[id]");
    expect(source).toContain("delete updated.sourcePlatform");
    expect(source).toContain("delete updated.platformDetail");
  });
});
