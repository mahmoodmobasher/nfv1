"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Button, FeedbackState, FieldMessage, Panel } from "@/frontend/design-system";
import {
  leadManagementErrorEnvelopeSchema,
  leadOperationalEditMutationSuccessEnvelopeSchema,
  leadOperationalEditSuccessEnvelopeSchema,
  leadStageTransitionSuccessEnvelopeSchema,
  type LeadManagementErrorEnvelope,
  type LeadOperationalEditCommand,
  type LeadOperationalEditView,
  type LeadPipelineStage,
  type LeadStageTransitionCommand,
  type LeadStageTransitionResult,
} from "../contracts/lead-management.contracts";

type ManagementError = LeadManagementErrorEnvelope["error"];
type OperationalDraft = LeadOperationalEditCommand;
type FieldErrors = Partial<Record<"visibleTeamIds" | "_form", string>>;

export type LeadManagementErrorDisposition = "authority_loss" | "permission" | "refetch_edit" | "refetch_stage" | "retry_same_request" | "new_request";
export function leadManagementErrorDisposition(error: ManagementError): LeadManagementErrorDisposition {
  if (error.code === "authentication_required" || error.code === "resource_not_found") return "authority_loss";
  if (error.code === "permission_required") return "permission";
  if (error.reconciliation.action === "refetch_lead_operational_edit" || error.reconciliation.action === "refetch_lead") return "refetch_edit";
  if (error.reconciliation.action === "refetch_lead_and_stages") return "refetch_stage";
  if (error.reconciliation.action === "retry_same_request") return "retry_same_request";
  return "new_request";
}

async function csrf() {
  const response = await fetch("/api/auth/csrf", { cache: "no-store" });
  if (!response.ok) throw new Error("csrf_unavailable");
  return await response.json() as { token: string };
}

async function json(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

function keyFor(body: string, previous: { body: string; key: string }) {
  if (!previous.body) return { body, key: previous.key };
  return previous.body === body ? previous : { body, key: crypto.randomUUID() };
}

function ManagementDialog({ titleId, descriptionId, trigger, onClose, children }: {
  titleId: string; descriptionId: string; trigger: HTMLElement | null; onClose: () => void; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    node.showModal();
    node.querySelector<HTMLElement>("select,button,a[href]")?.focus();
    return () => { if (node.open) node.close(); trigger?.focus(); };
  }, [trigger]);
  return <dialog ref={dialog} className="lead-management-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); onClose(); }}>{children}</dialog>;
}

