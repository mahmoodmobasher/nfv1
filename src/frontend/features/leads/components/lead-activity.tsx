"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button, EmptyState, FieldMessage, LoadingState, Panel, StatusBadge } from "@/frontend/design-system";
import {
  ACTIVITY_CREATE_V1, ACTIVITY_LIST_QUERY_V1, activityCreateCommandV1Schema, activityCreateEnvelopeV1Schema,
  activityErrorDisposition, activityErrorEnvelopeV1Schema, leadActivityListEnvelopeV1Schema,
  type ActivityCreateCommandV1, type ActivityErrorV1, type ActivityItemV1, type ActivityKindV1, type LeadActivityListV1,
} from "../contracts/lead-activity.contracts";

type Draft = { kind: ActivityKindV1; direction: "" | "inbound" | "outbound" | "internal"; outcome: "" | "completed" | "connected" | "no_answer" | "left_message" | "rescheduled" | "cancelled" | "follow_up_required" | "other"; occurredAt: string; durationMinutes: string; subject: string; details: string };
type FieldErrors = Partial<Record<keyof Draft | "_form", string>>;
type AuthorityLoss = { code: "authentication_required" | "permission_required" | "resource_not_found" };
type FeedbackKind = "pending" | "validation" | "error" | "conflict" | "replay" | "success" | "info";

