"use client";

import { FormEvent, useState } from "react";
import { Alert } from "../onboarding/components";
import { plans, type PlanKey, validEmail } from "../onboarding/logic";

type Role = "Member" | "Admin";
type PreviewInvite = { email: string; role: Role; status: "pending" | "shown-sent" | "shown-failed" };

export function InvitationPreview({ plan }: { plan: PlanKey; canOpenOperationalInvitations: boolean }) {
  const item = plans[plan];
  const [input, setInput] = useState(""), [defaultRole, setDefaultRole] = useState<Role>("Member"), [invites, setInvites] = useState<PreviewInvite[]>([]), [error, setError] = useState(""), [state, setState] = useState<"idle" | "success" | "partial" | "failed">("idle");
  function addEmails(value: string) {
    const entries = value.split(/[\s,;]+/).map(email => email.trim().toLowerCase()).filter(Boolean), invalid = entries.find(email => !validEmail(email)), duplicate = entries.find(email => invites.some(invite => invite.email === email));
    if (invalid) return setError("Enter a valid work email address.");
    if (duplicate) return setError("This address is already present in this preview.");
    if (entries.length) { setInvites(current => [...current, ...entries.map(email => ({ email, role: defaultRole, status: "pending" as const }))]); setError(""); setInput(""); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (input.trim()) return addEmails(input);
    if (!invites.length) return setError("Add at least one work email to preview the result.");
    setState("success"); setInvites(current => current.map(invite => ({ ...invite, status: "shown-sent" })));
  }
  return <div className="onboarding-page"><main className="onboarding-narrow"><section className="flow-card"><p className="eyebrow">Non-persistent demonstration</p><h1>Preview team invitations</h1><p className="lead">Try the invitation form and its recovery states without contacting anyone or changing Workspace access.</p><Alert><b>Preview only.</b> Nothing on this page sends email, reserves seats, creates Memberships, assigns Roles, or writes Audit events.</Alert><p className="helper"><b>{item.name}</b> capacity is server-authoritative. Pending preview entries do not reserve a real seat.</p>{state === "success" && <Alert kind="success">This preview did not send email or create Memberships.</Alert>}{error && <Alert kind="error">{error}</Alert>}<form onSubmit={submit} noValidate><label className="field" htmlFor="invite-email"><span>Work email<em> Required</em></span><span className="input-wrap"><input id="invite-email" value={input} onChange={event => setInput(event.target.value)} placeholder="alex@example.com" type="email" autoComplete="email" /></span></label><label className="field"><span>Preview role</span><select value={defaultRole} onChange={event => setDefaultRole(event.target.value as Role)}><option>Member</option><option>Admin</option></select></label><button type="button" className="secondary add-button" onClick={() => addEmails(input)}>Add preview entry</button><button className="primary">Preview invitation result</button></form></section></main></div>;
}
