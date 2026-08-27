"use client";

import Link from "next/link";
import { FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Button, FieldMessage, FormActions, FormGrid, FormSection, FormWorkbench, ProductPageHeader, SectionNav } from "@/frontend/design-system";
import type { ScreenFormOption } from "./quick-create-company";
import { LeadSourceFields } from "./lead-source-fields";
import { OptionChecks, OptionSelect } from "./screen-form-options";
import { buildScreenFormCommand } from "./screen-form-command";
import {
  AddressFields,
  ErrorSummary,
  Input,
  OptionalSection,
  Select,
  fieldId,
  linkedFields,
  type ScreenFormErrors,
  type ScreenKind,
} from "./screen-form-fields";
import {
  screenFormBootstrapV1Schema,
  screenFormsErrorEnvelopeV1Schema,
  screenProfileDetailV1Schema,
  screenProfileResultV1Schema,
  type ScreenFormsErrorEnvelopeV1,
} from "../contracts/screen-forms.contracts";
import {
  CONTACT_INTERNAL_NOTE_ADD_V1,
  contactInternalNoteAddCommandV1Schema,
  contactInternalNoteErrorV1Schema,
  contactInternalNoteResultV1Schema,
} from "../contracts/contact-note.contracts";

export type { ScreenKind } from "./screen-form-fields";
type Option = ScreenFormOption;
type Errors = ScreenFormErrors;
const plural = (kind: ScreenKind) =>
  kind === "company" ? "companies" : kind === "contact" ? "contacts" : "leads";
const noun = (kind: ScreenKind) => kind[0].toUpperCase() + kind.slice(1);
const endpoint = (workspaceId: string, suffix: string) =>
  `/api/workspaces/${workspaceId}/${suffix}`;
