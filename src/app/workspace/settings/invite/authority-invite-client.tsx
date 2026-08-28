"use client";
import { FormEvent, useState } from "react";
import { Button } from "@/frontend/design-system";
type Role = "member" | "admin";
type Team = { id: string; name: string; status: string };
type Draft = {
  id: string;
  email: string;
  role: Role;
  teamIds: string[];
  state: "ready" | "sending" | "sent" | "error";
  error?: string;
};
const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function deliver(workspaceId: string, row: Draft) {
  const csrf = await fetch("/api/auth/csrf", { cache: "no-store" }),
    { token } = (await csrf.json()) as { token: string },
    response = await fetch(`/api/workspaces/${workspaceId}/invitations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": token,
        "idempotency-key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        email: row.email,
        roleCode: row.role,
        teamIds: row.teamIds,
      }),
    });
  return response;
}
export function AuthorityInviteClient({
  workspaceId,
  teams,
  seatRemaining,
  roleOptions,
}: {
  workspaceId: string;
  teams: Team[];
  seatRemaining: number;
  roleOptions: Role[];
}) {
  const [first] = roleOptions,
    [entry, setEntry] = useState(""),
    [defaultRole, setDefaultRole] = useState<Role>(first ?? "member"),
    [rows, setRows] = useState<Draft[]>([]),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [alert, setAlert] = useState("");
  function patch(id: string, value: Partial<Draft>) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...value } : row)),
    );
  }
  function add(raw = entry) {
    const values = raw
      .split(/[\s,;]+/)
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
    if (values.some((v) => !email.test(v))) {
      setAlert("Enter valid work email addresses.");
      return;
    }
    setRows((current) => [
      ...current,
      ...values
        .filter((value) => !current.some((row) => row.email === value))
        .map((value) => ({
          id: crypto.randomUUID(),
          email: value,
          role: defaultRole,
          teamIds: [],
          state: "ready" as const,
        })),
    ]);
    setEntry("");
    setAlert("");
  }
  async function sendRow(row: Draft) {
    patch(row.id, { state: "sending", error: undefined });
    const response = await deliver(workspaceId, row);
    if (response.ok) {
      patch(row.id, { state: "sent" });
      return true;
    }
    patch(row.id, {
      state: "error",
      error:
        response.status === 404
          ? "Your permissions changed. Reload this page for current invitation roles."
          : "Needs attention. Your entry was preserved.",
    });
    return false;
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!roleOptions.length) {
      setAlert("Your current role cannot send workspace invitations.");
      return;
    }
    let pending = rows.filter((row) => row.state !== "sent");
    if (entry.trim() && email.test(entry.trim())) {
      const draft: Draft = {
        id: crypto.randomUUID(),
        email: entry.trim().toLowerCase(),
        role: defaultRole,
        teamIds: [],
        state: "ready",
      };
      setRows((current) => [...current, draft]);
      setEntry("");
      pending = [...pending, draft];
    }
    if (!pending.length) {
      setAlert("Add at least one work email.");
      return;
    }
    setBusy(true);
    setStatus("Sending invitations…");
    const results = await Promise.all(pending.map(sendRow));
    setBusy(false);
    setStatus(
      results.every(Boolean)
        ? "Invitations sent. They expire after 7 days."
        : "Some invitations were sent; others need attention.",
    );
  }
  if (!roleOptions.length)
    return (
      <p
        className="rounded-card border border-danger/30 bg-danger-soft p-3 text-xs text-danger"
        role="alert"
      >
        Your current role cannot send workspace invitations.
      </p>
    );
  return (
    <form onSubmit={submit} aria-busy={busy}>
      <p>Your plan has {seatRemaining} invitation seats remaining.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink">
          <span>Work email</span>
          <input
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            onPaste={(e) => {
              if (/[\s,;]/.test(e.clipboardData.getData("text"))) {
                e.preventDefault();
                add(e.clipboardData.getData("text"));
              }
            }}
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          className="disabled:opacity-45"
          onClick={() => add()}
        >
          Add
        </Button>
      </div>
      <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink">
        <span>Default role</span>
        <select
          value={defaultRole}
          onChange={(e) => setDefaultRole(e.target.value as Role)}
        >
          {roleOptions.map((role) => (
            <option key={role} value={role}>
              {role === "admin" ? "Admin" : "Member"}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-3" aria-label="Invitation entries">
        {rows.map((row) => (
          <article
            key={row.id}
            aria-busy={row.state === "sending"}
            aria-describedby={`invite-state-${row.id}`}
          >
            <b>{row.email}</b>
            <p
              id={`invite-state-${row.id}`}
              role={row.state === "error" ? "alert" : "status"}
            >
              {row.state === "sending"
                ? "Sending invitation…"
                : row.state === "sent"
                  ? "Sent"
                  : row.state === "error"
                    ? row.error
                    : "Ready"}
            </p>
            <label>
              Role
              <select
                value={row.role}
                disabled={row.state === "sent" || row.state === "sending"}
                onChange={(e) =>
                  patch(row.id, { role: e.target.value as Role })
                }
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role === "admin" ? "Admin" : "Member"}
                  </option>
                ))}
              </select>
            </label>
            {teams
              .filter((t) => t.status === "active")
              .map((team) => (
                <label
                  className="flex min-h-11 items-center gap-2 text-xs text-ink-muted [&_input]:size-4 [&_input]:accent-accent"
                  key={team.id}
                >
                  <input
                    type="checkbox"
                    checked={row.teamIds.includes(team.id)}
                    onChange={(e) =>
                      patch(row.id, {
                        teamIds: e.target.checked
                          ? [...row.teamIds, team.id]
                          : row.teamIds.filter((id) => id !== team.id),
                      })
                    }
                  />
                  {team.name}
                </label>
              ))}
            {row.state === "error" && (
              <button type="button" onClick={() => void sendRow(row)}>
                Retry {row.email}
              </button>
            )}
          </article>
        ))}
      </div>
      {status && <p role="status">{status}</p>}
      {alert && (
        <p
          className="rounded-card border border-danger/30 bg-danger-soft p-3 text-xs text-danger"
          role="alert"
        >
          {alert}
        </p>
      )}
      <Button
        variant="primary"
        className="disabled:opacity-45"
        disabled={busy}
      >
        {busy ? "Sending invitations…" : "Send invitations"}
      </Button>
    </form>
  );
}
