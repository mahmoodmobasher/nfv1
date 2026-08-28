"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
type Workspace = { id: string; name: string; role: string; current: boolean };
export function WorkspaceControl({
  name,
  role,
  accountAction,
}: {
  name: string;
  role: string;
  accountAction?: ReactNode;
}) {
  const [items, setItems] = useState<Workspace[] | null>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/workspaces/selectable", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (active && payload?.workspaces) setItems(payload.workspaces);
      });
    return () => {
      active = false;
    };
  }, []);
  const content = (
    <>
      <div className="grid min-w-0 gap-0.5">
        <b>{name}</b>
        <span>{role}</span>
      </div>
      {items && items.length > 1 ? (
        <Link href="/workspace/switch">Switch workspace</Link>
      ) : (
        <small>
          {items?.length === 1 ? "Your workspace" : "Current workspace"}
        </small>
      )}
      {accountAction}
    </>
  );
  if (!accountAction)
    return (
      <div className="grid min-w-0 gap-2 text-xs text-ink-muted [&_a]:font-semibold [&_a]:text-accent-ink">
        {content}
      </div>
    );
  return (
    <details
      ref={menu}
      className="relative min-w-0 text-xs text-ink-muted"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !menu.current?.open) return;
        event.preventDefault();
        menu.current.open = false;
        menu.current.querySelector<HTMLElement>("summary")?.focus();
      }}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-control border border-control bg-surface px-3 font-semibold text-ink marker:hidden hover:bg-surface-muted">
        <span>
          <b>{name}</b>
          <small>{role}</small>
        </span>
        <span aria-hidden="true">⌄</span>
      </summary>
      <div className="absolute right-0 z-30 mt-2 grid min-w-56 gap-2 rounded-panel border border-line bg-surface p-3 shadow-[0_4px_16px_rgb(0_0_0/.25)] [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:font-semibold [&_a]:text-accent-ink">
        {content}
      </div>
    </details>
  );
}
