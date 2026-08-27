"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, FieldMessage } from "@/frontend/design-system";
import { screenFormOptionsV1Schema, screenFormSelectedOptionV1Schema, screenFormsErrorEnvelopeV1Schema, type ScreenFormOptionsQueryV1 } from "../contracts/screen-forms.contracts";
import { QuickCreateCompany, type ScreenFormOption as Option } from "./quick-create-company";

type ScreenKind = "company" | "contact" | "lead";
const endpoint = (workspaceId: string, suffix: string) => `/api/workspaces/${workspaceId}/${suffix}`;
async function json(response: Response) { try { return await response.json(); } catch { return null; } }

export function optionIdentity(item: Pick<Option, "id" | "target">) {
  return JSON.stringify({
    id: item.id,
    target:
      item.target.kind === "version"
        ? item.target.version
        : item.target.updatedAt,
  });
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

type SelectionReconciliation = {
  outcome: "changed" | "unavailable";
  submitted: { id: string; target: Option["target"] };
};

type SelectedOutcome =
  | { outcome: "unchanged"; current: Option }
  | { outcome: "changed"; current: Option }
  | { outcome: "unavailable" };

export function reconcileOptionIdentity(
  selectedIdentity: string,
  outcome: SelectedOutcome,
) {
  if (outcome.outcome === "unavailable")
    return { selectedIdentity: "", replacement: null };
  if (outcome.outcome === "changed")
    return { selectedIdentity, replacement: outcome.current };
  return {
    selectedIdentity: optionIdentity(outcome.current),
    replacement: null,
  };
}

export function selectedOptionParams({
  kind,
  optionKind,
  item,
  excludeRecordId,
}: {
  kind: ScreenKind;
  optionKind: ScreenFormOptionsQueryV1["optionKind"];
  item: Pick<Option, "id" | "target">;
  excludeRecordId?: string;
}) {
  const params = new URLSearchParams({
    kind,
    optionKind,
    id: item.id,
    targetKind: item.target.kind,
    target:
      item.target.kind === "version"
        ? String(item.target.version)
        : item.target.updatedAt,
  });
  if (excludeRecordId) params.set("excludeRecordId", excludeRecordId);
  return params;
}

export function mergeOptions(current: Option[], incoming: Option[]) {
  const merged = new Map(current.map((item) => [optionIdentity(item), item]));
  for (const item of incoming) merged.set(optionIdentity(item), item);
  return [...merged.values()];
}

export function OptionSelect({
  workspaceId,
  kind,
  optionKind,
  id,
  label,
  required,
  initial,
  error,
  excludeRecordId,
  onAuthorityLoss,
  onCompanyCreated,
  canCreateCompany = false,
  reconciliation,
  onReconciled,
}: {
  workspaceId: string;
  kind: ScreenKind;
  optionKind: ScreenFormOptionsQueryV1["optionKind"];
  id: string;
  label: string;
  required?: boolean;
  initial?: Option | null;
  error?: string;
  excludeRecordId?: string;
  onAuthorityLoss: () => void;
  onCompanyCreated?: (replayed: boolean) => void;
  canCreateCompany?: boolean;
  reconciliation?: SelectionReconciliation;
  onReconciled?: () => void;
}) {
  const [query, setQuery] = useState(""),
    [items, setItems] = useState<Option[]>(initial ? [initial] : []),
    [selectedIdentity, setSelectedIdentity] = useState(
      initial ? optionIdentity(initial) : "",
    ),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState(""),
    [replacement, setReplacement] = useState<Option | null>(null),
    select = useRef<HTMLSelectElement>(null);
  async function loadSelected(item: Pick<Option, "id" | "target">) {
    let authorityCleared = false;
    setLoading(true);
    const params = selectedOptionParams({
      kind,
      optionKind,
      item,
      excludeRecordId,
    });
    try {
      const response = await fetch(
          `${endpoint(workspaceId, "screen-form-options/selected")}?${params}`,
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
      const parsed = screenFormSelectedOptionV1Schema.safeParse(payload?.data);
      if (
        !parsed.success ||
        parsed.data.kind !== kind ||
        parsed.data.optionKind !== optionKind
      )
        throw new Error();
      const selected = parsed.data.selected;
      const reconciled = reconcileOptionIdentity(selectedIdentity, selected);
      if (selected.outcome === "unavailable") {
        setSelectedIdentity(reconciled.selectedIdentity);
        setReplacement(reconciled.replacement);
        setMessage(`${label} is no longer available. Choose another option.`);
        onReconciled?.();
        return;
      }
      setItems((current) => mergeOptions(current, [selected.current]));
      if (selected.outcome === "unchanged") {
        setSelectedIdentity(reconciled.selectedIdentity);
        setReplacement(reconciled.replacement);
        setMessage(`${label} is current.`);
        onReconciled?.();
      } else {
        setReplacement(reconciled.replacement);
        setMessage(`${label} changed. Review and confirm the current option.`);
      }
    } catch {
      setMessage(
        "The selected option could not be checked. No selection was changed.",
      );
    } finally {
      if (!authorityCleared) setLoading(false);
    }
  }
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
      setItems((current) => {
        const retained = next ? current : current.filter((item) => optionIdentity(item) === selectedIdentity);
        return mergeOptions(retained, parsed.data.items);
      });
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
  useEffect(() => {
    if (kind === "lead" && initial) void loadSelected(initial);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (kind !== "lead" || !reconciliation) return;
    if (reconciliation.outcome === "unavailable") {
      setSelectedIdentity("");
      setReplacement(null);
      setMessage(`${label} is no longer available. Choose another option.`);
      onReconciled?.();
      return;
    }
    void loadSelected(reconciliation.submitted);
  }, [reconciliation]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectedOption = items.find(
    (item) => optionIdentity(item) === selectedIdentity,
  );
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
          required={required}
          aria-required={required || undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          value={selectedIdentity}
          onChange={(event) => {
            setSelectedIdentity(event.target.value);
            setReplacement(null);
            if (event.target.value) onReconciled?.();
          }}
        >
          <option value="">
            {required ? `Choose ${label}` : `No ${label.toLowerCase()}`}
          </option>
          {items.map((item) => (
            <option key={optionIdentity(item)} value={optionIdentity(item)}>
              {item.label}
            </option>
          ))}
        </select>
        <input
          type="hidden"
          name={id}
          value={selectedOption ? optionValue(selectedOption) : ""}
        />
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
                  setSelectedIdentity(optionIdentity(option));
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
      {replacement && (
        <Button
          type="button"
          onClick={() => {
            setSelectedIdentity(optionIdentity(replacement));
            setReplacement(null);
            setMessage(`${label} was reconfirmed.`);
            onReconciled?.();
            requestAnimationFrame(() => select.current?.focus());
          }}
        >
          Use current {label.toLowerCase()}
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
  reconciliation,
  onReconciled,
}: {
  workspaceId: string;
  kind: ScreenKind;
  initial?: Option[];
  error?: string;
  onAuthorityLoss: () => void;
  reconciliation?: SelectionReconciliation;
  onReconciled?: () => void;
}) {
  const [items, setItems] = useState<Option[]>(initial),
    [selectedIdentities, setSelectedIdentities] = useState(
      () => new Set(initial.map(optionIdentity)),
    ),
    [replacement, setReplacement] = useState<Option | null>(null),
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
        setItems((current) => mergeOptions(current, parsed.data.items));
      })
      .catch(() =>
        setMessage("Visible Team options are temporarily unavailable."),
      );
  }, [workspaceId, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (kind !== "lead" || !reconciliation) return;
    const submittedIdentity = optionIdentity(reconciliation.submitted);
    if (reconciliation.outcome === "unavailable") {
      setSelectedIdentities((current) => {
        const next = new Set(current);
        next.delete(submittedIdentity);
        return next;
      });
      setReplacement(null);
      setMessage("A visible Team is no longer available and was cleared.");
      onReconciled?.();
      return;
    }
    const params = selectedOptionParams({
      kind,
      optionKind: "assignment_team",
      item: reconciliation.submitted,
    });
    fetch(
      `${endpoint(workspaceId, "screen-form-options/selected")}?${params}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const payload = await json(response);
        if (!response.ok) {
          const failure = screenFormsErrorEnvelopeV1Schema.safeParse(payload);
          if (
            failure.success &&
            failure.data.error.reconciliation.action ===
              "clear_protected_state"
          ) {
            onAuthorityLoss();
            return;
          }
          throw new Error();
        }
        const parsed = screenFormSelectedOptionV1Schema.safeParse(payload?.data);
        if (
          !parsed.success ||
          parsed.data.kind !== kind ||
          parsed.data.optionKind !== "assignment_team"
        )
          throw new Error();
        const outcome = parsed.data.selected;
        if (outcome.outcome === "unavailable") {
          setSelectedIdentities((current) => {
            const next = new Set(current);
            next.delete(submittedIdentity);
            return next;
          });
          setReplacement(null);
          setMessage("A visible Team is no longer available and was cleared.");
          onReconciled?.();
          return;
        }
        setItems((current) => mergeOptions(current, [outcome.current]));
        if (outcome.outcome === "unchanged") {
          setReplacement(null);
          setMessage("The selected visible Team is current.");
          onReconciled?.();
        } else {
          setReplacement(outcome.current);
          setMessage("A visible Team changed. Review and confirm its current version.");
        }
      })
      .catch(() =>
        setMessage("The selected visible Team could not be checked."),
      );
  }, [reconciliation]); // eslint-disable-line react-hooks/exhaustive-deps
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
            <label className="check" key={optionIdentity(item)}>
              <input
                type="checkbox"
                name="visibleTeamIds"
                value={optionValue(item)}
                checked={selectedIdentities.has(optionIdentity(item))}
                onChange={(event) => {
                  const identity = optionIdentity(item);
                  setSelectedIdentities((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(identity);
                    else next.delete(identity);
                    return next;
                  });
                  setReplacement(null);
                  onReconciled?.();
                }}
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
      {replacement && reconciliation && (
        <Button
          type="button"
          onClick={() => {
            const submittedIdentity = optionIdentity(reconciliation.submitted),
              replacementIdentity = optionIdentity(replacement);
            setSelectedIdentities((current) => {
              const next = new Set(current);
              next.delete(submittedIdentity);
              next.add(replacementIdentity);
              return next;
            });
            setReplacement(null);
            setMessage("The visible Team was reconfirmed.");
            onReconciled?.();
          }}
        >
          Use current visible Team
        </Button>
      )}
      {error && (
        <FieldMessage id="visibleTeamIds-error" tone="error">
          {error}
        </FieldMessage>
      )}
    </fieldset>
  );
}
