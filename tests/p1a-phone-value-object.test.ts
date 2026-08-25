import { describe, expect, it } from "vitest";
import { parsePersonPhoneV2, PersonPhoneValidationError, PHONE_NORMALIZATION_VERSION } from "../src/backend/modules/leads";

describe("P1A authoritative phone value object", () => {
  it.each([
    ["6473894802", "CA", "+16473894802", "+1"],
    ["(647) 389-4802", "CA", "+16473894802", "+1"],
    ["647.389.4802", "US", "+16473894802", "+1"],
    ["16473894802", "US", "+16473894802", "+1"],
    ["1 (647) 389-4802", "CA", "+16473894802", "+1"],
    ["+1 647 389 4802", "US", "+16473894802", "+1"],
    ["+44 20 7946 0958", "CA", "+442079460958", "+44"],
  ] as const)("canonicalizes %s", (input, country, normalized, callingCode) => {
    expect(parsePersonPhoneV2(input, country)).toEqual({ display: input, normalized, callingCode,
      normalizationVersion: PHONE_NORMALIZATION_VERSION });
  });

  it.each(["6473894802 x123", "6473894802 ext 123", "6473894802#123", "26473894802", "64738",
    "++16473894802", "647+3894802", "CALL6473894802", "6473894802\u0000"])("strictly rejects %j", input => {
      expect(() => parsePersonPhoneV2(input, "CA")).toThrow(PersonPhoneValidationError);
  });

  it("reports the country field only when country context is materially responsible", () => {
    try { parsePersonPhoneV2("6473894802"); throw new Error("expected failure"); }
    catch (error) { expect(error).toMatchObject({ fields: ["person.phone", "person.phoneCountryOverride"] }); }
    try { parsePersonPhoneV2("6473894802 x123", "CA"); throw new Error("expected failure"); }
    catch (error) { expect(error).toMatchObject({ fields: ["person.phone"] }); }
  });
});
