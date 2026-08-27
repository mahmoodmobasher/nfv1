"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, FieldMessage } from "@/frontend/design-system";
import { screenFormOptionsV1Schema, screenFormsErrorEnvelopeV1Schema, type ScreenFormOptionsQueryV1 } from "../contracts/screen-forms.contracts";
import { QuickCreateCompany, type ScreenFormOption as Option } from "./quick-create-company";

type ScreenKind = "company" | "contact" | "lead";
const endpoint = (workspaceId: string, suffix: string) => `/api/workspaces/${workspaceId}/${suffix}`;
async function json(response: Response) { try { return await response.json(); } catch { return null; } }

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

export function OptionSelect({
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
  onCompanyCreated,
  canCreateCompany = false,
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
  onCompanyCreated?: (replayed: boolean) => void;
  canCreateCompany?: boolean;
}) {
  const [query, setQuery] = useState(""),
    [items, setItems] = useState<Option[]>(initial ? [initial] : []),
    [selectedValue, setSelectedValue] = useState(
      initial ? optionValue(initial) : "",
    ),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState(""),
    select = useRef<HTMLSelectElement>(null);
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
      if (!next)
        setMessage(
          parsed.data.items.length
            ? `${parsed.data.items.length} ${label} option${parsed.data.items.length === 1 ? "" : "s"} available.`
            : optionKind === "company"
              ? "No Companies are available yet."
              : "",
        );
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
  const companyRecovery = kind === "lead" && optionKind === "company" && !loading && items.length === 0;
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
          ref={select}
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
      {companyRecovery && (
        <div className="company-empty-state" aria-describedby={`${id}-empty-copy ${id}-status`}>
          <h3>Create a Company first</h3>
          <p id={`${id}-empty-copy`}>
            Every Lead must be linked to an existing Company. No Companies are
            available to select.
          </p>
          {canCreateCompany ? (
            <div className="company-empty-actions">
              <QuickCreateCompany
                workspaceId={workspaceId}
                onAuthorityLoss={onAuthorityLoss}
                onCreated={(option, replayed) => {
                  setItems([option]);
                  setSelectedValue(optionValue(option));
                  setMessage(
                    replayed
                      ? "Company creation was already applied and the Company is selected. Your Lead has not been saved yet."
                      : "Company created and selected. Your Lead has not been saved yet.",
                  );
                  onCompanyCreated?.(replayed);
                  requestAnimationFrame(() => select.current?.focus());
                }}
              />
              <Link
                className="secondary link-button"
                href="/crm/companies/new"
                target="_blank"
                rel="noopener"
              >
                Create Company in a new tab
                <span className="sr-only">; your unsaved Lead stays in this tab</span>
              </Link>
            </div>
          ) : (
            <p>Ask a workspace administrator to create a Company, then refresh this list.</p>
          )}
          <Button type="button" onClick={() => void load()} disabled={loading}>
            Refresh companies
          </Button>
        </div>
      )}
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
        <p id={`${id}-status`} className="helper" role="status" aria-live="polite">
          {message}
        </p>
      )}
    </div>
  );
}

export function OptionChecks({
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
