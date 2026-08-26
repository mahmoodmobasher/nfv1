"use client";

import { FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { ActionLink, Button, FeedbackState, FieldMessage, LoadingState, Panel } from "@/frontend/design-system";
import { formatDealMoney, parseDealMoney } from "@/frontend/features/deals";
import type { LeadPipelineStage, LeadSummaryItem } from "@/frontend/shared/contracts/p1a-transport";
import {
  LEAD_CONVERT_TO_DEAL_OPERATION,
  leadConversionErrorEnvelopeV1Schema,
  leadConversionPreviewEnvelopeSchema,
  leadConversionResultEnvelopeSchema,
  leadConvertToDealCommandV1Schema,
  type LeadConvertToDealCommandV1,
  type LeadConversionError,
  type LeadConversionPreviewV1,
  type LeadConversionResultV1,
} from "../contracts/lead-conversion.contracts";
import { LeadReadOnlyDetail } from "./lead-presentation";

type Draft = { companyId: string; contactId: string; name: string; value: string; currencyCode: "USD" | "CAD"; expectedCloseOn: string };
type FieldErrors = Record<string, string>;
type Disposition = "clear" | "refetch" | "new_request" | "retry" | "terminal";

const reasonCopy: Record<LeadConversionPreviewV1["ineligibilityReasons"][number], string> = {
  permission_required: "Conversion is not available with your current authority.",
  lead_not_qualified: "The canonical Lead lifecycle must be Qualified before conversion.",
  identity_review_pending: "Complete the pending Identity Review before conversion.",
  identity_review_unresolved: "The Lead identity must be resolved before conversion.",
  already_converted: "This Lead was already converted.",
  legacy_status_terminal: "A legacy won or lost status is preserved and does not authorize conversion.",
  customer_selection_required: "An authorized existing Company is required.",
  customer_unavailable: "The linked customer is no longer available for conversion.",
  contact_not_primary_eligible: "The linked Contact is not currently eligible as the primary Contact.",
  pipeline_unavailable: "The default Sales pipeline is unavailable.",
  stage_unavailable: "The initial open Deal stage is unavailable.",
  assignment_unavailable: "The Lead responsibility or visibility assignment is unavailable.",
};
const endpoint = (workspaceId: string, leadId: string, action: "conversion-preview" | "convert") => `/api/workspaces/${workspaceId}/leads/${leadId}/${action}`;
const json = async (response: Response): Promise<unknown> => { try { return await response.json(); } catch { return null; } };
const safeError = (value: unknown): LeadConversionError => { const parsed = leadConversionErrorEnvelopeV1Schema.safeParse(value); return parsed.success ? parsed.data.error : { code: "unexpected_error", message: "The conversion request could not be completed.", retryable: true, reconciliation: { required: true, action: "retry_same_request" }, guarantees: { zeroPartialEffects: true } }; };
const disposition = (error: LeadConversionError): Disposition => {
  if (["authentication_required", "permission_required", "resource_not_found"].includes(error.code) || error.reconciliation.action === "clear_conversion_state") return "clear";
  if (error.reconciliation.action === "refetch_preview") return "refetch";
  if (error.reconciliation.action === "new_request") return "new_request";
  if (error.reconciliation.action === "retry_same_request") return "retry";
  return "terminal";
};
const keyFor = (body: string, current: { body: string; key: string }) => body === current.body ? current : { body, key: crypto.randomUUID() };
const majorValue = (value: LeadConversionPreviewV1["dealDefaults"]["value"]) => {
  if (!value) return "";
  const padded = value.amountMinor.padStart(3, "0");
  return `${padded.slice(0, -2)}.${padded.slice(-2)}`;
};
const draftFrom = (preview: LeadConversionPreviewV1, previous?: Draft | null): Draft => {
  const company = preview.choices.companies.some(value => value.companyId === previous?.companyId) ? previous!.companyId : preview.choices.companies[0]?.companyId ?? "";
  const contact = preview.choices.primaryContacts.some(value => value.contactId === previous?.contactId) ? previous!.contactId : "";
  return { companyId: company, contactId: contact, name: previous?.name ?? preview.dealDefaults.name, value: previous?.value ?? majorValue(preview.dealDefaults.value), currencyCode: previous?.currencyCode ?? preview.dealDefaults.value?.currencyCode ?? "USD", expectedCloseOn: previous?.expectedCloseOn ?? preview.dealDefaults.expectedCloseOn ?? "" };
};
async function csrf() { const response = await fetch("/api/auth/csrf", { cache: "no-store" }); if (!response.ok) throw { code: "authentication_required", message: "Sign in again before continuing.", retryable: false, reconciliation: { required: true, action: "clear_conversion_state" }, guarantees: { zeroPartialEffects: true } } satisfies LeadConversionError; return (await response.json() as { token: string }).token; }

function ConversionDialog({ titleId, descriptionId, restoreFocus, onClose, children }: { titleId: string; descriptionId: string; restoreFocus: () => void; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null), restore = useRef(restoreFocus);
  useEffect(() => { restore.current = restoreFocus; }, [restoreFocus]);
  useEffect(() => { const node = dialog.current; if (!node) return; node.showModal(); node.querySelector<HTMLElement>("button")?.focus(); return () => { if (node.open) node.close(); restore.current(); }; }, []);
  return <dialog ref={dialog} className="lead-management-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event => { event.preventDefault(); onClose(); }}>{children}</dialog>;
}

function FocusedFeedbackState({ title, tone, action, children }: { title: ReactNode; tone: "success" | "danger"; action: ReactNode; children: ReactNode }) {
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => { region.current?.querySelector<HTMLElement>("[role]")?.focus(); }, []);
  return <div ref={region}><FeedbackState tone={tone} autoFocus title={title} action={action}>{children}</FeedbackState></div>;
}

