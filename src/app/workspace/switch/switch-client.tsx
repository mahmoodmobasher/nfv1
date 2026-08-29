"use client";
import { useRef, useState } from "react";
import { securePost } from "../../onboarding/api";
import { Button } from "@/frontend/design-system";
type Workspace = {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member";
  membershipId: string;
  current: boolean;
};
export function SwitchClient({ initial }: { initial: Workspace[] }) {
  const [items, setItems] = useState(initial),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    keys = useRef(new Map<string, string>());
  async function reload(preserveError = false) {
    const response = await fetch("/api/workspaces/selectable", {
        cache: "no-store",
      }),
      payload = await response.json();
    if (response.ok) {
      setItems(payload.workspaces);
      if (!preserveError) setError("");
      setMessage("Latest workspace access loaded.");
    } else setError("We couldn’t reload your workspace access. Try again.");
  }
  async function choose(item: Workspace) {
    if (item.current || busy) return;
    setBusy(item.id);
    setError("");
    setMessage(`Switching to ${item.name}…`);
    const key = keys.current.get(item.id) ?? crypto.randomUUID();
    keys.current.set(item.id, key);
    try {
      const { response } = await securePost(
        "/api/workspaces/switch",
        { workspaceId: item.id },
        { "idempotency-key": key },
      );
      if (!response.ok) {
        if (response.status === 404) {
          setError(
            "Your access to that workspace changed. The latest choices are now loaded.",
          );
          await reload(true);
        } else
          setError(
            "We couldn’t switch workspaces. Your current workspace is unchanged.",
          );
        return;
      }
      keys.current.delete(item.id);
      setMessage(`Switched to ${item.name}. Loading its CRM…`);
      window.location.replace("/crm/home");
    } catch {
      setError(
        "We couldn’t switch workspaces. Your current workspace is unchanged.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <div>
      {message && (
        <p role="status" className="rounded-control border border-line bg-surface-muted p-3 text-sm text-ink-muted">
          {message}
        </p>
      )}
      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-control border border-danger bg-danger-soft p-3 text-sm text-danger">
          <span>{error}</span>{" "}
          <Button
            variant="secondary"
            className="disabled:opacity-45"
            onClick={() => void reload()}
          >
            Reload latest
          </Button>
        </div>
      )}
      <ul
        className="grid gap-3"
        aria-label="Existing Workspace Memberships"
      >
        {items.map((item) => {
          const roleId = `workspace-${item.id}-role`;
          return (
            <li key={item.id} className={`flex flex-wrap items-center justify-between gap-4 rounded-control border p-4 ${item.current ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}>
              <div>
                <b>{item.name}</b>
                <span id={roleId}>
                  <span className="sr-only">Role: </span>
                  <span>{item.role}</span>
                </span>
                {item.current && <strong>Current Workspace</strong>}
              </div>
              {item.current ? (
                <span aria-label="Selected Workspace">Selected</span>
              ) : (
                <Button
                  variant="primary"
                  className="disabled:opacity-45"
                  disabled={!!busy}
                  aria-busy={busy === item.id}
                  aria-describedby={roleId}
                  onClick={() => void choose(item)}
                >
                  {busy === item.id ? "Switching…" : `Switch to ${item.name}`}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