const kinds: Array<[ActivityKindV1, string]> = [["note", "Note"], ["call", "Call"], ["meeting", "Meeting"], ["email", "Email"], ["message", "Message"], ["other", "Other"]];
const directionLabels = { inbound: "Inbound", outbound: "Outbound", internal: "Internal" } as const;
const outcomeLabels = { completed: "Completed", connected: "Connected", no_answer: "No answer", left_message: "Left message", rescheduled: "Rescheduled", cancelled: "Cancelled", follow_up_required: "Follow-up required", other: "Other" } as const;
const localNow = () => { const now = new Date(), local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16); };
const emptyDraft = (): Draft => ({ kind: "note", direction: "", outcome: "", occurredAt: localNow(), durationMinutes: "", subject: "", details: "" });
const endpoint = (workspaceId: string, leadId: string) => `/api/workspaces/${workspaceId}/leads/${leadId}/activities`;
const json = async (response: Response): Promise<unknown> => { try { return await response.json(); } catch { return null; } };
const safeError = (value: unknown): ActivityErrorV1 => { const parsed = activityErrorEnvelopeV1Schema.safeParse(value); return parsed.success ? parsed.data.error : { code: "unexpected_error", message: "Activities returned an invalid response.", retryable: true, reconciliation: { required: true, action: "retry_same_request" }, zeroPartialEffects: true }; };
async function csrf() { const response = await fetch("/api/auth/csrf", { cache: "no-store" }); if (!response.ok) throw { code: "authentication_required", message: "Sign in again before continuing.", retryable: false, reconciliation: { required: true, action: "clear_protected_state" }, zeroPartialEffects: true } satisfies ActivityErrorV1; return (await response.json() as { token: string }).token; }
const requestFor = (body: string, current: { body: string; key: string }) => body === current.body ? current : { body, key: crypto.randomUUID() };
const displayTime = (value: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
export function compareActivityDescending(left: ActivityItemV1, right: ActivityItemV1) {
  const chronology = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
  return chronology || right.activityId.localeCompare(left.activityId);
}
export function mergeActivityItems(current: ActivityItemV1[], incoming: ActivityItemV1[]) {
  return [...new Map([...current, ...incoming].map(item => [item.activityId, item])).values()].sort(compareActivityDescending);
}
export function activityMatchesFilter(item: ActivityItemV1, filter: "" | ActivityKindV1) { return !filter || item.kind === filter; }

function commandFrom(draft: Draft, version: number) {
  const duration = draft.durationMinutes.trim() ? Number(draft.durationMinutes) : null;
  let occurredAt = "";
  try { occurredAt = new Date(draft.occurredAt).toISOString(); } catch { occurredAt = ""; }
  return activityCreateCommandV1Schema.safeParse({ contractVersion: ACTIVITY_CREATE_V1, expectedLeadVersion: version,
    kind: draft.kind, direction: draft.direction || null, outcome: draft.outcome || null, occurredAt,
    durationMinutes: duration, subject: draft.subject, details: draft.details.trim() || null });
}
function fieldErrors(issues: Array<{ path: PropertyKey[] }>): FieldErrors {
  const next: FieldErrors = {};
  for (const issue of issues) { const field = String(issue.path[0] ?? "_form") as keyof Draft; next[field] ??= field === "subject" ? "Enter a subject between 1 and 200 characters." : field === "details" ? "Keep details within 10,000 characters." : field === "durationMinutes" ? "Enter a whole number from 1 to 1,440, or leave it blank." : field === "occurredAt" ? "Enter a valid occurrence date and time." : "Review this value."; }
  return next;
}

function ActivityCard({ item }: { item: ActivityItemV1 }) {
  const kind = kinds.find(([value]) => value === item.kind)?.[1] ?? "Activity", createdDiffers = item.createdAt !== item.occurredAt;
  return <li className="grid gap-3 rounded-card border border-line bg-surface p-4"><div className="flex flex-wrap items-start justify-between gap-3"><StatusBadge tone="accent">{kind}</StatusBadge><time dateTime={item.occurredAt}>{displayTime(item.occurredAt)}</time></div><h3>{item.subject}</h3>{item.details && <p>{item.details}</p>}<dl className="grid gap-2 text-xs text-ink-muted sm:grid-cols-2">{item.direction && <div><dt>Direction</dt><dd>{directionLabels[item.direction]}</dd></div>}{item.outcome && <div><dt>Outcome</dt><dd>{outcomeLabels[item.outcome]}</dd></div>}{item.durationMinutes && <div><dt>Duration</dt><dd>{item.durationMinutes} minutes</dd></div>}{createdDiffers && <div><dt>Recorded</dt><dd>{displayTime(item.createdAt)}</dd></div>}</dl>{item.kind === "email" && <small>Email is recorded as evidence only. NexaFlow did not send it.</small>}</li>;
}

export function LeadActivityPanel({ workspaceId, leadId, onAuthorityLoss }: { workspaceId: string; leadId: string; onAuthorityLoss: (error: AuthorityLoss) => void }) {
  const [view, setView] = useState<LeadActivityListV1 | null>(null), [loading, setLoading] = useState(true), [loadingOlder, setLoadingOlder] = useState(false);
  const [requestedKind, setRequestedKind] = useState<"" | ActivityKindV1>(""), [confirmedKind, setConfirmedKind] = useState<"" | ActivityKindV1>(""), [draft, setDraft] = useState<Draft>(emptyDraft), [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState(""), [error, setError] = useState<ActivityErrorV1 | null>(null), [busy, setBusy] = useState(false), [stale, setStale] = useState(false);
  const [feedbackKind, setFeedbackKind] = useState<FeedbackKind>("info");
  const summary = useRef<HTMLDivElement>(null), loadRecovery = useRef<HTMLDivElement>(null), request = useRef({ body: "", key: crypto.randomUUID() }), firstPageGeneration = useRef(0), olderInFlight = useRef(false), viewRef = useRef<LeadActivityListV1 | null>(null), confirmedKindRef = useRef<"" | ActivityKindV1>("");

  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { confirmedKindRef.current = confirmedKind; }, [confirmedKind]);

  function clearProtected(next: ActivityErrorV1) { firstPageGeneration.current++; viewRef.current = null; confirmedKindRef.current = ""; setView(null); setDraft(emptyDraft()); setErrors({}); setNotice(""); setError(null); setStale(false); setRequestedKind(""); setConfirmedKind(""); request.current = { body: "", key: crypto.randomUUID() }; onAuthorityLoss({ code: next.code as AuthorityLoss["code"] }); }
  async function load(filter: "" | ActivityKindV1, cursor?: string, append = false, preserveDraft = false) {
    if (append && olderInFlight.current) return; if (append) olderInFlight.current = true; else olderInFlight.current = false;
    const generation = append ? firstPageGeneration.current : ++firstPageGeneration.current, confirmedAtRequest = confirmedKindRef.current;
    if (append) setLoadingOlder(true); else { setLoading(true); setLoadingOlder(false); if (viewRef.current && !preserveDraft && !stale) { setFeedbackKind("pending"); setNotice(`Applying ${filter || "all manual kinds"} filter…`); } } setError(null);
    const query = new URLSearchParams({ queryVersion: ACTIVITY_LIST_QUERY_V1, limit: "20" }); if (filter) query.set("kind", filter); if (cursor) query.set("cursor", cursor);
    try {
      const response = await fetch(`${endpoint(workspaceId, leadId)}?${query}`, { cache: "no-store" }), payload = await json(response);
      if (generation !== firstPageGeneration.current || append && filter !== confirmedKindRef.current) return;
      if (!response.ok) throw safeError(payload);
      const parsed = leadActivityListEnvelopeV1Schema.safeParse(payload); if (!parsed.success || parsed.data.data.lead.leadId !== leadId) throw safeError(null);
      const next = parsed.data.data;
      if (append && viewRef.current) { const normalized = { ...next, items: mergeActivityItems(viewRef.current.items, next.items) }; viewRef.current = normalized; setView(normalized); }
      else { const normalized = { ...next, items: mergeActivityItems([], next.items) }; viewRef.current = normalized; confirmedKindRef.current = filter; setView(normalized); setConfirmedKind(filter); setRequestedKind(filter); if (!preserveDraft && !stale) { setNotice(""); setFeedbackKind("info"); } }
      if (preserveDraft) { setStale(false); setFeedbackKind("info"); setNotice("Latest Lead and activity authority loaded. Your safe draft is still here; review it before submitting again."); setTimeout(() => summary.current?.focus()); }
    } catch (value) {
      if (generation !== firstPageGeneration.current) return;
      const next = value && typeof value === "object" && "code" in value ? value as ActivityErrorV1 : safeError(null);
      if (activityErrorDisposition(next) === "authority_loss") clearProtected(next); else { setError(next); setFeedbackKind(stale ? "conflict" : "error"); setNotice(append ? `${next.message} Previously loaded activity remains in place.` : viewRef.current ? `${next.message} Results remain filtered by ${confirmedAtRequest || "all manual kinds"}.` : next.message); if (!append) setRequestedKind(confirmedAtRequest); setTimeout(() => (viewRef.current ? summary.current : loadRecovery.current)?.focus()); }
    } finally { if (append) olderInFlight.current = false; if (generation === firstPageGeneration.current) { if (append) setLoadingOlder(false); else setLoading(false); } }
  }
  // The effect intentionally starts a new first-page authority request only when its route/filter identity changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setRequestedKind(""); setConfirmedKind(""); void load(""); }, [workspaceId, leadId]);

  function update<K extends keyof Draft>(field: K, value: Draft[K]) { setDraft(current => ({ ...current, [field]: value })); setErrors(current => ({ ...current, [field]: undefined, _form: undefined })); if (!stale) { setNotice(""); setError(null); } }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!view?.lead.capabilities.canCreateActivity || busy || stale) return;
    const parsed = commandFrom(draft, view.lead.version);
    if (!parsed.success) { const next = fieldErrors(parsed.error.issues); setErrors(next); setFeedbackKind("validation"); setNotice("Correct the linked fields before logging this activity."); setTimeout(() => summary.current?.focus()); return; }
    const body = JSON.stringify(parsed.data satisfies ActivityCreateCommandV1); request.current = requestFor(body, request.current); setBusy(true); setFeedbackKind("pending"); setNotice("Logging activity…"); setErrors({}); setError(null);
    try {
      const token = await csrf(), response = await fetch(endpoint(workspaceId, leadId), { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": token, "idempotency-key": request.current.key }, body }), payload = await json(response);
      if (!response.ok) {
        const next = safeError(payload), disposition = activityErrorDisposition(next);
        if (disposition === "authority_loss") { clearProtected(next); return; }
        if (disposition === "new_request") request.current = { body: "", key: crypto.randomUUID() };
        if (disposition === "refetch") { setStale(true); setFeedbackKind("conflict"); request.current = { body: "", key: crypto.randomUUID() }; }
        if (disposition === "validation") setErrors(next.fields?.length ? fieldErrors(next.fields.map(field => ({ path: [field] }))) : { _form: "Review the submitted values." });
        setError(next); if (disposition !== "refetch") setFeedbackKind(disposition === "validation" ? "validation" : "error"); setNotice(next.message); setTimeout(() => summary.current?.focus()); return;
      }
      const result = activityCreateEnvelopeV1Schema.safeParse(payload); if (!result.success || result.data.data.activity.target.recordId !== leadId) throw new Error("invalid_activity_result");
      const saved = result.data.data; setView(current => { if (!current) return current; const normalized = { ...current, lead: { ...current.lead, version: saved.leadVersion }, items: activityMatchesFilter(saved.activity, confirmedKindRef.current) ? mergeActivityItems(current.items, [saved.activity]) : current.items }; viewRef.current = normalized; return normalized; });
      setDraft(emptyDraft()); setFeedbackKind(saved.replayed ? "replay" : "success"); setNotice(saved.replayed ? "This activity was already logged. No duplicate was created." : activityMatchesFilter(saved.activity, confirmedKindRef.current) ? "Activity logged and placed in occurrence order." : `Activity logged. It is outside the confirmed ${confirmedKindRef.current} filter.`); request.current = { body: "", key: crypto.randomUUID() }; setTimeout(() => summary.current?.focus());
    } catch (value) {
      const next = value && typeof value === "object" && "code" in value ? value as ActivityErrorV1 : safeError(null);
      if (activityErrorDisposition(next) === "authority_loss") clearProtected(next); else { setError(next); setFeedbackKind("error"); setNotice("The activity could not be confirmed. Your safe draft is still here; retry with the same request."); setTimeout(() => summary.current?.focus()); }
    } finally { setBusy(false); }
  }

  if (loading && !view) return <Panel tone="activity" title="Activity" description="Manual Lead interactions in newest-first order."><LoadingState label="Loading Lead activity…" rows={3}/></Panel>;
  if (error && !view) return <Panel tone="activity" title="Activity"><div ref={loadRecovery} className="grid gap-3 rounded-card border border-danger bg-danger-soft p-4 text-danger" role="alert" tabIndex={-1}><div><h2>Activity unavailable</h2><p>No protected activity content is shown. {error.message}</p></div><div className="flex flex-wrap items-center gap-2"><Button onClick={() => void load("")}>Try again</Button></div></div></Panel>;
  if (!view) return null;
  const described = (field: keyof Draft, help?: boolean) => [help ? `activity-${field}-help` : "", errors[field] ? `activity-${field}-error` : ""].filter(Boolean).join(" ") || undefined;
  return <Panel tone="activity" title="Activity" description="Manual Lead interactions in newest-first order." action={view.lead.capabilities.canCreateActivity ? <span className="rounded-card border border-line bg-surface-muted p-4 text-xs text-ink-muted">You can log activity</span> : undefined}>
    {(notice || error) && <div ref={summary} data-feedback-kind={feedbackKind} className="grid gap-3 rounded-card border border-line bg-surface-muted p-4 text-ink" role={feedbackKind === "validation" || feedbackKind === "error" || feedbackKind === "conflict" ? "alert" : "status"} aria-live={feedbackKind === "validation" || feedbackKind === "error" || feedbackKind === "conflict" ? "assertive" : "polite"} aria-atomic="true" tabIndex={-1}><div><p>{notice}</p>{Object.entries(errors).length > 0 && <ul>{Object.entries(errors).map(([field, message]) => message && <li key={field}>{field === "_form" ? message : <a href={`#activity-${field}`} onClick={event => { event.preventDefault(); document.getElementById(`activity-${field}`)?.focus(); }}>{message}</a>}</li>)}</ul>}</div>{stale && <div className="flex flex-wrap items-center gap-2"><Button onClick={() => void load(confirmedKind, undefined, false, true)} disabled={loading}>Load latest Lead and activity</Button></div>}</div>}
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {view.lead.capabilities.canCreateActivity && <form className="grid gap-5" onSubmit={submit} noValidate aria-busy={busy}>
        <section aria-labelledby="activity-composer-title"><h3 id="activity-composer-title">Log activity</h3>
          <div className="grid gap-4 md:grid-cols-12"><label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink" htmlFor="activity-kind"><span>Kind</span><select id="activity-kind" value={draft.kind} onChange={event => update("kind", event.target.value as ActivityKindV1)}>{kinds.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink" htmlFor="activity-occurredAt"><span>Occurred at</span><input id="activity-occurredAt" type="datetime-local" value={draft.occurredAt} onChange={event => update("occurredAt", event.target.value)} aria-invalid={Boolean(errors.occurredAt)} aria-describedby={described("occurredAt")}/>{errors.occurredAt && <FieldMessage id="activity-occurredAt-error" tone="error">{errors.occurredAt}</FieldMessage>}</label></div>
          <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink" htmlFor="activity-subject"><span>Subject</span><input id="activity-subject" maxLength={200} value={draft.subject} onChange={event => update("subject", event.target.value)} aria-invalid={Boolean(errors.subject)} aria-describedby={described("subject")}/>{errors.subject && <FieldMessage id="activity-subject-error" tone="error">{errors.subject}</FieldMessage>}</label>
          <div className="grid gap-4 md:grid-cols-2"><label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink" htmlFor="activity-direction"><span>Direction <small>optional</small></span><select id="activity-direction" value={draft.direction} onChange={event => update("direction", event.target.value as Draft["direction"])}><option value="">Not specified</option>{Object.entries(directionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink" htmlFor="activity-outcome"><span>Outcome <small>optional</small></span><select id="activity-outcome" value={draft.outcome} onChange={event => update("outcome", event.target.value as Draft["outcome"])}><option value="">Not specified</option>{Object.entries(outcomeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
          <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink" htmlFor="activity-durationMinutes"><span>Duration in minutes <small>optional</small></span><input id="activity-durationMinutes" type="number" inputMode="numeric" min={1} max={1440} step={1} value={draft.durationMinutes} onChange={event => update("durationMinutes", event.target.value)} aria-invalid={Boolean(errors.durationMinutes)} aria-describedby={described("durationMinutes", true)}/><FieldMessage id="activity-durationMinutes-help">Enter 1 to 1,440 minutes.</FieldMessage>{errors.durationMinutes && <FieldMessage id="activity-durationMinutes-error" tone="error">{errors.durationMinutes}</FieldMessage>}</label>
          <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink" htmlFor="activity-details"><span>Details <small>optional</small></span><textarea id="activity-details" maxLength={10000} value={draft.details} onChange={event => update("details", event.target.value)} aria-invalid={Boolean(errors.details)} aria-describedby={described("details", draft.kind === "email")}/>{draft.kind === "email" && <FieldMessage id="activity-details-help">This records email evidence only. It does not send an email.</FieldMessage>}{errors.details && <FieldMessage id="activity-details-error" tone="error">{errors.details}</FieldMessage>}</label>
          <div className="flex flex-wrap items-center gap-2"><Button variant="primary" type="submit" disabled={busy || stale}>{busy ? "Logging activity…" : stale ? "Load latest before submitting" : "Log activity"}</Button></div>
        </section>
      </form>}
      <section className="grid gap-4" aria-labelledby="activity-timeline-title" aria-busy={loadingOlder || loading}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="activity-timeline-title">Activity history</h3><p role="status">{view.items.length} loaded · {confirmedKind ? `${kinds.find(([value]) => value === confirmedKind)?.[1]} only` : "All manual kinds"}{requestedKind !== confirmedKind ? " · Applying requested filter…" : ""}</p></div><label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink" htmlFor="activity-filter"><span>Kind</span><select id="activity-filter" value={requestedKind} onChange={event => { const next = event.target.value as "" | ActivityKindV1; setRequestedKind(next); void load(next); }} disabled={loadingOlder}><option value="">All manual kinds</option>{kinds.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
        {view.items.length === 0 ? <EmptyState title="No activity yet"><p>{confirmedKind ? "No activity matches this kind." : "Log the first manual interaction when current authority permits it."}</p></EmptyState> : <ol className="grid list-none gap-3 p-0" aria-label="Lead activity history">{view.items.map(item => <ActivityCard item={item} key={item.activityId}/>)}</ol>}
        {view.hasMore && view.nextCursor && <div className="flex justify-center"><Button onClick={() => void load(confirmedKind, view.nextCursor!, true)} disabled={loadingOlder || loading}>{loadingOlder ? "Loading older activity…" : "Load older activity"}</Button></div>}
      </section>
    </div>
  </Panel>;
}
