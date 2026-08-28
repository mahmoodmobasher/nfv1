"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

export function ActionMenu({ label, children }: { label: string; children: ReactNode }) {
  const details = useRef<HTMLDetailsElement>(null);
  function close(event: KeyboardEvent<HTMLDetailsElement>) {
    if (event.key !== "Escape" || !details.current?.open || (event.target as Element).closest("dialog")) return;
    event.preventDefault();
    details.current.open = false;
    const trigger = details.current.querySelector<HTMLElement>("summary");
    requestAnimationFrame(() => trigger?.focus());
  }
  return <details className="relative" ref={details} onKeyDown={close}><summary className="grid size-11 cursor-pointer list-none place-items-center rounded-control border border-line bg-surface text-ink-muted hover:bg-surface-muted" role="button" aria-label={label}><span aria-hidden="true">•••</span></summary><div className="absolute right-0 top-full z-30 mt-1 grid min-w-40 gap-1 rounded-card border border-line bg-surface p-1 shadow-lg [&>*]:w-full">{children}</div></details>;
}
