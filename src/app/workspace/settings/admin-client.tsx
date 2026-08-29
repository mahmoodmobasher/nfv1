"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { securePost } from "../../onboarding/api";
import {
  ActionLink,
  Button,
  EmptyState,
  FeedbackState,
  Panel,
  StatusBadge,
} from "@/frontend/design-system";
type Role = "owner" | "admin" | "member";
type Team = {
  id: string;
  name: string;
  status: "active" | "archived";
  version: number;
  member_count?: number;
};
type TeamSummary = { id: string; name: string };
type Person = {
  id: string;
  display_name: string;
  email: string;
  role: Role;
  status: string;
  version: number;
  teams: TeamSummary[];
  capabilities: {
    roleOptions: Array<"admin" | "member">;
    canManageLifecycle: boolean;
  };
};
type Invitation = {
  id: string;
  email: string;
  role: "admin" | "member";
  status: string;
  version: number;
  expires_at?: string;
  expiresAt?: string;
};
type Envelope<T> = { data?: T; error?: { code?: string } };
async function mutate<T>(
  path: string,
  method: "POST" | "PATCH" | "PUT",
  body: unknown,
) {
  const csrf = await fetch("/api/auth/csrf", { cache: "no-store" }),
    { token } = (await csrf.json()) as { token: string },
    response = await fetch(path, {
      method,
      headers: {
        "content-type": "application/json",
        "x-csrf-token": token,
        "idempotency-key": crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    });
  return { response, data: (await response.json()) as Envelope<T> };
}
function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onClose,
  trigger,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  trigger: HTMLElement | null;
}) {
  const ref = useRef<HTMLDivElement>(null),
    cancel = useRef<HTMLButtonElement>(null),
    closeRef = useRef(onClose),
    triggerRef = useRef(trigger);
  useEffect(() => {
    closeRef.current = onClose;
    triggerRef.current = trigger;
  }, [onClose, trigger]);
  useEffect(() => {
    cancel.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key !== "Tab") return;
      const nodes = ref.current?.querySelectorAll<HTMLElement>("button");
      if (!nodes?.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      triggerRef.current?.focus();
    };
  }, []);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
      role="presentation"
    >
      <div
        ref={ref}
        className="grid w-full max-w-md gap-4 rounded-panel border border-line bg-surface p-5 text-ink shadow-[0_4px_16px_rgb(0_0_0/.25)]"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
      >
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-body">{body}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            ref={cancel}
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-control bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-surface-muted disabled:opacity-45"
            onClick={onClose}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-danger bg-danger px-3.5 py-2 text-[12.5px] font-semibold text-surface disabled:opacity-45"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
type MembershipAction = "suspend" | "restore" | "remove";
const membershipCopy: Record<
  MembershipAction,
  {
    title: (name: string) => string;
    body: string;
    confirm: string;
    busy: string;
    success: (name: string) => string;
    status: "active" | "suspended" | "removed";
  }
