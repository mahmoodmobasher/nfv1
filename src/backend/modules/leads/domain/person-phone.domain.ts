import { parsePhoneNumberFromString } from "libphonenumber-js/max";

export const PHONE_NORMALIZATION_VERSION = "p1a-identity-v2" as const;

export type PhoneCountryOverrideV1 = "CA" | "US";
export type PersonPhoneV2 = {
  display: string;
  normalized: string;
  callingCode: string;
  normalizationVersion: typeof PHONE_NORMALIZATION_VERSION;
};

export class PersonPhoneValidationError extends Error {
  constructor(
    public readonly reason:
      | "phone_invalid_characters"
      | "phone_invalid_length"
      | "phone_country_required"
      | "phone_ambiguous_national_form"
      | "phone_extension_unsupported"
      | "phone_invalid_international_form",
    public readonly fields: Array<"person.phone" | "person.phoneCountryOverride"> = ["person.phone"],
  ) {
    super("validation_failed");
  }
}

const extensionPattern = /(?:\bext\b|[x#;,])/iu;
const controlPattern = /[\p{Cc}\p{Cf}]/u;
const permittedPresentationPattern = /^\+?[0-9 ().-]+$/u;

function fail(reason: PersonPhoneValidationError["reason"], country = false): never {
  throw new PersonPhoneValidationError(reason, country
    ? ["person.phone", "person.phoneCountryOverride"]
    : ["person.phone"]);
}

export function parsePersonPhoneV2(
  original: string,
  countryOverride?: PhoneCountryOverrideV1,
): PersonPhoneV2 {
  const display = original.normalize("NFKC").trim();
  if (!display || controlPattern.test(display)) fail("phone_invalid_characters");
  if (extensionPattern.test(display)) fail("phone_extension_unsupported");
  if (!permittedPresentationPattern.test(display)) fail("phone_invalid_characters");
  if (display.slice(1).includes("+")) fail("phone_invalid_characters");

  const digits = display.replace(/[ ().-]/g, "");
  if (display.startsWith("+")) {
    const internationalDigits = digits.slice(1);
    if (!/^[1-9]\d{7,14}$/.test(internationalDigits)) fail("phone_invalid_international_form");
    const normalized = `+${internationalDigits}`;
    const parsed = parsePhoneNumberFromString(normalized);
    if (!parsed || parsed.number !== normalized || !parsed.countryCallingCode) fail("phone_invalid_international_form");
    return { display, normalized, callingCode: `+${parsed.countryCallingCode}`, normalizationVersion: PHONE_NORMALIZATION_VERSION };
  }

  if (!countryOverride) fail("phone_country_required", true);
  if (!/^\d+$/.test(digits)) fail("phone_invalid_characters");
  if (digits.length === 11 && !digits.startsWith("1")) fail("phone_ambiguous_national_form", true);
  if (digits.length !== 10 && !(digits.length === 11 && digits.startsWith("1"))) fail("phone_invalid_length");
  const normalized = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  return { display, normalized, callingCode: "+1", normalizationVersion: PHONE_NORMALIZATION_VERSION };
}

export function optionalPersonPhoneV2(
  original?: string,
  countryOverride?: PhoneCountryOverrideV1,
): PersonPhoneV2 | null {
  return original === undefined ? null : parsePersonPhoneV2(original, countryOverride);
}
