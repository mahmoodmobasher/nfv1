"use client";

import { useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

export function ActionMenu({ label, children }: { label: string; children: ReactNode }) {
  const details = useRef<HTMLDetailsElement>(null);
  const [dismissed, setDismissed] = useState(false);
  function close(event: KeyboardEvent<HTMLDetailsElement>) {
    if (event.key !== "Escape" || !details.current?.open) return;
    if ((event.target as Element).closest("dialog")) {
      requestAnimationFrame(() => {
        if (!details.current?.querySelector("dialog")) {
          if (details.current) details.current.open = false;
          setDismissed(false);
        }
      });
      return;
    }
    event.preventDefault();
    details.current.open = false;
    setDismissed(false);
    const trigger = details.current.querySelector<HTMLElement>("summary");
    requestAnimationFrame(() => trigger?.focus());
  }
  function closeOnAction(event: MouseEvent<HTMLDivElement>) {
    const action = (event.target as Element).closest<HTMLElement>("a,button");
    if (!action || action.matches(":disabled") || !details.current) return;
    if (action.closest("dialog")) {
      requestAnimationFrame(() => {
        if (!details.current?.querySelector("dialog")) {
          if (details.current) details.current.open = false;
          setDismissed(false);
        }
      });
      return;
    }
    if (action.matches("a")) {
      details.current.open = false;
      setDismissed(false);
      return;
    }
    requestAnimationFrame(() => {
      if (details.current?.querySelector("dialog")) setDismissed(true);
      else if (details.current) details.current.open = false;
    });
  }
  return <details className="relative" ref={details} onKeyDown={close} onToggle={() => { if (!details.current?.open) setDismissed(false); }}><summary className="grid size-11 cursor-pointer list-none place-items-center rounded-control border border-line bg-surface text-ink-muted hover:bg-surface-muted" role="button" aria-label={label}><span aria-hidden="true">•••</span></summary><div className={dismissed ? "contents [&>a]:hidden [&>button]:hidden [&>div]:contents [&>div>*:not(dialog)]:hidden" : "absolute right-0 top-full z-30 mt-1 grid min-w-40 gap-1 rounded-card border border-line bg-surface p-1 shadow-lg [&>*]:w-full"} onClick={closeOnAction}>{children}</div></details>;
}
