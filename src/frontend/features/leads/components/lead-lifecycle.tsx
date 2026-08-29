"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, FeedbackState, StatusBadge } from "@/frontend/design-system";
import {
  leadLifecycleTransitionSuccessEnvelopeSchema,
  leadManagementErrorEnvelopeSchema,
  type LeadDisqualificationReason,
  type LeadLifecycleCode,
  type LeadManagementErrorEnvelope,
} from "@/frontend/shared/contracts/p1a-transport";

type LifecycleError = LeadManagementErrorEnvelope["error"];

export type LeadLifecycleTransitionOption = { to: LeadLifecycleCode; label: string; requiresReason: boolean };

const REASONS: Array<{ value: LeadDisqualificationReason; label: string }> = [
  { value: "not_a_fit", label: "Not a fit" },
  { value: "no_response", label: "No response" },
  { value: "duplicate", label: "Duplicate" },
  { value: "bad_data", label: "Bad data" },
  { value: "no_budget", label: "No budget" },
  { value: "lost_to_competitor", label: "Lost to competitor" },
  { value: "other", label: "Other" },
];

const TONE: Record<string, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  new: "neutral", working: "accent", qualified: "success", disqualified: "danger", converted: "success",
};

async function csrf() {
  const response = await fetch("/api/auth/csrf", { cache: "no-store" });
  if (!response.ok) throw new Error("csrf_unavailable");
  return await response.json() as { token: string };
}

/**
 * Renders only the transitions the server says are legal for this actor from this
 * state. The state machine lives on the server; this component never derives it.
 */
export function LeadLifecycleControl({ workspaceId, leadId, version, currentCode, currentLabel, transitions }: {
  workspaceId: string; leadId: string; version: number;
  currentCode: string | null; currentLabel: string | null;
  transitions: LeadLifecycleTransitionOption[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<LeadLifecycleTransitionOption | null>(null);
  const [reason, setReason] = useState<LeadDisqualificationReason | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LifecycleError | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());
  const alertRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (error) alertRef.current?.focus(); }, [error]);
  useEffect(() => { if (pending?.requiresReason) dialogRef.current?.querySelector("select")?.focus(); }, [pending]);

  const noteRequired = reason === "other";
  const canSubmit = !busy && (!pending?.requiresReason || (reason !== "" && (!noteRequired || note.trim().length > 0)));

  function reset() {
    setPending(null); setReason(""); setNote(""); setBusy(false);
    idempotencyKey.current = crypto.randomUUID();
  }

  async function submit(option: LeadLifecycleTransitionOption) {
    setBusy(true); setError(null);
    const body = JSON.stringify({
      contractVersion: "lead-lifecycle-transition.v1", expectedVersion: version, targetLifecycle: option.to,
      disqualificationReason: option.requiresReason ? reason : null,
      disqualificationNote: option.requiresReason && note.trim() ? note.trim() : null,
    });
    try {
      const token = await csrf();
      const response = await fetch(`/api/workspaces/${workspaceId}/leads/${leadId}/lifecycle-transitions`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": token.token,
          "idempotency-key": idempotencyKey.current },
        body,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const parsed = leadLifecycleTransitionSuccessEnvelopeSchema.safeParse(payload);
        if (!parsed.success) throw new Error("invalid_lifecycle_result");
        reset(); router.refresh(); return;
      }
      const parsed = leadManagementErrorEnvelopeSchema.safeParse(payload);
      if (!parsed.success) throw new Error("invalid_lifecycle_error");
      setError(parsed.data.error);
      idempotencyKey.current = crypto.randomUUID();
    } catch {
      setError({ code: "lead_mutation_unavailable", retryable: true,
        message: "We couldn’t change this Lead’s lifecycle. Its saved state is unchanged.",
        reconciliation: { required: true, action: "retry_same_request" } });
    } finally { setBusy(false); }
  }

  const titleId = `lifecycle-title-${leadId}`;
  return (
    <section className="grid gap-3 rounded-panel border border-line bg-surface p-5" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-faint">Lifecycle</p>
          <h2 className="mt-1 text-[15.5px] font-bold text-ink" id={titleId}>
            {currentLabel ?? currentCode ?? "Not tracked"}
          </h2>
        </div>
        {currentCode && <StatusBadge tone={TONE[currentCode] ?? "neutral"}>{currentLabel ?? currentCode}</StatusBadge>}
      </div>

      {error && (
        <div ref={alertRef} tabIndex={-1}>
          <FeedbackState tone="danger" title="That change didn’t apply">{error.message}</FeedbackState>
        </div>
      )}

      {!currentCode && <p className="text-xs text-ink-faint">This Lead predates lifecycle tracking and cannot be moved.</p>}
      {currentCode && !transitions.length && (
        <p className="text-xs text-ink-faint">No lifecycle changes are available to you for this Lead.</p>
      )}

      {transitions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {transitions.map(option => (
            <Button
              key={option.to}
              variant={option.to === "disqualified" ? "secondary" : "primary"}
              className="h-9 min-h-0 py-0 text-xs"
              disabled={busy}
              onClick={() => (option.requiresReason ? setPending(option) : void submit(option))}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}

      {pending?.requiresReason && (
        <div ref={dialogRef} className="grid gap-3 rounded-card border border-line bg-surface-muted p-4"
          role="group" aria-label="Disqualify this Lead">
          <label className="grid gap-1 text-xs font-semibold text-ink">
            Reason
            <select
              className="h-11 rounded-control border border-control bg-surface px-3 text-ink"
              value={reason}
              onChange={event => setReason(event.target.value as LeadDisqualificationReason | "")}
            >
              <option value="">Select a reason…</option>
              {REASONS.map(entry => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-ink">
            Note {noteRequired ? "(required)" : "(optional)"}
            <textarea
              className="min-h-20 rounded-control border border-control bg-surface p-3 text-[13px] text-ink"
              maxLength={1000}
              value={note}
              onChange={event => setNote(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" className="h-9 min-h-0 py-0 text-xs" disabled={!canSubmit}
              onClick={() => void submit(pending)}>
              {busy ? "Disqualifying…" : "Disqualify Lead"}
            </Button>
            <Button variant="secondary" className="h-9 min-h-0 py-0 text-xs" disabled={busy} onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
