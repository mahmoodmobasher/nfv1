"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, FieldMessage } from "@/frontend/design-system";
import {
  COMPANY_SCREEN_CREATE_V2,
  companyScreenCreateCommandV2Schema,
  screenFormsErrorEnvelopeV1Schema,
  screenProfileResultV1Schema,
} from "../contracts/screen-forms.contracts";

export type ScreenFormOption = {
  id: string;
  label: string;
  target:
    | { kind: "version"; version: number }
    | { kind: "updated_at"; updatedAt: string };
};

const authorityCodes = new Set([
  "authentication_required",
  "permission_required",
  "resource_not_found",
  "authority_conflict",
]);

async function responseJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function csrf() {
  const response = await fetch("/api/auth/csrf", { cache: "no-store" });
  if (!response.ok) throw new Error("csrf_unavailable");
  return ((await response.json()) as { token: string }).token;
}

function QuickField({ id, label, required, error }: { id: string; label: string; required?: boolean; error?: string }) {
  return (
    <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink" htmlFor={id}>
      <span>{label}{required ? <strong className="font-semibold text-danger"> required</strong> : <small> optional</small>}</span>
      <input id={id} name={id} required={required} aria-required={required || undefined} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} autoComplete={id === "quickCompanyName" ? "organization" : undefined} inputMode={id === "quickCompanyDomain" ? "url" : undefined} />
      {error && <FieldMessage id={`${id}-error`} tone="error">{error}</FieldMessage>}
    </label>
  );
}

export function QuickCreateCompany({ workspaceId, onCreated, onAuthorityLoss }: { workspaceId: string; onCreated: (option: ScreenFormOption, replayed: boolean) => void; onAuthorityLoss: () => void }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [message, setMessage] = useState(""),
    dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    cancel = useRef<HTMLButtonElement>(null),
    request = useRef({ body: "", key: crypto.randomUUID() });

  useEffect(() => {
    const node = dialog.current,
      triggerNode = trigger.current;
    if (!open || !node) return;
    node.showModal();
    cancel.current?.focus();
    return () => {
      if (node.open) node.close();
      triggerNode?.focus();
    };
  }, [open]);

  function close() {
    setErrors({});
    setMessage("");
    setOpen(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    const data = new FormData(event.currentTarget),
      name = String(data.get("quickCompanyName") ?? "").trim(),
      domainValue = String(data.get("quickCompanyDomain") ?? "").trim(),
      parsed = companyScreenCreateCommandV2Schema.safeParse({
        contractVersion: COMPANY_SCREEN_CREATE_V2,
        profile: {
          name,
          domain: domainValue || null,
          website: null,
          industry: null,
          sizeBand: null,
          employeeCount: null,
          annualRevenue: null,
          parentCompanyId: null,
          parentCompanyVersion: null,
          phone: null,
          address: { street: null, city: null, stateProvince: null, postalCode: null, country: null },
        },
        assignment: {
          responsibleMembershipId: null,
          responsibleMembershipVersion: null,
          responsibleTeamId: null,
          responsibleTeamVersion: null,
          visibility: "workspace",
          visibleTeamIds: [],
          visibleTeamVersions: {},
        },
      });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path.at(-1) === "name" ? "quickCompanyName" : "quickCompanyDomain";
        next[field] ??= field === "quickCompanyName" ? "Enter a Company name." : "Enter a valid domain, for example example.com.";
      }
      setErrors(next);
      return;
    }
    const serialized = JSON.stringify(parsed.data);
    if (request.current.body !== serialized) request.current = { body: serialized, key: crypto.randomUUID() };
    setBusy(true);
    setMessage("Creating company…");
    try {
      const token = await csrf(),
        response = await fetch(`/api/workspaces/${workspaceId}/companies`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-csrf-token": token, "idempotency-key": request.current.key },
          body: serialized,
        }),
        payload = await responseJson(response);
      if (!response.ok) {
        const failure = screenFormsErrorEnvelopeV1Schema.safeParse(payload);
        if (failure.success && authorityCodes.has(failure.data.error.code)) {
          request.current = { body: "", key: "" };
          onAuthorityLoss();
          return;
        }
        if (failure.success && failure.data.error.reconciliation.action === "new_request") request.current = { body: "", key: crypto.randomUUID() };
        setMessage(failure.success ? failure.data.error.message : "The Company could not be created. Your Lead has not been saved.");
        return;
      }
      const result = screenProfileResultV1Schema.safeParse(payload?.data);
      if (!result.success || result.data.kind !== "company") throw new Error("invalid_company_result");
      request.current = { body: "", key: crypto.randomUUID() };
      onCreated(result.data.selection, result.data.replayed);
      setOpen(false);
    } catch {
      setMessage("The Company could not be created. Your Lead has not been saved; retry safely.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button ref={trigger} className="inline-flex min-h-11 items-center justify-center rounded-control border border-control bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-surface-muted disabled:opacity-45" type="button" onClick={() => setOpen(true)}>Quick create company</button>
    {open && createPortal(
      <dialog ref={dialog} className="m-auto w-[min(36rem,calc(100%-2rem))] rounded-card border border-line bg-surface p-5 text-ink shadow-e3 backdrop:bg-blanket" aria-labelledby="quick-company-title" aria-describedby="quick-company-description" onCancel={(event) => { event.preventDefault(); close(); }}>
        <h2 id="quick-company-title">Quick create company</h2>
        <p id="quick-company-description">This creates a Company now. It does not save your Lead.</p>
        {message && <p role="status">{message}</p>}
        <form className="grid gap-4" noValidate onSubmit={submit}>
          <QuickField id="quickCompanyName" label="Company name" required error={errors.quickCompanyName} />
          <QuickField id="quickCompanyDomain" label="Domain" error={errors.quickCompanyDomain} />
          <div className="flex flex-wrap items-center gap-2">
            <button ref={cancel} className="inline-flex min-h-11 items-center justify-center rounded-control border border-control bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-surface-muted disabled:opacity-45" type="button" onClick={close}>Cancel</button>
            <Button variant="primary" disabled={busy}>{busy ? "Creating company…" : "Create company"}</Button>
          </div>
        </form>
      </dialog>,
      document.body,
    )}
  </>;
}
