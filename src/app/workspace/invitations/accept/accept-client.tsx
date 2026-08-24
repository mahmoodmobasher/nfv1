"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { securePost } from "../../../onboarding/api";

type Acceptance = { workspaceName: string; role: "admin" | "member" };
type Preview = { workspaceName: string; role: "admin" | "member"; expiresAt: string };
type Envelope = { data?: Acceptance; error?: { code?: string } };

export function InvitationIntentCapture({ token }: { token: string }) {
  const [state, setState] = useState<"capturing" | "failed">("capturing");
  useEffect(() => {
    window.history.replaceState(null, "", "/workspace/invitations/accept");
    void securePost("/workspace/invitations/accept/intent", { token }).then(({ response }) => {
      if (!response.ok) throw new Error("capture_failed");
      window.location.replace("/workspace/invitations/accept");
    }).catch(() => setState("failed"));
  }, [token]);
  return <div className="onboarding-page"><main className="onboarding-narrow"><section className="flow-card" aria-live="polite" aria-busy={state === "capturing"}><p className="eyebrow">Workspace invitation</p><h1>{state === "capturing" ? "Preparing your invitation…" : "We couldn’t prepare this invitation"}</h1>{state === "failed" ? <><p className="lead">The link was removed from browser history for your privacy. Reopen the original invitation email to try again.</p><a className="secondary link-button" href="mailto:info@nexaflowsystems.com">Request a new invitation</a></> : <p className="lead">Securing the invitation before showing its details.</p>}</section></main></div>;
}

async function acceptMutation() {
  return securePost<Envelope>("/workspace/invitations/accept/complete", {}, { "idempotency-key": crypto.randomUUID() });
}

export function AcceptInvitationClient({ preview, authenticated }: { preview: Preview | null; authenticated: boolean }) {
  const [busy, setBusy] = useState(false), [result, setResult] = useState<Acceptance | null>(null), [error, setError] = useState("");
  useEffect(() => { if (!preview) void securePost("/workspace/invitations/accept/intent/clear", {}); }, [preview]);
  async function accept() {
    setBusy(true); setError("");
    try {
      const { response, data } = await acceptMutation();
      if (response.ok && data.data) return setResult(data.data);
      const code = data.error?.code;
      setError(code === "seat_limit_reached" ? "This Workspace has no available active seats. Ask its Owner or an authorized Admin to make capacity available." : code === "authentication_required" ? "Sign in with the verified email address that received this invitation." : "This invitation is invalid, expired, revoked, already used, or no longer matches your access.");
    } catch {
      setError("Invitation acceptance is unavailable. Your invitation has not been used; try again.");
    } finally {
      setBusy(false);
    }
  }
  async function leave() {
    setBusy(true);
    try { await securePost("/workspace/invitations/accept/intent/clear", {}); } finally { window.location.replace("/"); }
  }
  if (result) return <div className="onboarding-page"><main className="onboarding-narrow"><section className="flow-card"><p className="eyebrow">Membership active</p><h1>You joined {result.workspaceName} as {result.role === "admin" ? "Admin" : "Member"}</h1><p role="status">The Membership is active and uses one available active seat.</p><a className="primary link-button" href="/crm/home">Open Workspace</a></section></main></div>;
  if (!preview) return <div className="onboarding-page"><main className="onboarding-narrow"><section className="flow-card"><p className="eyebrow">Workspace invitation</p><h1>This invitation isn’t available</h1><p className="lead">The link may be invalid, expired, revoked, already used, or its access may have changed.</p><a className="primary link-button" href="mailto:info@nexaflowsystems.com">Request a new invitation</a></section></main></div>;
  return <div className="onboarding-page"><main className="onboarding-narrow"><section className="flow-card"><p className="eyebrow">Workspace invitation</p><h1>Join {preview.workspaceName}?</h1><p className="lead">You were invited as <b>{preview.role === "admin" ? "Admin" : "Member"}</b>. Accepting activates a Membership and uses one available active seat.</p><div className="ready-summary"><p><span>Workspace</span><b>{preview.workspaceName}</b></p><p><span>Invited Role</span><b>{preview.role === "admin" ? "Admin" : "Member"}</b></p><p><span>Expires</span><b>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(preview.expiresAt))}</b></p></div>{error && <div className="alert error" role="alert">{error}</div>}{authenticated ? <button className="primary" onClick={() => void accept()} disabled={busy} aria-busy={busy}>{busy ? "Joining Workspace…" : "Accept invitation"}</button> : <><p className="helper">Sign in or create an account using the verified email address that received this invitation. The invitation token stays in a short-lived, server-owned cookie and is not added to the return URL.</p><Link className="primary link-button" href="/login?next=/workspace/invitations/accept">Sign in to continue</Link><Link className="secondary link-button" href="/register?next=/workspace/invitations/accept">Create account to continue</Link></>}<button type="button" className="secondary" onClick={() => void leave()} disabled={busy}>Not now</button><p className="helper">Not now does not revoke or decline the invitation on the server.</p></section></main></div>;
}
