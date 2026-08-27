"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Button, FieldMessage, Panel } from "@/frontend/design-system";
import type { ScreenFormOption } from "./quick-create-company";
import { LeadSourceFields } from "./lead-source-fields";
import { OptionChecks, OptionSelect } from "./screen-form-options";
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
  screenFormBootstrapV1Schema,
  screenFormsErrorEnvelopeV1Schema,
  screenProfileDetailV1Schema,
  screenProfileResultV1Schema,
} from "../contracts/screen-forms.contracts";
import {
  CONTACT_INTERNAL_NOTE_ADD_V1,
  contactInternalNoteAddCommandV1Schema,
  contactInternalNoteErrorV1Schema,
  contactInternalNoteResultV1Schema,
} from "../contracts/contact-note.contracts";

export type ScreenKind = "company" | "contact" | "lead";
type Option = ScreenFormOption;
type Errors = Record<string, string>;
const plural = (kind: ScreenKind) =>
  kind === "company" ? "companies" : kind === "contact" ? "contacts" : "leads";
const noun = (kind: ScreenKind) => kind[0].toUpperCase() + kind.slice(1);
const endpoint = (workspaceId: string, suffix: string) =>
  `/api/workspaces/${workspaceId}/${suffix}`;
const authorityCodes = new Set([
  "authentication_required",
  "permission_required",
  "resource_not_found",
  "authority_conflict",
]);
async function json(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
async function csrf() {
  const response = await fetch("/api/auth/csrf", { cache: "no-store" });
  if (!response.ok) throw new Error("csrf");
  return ((await response.json()) as { token: string }).token;
}
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
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return { invalid: true };
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
function fieldId(path: string) {
  const last = path.split(".").at(-1) ?? path;
  return (
    (
      {
        name: "companyName",
        snapshotName: "companyId",
        amountMinor: "annualRevenue",
        currencyCode: "annualRevenue",
        currencyExponent: "annualRevenue",
        visibleTeamVersions: "visibleTeamIds",
        companyVersion: "companyId",
        parentCompanyVersion: "parentCompanyId",
        stageUpdatedAt: "stageId",
        sourcePlatform: "sourcePlatform",
      } as Record<string, string>
    )[last] ?? last
  );
}
function issues(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): Errors {
  const result: Errors = {};
  for (const issue of error.issues) {
    const id = fieldId(issue.path.map(String).join("."));
    result[id] ??= issue.message.replaceAll("_", " ");
  }
  return result;
}

function ErrorSummary({
  errors,
  summary,
  linkedFields,
}: {
  errors: Errors;
  summary: React.RefObject<HTMLDivElement | null>;
  linkedFields: ReadonlySet<string>;
}) {
  if (!Object.keys(errors).length) return null;
  return (
    <div
      ref={summary}
      className="alert error error-summary"
      role="alert"
      tabIndex={-1}
    >
      <b>Please correct the following:</b>
      <ul>
        {Object.entries(errors).map(([id, message]) =>
          linkedFields.has(id) ? (
            <li key={id}>
              <a
                href={`#${id}`}
                onClick={() => setTimeout(() => {
                  const target = document.getElementById(id);
                  const disclosure = target?.closest("details");
                  if (disclosure) disclosure.open = true;
                  target?.focus();
                })}
              >
                {message}
              </a>
            </li>
          ) : (
            <li key={id}>{message}</li>
          ),
        )}
      </ul>
    </div>
  );
}

function SectionHeading({ id, title, help }: { id: string; title: string; help: string }) {
  return (
    <header className="screen-section-heading">
      <span className="screen-section-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false"><path d="M5 5h14v14H5zM8 9h8M8 13h8M8 17h5" /></svg>
      </span>
      <div><h2 id={id}>{title}</h2><p>{help}</p></div>
    </header>
  );
}
function OptionalSection({ enabled, open, summary, children }: { enabled: boolean; open: boolean; summary: string; children: React.ReactNode }) {
  return enabled ? <details className="screen-disclosure" open={open}><summary>{summary}</summary>{children}</details> : <>{children}</>;
}
const commonLinkedFields = [
  "annualRevenue",
  "street",
  "city",
  "stateProvince",
  "postalCode",
  "country",
  "responsibleMembershipId",
  "responsibleTeamId",
  "visibility",
  "visibleTeamIds",
];
function linkedFields(kind: ScreenKind) {
  const owned =
    kind === "company"
      ? [
          "companyName",
          "domain",
          "website",
          "industry",
          "sizeBand",
          "employeeCount",
          "parentCompanyId",
          "phone",
        ]
      : kind === "contact"
        ? [
            "salutation",
            "firstName",
            "lastName",
            "jobTitle",
            "department",
            "primaryEmail",
            "secondaryEmail",
            "directPhone",
            "mobilePhone",
            "linkedinUrl",
            "lifecycleStage",
            "companyId",
            "companyRole",
          ]
        : [
            "salutation",
            "firstName",
            "lastName",
            "companyId",
            "jobTitle",
            "primaryEmail",
            "secondaryEmail",
            "officePhone",
            "mobilePhone",
            "fax",
            "website",
            "twitterHandle",
            "promotionalEmailOptOut",
            "source",
            "sourcePlatform",
            "stageId",
            "rating",
            "industry",
            "employeeCount",
          ];
  return new Set([...commonLinkedFields, ...owned]);
}
function Input({
  id,
  label,
  required,
  help,
  ...props
}: {
  id: string;
  label: string;
  required?: boolean;
  help?: string;
  "data-error"?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const error = props["data-error"] as string | undefined,
    described =
      [help ? `${id}-help` : "", error ? `${id}-error` : ""]
        .filter(Boolean)
        .join(" ") || undefined;
  return (
    <label className="field" htmlFor={id}>
      <span>
        {label}
        {required ? (
          <strong className="required-marker"> required</strong>
        ) : (
          <small> optional</small>
        )}
      </span>
      <input
        {...props}
        data-error={undefined}
        id={id}
        name={id}
        required={required}
        aria-required={required || undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={described}
      />
      {help && <FieldMessage id={`${id}-help`}>{help}</FieldMessage>}
      {error && (
        <FieldMessage id={`${id}-error`} tone="error">
          {error}
        </FieldMessage>
      )}
    </label>
  );
}
function Select({
  id,
  label,
  children,
  required,
  error,
  defaultValue,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  required?: boolean;
  error?: string;
  defaultValue?: string;
}) {
  return (
    <label className="field" htmlFor={id}>
      <span>
        {label}
        {required ? (
          <strong className="required-marker"> required</strong>
        ) : (
          <small> optional</small>
        )}
      </span>
      <select
        id={id}
        name={id}
        required={required}
        aria-required={required || undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        defaultValue={defaultValue}
      >
        {children}
      </select>
      {error && (
        <FieldMessage id={`${id}-error`} tone="error">
          {error}
        </FieldMessage>
      )}
    </label>
  );
}

function parseTarget(raw: string) {
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
const versionOption = (
  value: { id: string; label: string; version: number } | null | undefined,
): Option | null =>
  value
    ? {
        id: value.id,
        label: value.label,
        target: { kind: "version", version: value.version },
      }
    : null;
function commonAddress(
  errors: Errors,
  defaults: Record<string, string | null> = {},
  collapsible = false,
) {
  return (
    <section aria-labelledby="address-heading">
      <SectionHeading id="address-heading" title="Address Information" help="Add the current business mailing address." />
      <OptionalSection enabled={collapsible} open={Boolean(errors.street || errors.city || errors.stateProvince || errors.postalCode || errors.country)} summary="Address fields — optional">
        <div className="form-grid">
        <Input
          id="street"
          label="Street"
          autoComplete="street-address"
          defaultValue={defaults.street ?? ""}
          data-error={errors.street}
        />
        <Input
          id="city"
          label="City"
          autoComplete="address-level2"
          defaultValue={defaults.city ?? ""}
          data-error={errors.city}
        />
        <Input
          id="stateProvince"
          label="State/Province"
          autoComplete="address-level1"
          defaultValue={defaults.stateProvince ?? ""}
          data-error={errors.stateProvince}
        />
        <Input
          id="postalCode"
          label="Postal code"
          autoComplete="postal-code"
          defaultValue={defaults.postalCode ?? ""}
          data-error={errors.postalCode}
        />
        <Input
          id="country"
          label="Country"
          autoComplete="country"
          maxLength={2}
          defaultValue={defaults.country ?? ""}
          help="Use a two-letter country code, for example CA."
          data-error={errors.country}
        />
        </div>
      </OptionalSection>
    </section>
  );
}

export function ScreenProfileForm({
  workspaceId,
  kind,
  recordId,
}: {
  workspaceId: string;
  kind: ScreenKind;
  recordId?: string;
}) {
  const editing = Boolean(recordId),
    [ready, setReady] = useState(false),
    [detail, setDetail] = useState<ReturnType<
      typeof screenProfileDetailV1Schema.parse
    > | null>(null),
    [denied, setDenied] = useState(false),
    [loadError, setLoadError] = useState(false),
    [errors, setErrors] = useState<Errors>({}),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [stale, setStale] = useState(false),
    [result, setResult] = useState<ReturnType<
      typeof screenProfileResultV1Schema.parse
    > | null>(null),
    [noteBody, setNoteBody] = useState(""),
    [noteFailed, setNoteFailed] = useState(false),
    [noteNeedsRefetch, setNoteNeedsRefetch] = useState(false),
    [noteContactVersion, setNoteContactVersion] = useState<number | null>(null),
    [canCreateCompany, setCanCreateCompany] = useState(false),
    summary = useRef<HTMLDivElement>(null),
    safeAlert = useRef<HTMLDivElement>(null),
    request = useRef({ body: "", key: crypto.randomUUID() }),
    noteRequest = useRef({ body: "", key: crypto.randomUUID() });
  const quickCompanyCommittedRef = useRef(false);
  const basePath = `/crm/${plural(kind)}`,
    profileRoute = recordId ? `${plural(kind)}/${recordId}/profile` : "";
  function clearProtectedState() {
    setReady(false);
    setDetail(null);
    setErrors({});
    setNotice("");
    setStale(false);
    setResult(null);
    setNoteBody("");
    setNoteFailed(false);
    setNoteNeedsRefetch(false);
    setNoteContactVersion(null);
    quickCompanyCommittedRef.current = false;
    setCanCreateCompany(false);
    setBusy(false);
    setLoadError(false);
    request.current = { body: "", key: "" };
    noteRequest.current = { body: "", key: "" };
    setDenied(true);
  }
  async function load() {
    setReady(false);
    setDenied(false);
    setLoadError(false);
    setDetail(null);
    try {
      const url = editing
          ? endpoint(workspaceId, profileRoute)
          : `${endpoint(workspaceId, "screen-form-bootstrap")}?kind=${kind}`,
        response = await fetch(url, { cache: "no-store" }),
        payload = await json(response);
      if (!response.ok) {
        const parsed = screenFormsErrorEnvelopeV1Schema.safeParse(payload);
        if (parsed.success && authorityCodes.has(parsed.data.error.code)) {
          clearProtectedState();
          return;
        }
        throw new Error();
      }
      if (editing) {
        const parsed = screenProfileDetailV1Schema.safeParse(payload?.data);
        if (
          !parsed.success ||
          parsed.data.kind !== kind ||
          parsed.data.recordId !== recordId ||
          !parsed.data.capabilities.canEdit
        ) {
          clearProtectedState();
          return;
        }
        setDetail(parsed.data);
      } else {
        const parsed = screenFormBootstrapV1Schema.safeParse(payload?.data);
        if (
          !parsed.success ||
          parsed.data.kind !== kind ||
          !parsed.data.capabilities.canCreate ||
          !parsed.data.capabilities.canWriteSensitiveProfile ||
          !parsed.data.capabilities.canManageAssignment
        ) {
          clearProtectedState();
          return;
        }
        setCanCreateCompany(
          kind === "lead" && parsed.data.capabilities.canCreateCompany,
        );
      }
      setReady(true);
    } catch {
      setLoadError(true);
    }
  }
  useEffect(() => {
    void load();
  }, [workspaceId, kind, recordId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (errors && Object.keys(errors).length)
      setTimeout(() => summary.current?.focus());
  }, [errors]);
  useEffect(() => {
    if (denied) requestAnimationFrame(() => safeAlert.current?.focus());
  }, [denied]);
  if (denied)
    return (
      <div ref={safeAlert} className="alert error" role="alert" tabIndex={-1}>
        <h1>{noun(kind)} form unavailable</h1>
        <p>
          Current authority no longer permits this form. Protected fields,
          options, and drafts were cleared.
        </p>
        <Link className="secondary link-button" href={basePath}>
          Back to {plural(kind)}
        </Link>
      </div>
    );
  if (loadError)
    return (
      <div className="alert error" role="alert" tabIndex={-1} autoFocus>
        <h1>Form temporarily unavailable</h1>
        <p>No protected fields or options are shown.</p>
        <Button onClick={() => void load()}>Try again</Button>
      </div>
    );
  if (!ready) return <p role="status">Checking current form access…</p>;
  if (result)
    return (
      <div
        className="ds-feedback ds-feedback--success"
        role="status"
        tabIndex={-1}
        autoFocus
      >
        <h1>
          {result.replayed
            ? `${noun(kind)} save was already applied`
            : `${noun(kind)} saved`}
        </h1>
        {result.kind === "lead" && (
          <p>
            {result.identityReview.contactDimension === "pending"
              ? "The Company decision was recorded. Contact ambiguity remains pending Identity Review."
              : "The Company decision was recorded and no Contact ambiguity remains."}{" "}
            No lifecycle, stage, qualification, or conversion change was
            implied.
          </p>
        )}
        {noteFailed && (
          <>
            <p className="alert error">
              Contact saved; internal note was not saved.
            </p>
            <Button
              onClick={() =>
                void (noteNeedsRefetch
                  ? refetchContactForNote(result.recordId)
                  : saveNote(
                      result.recordId,
                      noteContactVersion ?? result.version,
                    ))
              }
            >
              {noteNeedsRefetch
                ? "Reload Contact for note retry"
                : "Retry internal note"}
            </Button>
          </>
        )}
        <Link
          className="primary link-button"
          href={`${basePath}/${result.recordId}`}
        >
          View {noun(kind)}
        </Link>
      </div>
    );

  const company = detail?.kind === "company" ? detail : null,
    contact = detail?.kind === "contact" ? detail : null,
    lead = detail?.kind === "lead" ? detail : null;
  const protectedFull =
    !detail ||
    (Object.values(detail.categories).every(
      (category) => category.disclosure === "full",
    ) &&
      detail.assignment.disclosure === "full");
  if (editing && !protectedFull)
    return (
      <div className="alert info" role="status">
        <h1>{noun(kind)} is read-only</h1>
        <p>
          Some protected profile categories are masked or unavailable. NexaFlow
          will not collect replacement values or overwrite retained data.
        </p>
        <Link
          className="secondary link-button"
          href={`${basePath}/${recordId}`}
        >
          Back to {noun(kind)}
        </Link>
      </div>
    );
  const categories = detail?.categories as
      Record<string, { disclosure: string; value?: unknown }> | undefined,
    channel = categories?.channels?.value as
      Record<string, string | null> | undefined,
    addr = categories?.address?.value as
      Record<string, string | null> | undefined,
    revenue = categories?.revenue?.value as
      { amountMinor: string; currencyCode: string } | null | undefined,
    hierarchy = categories?.hierarchy?.value as
      | {
          parent?: { id: string; label: string; version: number } | null;
          company?: {
            id: string;
            label: string;
            version: number;
            roleCode?: string;
            isPrimary?: boolean;
          } | null;
        }
      | undefined,
    assignmentValue =
      detail?.assignment.disclosure === "full" ? detail.assignment.value : null;
  const defaultRevenue = revenue
    ? `${BigInt(revenue.amountMinor) / BigInt(100)}.${(BigInt(revenue.amountMinor) % BigInt(100)).toString().padStart(2, "0")}`
    : "";
  const parentOption = versionOption(hierarchy?.parent),
    companyOption = versionOption(hierarchy?.company),
    membershipOption =
      assignmentValue?.responsibleMembershipId &&
      assignmentValue.responsibleMembershipVersion
        ? {
            id: assignmentValue.responsibleMembershipId,
            label: "Current authorized owner",
            target: {
              kind: "version" as const,
              version: assignmentValue.responsibleMembershipVersion,
            },
          }
        : null,
    teamOption =
      assignmentValue?.responsibleTeamId &&
      assignmentValue.responsibleTeamVersion
        ? {
            id: assignmentValue.responsibleTeamId,
            label: "Current authorized Team",
            target: {
              kind: "version" as const,
              version: assignmentValue.responsibleTeamVersion,
            },
          }
        : null,
    visibleTeamOptions = (assignmentValue?.visibleTeams ?? []).map((item) => ({
      id: item.id,
      label: "Current authorized Team",
      target: { kind: "version" as const, version: item.version },
    })),
    consentValue =
      lead && lead.categories.consent.disclosure === "full"
        ? lead.categories.consent.value === null
          ? ""
          : String(lead.categories.consent.value.promotionalEmailOptOut)
        : "";
  const described = (id: string) => (errors[id] ? `${id}-error` : undefined);
  async function refetchContactForNote(contactId: string) {
    try {
      const response = await fetch(
          endpoint(workspaceId, `contacts/${contactId}/profile`),
          { cache: "no-store" },
        ),
        payload = await json(response),
        parsed = screenProfileDetailV1Schema.safeParse(payload?.data);
      if (
        !response.ok ||
        !parsed.success ||
        parsed.data.kind !== "contact" ||
        parsed.data.recordId !== contactId ||
        !parsed.data.capabilities.canEdit
      ) {
        clearProtectedState();
        return;
      }
      setNoteContactVersion(parsed.data.version);
      setNoteNeedsRefetch(false);
      noteRequest.current = { body: "", key: crypto.randomUUID() };
    } catch {
      setNoteFailed(true);
    }
  }
  async function saveNote(contactId: string, contactVersion: number) {
    if (!noteBody.trim()) return "saved" as const;
    const parsed = contactInternalNoteAddCommandV1Schema.safeParse({
      contractVersion: CONTACT_INTERNAL_NOTE_ADD_V1,
      expectedContactVersion: contactVersion,
      body: noteBody,
    });
    if (!parsed.success) {
      setNoteFailed(true);
      return "failed" as const;
    }
    const serialized = JSON.stringify(parsed.data);
    if (noteRequest.current.body !== serialized)
      noteRequest.current = { body: serialized, key: crypto.randomUUID() };
    try {
      const token = await csrf(),
        response = await fetch(
          endpoint(workspaceId, `contacts/${contactId}/notes`),
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-csrf-token": token,
              "idempotency-key": noteRequest.current.key,
            },
            body: serialized,
          },
        ),
        payload = await json(response);
      if (!response.ok) {
        const parsedError = contactInternalNoteErrorV1Schema.safeParse(payload);
        if (
          parsedError.success &&
          parsedError.data.error.reconciliation.action ===
            "clear_protected_state"
        ) {
          clearProtectedState();
          return "authority_cleared" as const;
        }
        if (
          parsedError.success &&
          parsedError.data.error.reconciliation.action === "refetch_contact"
        )
          setNoteNeedsRefetch(true);
        if (
          parsedError.success &&
          parsedError.data.error.reconciliation.action === "new_request"
        )
          noteRequest.current = { body: "", key: crypto.randomUUID() };
        setNoteFailed(true);
        return "failed" as const;
      }
      if (!contactInternalNoteResultV1Schema.safeParse(payload?.data).success)
        throw new Error();
      setNoteBody("");
      setNoteFailed(false);
      setNoteNeedsRefetch(false);
      return "saved" as const;
    } catch {
      setNoteFailed(true);
      return "failed" as const;
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget),
      revenueValue = money(data);
    if (revenueValue && "invalid" in revenueValue) {
      setErrors({
        annualRevenue: "Enter an amount with no more than two decimal places.",
      });
      return;
    }
    const member = parseTarget(value(data, "responsibleMembershipId")),
      team = parseTarget(value(data, "responsibleTeamId")),
      visible = selected(data, "visibleTeamIds").map(parseTarget),
      assignment = {
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
      ...(editing ? { expectedVersion: detail!.version } : {}),
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
      const selectedCompany = parseTarget(value(data, "companyId")),
        stage = parseTarget(value(data, "stageId")),
        consent = value(data, "promotionalEmailOptOut");
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
              : leadScreenCreateCommandV2Schema,
      parsed = schema.safeParse(command);
    if (!parsed.success) {
      setErrors(issues(parsed.error));
      setNotice(
        quickCompanyCommittedRef.current
          ? "The Company was created; the Lead was not saved. Review the highlighted fields."
          : "Review the highlighted fields.",
      );
      return;
    }
    const serialized = JSON.stringify(parsed.data);
    if (request.current.body !== serialized)
      request.current = { body: serialized, key: crypto.randomUUID() };
    setBusy(true);
    setErrors({});
    setNotice("Saving…");
    try {
      const token = await csrf(),
        suffix = editing ? profileRoute : plural(kind),
        response = await fetch(endpoint(workspaceId, suffix), {
          method: editing ? "PATCH" : "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": token,
            "idempotency-key": request.current.key,
          },
          body: serialized,
        }),
        payload = await json(response);
      if (!response.ok) {
        const failure = screenFormsErrorEnvelopeV1Schema.safeParse(payload);
        if (!failure.success) throw new Error();
        const error = failure.data.error;
        if (error.reconciliation.action === "clear_protected_state") {
          clearProtectedState();
          return;
        }
        if (error.reconciliation.action === "refetch_record") {
          setStale(true);
          setNotice(
            "This record changed. Reload the latest version before saving again.",
          );
          return;
        }
        if (error.reconciliation.action === "refetch_bootstrap") {
          setStale(true);
          setNotice(
            "A selected option changed. Reload current options and reconfirm your choices.",
          );
          return;
        }
        if (error.reconciliation.action === "new_request")
          request.current = { body: "", key: crypto.randomUUID() };
        setErrors(
          Object.fromEntries(
            (error.fields ?? []).map((path) => [fieldId(path), error.message]),
          ),
        );
        setNotice(
          quickCompanyCommittedRef.current && kind === "lead"
            ? `The Company was created; the Lead was not saved. ${error.message}`
            : error.message,
        );
        return;
      }
      const saved = screenProfileResultV1Schema.safeParse(payload?.data);
      if (!saved.success || saved.data.kind !== kind) throw new Error();
      request.current = { body: "", key: crypto.randomUUID() };
      if (kind === "contact" && noteBody.trim()) {
        const noteOutcome = await saveNote(
          saved.data.recordId,
          saved.data.version,
        );
        if (noteOutcome === "authority_cleared") return;
      }
      setResult(saved.data);
    } catch {
      setNotice(
        quickCompanyCommittedRef.current && kind === "lead"
          ? "The Company was created; the Lead was not saved. Your Lead draft remains available."
          : "The form could not be saved. No unconfirmed changes were applied; your safe draft remains available.",
      );
      setErrors({ _form: "Try again safely." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="product-page-header">
        <div>
          <p className="eyebrow">
            {noun(kind)} / {editing ? "Edit" : "New"}
          </p>
          <h1>{editing ? `Edit ${noun(kind)}` : `Add ${noun(kind)}`}</h1>
          <p>
            Required fields are identified in text. Protected choices come only
            from current server authority.
          </p>
        </div>
      </header>
      <Panel title={kind === "lead" ? undefined : `${noun(kind)} information`} className={kind === "lead" ? "lead-profile-shell" : undefined}>
        <form
          className="ds-form screen-profile-form"
          noValidate
          onSubmit={submit}
          aria-busy={busy}
        >
          <ErrorSummary
            errors={errors}
            summary={summary}
            linkedFields={linkedFields(kind)}
          />
          {notice && (
            <p className="alert info" role="status">
              {notice}
            </p>
          )}
          {kind === "company" && (
            <>
              <section aria-labelledby="company-profile-heading">
                <h2 id="company-profile-heading">Company profile</h2>
                <Input
                  id="companyName"
                  label="Company name"
                  required
                  autoComplete="organization"
                  defaultValue={company?.base.name}
                  data-error={errors.companyName}
                />
                <div className="form-grid">
                  <Input
                    id="domain"
                    label="Domain"
                    inputMode="url"
                    defaultValue={channel?.domain ?? ""}
                    data-error={errors.domain}
                  />
                  <Input
                    id="website"
                    label="Website"
                    type="url"
                    inputMode="url"
                    defaultValue={channel?.website ?? ""}
                    data-error={errors.website}
                  />
                  <Input
                    id="industry"
                    label="Industry"
                    defaultValue={company?.base.industry ?? ""}
                    data-error={errors.industry}
                  />
                  <Select
                    id="sizeBand"
                    label="Size band"
                    defaultValue={company?.base.sizeBand ?? ""}
                    error={errors.sizeBand}
                  >
                    <option value="">Not specified</option>
                    {[
                      ["micro", "Micro"],
                      ["small", "Small"],
                      ["medium", "Medium"],
                      ["large", "Large"],
                      ["enterprise", "Enterprise"],
                    ].map(([v, l]) => (
                      <option value={v} key={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                  <Input
                    id="employeeCount"
                    label="Employees"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    defaultValue={company?.base.employeeCount ?? ""}
                    data-error={errors.employeeCount}
                  />
                  <Input
                    id="annualRevenue"
                    label="Annual revenue"
                    inputMode="decimal"
                    defaultValue={defaultRevenue}
                    data-error={errors.annualRevenue}
                  />
                  <Select
                    id="revenueCurrency"
                    label="Revenue currency"
                    defaultValue={revenue?.currencyCode ?? "USD"}
                  >
                    <option>USD</option>
                    <option>CAD</option>
                  </Select>
                  <OptionSelect
                    workspaceId={workspaceId}
                    kind="company"
                    optionKind="parent_company"
                    id="parentCompanyId"
                    label="Parent Company"
                    initial={parentOption}
                    excludeRecordId={recordId}
                    error={errors.parentCompanyId}
                    onAuthorityLoss={clearProtectedState}
                  />
                </div>
              </section>
              <section aria-labelledby="company-contact-heading">
                <h2 id="company-contact-heading">Contact and address</h2>
                <Input
                  id="phone"
                  label="Phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  defaultValue={channel?.phone ?? ""}
                  data-error={errors.phone}
                />
                {commonAddress(errors, addr ?? {})}
              </section>
            </>
          )}
          {kind === "contact" && (
            <>
              <section aria-labelledby="basic-heading">
                <h2 id="basic-heading">Basic details</h2>
                <div className="form-grid">
                  <Input
                    id="salutation"
                    label="Salutation"
                    defaultValue={contact?.base.salutation ?? ""}
                    data-error={errors.salutation}
                  />
                  <Input
                    id="firstName"
                    label="First name"
                    required
                    autoComplete="given-name"
                    defaultValue={contact?.base.firstName}
                    data-error={errors.firstName}
                  />
                  <Input
                    id="lastName"
                    label="Last name"
                    required
                    autoComplete="family-name"
                    defaultValue={contact?.base.lastName}
                    data-error={errors.lastName}
                  />
                  <Input
                    id="jobTitle"
                    label="Job title"
                    autoComplete="organization-title"
                    defaultValue={contact?.base.jobTitle ?? ""}
                    data-error={errors.jobTitle}
                  />
                  <Input
                    id="department"
                    label="Department"
                    defaultValue={contact?.base.department ?? ""}
                    data-error={errors.department}
                  />
                  <OptionSelect
                    workspaceId={workspaceId}
                    kind="contact"
                    optionKind="company"
                    id="companyId"
                    label="Company"
                    initial={companyOption}
                    error={errors.companyId}
                    onAuthorityLoss={clearProtectedState}
                  />
                  <Select
                    id="companyRole"
                    label="Company role"
                    defaultValue={hierarchy?.company?.roleCode ?? "employee"}
                  >
                    <option value="employee">Employee</option>
                    <option value="owner">Owner</option>
                    <option value="executive">Executive</option>
                    <option value="decision_maker">Decision maker</option>
                    <option value="billing">Billing</option>
                    <option value="technical">Technical</option>
                    <option value="advisor">Advisor</option>
                    <option value="contractor">Contractor</option>
                    <option value="other">Other</option>
                  </Select>
                </div>
              </section>
              <section aria-labelledby="channels-heading">
                <h2 id="channels-heading">Contact channels</h2>
                <div className="form-grid">
                  <Input
                    id="primaryEmail"
                    label="Primary email"
                    required
                    type="email"
                    autoComplete="email"
                    defaultValue={channel?.primaryEmail ?? ""}
                    data-error={errors.primaryEmail}
                  />
                  <Input
                    id="secondaryEmail"
                    label="Secondary email"
                    type="email"
                    autoComplete="email"
                    defaultValue={channel?.secondaryEmail ?? ""}
                    data-error={errors.secondaryEmail}
                  />
                  <Input
                    id="directPhone"
                    label="Direct phone"
                    type="tel"
                    inputMode="tel"
                    defaultValue={channel?.directPhone ?? ""}
                    data-error={errors.directPhone}
                  />
                  <Input
                    id="mobilePhone"
                    label="Mobile"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    defaultValue={channel?.mobilePhone ?? ""}
                    data-error={errors.mobilePhone}
                  />
                  <Input
                    id="linkedinUrl"
                    label="LinkedIn"
                    type="url"
                    inputMode="url"
                    defaultValue={channel?.linkedinUrl ?? ""}
                    data-error={errors.linkedinUrl}
                  />
                </div>
              </section>
              <section aria-labelledby="lifecycle-heading">
                <h2 id="lifecycle-heading">Lifecycle and assignment</h2>
                <Select
                  id="lifecycleStage"
                  label="Lifecycle stage"
                  required
                  defaultValue={contact?.base.lifecycleStage ?? "lead"}
                  error={errors.lifecycleStage}
                >
                  {[
                    ["lead", "Lead"],
                    ["marketing_qualified", "Marketing qualified"],
                    ["sales_qualified", "Sales qualified"],
                    ["opportunity", "Opportunity"],
                    ["customer", "Customer"],
                    ["evangelist", "Evangelist"],
                    ["other", "Other"],
                  ].map(([v, l]) => (
                    <option value={v} key={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </section>
              {commonAddress(errors, addr ?? {})}
              <section aria-labelledby="notes-heading">
                <h2 id="notes-heading">Internal notes</h2>
                <label className="field" htmlFor="internalNote">
                  <span>
                    Add internal note <small>optional, separate save</small>
                  </span>
                  <textarea
                    id="internalNote"
                    maxLength={4000}
                    rows={5}
                    value={noteBody}
                    onChange={(event) => setNoteBody(event.target.value)}
                  />
                  <FieldMessage id="internalNote-help">
                    The Contact saves first. This note is a separate Notes-owned
                    request and can be retried independently.
                  </FieldMessage>
                </label>
              </section>
            </>
          )}
          {kind === "lead" && (
            <>
              <section aria-labelledby="lead-essentials-heading">
                <SectionHeading id="lead-essentials-heading" title="Primary Information" help="Start with the Lead’s identity and existing Company." />
                <div className="form-grid">
                  <Input
                    id="firstName"
                    label="First name"
                    required
                    autoComplete="given-name"
                    defaultValue={lead?.base.firstName}
                    data-error={errors.firstName}
                  />
                  <Input
                    id="lastName"
                    label="Last name"
                    required
                    autoComplete="family-name"
                    defaultValue={lead?.base.lastName}
                    data-error={errors.lastName}
                  />
                  <OptionSelect
                    workspaceId={workspaceId}
                    kind="lead"
                    optionKind="company"
                    id="companyId"
                    label="Company"
                    required
                    initial={companyOption}
                    error={errors.companyId}
                    onAuthorityLoss={clearProtectedState}
                    canCreateCompany={canCreateCompany}
                    onCompanyCreated={() => {
                      quickCompanyCommittedRef.current = true;
                      setErrors((current) => {
                        const next = { ...current };
                        delete next.companyId;
                        return next;
                      });
                    }}
                  />
                  <Input
                    id="jobTitle"
                    label="Job title"
                    defaultValue={lead?.base.jobTitle ?? ""}
                    data-error={errors.jobTitle}
                  />
                  <Input
                    id="salutation"
                    label="Salutation"
                    defaultValue={lead?.base.salutation ?? ""}
                    data-error={errors.salutation}
                  />
                </div>
              </section>
              <section aria-labelledby="lead-channels-heading">
                <SectionHeading id="lead-channels-heading" title="Contact Channels" help="Add current ways to reach this Lead." />
                <div className="form-grid">
                  <Input
                    id="primaryEmail"
                    label="Primary email"
                    required
                    type="email"
                    autoComplete="email"
                    defaultValue={channel?.primaryEmail ?? ""}
                    data-error={errors.primaryEmail}
                  />
                </div>
                <details className="screen-disclosure" open={Boolean(errors.secondaryEmail || errors.officePhone || errors.mobilePhone || errors.fax || errors.website || errors.twitterHandle || errors.promotionalEmailOptOut)}>
                  <summary>Optional contact channels</summary>
                  <div className="form-grid">
                  <Input
                    id="secondaryEmail"
                    label="Secondary email"
                    type="email"
                    defaultValue={channel?.secondaryEmail ?? ""}
                    data-error={errors.secondaryEmail}
                  />
                  <Input
                    id="officePhone"
                    label="Office phone"
                    type="tel"
                    inputMode="tel"
                    defaultValue={channel?.officePhone ?? ""}
                    data-error={errors.officePhone}
                  />
                  <Input
                    id="mobilePhone"
                    label="Mobile"
                    type="tel"
                    inputMode="tel"
                    defaultValue={channel?.mobilePhone ?? ""}
                    data-error={errors.mobilePhone}
                  />
                  <Input
                    id="fax"
                    label="Fax"
                    type="tel"
                    inputMode="tel"
                    defaultValue={channel?.fax ?? ""}
                    data-error={errors.fax}
                  />
                  <Input
                    id="website"
                    label="Website"
                    type="url"
                    defaultValue={channel?.website ?? ""}
                    data-error={errors.website}
                  />
                  <Input
                    id="twitterHandle"
                    label="Twitter handle"
                    defaultValue={channel?.twitterHandle ?? ""}
                    data-error={errors.twitterHandle}
                  />
                  <Select
                    id="promotionalEmailOptOut"
                    label="Promotional email preference"
                    defaultValue={consentValue}
                  >
                    <option value="">Unknown — preserve current state</option>
                    <option value="false">Can receive promotional email</option>
                    <option value="true">Opted out of promotional email</option>
                  </Select>
                  </div>
                </details>
              </section>
              <section aria-labelledby="profiling-heading">
                <SectionHeading id="profiling-heading" title="Lead &amp; Profiling" help="Status is operational and does not itself qualify the Lead." />
                <div className="form-grid">
                  <LeadSourceFields
                    initialSource={lead?.base.source ?? "manual"}
                    initialPlatform={lead?.base.sourcePlatform}
                    sourceError={errors.source}
                    platformError={errors.sourcePlatform}
                  />
                  <OptionSelect
                    workspaceId={workspaceId}
                    kind="lead"
                    optionKind="lead_stage"
                    id="stageId"
                    label="Status"
                    required
                    initialId={lead?.base.stageId}
                    error={errors.stageId}
                    onAuthorityLoss={clearProtectedState}
                  />
                </div>
                <details className="screen-disclosure" open={Boolean(errors.rating || errors.industry || errors.annualRevenue || errors.employeeCount)}>
                  <summary>Optional profiling fields</summary>
                  <div className="form-grid">
                  <Select
                    id="rating"
                    label="Rating"
                    defaultValue={lead?.base.rating ?? ""}
                  >
                    <option value="">Not rated</option>
                    <option value="hot">Hot</option>
                    <option value="warm">Warm</option>
                    <option value="cold">Cold</option>
                  </Select>
                  <Input
                    id="industry"
                    label="Industry"
                    defaultValue={lead?.base.industry ?? ""}
                    data-error={errors.industry}
                  />
                  <Input
                    id="annualRevenue"
                    label="Annual revenue"
                    inputMode="decimal"
                    defaultValue={defaultRevenue}
                    data-error={errors.annualRevenue}
                  />
                  <Select
                    id="revenueCurrency"
                    label="Revenue currency"
                    defaultValue={revenue?.currencyCode ?? "USD"}
                  >
                    <option>USD</option>
                    <option>CAD</option>
                  </Select>
                  <Input
                    id="employeeCount"
                    label="Employees"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    defaultValue={lead?.base.employeeCount ?? ""}
                    data-error={errors.employeeCount}
                  />
                  </div>
                </details>
              </section>
              {commonAddress(errors, addr ?? {}, true)}
            </>
          )}
          <section aria-labelledby="assignment-heading">
            {kind === "lead" ? (
              <SectionHeading id="assignment-heading" title="Responsibility &amp; Visibility" help="Use only current server-authorized owners, Teams, and visibility." />
            ) : (
              <h2 id="assignment-heading">Responsibility and visibility</h2>
            )}
            <OptionalSection enabled={kind === "lead"} open={Boolean(errors.responsibleMembershipId || errors.responsibleTeamId || errors.visibility || errors.visibleTeamIds)} summary="Responsibility and visibility fields — optional">
            <OptionSelect
              workspaceId={workspaceId}
              kind={kind}
              optionKind="assignment_membership"
              id="responsibleMembershipId"
              label="Assigned owner"
              initial={membershipOption}
              error={errors.responsibleMembershipId}
              onAuthorityLoss={clearProtectedState}
            />
            <OptionSelect
              workspaceId={workspaceId}
              kind={kind}
              optionKind="assignment_team"
              id="responsibleTeamId"
              label="Responsible Team"
              initial={teamOption}
              error={errors.responsibleTeamId}
              onAuthorityLoss={clearProtectedState}
            />
            <fieldset
              id="visibility"
              tabIndex={-1}
              aria-invalid={Boolean(errors.visibility)}
              aria-describedby={described("visibility")}
            >
              <legend>Visibility</legend>
              <label className="check">
                <input
                  type="radio"
                  name="visibility"
                  value="workspace"
                  defaultChecked={
                    !assignmentValue ||
                    assignmentValue.visibility === "workspace"
                  }
                />
                Workspace
              </label>
              <label className="check">
                <input
                  type="radio"
                  name="visibility"
                  value="teams"
                  defaultChecked={assignmentValue?.visibility === "teams"}
                />
                Selected Teams
              </label>
              {errors.visibility && (
                <FieldMessage id="visibility-error" tone="error">
                  {errors.visibility}
                </FieldMessage>
              )}
            </fieldset>
            <OptionChecks
              workspaceId={workspaceId}
              kind={kind}
              initial={visibleTeamOptions}
              error={errors.visibleTeamIds}
              onAuthorityLoss={clearProtectedState}
            />
            </OptionalSection>
          </section>
          {stale && (
            <div className="alert error" role="alert" tabIndex={-1}>
              <p>{notice}</p>
              <Button type="button" onClick={() => void load()}>
                Reload latest
              </Button>
            </div>
          )}
          <div className="ds-page-actions">
            <Link
              className="secondary link-button"
              href={editing ? `${basePath}/${recordId}` : basePath}
            >
              Cancel
            </Link>
            <Button variant="primary" disabled={busy || stale}>
              {busy ? "Saving…" : `Save ${noun(kind)}`}
            </Button>
          </div>
        </form>
      </Panel>
    </>
  );
}