function AssignmentSection({ kind, children }: { kind: ScreenKind; children: ReactNode }) {
  const number = kind === "company" ? "03" : kind === "contact" ? "06" : "04";
  return <FormSection id="assignment-heading" number={number} title="Responsibility & visibility" description="Use only current server-authorized owners, Teams, and visibility." tone="access">{children}</FormSection>;
}
function ScreenFormActions({ children }: { children: ReactNode }) {
  return <FormActions>{children}</FormActions>;
}
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
    [safeReference, setSafeReference] = useState(""),
    [stale, setStale] = useState(false),
    [selectionConflict, setSelectionConflict] = useState<
      NonNullable<ScreenFormsErrorEnvelopeV1["error"]["selection"]> | null
    >(null),
    [unresolvedOptions, setUnresolvedOptions] = useState<Set<string>>(
      () => new Set(),
    ),
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
    setSafeReference("");
    setStale(false);
    setSelectionConflict(null);
    setUnresolvedOptions(new Set());
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
    setSafeReference("");
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
        if (
          parsed.success &&
          (parsed.data.error.code === "screen_form_unavailable" ||
            parsed.data.error.code === "unexpected_error")
        )
          setSafeReference(parsed.data.requestId);
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
        {safeReference && <p>Reference: {safeReference}</p>}
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
    stageOption = lead
      ? {
          id: lead.base.stageId,
          label: "Current status",
          target: {
            kind: "updated_at" as const,
            updatedAt: lead.base.stageUpdatedAt,
          },
        }
      : null,
    consentValue =
      lead && lead.categories.consent.disclosure === "full"
        ? lead.categories.consent.value === null
          ? ""
          : String(lead.categories.consent.value.promotionalEmailOptOut)
        : "";
  const described = (id: string) => (errors[id] ? `${id}-error` : undefined);
  const setOptionResolution = (id: string, unresolved: boolean) =>
    setUnresolvedOptions((current) => {
      const next = new Set(current);
      if (unresolved) next.add(id);
      else next.delete(id);
      return next;
    });
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
    setSafeReference("");
    const command = buildScreenFormCommand({
      kind,
      editing,
      expectedVersion: detail?.version,
      data: new FormData(event.currentTarget),
    });
    if (!command.success) {
      setErrors(command.errors);
      setNotice(
        quickCompanyCommittedRef.current
          ? "The Company was created; the Lead was not saved. Review the highlighted fields."
          : "Review the highlighted fields.",
      );
      return;
    }
    const serialized = JSON.stringify(command.data);
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
        if (
          error.code === "screen_form_unavailable" ||
          error.code === "unexpected_error"
        )
          setSafeReference(failure.data.requestId);
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
          if (!error.selection) throw new Error();
          setSelectionConflict(error.selection);
          const affected = fieldId(error.selection.field);
          setErrors({ [affected]: error.message });
          setNotice(
            error.selection.outcome === "changed"
              ? "A selected option changed. Review and reconfirm only the highlighted field."
              : "A selected option is unavailable. Choose a replacement for the highlighted field.",
          );
          return;
        }
        if (error.reconciliation.action === "new_request")
          request.current = { body: "", key: crypto.randomUUID() };
        const fieldErrors = Object.fromEntries(
          (error.fields ?? []).map((path) => [fieldId(path), error.message]),
        );
        setErrors(
          Object.keys(fieldErrors).length
            ? fieldErrors
            : { _form: error.message },
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
      <ProductPageHeader
        context={`${plural(kind)[0].toUpperCase()}${plural(kind).slice(1)} / ${editing ? "Edit" : "New"}`}
        marker={kind === "company" ? "CO" : kind === "contact" ? "CT" : "LD"}
        title={editing ? `Edit ${noun(kind).toLowerCase()}` : `Add ${noun(kind).toLowerCase()}`}
        description={<p>Required fields are identified in text. Protected choices come only from current server authority.</p>}
      />
      <FormWorkbench label={`${editing ? "Edit" : "Add"} ${noun(kind)}`}>
      <SectionNav label={`${noun(kind)} form sections`} items={kind === "company" ? [{href:"#company-profile-heading",label:"Profile"},{href:"#company-contact-heading",label:"Contact & address"},{href:"#assignment-heading",label:"Responsibility"}] : kind === "contact" ? [{href:"#basic-heading",label:"Overview"},{href:"#channels-heading",label:"Channels"},{href:"#lifecycle-heading",label:"Lifecycle"},{href:"#address-heading",label:"Address"},{href:"#notes-heading",label:"Notes"},{href:"#assignment-heading",label:"Responsibility"}] : [{href:"#lead-essentials-heading",label:"Overview"},{href:"#lead-channels-heading",label:"Channels"},{href:"#profiling-heading",label:"Profiling"},{href:"#assignment-heading",label:"Responsibility"}]}/>
        <form
          className={`ds-form screen-profile-form${kind === "lead" ? " lead-profile-shell" : ""}`}
          noValidate
          onSubmit={submit}
          aria-busy={busy}
        >
          <ErrorSummary
            errors={errors}
            summary={summary}
            linkedFields={linkedFields(kind)}
            reference={safeReference || undefined}
          />
          {notice && (
            <p className="alert info" role="status">
              {notice}
            </p>
          )}
          {kind === "company" && (
            <>
              <FormSection id="company-profile-heading" number="01" title="Company profile" description="Capture the organization’s current identity and business profile." tone="overview">
                <FormGrid>
                  <Input
                    id="companyName"
                    label="Company name"
                    required
                    autoComplete="organization"
                    defaultValue={company?.base.name}
                    data-error={errors.companyName}
                  />
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
                    onResolutionStateChange={(unresolved) => setOptionResolution("parentCompanyId", unresolved)}
                    initial={parentOption}
                    excludeRecordId={recordId}
                    error={errors.parentCompanyId}
                    onAuthorityLoss={clearProtectedState}
                  />
                </FormGrid>
              </FormSection>
              <FormSection id="company-contact-heading" number="02" title="Contact & address" description="Add the organization’s current contact and mailing details." tone="relationship">
                <FormGrid>
                  <Input
                    id="phone"
                    label="Phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    defaultValue={channel?.phone ?? ""}
                    data-error={errors.phone}
                  />
                </FormGrid>
                <AddressFields errors={errors} defaults={addr ?? {}} embedded />
              </FormSection>
            </>
          )}
          {kind === "contact" && (
            <>
              <FormSection id="basic-heading" number="01" title="Contact overview" description="Capture the person’s current identity and Company relationship." tone="overview">
                <FormGrid>
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
                    onResolutionStateChange={(unresolved) => setOptionResolution("companyId", unresolved)}
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
                </FormGrid>
              </FormSection>
              <FormSection id="channels-heading" number="02" title="Contact channels" description="Add current ways to reach this Contact." tone="overview">
                <FormGrid>
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
                </FormGrid>
              </FormSection>
              <FormSection id="lifecycle-heading" number="03" title="Lifecycle" description="Choose the Contact’s current lifecycle state before saving." tone="relationship">
                <FormGrid>
                <Select
                  id="lifecycleStage"
                  label="Lifecycle stage"
                  required
                  defaultValue={contact?.base.lifecycleStage ?? ""}
                  error={errors.lifecycleStage}
                >
                  <option value="">Choose a lifecycle stage</option>
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
                </FormGrid>
              </FormSection>
              <FormSection id="address-heading" number="04" title="Address" description="Add the current business mailing address." tone="relationship">
                <AddressFields errors={errors} defaults={addr ?? {}} embedded />
              </FormSection>
              <FormSection id="notes-heading" number="05" title="Internal notes" description="Optionally record a separate Notes-owned entry after the Contact saves." tone="activity">
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
              </FormSection>
            </>
          )}
          {kind === "lead" && (
            <>
              <FormSection id="lead-essentials-heading" number="01" title="Overview" description="Start with the Lead’s identity and existing Company." tone="overview">
                <FormGrid className="lead-primary-grid">
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
                    onResolutionStateChange={(unresolved) => setOptionResolution("companyId", unresolved)}
                    initial={companyOption}
                    reconciliation={selectionConflict?.field === "profile.company" ? selectionConflict : undefined}
                    onReconciled={() => {
                      setSelectionConflict(null);
                      setErrors((current) => {
                        const next = { ...current };
                        delete next.companyId;
                        return next;
                      });
                    }}
                    error={errors.companyId}
                    onAuthorityLoss={clearProtectedState}
                    canCreateCompany={canCreateCompany}
                    leadCompanyLayout
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
                </FormGrid>
              </FormSection>
              <FormSection id="lead-channels-heading" number="02" title="Contact channels" description="Add current ways to reach this Lead." tone="overview">
                <FormGrid>
                  <Input
                    id="primaryEmail"
                    label="Primary email"
                    required
                    type="email"
                    autoComplete="email"
                    defaultValue={channel?.primaryEmail ?? ""}
                    data-error={errors.primaryEmail}
                  />
                </FormGrid>
                <details className="screen-disclosure" open={Boolean(errors.secondaryEmail || errors.officePhone || errors.mobilePhone || errors.fax || errors.website || errors.twitterHandle || errors.promotionalEmailOptOut)}>
                  <summary>Optional contact channels</summary>
                  <FormGrid>
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
                  </FormGrid>
                </details>
              </FormSection>
              <FormSection id="profiling-heading" number="03" title="Profiling" description="Status is operational and does not itself qualify the Lead." tone="relationship">
                <FormGrid>
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
                    onResolutionStateChange={(unresolved) => setOptionResolution("stageId", unresolved)}
                    initial={stageOption}
                    reconciliation={selectionConflict?.field === "profile.stageId" ? selectionConflict : undefined}
                    onReconciled={() => {
                      setSelectionConflict(null);
                      setErrors((current) => {
                        const next = { ...current };
                        delete next.stageId;
                        return next;
                      });
                    }}
                    error={errors.stageId}
                    onAuthorityLoss={clearProtectedState}
                  />
                </FormGrid>
                <details className="screen-disclosure" open={Boolean(errors.rating || errors.industry || errors.annualRevenue || errors.employeeCount)}>
                  <summary>Optional profiling fields</summary>
                  <FormGrid>
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
                  </FormGrid>
                </details>
                <AddressFields errors={errors} defaults={addr ?? {}} collapsible />
              </FormSection>
            </>
          )}
          <AssignmentSection kind={kind}>
            <OptionalSection enabled={kind === "lead"} open={Boolean(errors.responsibleMembershipId || errors.responsibleTeamId || errors.visibility || errors.visibleTeamIds)} summary="Responsibility and visibility fields — optional">
            <OptionSelect
              workspaceId={workspaceId}
              kind={kind}
              optionKind="assignment_membership"
              id="responsibleMembershipId"
              label="Assigned owner"
              onResolutionStateChange={(unresolved) => setOptionResolution("responsibleMembershipId", unresolved)}
              initial={membershipOption}
              reconciliation={selectionConflict?.field === "assignment.responsibleMembershipId" ? selectionConflict : undefined}
              onReconciled={() => {
                setSelectionConflict(null);
                setErrors((current) => {
                  const next = { ...current };
                  delete next.responsibleMembershipId;
                  return next;
                });
              }}
              error={errors.responsibleMembershipId}
              onAuthorityLoss={clearProtectedState}
            />
            <OptionSelect
              workspaceId={workspaceId}
              kind={kind}
              optionKind="assignment_team"
              id="responsibleTeamId"
              label="Responsible Team"
              onResolutionStateChange={(unresolved) => setOptionResolution("responsibleTeamId", unresolved)}
              initial={teamOption}
              reconciliation={selectionConflict?.field === "assignment.responsibleTeamId" ? selectionConflict : undefined}
              onReconciled={() => {
                setSelectionConflict(null);
                setErrors((current) => {
                  const next = { ...current };
                  delete next.responsibleTeamId;
                  return next;
                });
              }}
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
              reconciliation={selectionConflict?.field === "assignment.visibleTeamIds" ? selectionConflict : undefined}
              onReconciled={() => {
                setSelectionConflict(null);
                setErrors((current) => {
                  const next = { ...current };
                  delete next.visibleTeamIds;
                  return next;
                });
              }}
              error={errors.visibleTeamIds}
              onAuthorityLoss={clearProtectedState}
            />
            </OptionalSection>
          </AssignmentSection>
          {stale && (
            <div className="alert error" role="alert" tabIndex={-1}>
              <p>{notice}</p>
              <Button type="button" onClick={() => void load()}>
                Reload latest
              </Button>
            </div>
          )}
          <ScreenFormActions>
            <Link
              className="secondary link-button"
              href={editing ? `${basePath}/${recordId}` : basePath}
            >
              Cancel
            </Link>
            <Button variant="primary" disabled={busy || stale || selectionConflict !== null || unresolvedOptions.size > 0}>
              {busy ? "Saving…" : kind === "lead" && editing ? "Save changes" : `Save ${noun(kind)}`}
            </Button>
          </ScreenFormActions>
        </form>
      </FormWorkbench>
    </>
  );
}