> = {
  suspend: {
    title: (name) => `Suspend ${name}?`,
    body: "They will lose access immediately. You can restore access later.",
    confirm: "Suspend member",
    busy: "Suspending member…",
    success: (name) => `${name} was suspended.`,
    status: "suspended",
  },
  restore: {
    title: (name) => `Restore ${name}’s access?`,
    body: "They will be able to use this workspace again with their current role.",
    confirm: "Restore access",
    busy: "Restoring access…",
    success: (name) => `${name}’s access was restored.`,
    status: "active",
  },
  remove: {
    title: (name) => `Remove ${name} from this workspace?`,
    body: "They will lose access to this workspace. Their account is not deleted.",
    confirm: "Remove from workspace",
    busy: "Removing member…",
    success: (name) => `${name} was removed from the workspace.`,
    status: "removed",
  },
};
export function PeopleClient({
  workspaceId,
  people,
}: {
  workspaceId: string;
  people: Person[];
}) {
  const [rows, setRows] = useState(people),
    [message, setMessage] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [role, setRole] = useState("all"),
    [busyId, setBusyId] = useState<string | null>(null),
    [conflictId, setConflictId] = useState<string | null>(null),
    [confirm, setConfirm] = useState<{
      action: MembershipAction;
      row: Person;
      trigger: HTMLElement;
    } | null>(null);
  useEffect(() => setRows(people), [people]);
  const visible = rows.filter(
    (row) =>
      (!query ||
        `${row.display_name} ${row.email}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (status === "all" || row.status === status) &&
      (role === "all" || row.role === role),
  );
  async function change(row: Person, roleCode: string) {
    if (
      (roleCode !== "member" && roleCode !== "admin") ||
      !row.capabilities.roleOptions.includes(roleCode)
    )
      return;
    setBusyId(row.id);
    setConflictId(null);
    setMessage("Saving roles…");
    const { response, data } = await mutate<{
      role: Role;
      version: number;
      capabilities: Person["capabilities"];
    }>(`/api/workspaces/${workspaceId}/memberships/${row.id}`, "PATCH", {
      roleCode,
      expectedVersion: row.version,
    });
    setBusyId(null);
    if (response.status === 409) {
      setConflictId(row.id);
      setMessage(
        "This person’s role changed while you were editing. Reload the latest values.",
      );
      return;
    }
    if (!response.ok || !data.data)
      return setMessage(
        "You don’t have permission to change this person’s role.",
      );
    setRows((current) =>
      current.map((item) =>
        item.id === row.id
          ? {
              ...item,
              role: data.data!.role,
              version: data.data!.version,
              capabilities: data.data!.capabilities,
            }
          : item,
      ),
    );
    setMessage(`${row.display_name}’s role changed to ${data.data.role}.`);
  }
  function canManage(row: Person) {
    return row.capabilities.canManageLifecycle;
  }
  async function reload(row: Person) {
    setMessage("Loading the latest membership…");
    const response = await fetch(
        `/api/workspaces/${workspaceId}/people?limit=100`,
        { cache: "no-store" },
      ),
      payload = (await response.json()) as Envelope<{ items: Person[] }>;
    if (!response.ok || !payload.data)
      return setMessage("We couldn’t load the latest membership. Try again.");
    const latest = payload.data.items.find((item) => item.id === row.id);
    if (!latest)
      return setRows((current) => current.filter((item) => item.id !== row.id));
    setRows((current) =>
      current.map((item) =>
        item.id === row.id ? { ...item, ...latest, teams: item.teams } : item,
      ),
    );
    setConflictId(null);
    setMessage("Latest values loaded.");
    setTimeout(() => document.getElementById(`person-${row.id}`)?.focus());
  }
  async function lifecycle(action: MembershipAction, row: Person) {
    const copy = membershipCopy[action];
    setBusyId(row.id);
    setConflictId(null);
    setMessage(copy.busy);
    const { response, data } = await mutate<{
      role: Role;
      status: string;
      version: number;
      capabilities: Person["capabilities"];
    }>(`/api/workspaces/${workspaceId}/memberships/${row.id}`, "PATCH", {
      status: copy.status,
      expectedVersion: row.version,
    });
    setBusyId(null);
    if (response.status === 409) {
      setConflictId(row.id);
      setMessage(
        "This membership changed while you were viewing it. Reload the latest values before continuing.",
      );
      return;
    }
    if (!response.ok || !data.data) {
      setMessage(
        data.error?.code === "seat_limit_reached"
          ? "There are no available seats to restore this member."
          : "We couldn’t update this person. No changes were saved. Try again.",
      );
      return;
    }
    setRows((current) =>
      current.map((item) =>
        item.id === row.id
          ? {
              ...item,
              status: data.data!.status,
              role: data.data!.role,
              version: data.data!.version,
              capabilities: data.data!.capabilities,
            }
          : item,
      ),
    );
    setMessage(copy.success(row.display_name));
  }
  return (
    <>
      <div className="flex flex-wrap items-end gap-3 rounded-panel border border-line bg-surface p-4">
        <ActionLink variant="primary" href="/workspace/settings/invite">
          Invite your team
        </ActionLink>
        <label>
          Search people
          <input
            type="search"
            placeholder="Search by name or email"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="removed">Removed</option>
          </select>
        </label>
        <label>
          Role
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="all">All</option>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="member">Member</option>
          </select>
        </label>
      </div>
      <p role="status" aria-live="polite">
        {visible.length} {visible.length === 1 ? "person" : "people"} shown.
      </p>
      {message && (
        <p
          className="rounded-card border border-accent/30 bg-accent-soft p-3 text-xs text-accent-ink"
          role="status"
          tabIndex={-1}
        >
          {message}
        </p>
      )}
      <div className="w-full overflow-x-auto rounded-panel border border-line bg-surface">
        <table className="w-full min-w-[760px] border-collapse text-left text-xs [&_th]:border-b [&_th]:border-line [&_th]:bg-surface-muted [&_th]:px-4 [&_th]:py-2.5 [&_td]:border-b [&_td]:border-line-soft [&_td]:px-4 [&_td]:py-3">
          <caption>People and roles in this workspace</caption>
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Status</th>
              <th scope="col">Role</th>
              <th scope="col">Teams</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const manageable = canManage(row),
                busy = busyId === row.id;
              return (
                <tr key={row.id}>
                  <td>
                    <b id={`person-${row.id}`} tabIndex={-1}>
                      {row.display_name}
                    </b>
                    <span className="break-all">{row.email}</span>
                  </td>
                  <td>{row.status}</td>
                  <td>
                    {row.role === "owner" ? (
                      <>
                        <b>Owner</b>
                        <small id={`role-help-${row.id}`}>
                          You can’t remove or downgrade a Workspace Owner.
                          Transfer ownership first.
                        </small>
                      </>
                    ) : row.capabilities.roleOptions.length > 1 ? (
                      <label>
                        Role for {row.display_name}
                        <select
                          value={row.role}
                          disabled={busy}
                          aria-describedby={`role-help-${row.id}`}
                          onChange={(event) =>
                            void change(row, event.target.value)
                          }
                        >
                          {row.capabilities.roleOptions.map((option) => (
                            <option key={option} value={option}>
                              {option === "admin" ? "Admin" : "Member"}
                            </option>
                          ))}
                        </select>
                        <small id={`role-help-${row.id}`}>
                          {row.role === "admin"
                            ? "Admins can manage members and teams."
                            : "Members use workspace features assigned to them."}
                        </small>
                      </label>
                    ) : (
                      <>
                        <b>{row.role}</b>
                        <small>
                          {row.status !== "active"
                            ? "Role changes are unavailable until this membership is active."
                            : "Your current authority does not permit another role assignment."}
                        </small>
                      </>
                    )}
                  </td>
                  <td>
                    {row.teams.map((team) => team.name).join(", ") || "No team"}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {row.status === "active" && (
                        <>
                          <Button
                            type="button"
                            variant="secondary"
                            className="disabled:opacity-45"
                            disabled={!manageable || busy}
                            onClick={(event) =>
                              setConfirm({
                                action: "suspend",
                                row,
                                trigger: event.currentTarget,
                              })
                            }
                          >
                            Suspend
                          </Button>
                          <button
                            type="button"
                            className="inline-flex min-h-11 items-center justify-center rounded-control border border-danger bg-danger px-3.5 py-2 text-[12.5px] font-semibold text-surface disabled:opacity-45"
                            disabled={!manageable || busy}
                            onClick={(event) =>
                              setConfirm({
                                action: "remove",
                                row,
                                trigger: event.currentTarget,
                              })
                            }
                          >
                            Remove
                          </button>
                        </>
                      )}
                      {row.status === "suspended" && (
                        <>
                          <Button
                            type="button"
                            variant="primary"
                            className="disabled:opacity-45"
                            disabled={!manageable || busy}
                            onClick={(event) =>
                              setConfirm({
                                action: "restore",
                                row,
                                trigger: event.currentTarget,
                              })
                            }
                          >
                            Restore access
                          </Button>
                          <button
                            type="button"
                            className="inline-flex min-h-11 items-center justify-center rounded-control border border-danger bg-danger px-3.5 py-2 text-[12.5px] font-semibold text-surface disabled:opacity-45"
                            disabled={!manageable || busy}
                            onClick={(event) =>
                              setConfirm({
                                action: "remove",
                                row,
                                trigger: event.currentTarget,
                              })
                            }
                          >
                            Remove
                          </button>
                        </>
                      )}
                      {row.status === "removed" && (
                        <small>
                          Invite this person again to restore access.
                        </small>
                      )}
                      {conflictId === row.id && (
                        <Button
                          type="button"
                          variant="secondary"
                          className="disabled:opacity-45"
                          onClick={() => void reload(row)}
                        >
                          Reload latest
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {confirm && (
        <ConfirmDialog
          title={membershipCopy[confirm.action].title(confirm.row.display_name)}
          body={membershipCopy[confirm.action].body}
          confirmLabel={membershipCopy[confirm.action].confirm}
          trigger={confirm.trigger}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            const choice = confirm;
            setConfirm(null);
            void lifecycle(choice.action, choice.row);
          }}
        />
      )}
    </>
  );
}
type InviteDraft = {
  id: string;
  email: string;
  role: "member" | "admin";
  teamIds: string[];
  state: "ready" | "sending" | "sent" | "error";
  error?: string;
};
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function InviteClient({
  workspaceId,
  teams,
  seatRemaining,
}: {
  workspaceId: string;
  teams: Team[];
  seatRemaining: number;
}) {
  const [entry, setEntry] = useState(""),
    [defaultRole, setDefaultRole] = useState<"member" | "admin">("member"),
    [rows, setRows] = useState<InviteDraft[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  function add(raw = entry) {
    const values = raw
        .split(/[\s,;]+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
      invalid = values.find((value) => !emailPattern.test(value));
    if (invalid) return setMessage("Enter a valid work email address.");
    setRows((current) => {
      const known = new Set(current.map((row) => row.email));
      return [
        ...current,
        ...values
          .filter((email) => !known.has(email))
          .map((email) => ({
            id: crypto.randomUUID(),
            email,
            role: defaultRole,
            teamIds: [],
            state: "ready" as const,
          })),
      ];
    });
    setEntry("");
    setMessage("");
  }
  function patch(id: string, value: Partial<InviteDraft>) {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? { ...row, ...value, state: value.state ?? "ready" }
          : row,
      ),
    );
  }
  async function sendRow(row: InviteDraft) {
    patch(row.id, { state: "sending", error: undefined });
    const { response, data } = await mutate<Invitation>(
      `/api/workspaces/${workspaceId}/invitations`,
      "POST",
      { email: row.email, roleCode: row.role, teamIds: row.teamIds },
    );
    if (response.ok) {
      patch(row.id, { state: "sent" });
      return true;
    }
    const error =
      data.error?.code === "membership_exists"
        ? "This person already belongs to this workspace or has a pending invitation."
        : data.error?.code === "rate_limited"
          ? "Too many attempts. Try again shortly."
          : "Delivery needs attention. Your entry is still here.";
    patch(row.id, { state: "error", error });
    return false;
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    let pending = rows.filter((row) => row.state !== "sent");
    if (entry.trim() && emailPattern.test(entry.trim())) {
      const draft: InviteDraft = {
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
    if (!pending.length)
      return setMessage("Add at least one work email to send an invitation.");
    setBusy(true);
    setMessage("Sending invitations…");
    const results = await Promise.all(pending.map(sendRow));
    setBusy(false);
    const sent = results.filter(Boolean).length;
    setMessage(
      sent === results.length
        ? `Invitations sent. We sent ${sent} invitation${sent === 1 ? "" : "s"}. They expire after 7 days.`
        : "Some invitations were sent; others need attention.",
    );
  }
  return (
    <form onSubmit={submit} noValidate>
      <p className="text-xs leading-5 text-ink-faint">
        Your plan has {seatRemaining} invitation seats remaining. Pending
        invitations don’t use a seat.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink">
          <span>Work email</span>
          <input
            value={entry}
            onChange={(event) => setEntry(event.target.value)}
            onPaste={(event) => {
              if (/[\s,;]/.test(event.clipboardData.getData("text"))) {
                event.preventDefault();
                add(event.clipboardData.getData("text"));
              }
            }}
            onKeyDown={(event) => {
              if (["Enter", ",", ";", " "].includes(event.key)) {
                event.preventDefault();
                add();
              }
            }}
            type="email"
            autoComplete="email"
            aria-describedby="invite-help"
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
      <p id="invite-help" className="text-xs leading-5 text-ink-faint">
        Separate addresses with Enter, comma, semicolon, or space.
      </p>
      <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink">
        <span>Default role</span>
        <select
          value={defaultRole}
          onChange={(event) =>
            setDefaultRole(event.target.value === "admin" ? "admin" : "member")
          }
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      {rows.length > 0 && (
        <div className="grid gap-3" aria-label="Invitation entries">
          {rows.map((row) => (
            <article key={row.id}>
              <div>
                <b className="break-all">{row.email}</b>
                <span>
                  {row.state === "sent"
                    ? "Sent"
                    : row.state === "error"
                      ? "Needs attention"
                      : "Ready"}
                </span>
                {row.error && (
                  <small className="font-semibold text-danger">
                    {row.error}
                  </small>
                )}
              </div>
              <label>
                Role
                <select
                  value={row.role}
                  disabled={row.state === "sent"}
                  onChange={(event) =>
                    patch(row.id, {
                      role: event.target.value === "admin" ? "admin" : "member",
                    })
                  }
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              {teams.length > 0 && (
                <fieldset disabled={row.state === "sent"}>
                  <legend>Teams for {row.email}</legend>
                  {teams
                    .filter((team) => team.status === "active")
                    .map((team) => (
                      <label
                        className="flex min-h-11 items-center gap-2 text-xs text-ink-muted [&_input]:size-4 [&_input]:accent-accent"
                        key={team.id}
                      >
                        <input
                          type="checkbox"
                          checked={row.teamIds.includes(team.id)}
                          onChange={(event) =>
                            patch(row.id, {
                              teamIds: event.target.checked
                                ? [...row.teamIds, team.id]
                                : row.teamIds.filter((id) => id !== team.id),
                            })
                          }
                        />
                        {team.name}
                      </label>
                    ))}
                </fieldset>
              )}
              <div className="flex flex-wrap gap-2">
                {row.state === "error" && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="disabled:opacity-45"
                    onClick={() => void sendRow(row)}
                  >
                    Retry {row.email}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  className="disabled:opacity-45"
                  aria-label={`Remove ${row.email}`}
                  onClick={() =>
                    setRows((current) =>
                      current.filter((item) => item.id !== row.id),
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {message && (
        <p
          className="rounded-card border border-accent/30 bg-accent-soft p-3 text-xs text-accent-ink"
          role="status"
        >
          {message}
        </p>
      )}
      <Button
        variant="primary"
        className="disabled:opacity-45"
        disabled={busy}
      >
        {busy ? "Sending invitations…" : "Send invitations"}
      </Button>
      <p className="text-xs leading-5 text-ink-faint">
        In this local environment, delivery can be inspected in Mailpit.
      </p>
    </form>
  );
}
export function InvitationsClient({
  workspaceId,
  initial,
}: {
  workspaceId: string;
  initial: Invitation[];
}) {
  const [rows, setRows] = useState(initial),
    [message, setMessage] = useState(""),
    [filter, setFilter] = useState("pending"),
    [conflict, setConflict] = useState(false),
    [confirmRow, setConfirmRow] = useState<Invitation | null>(null),
    [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const visible = rows.filter((row) =>
    filter === "sent"
      ? ["pending", "sent"].includes(row.status)
      : row.status === filter,
  );
  async function reload() {
    const response = await fetch(
        `/api/workspaces/${workspaceId}/invitations?limit=100`,
        { cache: "no-store" },
      ),
      payload = (await response.json()) as Envelope<{ items: Invitation[] }>;
    if (response.ok && payload.data) {
      setRows(payload.data.items);
      setConflict(false);
      setMessage("Latest values loaded.");
    } else setMessage("We couldn’t load the latest invitations.");
  }
  async function action(row: Invitation, kind: "resend" | "revoke") {
    setMessage(
      kind === "resend" ? "Resending invitation…" : "Revoking invitation…",
    );
    const { response, data } = await mutate<Invitation>(
      `/api/workspaces/${workspaceId}/invitations/${row.id}/${kind}`,
      "POST",
      { expectedVersion: row.version },
    );
    if (!response.ok || !data.data) {
      if (response.status === 409) {
        setConflict(true);
        setMessage(
          "This changed while you were editing. Reload the latest values.",
        );
      } else setMessage("We couldn’t update this invitation. Try again.");
      return;
    }
    setRows((current) =>
      current.map((item) =>
        item.id === row.id ? { ...item, ...data.data } : item,
      ),
    );
    setMessage(
      kind === "resend"
        ? "Invitation resent. It expires after 7 days."
        : "Invitation revoked.",
    );
  }
  return (
    <>
      {message && (
        <p
          className="rounded-card border border-accent/30 bg-accent-soft p-3 text-xs text-accent-ink"
          role="status"
          tabIndex={-1}
        >
          {message}
        </p>
      )}
      <div
        className="flex flex-wrap gap-1 rounded-control border border-line bg-surface p-1 [&_[aria-selected=true]]:bg-accent-soft [&_[aria-selected=true]]:text-accent-ink"
        role="tablist"
        aria-label="Invitation status"
      >
        {["pending", "sent", "expired", "revoked"].map((value) => (
          <Button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            onClick={() => setFilter(value)}
          >
            {value[0].toUpperCase() + value.slice(1)}
          </Button>
        ))}
      </div>
      {conflict && (
        <FeedbackState
          tone="conflict"
          title="Invitation data changed"
          action={
            <Button variant="primary" onClick={() => void reload()}>
              Reload latest
            </Button>
          }
        >
          <p>Reload the latest invitations before retrying.</p>
        </FeedbackState>
      )}
      {visible.length === 0 ? (
        <EmptyState title={`No ${filter} invitations.`}>
          <p>Invitations in this state will appear here.</p>
        </EmptyState>
      ) : (
        <div
          className="grid gap-3"
          role="list"
          aria-label={`${filter} invitations`}
        >
          {visible.map((row) => (
            <Panel key={row.id} className="p-4">
              <div className="grid min-w-0 gap-1 text-xs text-ink-muted">
                <b className="break-all text-ink">{row.email}</b>
                <StatusBadge
                  tone={
                    row.status === "pending" || row.status === "sent"
                      ? "accent"
                      : row.status === "expired"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {row.status}
                </StatusBadge>
                <span>{row.role}</span>
                {(row.expires_at || row.expiresAt) && (
                  <small>
                    Expires{" "}
                    {new Date(
                      row.expires_at ?? row.expiresAt ?? "",
                    ).toLocaleDateString()}
                  </small>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {["pending", "sent"].includes(row.status) && (
                  <>
                    <Button onClick={() => void action(row, "resend")}>
                      Resend
                    </Button>
                    <Button
                      variant="danger"
                      onClick={(event) => {
                        setTrigger(event.currentTarget);
                        setConfirmRow(row);
                      }}
                    >
                      Revoke
                    </Button>
                  </>
                )}
                {row.status === "expired" && (
                  <ActionLink
                    variant="primary"
                    href={`/workspace/settings/invite?email=${encodeURIComponent(row.email)}`}
                  >
                    Send new invitation
                  </ActionLink>
                )}
                {row.status === "revoked" && (
                  <ActionLink
                    variant="primary"
                    href={`/workspace/settings/invite?email=${encodeURIComponent(row.email)}`}
                  >
                    Invite again
                  </ActionLink>
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}
      {confirmRow && (
        <ConfirmDialog
          title="Revoke this invitation?"
          body="The invitation link will stop working. The person can’t use it to join this workspace."
          cancelLabel="Keep invitation"
          confirmLabel="Revoke invitation"
          trigger={trigger}
          onClose={() => setConfirmRow(null)}
          onConfirm={() => {
            const row = confirmRow;
            setConfirmRow(null);
            void action(row, "revoke");
          }}
        />
      )}
    </>
  );
}
export function TeamsClient({
  workspaceId,
  initial,
  people,
}: {
  workspaceId: string;
  initial: Team[];
  people: Person[];
}) {
  const [teams, setTeams] = useState(initial),
    [members, setMembers] = useState(people),
    [dirtyByTeam, setDirtyByTeam] = useState<Record<string, string[]>>({}),
    [name, setName] = useState(""),
    [message, setMessage] = useState(""),
    [conflictTeam, setConflictTeam] = useState<string | null>(null),
    [confirm, setConfirm] = useState<{
      kind: "remove" | "delete";
      team: Team;
      person?: Person;
      trigger: HTMLElement;
    } | null>(null);
  async function create(event: FormEvent) {
    event.preventDefault();
    setMessage("Creating team…");
    const { response, data } = await mutate<Team>(
      `/api/workspaces/${workspaceId}/teams`,
      "POST",
      { name },
    );
    if (!response.ok || !data.data)
      return setMessage(
        data.error?.code === "team_exists"
          ? "A team with this name already exists in this workspace."
          : "We couldn’t create this team. Try again.",
      );
    setTeams((current) => [...current, data.data!]);
    setName("");
    setMessage("Team created.");
  }
  async function archive(team: Team) {
    const { response, data } = await mutate<Team>(
      `/api/workspaces/${workspaceId}/teams/${team.id}`,
      "PATCH",
      { status: "archived", expectedVersion: team.version },
    );
    if (response.ok && data.data) {
      setTeams((current) =>
        current.map((item) => (item.id === team.id ? data.data! : item)),
      );
      setMessage("Team deleted. People remain in the workspace.");
    } else {
      setConflictTeam(team.id);
      setMessage(
        "This changed while you were editing. Your selections are still here.",
      );
    }
  }
  function applyToggle(team: Team, person: Person) {
    const assigned = person.teams.some((item) => item.id === team.id);
    setMembers((current) =>
      current.map((item) =>
        item.id === person.id
          ? {
              ...item,
              teams: assigned
                ? item.teams.filter((value) => value.id !== team.id)
                : [...item.teams, { id: team.id, name: team.name }],
            }
          : item,
      ),
    );
    setDirtyByTeam((current) => ({
      ...current,
      [team.id]: [...new Set([...(current[team.id] ?? []), person.id])],
    }));
    setMessage(
      assigned
        ? `${person.display_name} removed from ${team.name}. Save members to apply this change.`
        : `${person.display_name} added to ${team.name}. Save members to apply this change.`,
    );
  }
  function toggle(team: Team, person: Person, trigger: HTMLElement) {
    if (person.teams.some((item) => item.id === team.id)) {
      setConfirm({ kind: "remove", team, person, trigger });
      return;
    }
    applyToggle(team, person);
  }
  async function save(team: Team) {
    setMessage("Saving members…");
    const dirty = new Set(dirtyByTeam[team.id] ?? []);
    for (const person of members.filter(
      (value) => value.role !== "owner" && dirty.has(value.id),
    )) {
      const result = await mutate<{ membershipVersion: number }>(
        `/api/workspaces/${workspaceId}/memberships/${person.id}/teams`,
        "PUT",
        {
          teamIds: person.teams.map((item) => item.id),
          expectedMembershipVersion: person.version,
        },
      );
      if (result.response.status === 409) {
        setConflictTeam(team.id);
        setMessage(
          "This changed while you were editing. Your selections are still here.",
        );
        return;
      }
      if (!result.response.ok || !result.data.data)
        return setMessage(
          "We couldn’t update team members. Your selections are still here.",
        );
      setMembers((current) =>
        current.map((item) =>
          item.id === person.id
            ? { ...item, version: result.data.data!.membershipVersion }
            : item,
        ),
      );
      setDirtyByTeam((current) => ({
        ...current,
        [team.id]: (current[team.id] ?? []).filter((id) => id !== person.id),
      }));
    }
    setConflictTeam(null);
    setMessage("Team members updated.");
  }
  async function reload(teamId: string) {
    const [teamResponse, peopleResponse] = await Promise.all([
        fetch(`/api/workspaces/${workspaceId}/teams?limit=100`, {
          cache: "no-store",
        }),
        fetch(`/api/workspaces/${workspaceId}/people?limit=100`, {
          cache: "no-store",
        }),
      ]),
      teamPayload = (await teamResponse.json()) as Envelope<{ items: Team[] }>,
      peoplePayload = (await peopleResponse.json()) as Envelope<{
        items: Person[];
      }>;
    if (
      !teamResponse.ok ||
      !peopleResponse.ok ||
      !teamPayload.data ||
      !peoplePayload.data
    )
      return setMessage(
        "We couldn’t load the latest values. Your selections are still here.",
      );
    setTeams(teamPayload.data.items);
    setMembers((current) =>
      current.map((draft) => ({
        ...draft,
        version:
          peoplePayload.data!.items.find((item) => item.id === draft.id)
            ?.version ?? draft.version,
      })),
    );
    setConflictTeam(null);
    setMessage("Latest values loaded.");
    setTimeout(() => document.getElementById(`team-${teamId}`)?.focus());
  }
  return (
    <>
      <form
        className="flex flex-wrap items-end gap-3 rounded-panel border border-line bg-surface p-4"
        onSubmit={create}
      >
        <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink">
          <span>Team name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={100}
          />
        </label>
        <Button variant="primary">Create team</Button>
      </form>
      {message && (
        <p
          className="rounded-card border border-accent/30 bg-accent-soft p-3 text-xs text-accent-ink"
          role="status"
          tabIndex={-1}
        >
          {message}
        </p>
      )}
      {teams.length === 0 ? (
        <EmptyState title="No teams yet">
          <p>
            Teams are optional. Create one when you need team-based routing,
            visibility, or collaboration.
          </p>
        </EmptyState>
      ) : (
        <div className="grid gap-3" role="list" aria-label="Workspace teams">
          {teams.map((team) => (
            <Panel
              key={team.id}
              className="overflow-hidden"
              title={
                <span id={`team-${team.id}`} tabIndex={-1}>
                  {team.name}
                </span>
              }
              description={
                <span>
                  {
                    members.filter((person) =>
                      person.teams.some((item) => item.id === team.id),
                    ).length
                  }{" "}
                  members
                </span>
              }
              action={
                <StatusBadge
                  tone={team.status === "active" ? "success" : "neutral"}
                >
                  {team.status}
                </StatusBadge>
              }
            >
              {team.status === "active" && (
                <fieldset>
                  <legend>Members of {team.name}</legend>
                  {members
                    .filter((person) => person.status === "active")
                    .map((person) => (
                      <label
                        className="flex min-h-11 items-center gap-2 text-xs text-ink-muted [&_input]:size-4 [&_input]:accent-accent"
                        key={person.id}
                      >
                        <input
                          type="checkbox"
                          checked={person.teams.some(
                            (item) => item.id === team.id,
                          )}
                          onChange={(event) =>
                            toggle(team, person, event.currentTarget)
                          }
                          disabled={person.role === "owner"}
                        />
                        {person.display_name}
                      </label>
                    ))}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => void save(team)}
                    >
                      Save members
                    </Button>
                    {conflictTeam === team.id && (
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => void reload(team.id)}
                      >
                        Reload latest
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="danger"
                      onClick={(event) =>
                        setConfirm({
                          kind: "delete",
                          team,
                          trigger: event.currentTarget,
                        })
                      }
                    >
                      Delete team
                    </Button>
                  </div>
                </fieldset>
              )}
            </Panel>
          ))}
        </div>
      )}
      {confirm && (
        <ConfirmDialog
          title={
            confirm.kind === "delete"
              ? `Delete ${confirm.team.name}?`
              : `Remove ${confirm.person!.display_name} from ${confirm.team.name}?`
          }
          body={
            confirm.kind === "delete"
              ? "People will remain in the workspace, but team-based routing and visibility rules may change."
              : "They will remain a member of the workspace."
          }
          confirmLabel={
            confirm.kind === "delete" ? "Delete team" : "Remove from team"
          }
          trigger={confirm.trigger}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            const action = confirm;
            setConfirm(null);
            if (action.kind === "delete") void archive(action.team);
            else applyToggle(action.team, action.person!);
          }}
        />
      )}
    </>
  );
}
export function TransferClient({
  workspaceId,
  actor,
  eligible,
  recentConfirmed = false,
}: {
  workspaceId: string;
  actor: Person;
  eligible: Person[];
  recentConfirmed?: boolean;
}) {
  const [ready, setReady] = useState(false),
    [selected, setSelected] = useState(""),
    [password, setPassword] = useState(""),
    [verified, setVerified] = useState(recentConfirmed),
    [message, setMessage] = useState(""),
    [confirm, setConfirm] = useState(false),
    [triggerElement, setTriggerElement] = useState<HTMLElement | null>(null);
  useEffect(() => setReady(true), []);
  async function verify(event: FormEvent) {
    event.preventDefault();
    setMessage("Confirming your identity…");
    const { response } = await securePost("/api/auth/recent/password", {
      password,
    });
    if (response.ok) {
      setVerified(true);
      setMessage("Identity confirmed.");
    } else setMessage("We couldn’t confirm your identity.");
  }
  async function transfer() {
    const successor = eligible.find((row) => row.id === selected);
    if (!successor) return;
    setConfirm(false);
    setMessage("Transferring ownership…");
    const { response } = await mutate(
      `/api/workspaces/${workspaceId}/ownership/transfer`,
      `POST`,
      {
        successorMembershipId: selected,
        actorExpectedVersion: actor.version,
        successorExpectedVersion: successor.version,
      },
    );
    if (response.ok)
      setMessage(
        `${successor.display_name} is now the Workspace Owner. You are an Admin. Your refreshed authorization is active.`,
      );
    else
      setMessage(
        "We couldn’t transfer ownership. No role changes were saved. Try again.",
      );
  }
  const successor = eligible.find((row) => row.id === selected);
  return (
    <>
      {!verified && (
        <>
          <form onSubmit={verify}>
            <p>
              For your security, confirm your identity before transferring
              ownership.
            </p>
            <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink">
              <span>Confirm your password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            <Button variant="primary" className="disabled:opacity-45">
              Verify and continue
            </Button>
          </form>
          <ActionLink
            variant="secondary"
            href={`/api/auth/recent/oidc/start?returnTo=${encodeURIComponent("/workspace/settings/transfer-ownership")}`}
          >
            Confirm with local Google fixture
          </ActionLink>
        </>
      )}
      {verified && (
        <>
          <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-muted [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-control [&_input]:border [&_input]:border-control [&_input]:bg-surface [&_input]:px-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-control [&_select]:border [&_select]:border-control [&_select]:bg-surface [&_select]:px-3 [&_select]:text-ink [&_textarea]:min-h-28 [&_textarea]:w-full [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-control [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink">
            <span>Choose successor</span>
            <select
              value={selected}
              disabled={!ready}
              aria-busy={!ready}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">Select an active member</option>
              {eligible.map((row) => (
                <option value={row.id} key={row.id}>
                  {row.display_name}
                </option>
              ))}
            </select>
          </label>
          <p>
            The new Owner will control billing, workspace settings, people,
            roles, and ownership. You will become an Admin.
          </p>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-danger bg-danger px-3.5 py-2 text-[12.5px] font-semibold text-surface disabled:opacity-45"
            disabled={!ready || !selected}
            onClick={(event) => {
              setTriggerElement(event.currentTarget);
              setConfirm(true);
            }}
          >
            Continue to confirmation
          </button>
          {confirm && successor && (
            <ConfirmDialog
              title={`Transfer ownership to ${successor.display_name}?`}
              body="This person will gain full workspace and billing control. You will become an Admin. This action can’t be undone from this screen."
              confirmLabel="Transfer ownership"
              onClose={() => setConfirm(false)}
              onConfirm={() => void transfer()}
              trigger={triggerElement}
            />
          )}
        </>
      )}
      {message && (
        <p
          className="rounded-card border border-accent/30 bg-accent-soft p-3 text-xs text-accent-ink"
          role="status"
          tabIndex={-1}
        >
          {message}
        </p>
      )}
    </>
  );
}