export function LeadOperationalEditForm({ workspaceId, initial }: { workspaceId: string; initial: LeadOperationalEditView }) {
  const router = useRouter(), [view, setView] = useState(initial), [membership, setMembership] = useState(initial.operational.responsibleMembershipId ?? ""),
    [team, setTeam] = useState(initial.operational.responsibleTeamId ?? ""), [visibility, setVisibility] = useState<"workspace" | "teams">(initial.operational.visibility),
    [visibleTeams, setVisibleTeams] = useState(initial.operational.visibleTeamIds), [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""), [errors, setErrors] = useState<FieldErrors>({}), [authorityLost, setAuthorityLost] = useState(false),
    [saved, setSaved] = useState(false), noticeRef = useRef<HTMLDivElement>(null), request = useRef({ body: "", key: crypto.randomUUID() });
  const current = view.operational, normalizedVisible = visibility === "teams" ? [...new Set(visibleTeams)].sort() : [],
    dirty = membership !== (current.responsibleMembershipId ?? "") || team !== (current.responsibleTeamId ?? "") ||
      visibility !== current.visibility || normalizedVisible.join(",") !== [...current.visibleTeamIds].sort().join(",");

  function focusNotice() { setTimeout(() => noticeRef.current?.focus()); }
  function command(): OperationalDraft {
    return { contractVersion: "lead-operational-edit.v1", expectedVersion: view.version,
      responsibleMembershipId: membership || null, responsibleTeamId: team || null, visibility, visibleTeamIds: normalizedVisible };
  }
  function chooseResponsibleTeam(id: string) {
    setTeam(id);
    if (id && visibility === "teams") setVisibleTeams(values => values.includes(id) ? values : [...values, id]);
  }
  function validate() {
    const next: FieldErrors = {};
    if (visibility === "teams" && !normalizedVisible.length) next.visibleTeamIds = "Choose at least one Team for Team visibility.";
    if (visibility === "teams" && team && !normalizedVisible.includes(team)) next.visibleTeamIds = "The responsible Team must also be able to view this Lead.";
    if (!dirty) next._form = "Choose an operational change before saving.";
    setErrors(next);
    if (Object.keys(next).length) focusNotice();
    return Object.keys(next).length === 0;
  }
  async function reloadLatest() {
    setBusy(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/leads/${view.leadId}/operational-edit`, { cache: "no-store" }), payload = await json(response);
      if (response.ok) {
        const parsed = leadOperationalEditSuccessEnvelopeSchema.safeParse(payload);
        if (!parsed.success) throw new Error("invalid_operational_edit");
        if (!parsed.data.data.capabilities.canEditLead) { setAuthorityLost(true); return; }
        const latest = parsed.data.data, membershipIds = new Set(latest.options.responsibleMemberships.map(option => option.id)),
          teamIds = new Set(latest.options.teams.map(option => option.id));
        setView(latest);
        if (membership && !membershipIds.has(membership)) setMembership("");
        if (team && !teamIds.has(team)) setTeam("");
        setVisibleTeams(values => values.filter(id => teamIds.has(id)));
        setNotice("Latest operational values and choices loaded. Your still-available selections were preserved; review them before saving.");
        request.current = { body: "", key: crypto.randomUUID() };
        focusNotice();
        return;
      }
      const parsed = leadManagementErrorEnvelopeSchema.safeParse(payload);
      if (parsed.success && ["authentication_required", "permission_required", "resource_not_found"].includes(parsed.data.error.code)) setAuthorityLost(true);
      else { setNotice(parsed.success ? parsed.data.error.message : "The latest operational choices could not be loaded."); focusNotice(); }
    } catch { setNotice("The latest operational choices could not be loaded. Your selections are still here."); focusNotice(); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    const payload = JSON.stringify(command()); request.current = keyFor(payload, request.current);
    setBusy(true); setErrors({}); setNotice("Saving operational changes…"); setSaved(false);
    try {
      const token = await csrf(), response = await fetch(`/api/workspaces/${workspaceId}/leads/${view.leadId}/operational-edits`, {
        method: "POST", headers: { "content-type": "application/json", "x-csrf-token": token.token, "idempotency-key": request.current.key }, body: payload,
      }), body = await json(response);
      if (response.ok) {
        const parsed = leadOperationalEditMutationSuccessEnvelopeSchema.safeParse(body);
        if (!parsed.success) throw new Error("invalid_operational_edit_result");
        const result = parsed.data.data;
        setView(value => ({ ...value, version: result.leadVersion, operational: result.operational }));
        setNotice(result.replayed ? "These operational changes were already saved." : "Lead operations updated.");
        setSaved(true); request.current = { body: "", key: crypto.randomUUID() }; focusNotice(); return;
      }
      const parsed = leadManagementErrorEnvelopeSchema.safeParse(body);
      if (!parsed.success) throw new Error("invalid_management_error");
      const error = parsed.data.error, disposition = leadManagementErrorDisposition(error);
      if (disposition === "authority_loss" || disposition === "permission") setAuthorityLost(true);
      else {
        if (disposition === "new_request") request.current = { body: "", key: crypto.randomUUID() };
        setNotice(disposition === "refetch_edit" ? "This Lead or an operational choice changed. Your selections are preserved; reload the latest values before saving." : error.message);
        setErrors(error.details?.fields.includes("visibleTeamIds") ? { visibleTeamIds: "Review the selected visible Teams." } : {});
        focusNotice();
      }
    } catch { setNotice("We couldn’t save these operational changes. Your selections are still here; retry safely."); focusNotice(); }
    finally { setBusy(false); }
  }
  if (authorityLost || !view.capabilities.canEditLead) return <FeedbackState tone="danger" autoFocus title="Editing is no longer available"
    action={<Link className="ds-action ds-action--secondary" href={`/crm/leads/${view.leadId}`}>Return to Lead details</Link>}><p>Your authority changed or this Lead is no longer available. No operational choices are shown.</p></FeedbackState>;
  if (saved) return <FeedbackState tone="success" autoFocus title={notice} action={<Link className="ds-action ds-action--primary" href={`/crm/leads/${view.leadId}`}>Return to Lead details</Link>}>
    <p>Responsibility and visibility now reflect the authoritative saved values.</p></FeedbackState>;
  return <div className="ds-form-layout lead-operational-edit"><Panel title="Responsibility and visibility" description="Only operational responsibility and visibility can be changed here. Names, contact details, Company identity, attribution, lifecycle and Pipeline stage cannot be changed in this editor. Identity-bearing corrections are not available in this MVP.">
    {notice && <div ref={noticeRef} className={`ds-feedback ${errors._form || notice.includes("changed") ? "ds-feedback--conflict" : "ds-feedback--info"}`} role={errors._form ? "alert" : "status"} tabIndex={-1}><div><p>{notice}</p></div>{notice.includes("reload") || notice.includes("changed") ? <div className="ds-feedback__actions"><Button type="button" onClick={() => void reloadLatest()} disabled={busy}>Reload latest</Button></div> : null}</div>}
    {errors._form && <div ref={!notice ? noticeRef : undefined} className="ds-feedback ds-feedback--warning" role="alert" tabIndex={-1}><div><p>{errors._form}</p></div></div>}
    <form className="ds-form" onSubmit={submit} noValidate aria-busy={busy}>
      <section><h2>Responsibility</h2><label className="field" htmlFor="responsibleMembershipId"><span>Responsible person</span><select id="responsibleMembershipId" value={membership} onChange={event => setMembership(event.target.value)}><option value="">Unassigned</option>{view.options.responsibleMemberships.map(option => <option value={option.id} key={option.id}>{option.label}</option>)}</select><FieldMessage id="responsibleMembershipId-help">Only active people in this Workspace are available.</FieldMessage></label>
      <label className="field" htmlFor="responsibleTeamId"><span>Responsible Team</span><select id="responsibleTeamId" value={team} onChange={event => chooseResponsibleTeam(event.target.value)}><option value="">No responsible Team</option>{view.options.teams.map(option => <option value={option.id} key={option.id}>{option.label}</option>)}</select><FieldMessage id="responsibleTeamId-help">Assignment may be cleared. A responsible Team is included in Team visibility when selected.</FieldMessage></label></section>
      <section><h2>Visibility</h2><fieldset aria-describedby={`visibility-help${errors.visibleTeamIds ? " visibleTeamIds-error" : ""}`}><legend>Who can view this Lead?</legend><label className="check"><input type="radio" name="visibility" checked={visibility === "workspace"} onChange={() => setVisibility("workspace")}/>Everyone with access to this Workspace</label><label className="check"><input type="radio" name="visibility" checked={visibility === "teams"} onChange={() => { setVisibility("teams"); if (team) setVisibleTeams(values => values.includes(team) ? values : [...values, team]); }}/>Authorized members of selected Teams</label><FieldMessage id="visibility-help">Workspace visibility may broaden access. Team visibility requires at least one active Team.</FieldMessage></fieldset>
      {visibility === "teams" && <fieldset className="lead-visible-teams" aria-describedby={errors.visibleTeamIds ? "visibleTeamIds-error" : "visibleTeamIds-help"} aria-invalid={Boolean(errors.visibleTeamIds)}><legend>Teams that can view this Lead</legend>{view.options.teams.map(option => <label className="check" key={option.id}><input type="checkbox" checked={visibleTeams.includes(option.id)} disabled={option.id === team} onChange={event => setVisibleTeams(values => event.target.checked ? [...values, option.id] : values.filter(id => id !== option.id))}/>{option.label}{option.id === team ? " · Responsible Team" : ""}</label>)}<FieldMessage id="visibleTeamIds-help">Choose one or more active Teams.</FieldMessage>{errors.visibleTeamIds && <FieldMessage id="visibleTeamIds-error" tone="error">{errors.visibleTeamIds}</FieldMessage>}</fieldset>}</section>
      <div className="ds-page-actions"><Button variant="primary" disabled={busy || !dirty}>{busy ? "Saving changes…" : "Save changes"}</Button><Link className="ds-action ds-action--secondary" href={`/crm/leads/${view.leadId}`}>Cancel</Link></div>
    </form></Panel></div>;
}

export function LeadStageMove({ workspaceId, leadId, leadName, version, currentStageId, stages }: {
  workspaceId: string; leadId: string; leadName: string; version: number; currentStageId: string; stages: LeadPipelineStage[];
}) {
  const router = useRouter(), targets = stages.filter(stage => stage.stageId !== currentStageId), [open, setOpen] = useState(false),
    [target, setTarget] = useState(targets[0]?.stageId ?? ""), [busy, setBusy] = useState(false), [error, setError] = useState<ManagementError | null>(null),
    [result, setResult] = useState<LeadStageTransitionResult | null>(null), [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null), alert = useRef<HTMLDivElement>(null),
    request = useRef({ body: "", key: crypto.randomUUID() });
  const selected = stages.find(stage => stage.stageId === target), authorityLoss = error && leadManagementErrorDisposition(error) === "authority_loss",
    forbidden = error && leadManagementErrorDisposition(error) === "permission";
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);
  function close() { setOpen(false); setError(null); setResult(null); setBusy(false); request.current = { body: "", key: crypto.randomUUID() }; }
  async function move() {
    if (!selected) return;
    const command: LeadStageTransitionCommand = { contractVersion: "lead-stage-transition.v1", expectedVersion: version, targetStageId: selected.stageId },
      payload = JSON.stringify(command); request.current = keyFor(payload, request.current); setBusy(true); setError(null);
    try {
      const token = await csrf(), response = await fetch(`/api/workspaces/${workspaceId}/leads/${leadId}/stage-transitions`, {
        method: "POST", headers: { "content-type": "application/json", "x-csrf-token": token.token, "idempotency-key": request.current.key }, body: payload,
      }), body = await json(response);
      if (response.ok) {
        const parsed = leadStageTransitionSuccessEnvelopeSchema.safeParse(body);
        if (!parsed.success) throw new Error("invalid_stage_result");
        setResult(parsed.data.data); request.current = { body: "", key: crypto.randomUUID() }; return;
      }
      const parsed = leadManagementErrorEnvelopeSchema.safeParse(body);
      if (!parsed.success) throw new Error("invalid_stage_error");
      setError(parsed.data.error);
      if (leadManagementErrorDisposition(parsed.data.error) === "new_request") request.current = { body: "", key: crypto.randomUUID() };
    } catch {
      setError({ code: "lead_mutation_unavailable", message: "We couldn’t move this Lead. Its saved stage is unchanged.", retryable: true,
        reconciliation: { required: true, action: "retry_same_request" } });
    } finally { setBusy(false); }
  }
  if (!targets.length) return <span className="lead-stage-unavailable">No other active stages</span>;
  const titleId = `move-stage-title-${leadId}`, descriptionId = `move-stage-description-${leadId}`;
  return <><button className="ds-action ds-action--secondary" type="button" onClick={event => { setReturnFocus(event.currentTarget); setTarget(targets[0]?.stageId ?? ""); setOpen(true); }} aria-haspopup="dialog">Move stage<span className="sr-only"> for {leadName}</span></button>{open && <ManagementDialog titleId={titleId} descriptionId={descriptionId} trigger={returnFocus} onClose={close}>
    {result ? <><h2 id={titleId}>{result.changed ? `Stage updated to ${result.stage.name}.` : `Already in ${result.stage.name}.`}</h2><p id={descriptionId}>{result.changed ? result.replayed ? "This stage movement was already applied. No duplicate activity was created." : "The Lead was moved and its activity history was updated." : result.replayed ? "This no-change result was already recorded. The Lead remains unchanged." : "The Lead was already in this stage. No Lead change or activity was created."}</p><div className="ds-page-actions"><Button variant="primary" type="button" onClick={() => { close(); router.refresh(); }}>Done</Button><Link className="ds-action ds-action--secondary" href={`/crm/leads/${leadId}`}>View Lead</Link></div></> : authorityLoss ? <><h2 id={titleId}>Lead no longer available</h2><p id={descriptionId}>Access changed or this Lead is no longer visible. No stage change was applied.</p><div className="ds-page-actions"><Button variant="primary" type="button" onClick={() => location.reload()}>Reload safely</Button></div></> : <><h2 id={titleId}>Move {leadName} to another stage?</h2><p id={descriptionId}>Choose an active Pipeline stage and confirm the movement. Lifecycle and status will not change.</p>{error && <div ref={alert} className="ds-feedback ds-feedback--danger" role="alert" tabIndex={-1}><div><p>{leadManagementErrorDisposition(error) === "refetch_edit" || leadManagementErrorDisposition(error) === "refetch_stage" ? "This Lead or the available stages changed. No movement was applied; reload the latest Pipeline before trying again." : error.message}</p></div></div>}<label className="field" htmlFor={`move-stage-${leadId}`}><span>Pipeline stage</span><select id={`move-stage-${leadId}`} value={target} disabled={busy || Boolean(forbidden)} onChange={event => { setTarget(event.target.value); setError(null); request.current = { body: "", key: crypto.randomUUID() }; }}>{targets.map(stage => <option key={stage.stageId} value={stage.stageId}>{stage.name}</option>)}</select></label><div className="ds-page-actions">{forbidden ? <Button variant="primary" type="button" onClick={() => { close(); router.refresh(); }}>Close and refresh</Button> : error && (leadManagementErrorDisposition(error) === "refetch_edit" || leadManagementErrorDisposition(error) === "refetch_stage") ? <Button variant="primary" type="button" onClick={() => { close(); router.refresh(); }}>Reload latest</Button> : <Button variant="primary" type="button" disabled={busy || !selected} onClick={() => void move()}>{busy ? "Moving Lead…" : `Move to ${selected?.name ?? "stage"}`}</Button>}<Button type="button" disabled={busy} onClick={close}>Cancel</Button></div></>}
  </ManagementDialog>}</>;
}
