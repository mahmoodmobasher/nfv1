import {
  COMPANY_SCREEN_CREATE_V2,
  COMPANY_SCREEN_EDIT_V2,
  CONTACT_SCREEN_CREATE_V2,
  CONTACT_SCREEN_EDIT_V2,
  LEAD_SCREEN_CREATE_V2,
  LEAD_SCREEN_EDIT_V2,
  companyScreenCreateCommandV2Schema,
  companyScreenEditCommandV2Schema,
  contactScreenCreateCommandV2Schema,
  contactScreenEditCommandV2Schema,
  leadScreenCreateCommandV2Schema,
  leadScreenEditCommandV2Schema,
} from "../contracts/screen-forms.contracts";
import {
  validationIssues,
  type ScreenFormErrors,
  type ScreenKind,
} from "./screen-form-fields";

const value = (data: FormData, name: string) =>
  String(data.get(name) ?? "").trim();
const nullable = (data: FormData, name: string) => value(data, name) || null;
const integer = (data: FormData, name: string) =>
  value(data, name) ? Number(value(data, name)) : null;
const selected = (data: FormData, name: string) =>
  data.getAll(name).map(String);

function money(data: FormData) {
  const raw = value(data, "annualRevenue");
  if (!raw) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return { invalid: true } as const;
  const [whole, decimals = ""] = raw.split(".");
  return {
    amountMinor: `${BigInt(whole) * BigInt(100) + BigInt((decimals + "00").slice(0, 2))}`,
    currencyCode:
      value(data, "revenueCurrency") === "CAD"
        ? ("CAD" as const)
        : ("USD" as const),
    currencyExponent: 2 as const,
  };
}

function address(data: FormData) {
  return {
    street: nullable(data, "street"),
    city: nullable(data, "city"),
    stateProvince: nullable(data, "stateProvince"),
    postalCode: nullable(data, "postalCode"),
    country: nullable(data, "country")?.toUpperCase() ?? null,
  };
}

export function parseTarget(raw: string) {
  if (!raw) return { id: "", target: "", label: "" };
  try {
    const parsed = JSON.parse(raw) as {
      id?: unknown;
      target?: unknown;
      label?: unknown;
    };
    return {
      id: typeof parsed.id === "string" ? parsed.id : "",
      target:
        typeof parsed.target === "string" || typeof parsed.target === "number"
          ? String(parsed.target)
          : "",
      label: typeof parsed.label === "string" ? parsed.label : "",
    };
  } catch {
    return { id: "", target: "", label: "" };
  }
}

type BuildCommandInput = {
  kind: ScreenKind;
  editing: boolean;
  expectedVersion?: number;
  data: FormData;
};

type BuildCommandResult =
  | { success: true; data: unknown }
  | { success: false; errors: ScreenFormErrors };