function SafeConversionState({ authentication }: { authentication: boolean }) {
  return <FocusedFeedbackState tone="danger" title="Lead unavailable" action={<ActionLink href={authentication ? `/login?next=${encodeURIComponent("/crm")}` : "/crm"}>{authentication ? "Sign in again" : "Back to leads"}</ActionLink>}><p>Your authority changed or this Lead is no longer available. Protected Lead, customer, Deal preview, assignment, choice, draft, and action data has been cleared.</p></FocusedFeedbackState>;
}

function LeadConversionPanel({ workspaceId, leadId, onAuthorityLoss }: { workspaceId: string; leadId: string; onAuthorityLoss: (error: LeadConversionError) => void }) {
  const [preview, setPreview] = useState<LeadConversionPreviewV1 | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<LeadConvertToDealCommandV1 | null>(null);
  const [result, setResult] = useState<LeadConversionResultV1 | null>(null);
  const [error, setError] = useState<LeadConversionError | null>(null);
  const [notice, setNotice] = useState("");
  const [stale, setStale] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const summary = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), request = useRef({ body: "", key: crypto.randomUUID() });

  useEffect(() => { if (notice && !confirming) summary.current?.focus(); }, [notice, confirming]);

  function clearProtected(next: LeadConversionError) {
    setPreview(null); setDraft(null); setPendingCommand(null); setResult(null); setError(null); setNotice(""); setErrors({}); setStale(false); setConfirming(false); request.current = { body: "", key: crypto.randomUUID() }; onAuthorityLoss(next);
  }
  async function loadPreview(preserveDraft: boolean) {
    setLoading(true); setError(null);
    try {
      const response = await fetch(endpoint(workspaceId, leadId, "conversion-preview"), { cache: "no-store" }), payload = await json(response);
      if (!response.ok) throw safeError(payload);
      const parsed = leadConversionPreviewEnvelopeSchema.safeParse(payload);
      if (!parsed.success || parsed.data.data.lead.leadId !== leadId) throw safeError(null);
      const next = parsed.data.data;
      if (next.eligible && (!next.capabilities.canConvert || !next.lead.review || !next.pipeline || next.choices.companies.length !== 1)) throw safeError(null);
      setPreview(next); setDraft(next.eligible ? draftFrom(next, preserveDraft ? draft : null) : null); setStale(false); setErrors({});
      if (preserveDraft) { setNotice("Latest conversion preview loaded. Only still-authorized customer choices were preserved; review all effects and confirm again."); setTimeout(() => summary.current?.focus()); }
    } catch (value) {
      const next = value && typeof value === "object" && "code" in value ? value as LeadConversionError : safeError(null);
      if (disposition(next) === "clear") clearProtected(next); else { setPreview(null); setDraft(null); setError(next); setNotice("Conversion preview is unavailable. No conversion choices or action are shown."); setTimeout(() => summary.current?.focus()); }
    } finally { setLoading(false); }
  }
  useEffect(() => { void loadPreview(false); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, leadId]);

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview || !draft || !preview.eligible || !preview.capabilities.canConvert || !preview.pipeline || !preview.lead.review || stale) return;
    const company = preview.choices.companies.find(value => value.companyId === draft.companyId);
    const contact = draft.contactId ? preview.choices.primaryContacts.find(value => value.contactId === draft.contactId && value.companyId === company?.companyId) : null;
    const parsedMoney = parseDealMoney(draft.value, draft.currencyCode);
    const command = {
      contractVersion: LEAD_CONVERT_TO_DEAL_OPERATION,
      expectedLeadVersion: preview.lead.version,
      intakeId: preview.lead.intakeId,
      expectedIntakeVersion: preview.lead.intakeVersion,
      review: preview.lead.review,
      company: company ? { companyId: company.companyId, expectedVersion: company.version } : { companyId: "", expectedVersion: 0 },
      primaryContact: contact ? { contactId: contact.contactId, expectedVersion: contact.version } : null,
      pipeline: { pipelineId: preview.pipeline.pipelineId, expectedVersion: preview.pipeline.version, expectedConfigurationVersion: preview.pipeline.configurationVersion, stageId: preview.pipeline.initialStage.stageId, expectedStageVersion: preview.pipeline.initialStage.version },
      deal: { name: draft.name, value: parsedMoney === "invalid" ? { amountMinor: "invalid", currencyCode: draft.currencyCode, currencyExponent: 2 as const } : parsedMoney, expectedCloseOn: draft.expectedCloseOn || null },
      assignment: preview.assignment,
    };
    const parsed = leadConvertToDealCommandV1Schema.safeParse(command);
    if (!parsed.success || draft.contactId && !contact) {
      const next: FieldErrors = {};
      for (const issue of parsed.success ? [] : parsed.error.issues) {
        const path = issue.path.map(String);
        const field = path.includes("company") ? "conversion-company" : path.includes("primaryContact") ? "conversion-contact" : path.includes("name") ? "conversion-name" : path.includes("value") ? "conversion-value" : path.includes("expectedCloseOn") ? "conversion-close" : "_form";
        next[field] ??= "Review this value.";
      }
      if (draft.contactId && !contact) next["conversion-contact"] = "Choose a currently authorized primary Contact.";
      setErrors(next); setNotice("Correct the linked conversion fields before continuing."); setTimeout(() => summary.current?.focus()); return;
    }
    setErrors({}); setNotice(""); setPendingCommand(parsed.data); setConfirming(true);
  }

  async function convert() {
    if (!pendingCommand || stale) return;
    const body = JSON.stringify(pendingCommand); request.current = keyFor(body, request.current); setBusy(true); setNotice("Converting…");
    try {
      const token = await csrf();
      const response = await fetch(endpoint(workspaceId, leadId, "convert"), { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": token, "idempotency-key": request.current.key }, body });
      const payload = await json(response);
      if (!response.ok) {
        const next = safeError(payload), action = disposition(next);
        if (action === "clear") { clearProtected(next); return; }
        setConfirming(false); setPendingCommand(null); setError(next); setNotice(`${next.message} Conversion was not completed and no partial Deal, Lead, customer, lineage, or related effects were saved.`);
        if (action === "refetch") { setStale(true); request.current = { body: "", key: crypto.randomUUID() }; }
        if (action === "new_request") request.current = { body: "", key: crypto.randomUUID() };
        setTimeout(() => summary.current?.focus()); return;
      }
      const parsed = leadConversionResultEnvelopeSchema.safeParse(payload);
      if (!parsed.success || parsed.data.data.leadId !== leadId) throw new Error("invalid_conversion_result");
      request.current = { body: "", key: crypto.randomUUID() }; setResult(parsed.data.data); setConfirming(false); setPendingCommand(null); setPreview(null); setDraft(null);
    } catch (value) {
      const next = value && typeof value === "object" && "code" in value ? value as LeadConversionError : null;
      if (next && disposition(next) === "clear") { clearProtected(next); return; }
      setConfirming(false); setPendingCommand(null); setError(safeError(null)); setNotice("Conversion was not completed. No partial Deal, Lead, customer, lineage, or related effects were saved; retry safely with the same request."); setTimeout(() => summary.current?.focus());
    } finally { setBusy(false); }
  }

  if (loading && !preview) return <Panel title="Lead conversion"><LoadingState label="Checking conversion eligibility…" rows={2}/></Panel>;
  if (result) {
    const dealHref = result.deal.available && result.nextView.kind === "deal_detail" && result.nextView.dealId === result.deal.dealId ? `/crm/deals/${result.deal.dealId}` : null;
    return <FocusedFeedbackState tone="success" title={result.replayed ? "Conversion was already applied" : "Lead converted"} action={dealHref ? <ActionLink variant="primary" href={dealHref}>View Deal</ActionLink> : <ActionLink href={`/crm/leads/${leadId}`}>View Lead</ActionLink>}><p>The server confirmed one committed conversion. No duplicate Deal or conversion effects were created.</p></FocusedFeedbackState>;
  }
  if (error && !preview) return <FocusedFeedbackState tone="danger" title="Conversion preview unavailable" action={<Button onClick={() => void loadPreview(false)}>Try again</Button>}><p>{notice}</p></FocusedFeedbackState>;
  if (!preview) return null;
  if (!preview.eligible || !preview.capabilities.canConvert || !draft) return <Panel title="Lead conversion" description="Conversion is read-only until every current server eligibility check passes."><div role="status"><p>Convert Lead to Deal is not available.</p><ul>{preview.ineligibilityReasons.map(reason => <li key={reason}>{reasonCopy[reason]}</li>)}</ul></div></Panel>;
  const company = preview.choices.companies.find(value => value.companyId === draft.companyId), contact = preview.choices.primaryContacts.find(value => value.contactId === draft.contactId), described = (id: string, help?: boolean) => [help ? `${id}-help` : "", errors[id] ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  return <Panel title="Convert Lead to Deal" description="Only the current server preview authorizes this action. Review every destination and atomic effect before confirming.">
    {notice && <div ref={summary} className={`ds-feedback ${stale || Object.keys(errors).length ? "ds-feedback--conflict" : "ds-feedback--info"}`} role={stale || Object.keys(errors).length ? "alert" : "status"} tabIndex={-1}><div><p>{notice}</p>{Object.keys(errors).length > 0 && <ul>{Object.entries(errors).map(([field, message]) => <li key={field}>{field === "_form" ? message : <a href={`#${field}`} onClick={() => setTimeout(() => document.getElementById(field)?.focus())}>{message}</a>}</li>)}</ul>}</div>{stale && <div className="ds-feedback__actions"><Button onClick={() => void loadPreview(true)} disabled={loading}>Reload conversion preview</Button></div>}</div>}
    <form className="ds-form" onSubmit={review} noValidate aria-busy={busy}>
      <section aria-labelledby="conversion-destination-title"><h3 id="conversion-destination-title">Destination Deal</h3>
        <label className="field" htmlFor="conversion-name"><span>Deal name</span><input id="conversion-name" value={draft.name} onChange={event => { setDraft({ ...draft, name: event.target.value }); setErrors({}); }} aria-invalid={Boolean(errors["conversion-name"])} aria-describedby={described("conversion-name")}/>{errors["conversion-name"] && <FieldMessage id="conversion-name-error" tone="error">{errors["conversion-name"]}</FieldMessage>}</label>
        <div className="form-grid"><label className="field" htmlFor="conversion-value"><span>Deal value <small>optional</small></span><input id="conversion-value" inputMode="decimal" value={draft.value} onChange={event => { setDraft({ ...draft, value: event.target.value }); setErrors({}); }} aria-invalid={Boolean(errors["conversion-value"])} aria-describedby={described("conversion-value", true)}/><FieldMessage id="conversion-value-help">Leave blank for Unknown. Zero is a real USD/CAD 0.00 value.</FieldMessage>{errors["conversion-value"] && <FieldMessage id="conversion-value-error" tone="error">{errors["conversion-value"]}</FieldMessage>}</label><label className="field" htmlFor="conversion-currency"><span>Currency</span><select id="conversion-currency" value={draft.currencyCode} onChange={event => setDraft({ ...draft, currencyCode: event.target.value === "CAD" ? "CAD" : "USD" })}><option value="USD">USD</option><option value="CAD">CAD</option></select></label></div>
        <label className="field" htmlFor="conversion-close"><span>Expected close <small>optional</small></span><input id="conversion-close" type="date" value={draft.expectedCloseOn} onChange={event => { setDraft({ ...draft, expectedCloseOn: event.target.value }); setErrors({}); }} aria-invalid={Boolean(errors["conversion-close"])} aria-describedby={described("conversion-close")}/>{errors["conversion-close"] && <FieldMessage id="conversion-close-error" tone="error">{errors["conversion-close"]}</FieldMessage>}</label>
        <dl className="ds-fact-list"><div><dt>Pipeline</dt><dd>{preview.pipeline!.label}</dd></div><div><dt>Initial stage</dt><dd>{preview.pipeline!.initialStage.label}</dd></div><div><dt>Default value</dt><dd>{formatDealMoney(preview.dealDefaults.value)}</dd></div></dl>
      </section>
      <section aria-labelledby="conversion-customer-title"><h3 id="conversion-customer-title">Existing customer links</h3>
        <label className="field" htmlFor="conversion-company"><span>Company</span><select id="conversion-company" value={draft.companyId} onChange={event => { setDraft({ ...draft, companyId: event.target.value, contactId: "" }); setErrors({}); }} aria-invalid={Boolean(errors["conversion-company"])} aria-describedby={described("conversion-company", true)}><option value="">Choose an authorized existing Company</option>{preview.choices.companies.map(value => <option key={value.companyId} value={value.companyId}>{value.label}</option>)}</select><FieldMessage id="conversion-company-help">Conversion never creates, merges, or silently updates a customer.</FieldMessage>{errors["conversion-company"] && <FieldMessage id="conversion-company-error" tone="error">{errors["conversion-company"]}</FieldMessage>}</label>
        <label className="field" htmlFor="conversion-contact"><span>Primary Contact <small>optional</small></span><select id="conversion-contact" value={draft.contactId} onChange={event => { setDraft({ ...draft, contactId: event.target.value }); setErrors({}); }} aria-invalid={Boolean(errors["conversion-contact"])} aria-describedby={described("conversion-contact", true)}><option value="">No primary Contact</option>{preview.choices.primaryContacts.filter(value => value.companyId === draft.companyId).map(value => <option key={value.contactId} value={value.contactId}>{value.label}</option>)}</select><FieldMessage id="conversion-contact-help">Only the one server-authorized primary-eligible Contact may be selected.</FieldMessage>{errors["conversion-contact"] && <FieldMessage id="conversion-contact-error" tone="error">{errors["conversion-contact"]}</FieldMessage>}</label>
      </section>
      <section aria-labelledby="conversion-assignment-title"><h3 id="conversion-assignment-title">Responsibility and visibility</h3><p>The Deal inherits the Lead’s current responsible person{preview.assignment.responsibleTeamId ? ", responsible Team" : ""}, and {preview.assignment.visibility === "workspace" ? "Workspace visibility" : "selected-Team visibility"}. No assignment choices are inferred or broadened in the browser.</p></section>
      <section aria-labelledby="conversion-effects-title"><h3 id="conversion-effects-title">Atomic effects</h3><ul><li>Create exactly one Deal in {preview.pipeline!.label} at {preview.pipeline!.initialStage.label}.</li><li>Link the selected existing Company{contact ? ` and primary Contact ${contact.label}` : " with no primary Contact"}.</li><li>Record conversion lineage and mark the canonical Lead lifecycle Converted.</li><li>Preserve the legacy Lead status {preview.lead.legacyStatus}; do not rewrite won or lost.</li><li>Create no customer, Delivery Project, or hidden automation.</li></ul></section>
      <div className="ds-page-actions"><button ref={trigger} type="submit" className="ds-action ds-action--primary" disabled={busy || stale}>Review conversion</button></div>
    </form>
    {confirming && pendingCommand && <ConversionDialog titleId="lead-conversion-title" descriptionId="lead-conversion-description" restoreFocus={() => trigger.current?.focus()} onClose={() => setConfirming(false)}><h2 id="lead-conversion-title">Convert Lead to Deal?</h2><p id="lead-conversion-description">This atomic operation will create one Deal, link only the selected existing customer records, record lineage, and mark the canonical Lead converted.</p><dl className="ds-fact-list"><div><dt>Deal</dt><dd>{pendingCommand.deal.name}</dd></div><div><dt>Company</dt><dd>{company?.label ?? "Unavailable"}</dd></div><div><dt>Primary Contact</dt><dd>{contact?.label ?? "None"}</dd></div><div><dt>Pipeline and stage</dt><dd>{preview.pipeline!.label} · {preview.pipeline!.initialStage.label}</dd></div></dl><div className="ds-page-actions"><Button onClick={() => setConfirming(false)} disabled={busy}>Cancel</Button><Button variant="primary" onClick={() => void convert()} disabled={busy}>{busy ? "Converting…" : "Convert Lead to Deal"}</Button></div></ConversionDialog>}
  </Panel>;
}

export function LeadDetailWithConversion({ lead, workspaceId, stages = [] }: { lead: LeadSummaryItem; workspaceId: string; stages?: LeadPipelineStage[] }) {
  const [authorityError, setAuthorityError] = useState<LeadConversionError | null>(null);
  if (authorityError) return <SafeConversionState authentication={authorityError.code === "authentication_required"}/>;
  return <><LeadReadOnlyDetail lead={lead} workspaceId={workspaceId} stages={stages}/><LeadConversionPanel workspaceId={workspaceId} leadId={lead.leadId} onAuthorityLoss={setAuthorityError}/></>;
}
