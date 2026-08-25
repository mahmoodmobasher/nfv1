import type { LeadInquiryIntakeCommandV1 } from "../contracts/lead-inquiry-intake.contract";
import { optionalPersonPhoneV2 } from "./person-phone.domain";

export function normalizeText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function normalizeDomain(value?: string): string | null {
  if (!value) return null;
  return value.trim().toLocaleLowerCase("en-US").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function canonicalizeIntake(command: LeadInquiryIntakeCommandV1) {
  const emailDisplay = command.person.email?.trim() ?? null;
  const phone = optionalPersonPhoneV2(command.person.phone, command.person.phoneCountryOverride);
  const sourceDetail: Record<string, string> = { ...command.source.sourceDetail };
  if (command.source.sourcePlatform === "other_social") sourceDetail.platform_context = sourceDetail.operator_context;
  return {
    displayName: command.person.displayName.normalize("NFKC").trim().replace(/\s+/g, " "),
    personNameNormalized: normalizeText(command.person.displayName),
    firstName: command.person.firstName?.normalize("NFKC").trim() ?? null,
    lastName: command.person.lastName?.normalize("NFKC").trim() ?? null,
    emailDisplay,
    emailNormalized: emailDisplay?.toLocaleLowerCase("en-US") ?? null,
    phoneDisplay: phone?.display ?? null,
    phoneNormalized: phone?.normalized ?? null,
    phoneCountryCodeUsed: phone?.callingCode ?? null,
    normalizationVersion: phone?.normalizationVersion ?? "p1a-identity-v2",
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
