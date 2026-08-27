import type {
  CompanyCreateCommandV1,
  CompanyEditCommandV1,
  ContactCreateCommandV1,
  ContactEditCommandV1,
} from "../contracts/customer-graph.contract";
import type {
  CompanyScreenCreateCommandV2,
  CompanyScreenEditCommandV2,
  ContactScreenCreateCommandV2,
  ContactScreenEditCommandV2,
} from "@/backend/modules/screen-forms/contracts/screen-forms.contract";

export type CompanyCreate =
  | CompanyCreateCommandV1
  | CompanyScreenCreateCommandV2;
export type CompanyEdit = CompanyEditCommandV1 | CompanyScreenEditCommandV2;
export type ContactCreate =
  | ContactCreateCommandV1
  | ContactScreenCreateCommandV2;
export type ContactEdit = ContactEditCommandV1 | ContactScreenEditCommandV2;

export const normalizeName = (value: string) =>
  value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
export const normalizeDomain = (value: string | null) =>
  value ? value.trim().toLowerCase() : null;
export const normalizeEmail = (value: string | null) =>
  value ? value.trim().toLowerCase() : null;
export const normalizePhone = (value: string | null) =>
  value ? value.trim() : null;
export const phoneCountry = (value: string | null) =>
  value
    ? value.match(/^\+(\d{1,3})/)?.[1]
      ? `+${value.match(/^\+(\d{1,3})/)![1]}`
      : "+unknown"
    : null;

export const moneyColumns = (
  value: {
    amountMinor: string;
    currencyCode: "USD" | "CAD";
    currencyExponent: 2;
  } | null,
) =>
  [
    value?.amountMinor ?? null,
    value?.currencyCode ?? null,
    value?.currencyExponent ?? null,
  ] as const;

export const companyCommand = (command: CompanyCreate | CompanyEdit) =>
  "profile" in command
    ? {
        ...command.profile,
        displayName: command.profile.name,
        ...command.assignment,
      }
    : command;

export const contactCommand = (command: ContactCreate | ContactEdit) =>
  "profile" in command
    ? {
        ...command.profile,
        email: command.profile.primaryEmail,
        phone: command.profile.directPhone,
        affiliation: command.profile.company
          ? {
              companyId: command.profile.company.companyId,
              roleCode: command.profile.company.roleCode,
            }
          : null,
        ...command.assignment,
      }
    : command;
