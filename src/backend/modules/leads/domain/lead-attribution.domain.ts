import type { LeadInquiryIntakeCommandV1 } from "../contracts/lead-inquiry-intake.contract";

export function normalizeText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function normalizeDomain(value?: string): string | null {
  if (!value) return null;
  return value.trim().toLocaleLowerCase("en-US").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function normalizePhone(original: string | undefined, countryOverride?: "CA" | "US") {
  if (!original) return { display: null, normalized: null, country: null };
  const compact = original.trim();
  const digits = compact.replace(/\D/g, "");
  const country = countryOverride ?? "CA";
  const normalized = compact.startsWith("+") ? `+${digits}` : digits.length === 10 && (country === "CA" || country === "US") ? `+1${digits}` : null;
  if (!normalized || !/^\+[1-9]\d{7,14}$/.test(normalized)) throw Object.assign(new Error("validation_failed"), { code: "validation_failed", status: 400 });
  return { display: compact, normalized, country };
}

export function canonicalizeIntake(command: LeadInquiryIntakeCommandV1) {
  const emailDisplay = command.person.email?.trim() ?? null;
  const phone = normalizePhone(command.person.phone, command.person.phoneCountryOverride);
  const sourceDetail: Record<string, string> = { ...command.source.sourceDetail };
  if (command.source.sourcePlatform === "other_social") sourceDetail.platform_context = sourceDetail.operator_context;
  return {
    displayName: command.person.displayName.normalize("NFKC").trim().replace(/\s+/g, " "),
    personNameNormalized: normalizeText(command.person.displayName),
    firstName: command.person.firstName?.normalize("NFKC").trim() ?? null,
    lastName: command.person.lastName?.normalize("NFKC").trim() ?? null,
    emailDisplay,
    emailNormalized: emailDisplay?.toLocaleLowerCase("en-US") ?? null,
    phoneDisplay: phone.display,
    phoneNormalized: phone.normalized,
    phoneCountryCodeUsed: phone.country,
    organizationName: command.organization?.name.normalize("NFKC").trim().replace(/\s+/g, " ") ?? null,
    organizationNameNormalized: command.organization ? normalizeText(command.organization.name) : null,
    organizationDomainNormalized: normalizeDomain(command.organization?.domain),
    receivedAt: new Date(command.inquiry.receivedAt),
    sourceCategory: command.source.sourceCategory,
    sourcePlatform: command.source.sourcePlatform ?? null,
    sourceMedium: command.source.sourceMedium,
    sourceDetail,
    campaignContext: command.source.campaignContext,
    attributionContractVersion: command.source.attributionContractVersion,
  };
}
