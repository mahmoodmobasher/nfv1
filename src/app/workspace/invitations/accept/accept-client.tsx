"use client";

import Link from "next/link";
import { useState } from "react";
import { securePost } from "../../../onboarding/api";

type Acceptance = { workspaceName: string; role: "admin" | "member" };
type Preview = {
  workspaceName: string;
  role: "admin" | "member";
  expiresAt: string;
};
type Envelope = { data?: Acceptance; error?: { code?: string } };

async function acceptMutation() {
  return securePost<Envelope>(
    "/workspace/invitations/accept/complete",
    {},
    { "idempotency-key": crypto.randomUUID() },
  );
}

export function AcceptInvitationClient({
  preview,
  authenticated,
}: {
  preview: Preview;
  authenticated: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState<Acceptance | null>(null),
    [error, setError] = useState("");
  async function accept() {
    setBusy(true);
    setError("");
    try {
      const { response, data } = await acceptMutation();
      if (response.ok && data.data) return setResult(data.data);
      const code = data.error?.code;
      setError(
        code === "seat_limit_reached"
          ? "This Workspace has no available active seats. Ask its Owner or an authorized Admin to make capacity available."
          : code === "authentication_required"
            ? "Sign in with the verified email address that received this invitation."
            : "This invitation is invalid, expired, revoked, already used, or no longer matches your access.",
      );
    } catch {
      setError(
        "Invitation acceptance is unavailable. Your invitation has not been used; try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function leave() {
    setBusy(true);
    try {
      await securePost("/workspace/invitations/accept/intent/clear", {});
    } finally {
      window.location.replace("/");
    }
  }
  if (result)
    return (
      <div className="min-h-screen bg-canvas text-ink">
        <main className="mx-auto max-w-xl px-5 py-10">
          <section className="rounded-panel border border-line bg-surface p-6 sm:p-8">
            <p className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-faint">
              Membership active
            </p>
            <h1>
              You joined {result.workspaceName} as{" "}
              {result.role === "admin" ? "Admin" : "Member"}
            </h1>
            <p role="status">
              The Membership is active and uses one available active seat.
            </p>
            <a className="inline-flex min-h-11 items-center justify-center rounded-control border border-accent bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-ink" href="/crm/home">
              Open Workspace
            </a>
          </section>
        </main>
      </div>
    );
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <main className="mx-auto max-w-xl px-5 py-10">
        <section className="rounded-panel border border-line bg-surface p-6 sm:p-8">
          <p className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-faint">
            Workspace invitation
          </p>
          <h1>Join {preview.workspaceName}?</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-ink-muted">
            You were invited as{" "}
            <b>{preview.role === "admin" ? "Admin" : "Member"}</b>. Accepting
            activates a Membership and uses one available active seat.
          </p>
          <div className="grid gap-px overflow-hidden rounded-control border border-line bg-line [&_p]:grid [&_p]:grid-cols-2 [&_p]:gap-4 [&_p]:bg-surface-muted [&_p]:p-3 [&_span]:text-ink-muted">
            <p>
              <span>Workspace</span>
              <b>{preview.workspaceName}</b>
            </p>
            <p>
              <span>Invited Role</span>
              <b>{preview.role === "admin" ? "Admin" : "Member"}</b>
            </p>
            <p>
              <span>Expires</span>
              <b>
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                }).format(new Date(preview.expiresAt))}
              </b>
            </p>
          </div>
          {error && (
            <div className="rounded-control border border-danger bg-danger-soft p-3 text-sm text-danger" role="alert">
              {error}
            </div>
          )}
          {authenticated ? (
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-accent bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-on-accent hover:bg-accent-ink disabled:opacity-45"
              onClick={() => void accept()}
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? "Joining Workspace…" : "Accept invitation"}
            </button>
          ) : (
            <>
              <p className="text-xs leading-5 text-ink-faint">
                Sign in or create an account using the verified email address
                that received this invitation. The invitation token stays in a
                short-lived, server-owned cookie and is not added to the return
                URL.
              </p>
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-control border border-accent bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-ink"
                href="/login?next=/workspace/invitations/accept"
              >
                Sign in to continue
              </Link>
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-control border border-control bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-muted"
                href="/register?next=/workspace/invitations/accept"
              >
                Create account to continue
              </Link>
            </>
          )}
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-control bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-surface-muted disabled:opacity-45"
            onClick={() => void leave()}
            disabled={busy}
          >
            Not now
          </button>
          <p className="text-xs leading-5 text-ink-faint">
            Not now does not revoke or decline the invitation on the server.
          </p>
        </section>
      </main>
    </div>
  );
}
