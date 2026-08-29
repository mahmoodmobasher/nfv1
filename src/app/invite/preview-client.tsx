"use client";

import { FormEvent, useState } from "react";
import { Alert } from "../onboarding/components";
import { plans, type PlanKey, validEmail } from "../onboarding/logic";
import { Button } from "@/frontend/design-system";

type Role = "Member" | "Admin";
type PreviewInvite = {
  email: string;
  role: Role;
  status: "pending" | "shown-sent" | "shown-failed";
};

export function InvitationPreview({
  plan,
}: {
  plan: PlanKey;
  canOpenOperationalInvitations: boolean;
}) {
  const item = plans[plan];
  const [input, setInput] = useState(""),
    [defaultRole, setDefaultRole] = useState<Role>("Member"),
    [invites, setInvites] = useState<PreviewInvite[]>([]),
    [error, setError] = useState(""),
    [state, setState] = useState<"idle" | "success" | "partial" | "failed">(
      "idle",
    );
  function addEmails(value: string) {
    const entries = value
        .split(/[\s,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
      invalid = entries.find((email) => !validEmail(email)),
      duplicate = entries.find((email) =>
        invites.some((invite) => invite.email === email),
      );
    if (invalid) return setError("Enter a valid work email address.");
    if (duplicate)
      return setError("This address is already present in this preview.");
    if (entries.length) {
      setInvites((current) => [
        ...current,
        ...entries.map((email) => ({
          email,
          role: defaultRole,
          status: "pending" as const,
        })),
      ]);
      setError("");
      setInput("");
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (input.trim()) return addEmails(input);
    if (!invites.length)
      return setError("Add at least one work email to preview the result.");
    setState("success");
    setInvites((current) =>
      current.map((invite) => ({ ...invite, status: "shown-sent" })),
    );
  }
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <main className="mx-auto max-w-xl px-5 py-10">
        <section className="rounded-panel border border-line bg-surface p-6 sm:p-8">
          <p className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-faint">
            Non-persistent demonstration
          </p>
          <h1>Preview team invitations</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-ink-muted">
            Try the invitation form and its recovery states without contacting
            anyone or changing Workspace access.
          </p>
          <Alert>
            <b>Preview only.</b> Nothing on this page sends email, reserves
            seats, creates Memberships, assigns Roles, or writes Audit events.
          </Alert>
          <p className="text-xs leading-5 text-ink-faint">
            <b>{item.name}</b> capacity is server-authoritative. Pending preview
            entries do not reserve a real seat.
          </p>
          {state === "success" && (
            <Alert kind="success">
              This preview did not send email or create Memberships.
            </Alert>
          )}
          {error && <Alert kind="error">{error}</Alert>}
          <form onSubmit={submit} noValidate>
            <label
              className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink"
              htmlFor="invite-email"
            >
              <span>
                Work email<em> Required</em>
              </span>
              <span>
                <input
                  id="invite-email"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="alex@example.com"
                  type="email"
                  autoComplete="email"
                />
              </span>
            </label>
            <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink">
              <span>Preview role</span>
              <select
                value={defaultRole}
                onChange={(event) => setDefaultRole(event.target.value as Role)}
              >
                <option>Member</option>
                <option>Admin</option>
              </select>
            </label>
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-control border border-control bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-muted"
              onClick={() => addEmails(input)}
            >
              Add preview entry
            </button>
            <Button variant="primary" className="disabled:opacity-45">
              Preview invitation result
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
}
