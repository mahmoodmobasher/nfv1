"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Button, FieldMessage, Panel } from "@/frontend/design-system";
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
  screenFormOptionsV1Schema,
  screenFormsErrorEnvelopeV1Schema,
  screenProfileDetailV1Schema,
  screenProfileResultV1Schema,
  type ScreenFormOptionsQueryV1,
} from "../contracts/screen-forms.contracts";
import {
  CONTACT_INTERNAL_NOTE_ADD_V1,
  contactInternalNoteAddCommandV1Schema,
  contactInternalNoteErrorV1Schema,
  contactInternalNoteResultV1Schema,
} from "../contracts/contact-note.contracts";

export type ScreenKind = "company" | "contact" | "lead";
type Option = {
  id: string;
  label: string;
  target:
    | { kind: "version"; version: number }
    | { kind: "updated_at"; updatedAt: string };
};
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
                onClick={() =>
                  setTimeout(() => document.getElementById(id)?.focus())
                }
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

function optionValue(item: Option) {
  return JSON.stringify({
    id: item.id,
    target:
      item.target.kind === "version"
        ? item.target.version
        : item.target.updatedAt,
    label: item.label,
  });
}
function OptionSelect({
  workspaceId,
  kind,
  optionKind,
  id,
  label,
  required,
  initial,
  initialId,
  error,
  excludeRecordId,
  onAuthorityLoss,
}: {
  workspaceId: string;
  kind: ScreenKind;
  optionKind: ScreenFormOptionsQueryV1["optionKind"];
  id: string;
  label: string;
  required?: boolean;
  initial?: Option | null;
  initialId?: string;
  error?: string;
  excludeRecordId?: string;
  onAuthorityLoss: () => void;
}) {
  const [query, setQuery] = useState(""),
    [items, setItems] = useState<Option[]>(initial ? [initial] : []),
    [selectedValue, setSelectedValue] = useState(
      initial ? optionValue(initial) : "",
    ),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState("");
  async function load(next = false) {
    let authorityCleared = false;
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({
      kind,
      optionKind,
      query,
      limit: "25",
    });
    if (next && cursor) params.set("cursor", cursor);
    if (excludeRecordId) params.set("excludeRecordId", excludeRecordId);
    try {
      const response = await fetch(
          `${endpoint(workspaceId, "screen-form-options")}?${params}`,
          { cache: "no-store" },
        ),
        payload = await json(response);
      if (!response.ok) {
        const failure = screenFormsErrorEnvelopeV1Schema.safeParse(payload);
        if (
          failure.success &&
          failure.data.error.reconciliation.action === "clear_protected_state"
        ) {
          authorityCleared = true;
          onAuthorityLoss();
          return;
        }
        throw new Error();
      }
      const parsed = screenFormOptionsV1Schema.safeParse(payload?.data);
      if (
        !parsed.success ||
        parsed.data.kind !== kind ||
        parsed.data.optionKind !== optionKind
      )
        throw new Error();
      setItems((current) =>
        next
          ? [
              ...current,
              ...parsed.data.items.filter(
                (item) => !current.some((value) => value.id === item.id),
              ),
            ]
          : [
              ...(initial &&
              !parsed.data.items.some((item) => item.id === initial.id)
                ? [initial]
                : []),
              ...parsed.data.items,
            ],
      );
      const retained = parsed.data.items.find((item) => item.id === initialId);
      if (!selectedValue && retained) setSelectedValue(optionValue(retained));
      setCursor(parsed.data.nextCursor);
    } catch {
      setMessage(
        "Options are temporarily unavailable. No selection was changed.",
      );
    } finally {
      if (!authorityCleared) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="screen-option-field">
      <label className="field" htmlFor={`${id}-search`}>
        <span>Search {label.toLowerCase()}</span>
        <input
          id={`${id}-search`}
          type="search"
          maxLength={100}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <Button type="button" onClick={() => void load()} disabled={loading}>
        {loading ? "Searching…" : "Search"}
      </Button>
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
          value={selectedValue}
          onChange={(event) => setSelectedValue(event.target.value)}
        >
          <option value="">
            {required ? `Choose ${label}` : `No ${label.toLowerCase()}`}
          </option>
          {items.map((item) => (
            <option key={item.id} value={optionValue(item)}>
              {item.label}
            </option>
          ))}
        </select>
        {error && (
          <FieldMessage id={`${id}-error`} tone="error">
            {error}
          </FieldMessage>
        )}
      </label>
      {cursor && (
        <Button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
        >
          Load more
        </Button>
      )}
      {message && (
        <p className="helper" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

function OptionChecks({
  workspaceId,
  kind,
  initial = [],
  error,
  onAuthorityLoss,
}: {
  workspaceId: string;
  kind: ScreenKind;
  initial?: Option[];
  error?: string;
  onAuthorityLoss: () => void;
}) {
  const [items, setItems] = useState<Option[]>(initial),
    [message, setMessage] = useState("");
  useEffect(() => {
    const params = new URLSearchParams({
      kind,
      optionKind: "assignment_team",
      limit: "50",
    });
    fetch(`${endpoint(workspaceId, "screen-form-options")}?${params}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await json(response);
        if (!response.ok) {
          const failure = screenFormsErrorEnvelopeV1Schema.safeParse(payload);
          if (
            failure.success &&
            failure.data.error.reconciliation.action === "clear_protected_state"
          ) {
            onAuthorityLoss();
            return;
          }
          throw new Error();
        }
        const parsed = screenFormOptionsV1Schema.safeParse(payload?.data);
        if (!parsed.success) throw new Error();
        setItems((current) => [
          ...current,
          ...parsed.data.items.filter(
            (item) => !current.some((value) => value.id === item.id),
          ),
        ]);
      })
      .catch(() =>
        setMessage("Visible Team options are temporarily unavailable."),
      );
  }, [workspaceId, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <fieldset
      id="visibleTeamIds"
      aria-invalid={Boolean(error)}
      aria-describedby={error ? "visibleTeamIds-error" : undefined}
    >
      <legend>Visible Teams</legend>
      {items.length ? (
        <>
          {items.map((item) => (
            <label className="check" key={item.id}>
              <input
                type="checkbox"
                name="visibleTeamIds"
                value={optionValue(item)}
                defaultChecked={initial.some((value) => value.id === item.id)}
              />
              {item.label}
            </label>
          ))}
        </>
      ) : (
        <p className="helper">No authorized Teams are available.</p>
      )}
      {message && (
        <p className="helper" role="status">
          {message}
        </p>
      )}
      {error && (
        <FieldMessage id="visibleTeamIds-error" tone="error">
          {error}
        </FieldMessage>
      )}
    </fieldset>
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
) {
  return (
    <section aria-labelledby="address-heading">
      <h2 id="address-heading">Address</h2>
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
    summary = useRef<HTMLDivElement>(null),
    safeAlert = useRef<HTMLDivElement>(null),
    request = useRef({ body: "", key: crypto.randomUUID() }),
    noteRequest = useRef({ body: "", key: crypto.randomUUID() });
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
      setNotice("Review the highlighted fields.");
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
        setNotice(error.message);
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
        "The form could not be saved. No unconfirmed changes were applied; your safe draft remains available.",
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
      <Panel title={`${noun(kind)} information`}>
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
          {notice && !Object.keys(errors).length && (
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
              <section aria-labelledby="primary-heading">
                <h2 id="primary-heading">Primary information</h2>
                <div className="form-grid">
                  <Input
                    id="salutation"
                    label="Salutation"
                    defaultValue={lead?.base.salutation ?? ""}
                    data-error={errors.salutation}
                  />
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
                  />
                  <Input
                    id="jobTitle"
                    label="Job title"
                    defaultValue={lead?.base.jobTitle ?? ""}
                    data-error={errors.jobTitle}
                  />
                </div>
              </section>
              <section aria-labelledby="lead-channels-heading">
                <h2 id="lead-channels-heading">Contact channels</h2>
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
              </section>
              <section aria-labelledby="profiling-heading">
                <h2 id="profiling-heading">Lead and profiling</h2>
                <div className="form-grid">
                  <Select
                    id="source"
                    label="Source"
                    required
                    defaultValue={lead?.base.source ?? "manual"}
                  >
                    {[
                      "website",
                      "referral",
                      "outbound",
                      "event",
                      "partner",
                      "social_media",
                      "import",
                      "manual",
                      "other",
                    ].map((v) => (
                      <option value={v} key={v}>
                        {v.replaceAll("_", " ")}
                      </option>
                    ))}
                  </Select>
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
              </section>
              {commonAddress(errors, addr ?? {})}
            </>
          )}
          <section aria-labelledby="assignment-heading">
            <h2 id="assignment-heading">Responsibility and visibility</h2>
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