export function buildScreenFormCommand({
  kind,
  editing,
  expectedVersion,
  data,
}: BuildCommandInput): BuildCommandResult {
  const revenueValue = money(data);
  if (revenueValue && "invalid" in revenueValue) {
    return {
      success: false,
      errors: {
        annualRevenue: "Enter an amount with no more than two decimal places.",
      },
    };
  }

  const member = parseTarget(value(data, "responsibleMembershipId"));
  const team = parseTarget(value(data, "responsibleTeamId"));
  const visible = selected(data, "visibleTeamIds").map(parseTarget);
  const assignment = {
    responsibleMembershipId: member.id || null,
    responsibleMembershipVersion: member.id ? Number(member.target) : null,
    responsibleTeamId: team.id || null,
    responsibleTeamVersion: team.id ? Number(team.target) : null,
    visibility:
      value(data, "visibility") === "teams"
        ? ("teams" as const)
        : ("workspace" as const),
    visibleTeamIds: visible.map((item) => item.id),
    visibleTeamVersions: Object.fromEntries(
      visible.map((item) => [item.id, Number(item.target)]),
    ),
  };
  const common = {
    assignment,
    ...(editing ? { expectedVersion } : {}),
  };

  let command: unknown;
  if (kind === "company") {
    const parent = parseTarget(value(data, "parentCompanyId"));
    command = {
      contractVersion: editing
        ? COMPANY_SCREEN_EDIT_V2
        : COMPANY_SCREEN_CREATE_V2,
      ...common,
      profile: {
        name: value(data, "companyName"),
        domain: nullable(data, "domain"),
        website: nullable(data, "website"),
        industry: nullable(data, "industry"),
        sizeBand: nullable(data, "sizeBand"),
        employeeCount: integer(data, "employeeCount"),
        annualRevenue: revenueValue,
        parentCompanyId: parent.id || null,
        parentCompanyVersion: parent.id ? Number(parent.target) : null,
        phone: nullable(data, "phone"),
        address: address(data),
      },
    };
  } else if (kind === "contact") {
    const affiliation = parseTarget(value(data, "companyId"));
    command = {
      contractVersion: editing
        ? CONTACT_SCREEN_EDIT_V2
        : CONTACT_SCREEN_CREATE_V2,
      ...common,
      profile: {
        salutation: nullable(data, "salutation"),
        firstName: value(data, "firstName"),
        lastName: value(data, "lastName"),
        jobTitle: nullable(data, "jobTitle"),
        department: nullable(data, "department"),
        primaryEmail: value(data, "primaryEmail"),
        secondaryEmail: nullable(data, "secondaryEmail"),
        directPhone: nullable(data, "directPhone"),
        mobilePhone: nullable(data, "mobilePhone"),
        linkedinUrl: nullable(data, "linkedinUrl"),
        lifecycleStage: value(data, "lifecycleStage"),
        company: affiliation.id
          ? {
              companyId: affiliation.id,
              companyVersion: Number(affiliation.target),
              roleCode: value(data, "companyRole"),
              isPrimary: true,
            }
          : null,
        address: address(data),
      },
    };
  } else {
    const selectedCompany = parseTarget(value(data, "companyId"));
    const stage = parseTarget(value(data, "stageId"));
    const consent = value(data, "promotionalEmailOptOut");
    command = {
      contractVersion: editing ? LEAD_SCREEN_EDIT_V2 : LEAD_SCREEN_CREATE_V2,
      ...common,
      ...(!editing ? { contactDisposition: "dismiss" } : {}),
      profile: {
        salutation: nullable(data, "salutation"),
        firstName: value(data, "firstName"),
        lastName: value(data, "lastName"),
        company: {
          snapshotName: selectedCompany.label,
          companyId: selectedCompany.id,
          companyVersion: Number(selectedCompany.target),
        },
        jobTitle: nullable(data, "jobTitle"),
        primaryEmail: value(data, "primaryEmail"),
        secondaryEmail: nullable(data, "secondaryEmail"),
        officePhone: nullable(data, "officePhone"),
        mobilePhone: nullable(data, "mobilePhone"),
        fax: nullable(data, "fax"),
        website: nullable(data, "website"),
        twitterHandle: nullable(data, "twitterHandle"),
        promotionalEmailOptOut: consent === "" ? null : consent === "true",
        source: value(data, "source"),
        sourcePlatform: nullable(data, "sourcePlatform"),
        stageId: stage.id,
        stageUpdatedAt: stage.target,
        rating: nullable(data, "rating"),
        industry: nullable(data, "industry"),
        annualRevenue: revenueValue,
        employeeCount: integer(data, "employeeCount"),
        address: address(data),
      },
    };
  }

  const schema =
    kind === "company"
      ? editing
        ? companyScreenEditCommandV2Schema
        : companyScreenCreateCommandV2Schema
      : kind === "contact"
        ? editing
          ? contactScreenEditCommandV2Schema
          : contactScreenCreateCommandV2Schema
        : editing
          ? leadScreenEditCommandV2Schema
          : leadScreenCreateCommandV2Schema;
  const parsed = schema.safeParse(command);
  const errors: ScreenFormErrors = parsed.success
    ? {}
    : validationIssues(parsed.error);
  if (kind === "contact") {
    const primaryEmail = value(data, "primaryEmail").toLowerCase(),
      secondaryEmail = nullable(data, "secondaryEmail")?.toLowerCase() ?? null,
      directPhone = nullable(data, "directPhone"),
      mobilePhone = nullable(data, "mobilePhone");
    if (!value(data, "lifecycleStage"))
      errors.lifecycleStage = "Choose a lifecycle stage.";
    if (secondaryEmail && primaryEmail === secondaryEmail) {
      errors.primaryEmail = "Primary and secondary email must be different.";
      errors.secondaryEmail = "Primary and secondary email must be different.";
    }
    if (directPhone && mobilePhone && directPhone === mobilePhone) {
      errors.directPhone = "Direct and mobile phone must be different.";
      errors.mobilePhone = "Direct and mobile phone must be different.";
    }
  }
  return parsed.success && !Object.keys(errors).length
    ? { success: true, data: parsed.data }
    : { success: false, errors };
}
