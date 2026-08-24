"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Alert } from "../onboarding/components";
import { plans, type PlanKey, validEmail } from "../onboarding/logic";

type Role = "Member" | "Admin";
type PreviewInvite = { email: string; role: Role; status: "pending" | "shown-sent" | "shown-failed" };

export function InvitationPreview({ plan, canOpenOperationalInvitations }: { plan: PlanKey; canOpenOperationalInvitations: boolean }) {
  const item = plans[plan], additionalSeats = Math.max(0, item.seats - 1);
  const [input, setInput] = useState(""), [defaultRole, setDefaultRole] = useState<Role>("Member"), [invites, setInvites] = useState<PreviewInvite[]>([]), [error, setError] = useState(""), [state, setState] = useState<"idle" | "success" | "partial" | "failed">("idle");
  function addEmails(value: string) {
    const entries = value.split(/[\s,;]+/).map(email => email.trim().toLowerCase()).filter(Boolean), invalid = entries.find(email => !validEmail(email)), duplicate = entries.find(email => invites.some(invite => invite.email === email));
    if (invalid) return setError("Enter a valid work email address.");
    if (duplicate) return setError("This address is already present in this preview.");
    if (invites.length + entries.length > additionalSeats) return setError(`This preview allows ${Math.max(0, additionalSeats - invites.length)} more entr${additionalSeats - invites.length === 1 ? "y" : "ies"} for the selected plan.`);
    if (entries.length) { setInvites(current => [...current, ...entries.map(email => ({ email, role: defaultRole, status: "pending" as const }))]); setError(""); setInput(""); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (input.trim()) return addEmails(input);
    if (!invites.length) return setError("Add at least one work email to preview the result.");
    setState("success"); setInvites(current => current.map(invite => ({ ...invite, status: "shown-sent" })));
  }
  function previewPartial() {
    if (!invites.length) return setError("Add at least one work email to preview partial success.");
    setState("partial"); setInvites(current => current.map((invite, index) => ({ ...invite, status: index === 0 ? "shown-sent" : "shown-failed" })));
  }
  function retry(email: string) { setInvites(current => current.map(invite => invite.email === email ? { ...invite, status: "shown-sent" } : invite)); setState("success"); }
  return <div className="onboarding-page"><main className="onboarding-narrow"><section className="flow-card"><p className="eyebrow">Non-persistent demonstration</p><h1>Preview team invitations</h1><p className="lead">Try the invitation form and its recovery states without contacting anyone or changing Workspace access.</p><Alert><b>Preview only.</b> Nothing on this page sends email, reserves seats, creates Memberships, assigns Roles, or writes Audit events.</Alert><p className="helper"><b>{item.name}</b> includes {item.seats} total active seat{item.seats === 1 ? "" : "s"}. The Owner uses one; up to {additionalSeats} additional Admin{additionalSeats === 1 ? "" : "s"} or Member{additionalSeats === 1 ? "" : "s"} can be active. Pending preview entries do not reserve a real seat.</p>{(state === "success" || state === "partial") && <Alert kind="success"><b>{state === "partial" ? "Partial-result preview." : "Success-result preview."}</b> This preview did not send email or create Memberships.</Alert>}{state === "failed" && <Alert kind="error"><b>Network-failure preview.</b> Your entries remain on this page only. Nothing was submitted.</Alert>}{error && <Alert kind="error">{error}</Alert>}<form onSubmit={submit} noValidate><label className="field" htmlFor="invite-email"><span>Work email<em> Required</em></span><span className="input-wrap"><input id="invite-email" value={input} onChange={event => setInput(event.target.value)} placeholder="alex@example.com" type="email" autoComplete="email" aria-describedby="invite-help" aria-invalid={Boolean(error)} /></span><small id="invite-help">Add multiple addresses separated by commas, spaces, or semicolons.</small></label><button type="button" className="secondary add-button" onClick={() => addEmails(input)}>Add preview entry</button><label className="field" htmlFor="invite-role"><span>Preview role<em> Required</em></span><select id="invite-role" value={defaultRole} onChange={event => setDefaultRole(event.target.value as Role)}><option>Member</option><option>Admin</option></select></label><div className="owner-panel"><b>{invites.length ? `${invites.length} preview entr${invites.length === 1 ? "y" : "ies"}` : "No preview entries yet"}</b>{invites.map(invite => <div className="invite-row" key={invite.email}><span>{invite.email}<small>{invite.status === "shown-failed" ? "Preview: couldn’t send" : invite.status === "shown-sent" ? "Preview: sent" : invite.role}</small></span>{invite.status === "shown-failed" ? <button type="button" className="text-button" onClick={() => retry(invite.email)}>Preview retry</button> : <button type="button" className="chip-remove" aria-label={`Remove ${invite.email}`} onClick={() => setInvites(current => current.filter(item => item.email !== invite.email))}>×</button>}</div>)}</div><button className="primary" disabled={state === "success"}>{state === "success" ? "Success preview shown" : "Preview invitation result"}</button></form><div className="preview-actions"><button type="button" className="text-button" onClick={previewPartial}>Preview partial result</button><button type="button" className="text-button" onClick={() => setState("failed")}>Preview network failure</button></div>{canOpenOperationalInvitations ? <Link className="secondary link-button" href="/workspace/settings/invite">Open Workspace invitations</Link> : <p className="helper">Operational invitations are available in Workspace administration only to a server-authorized Owner or Admin.</p>}</section></main></div>;
}
