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
  return <details className="ds-action-menu" ref={details} onKeyDown={close}><summary role="button" aria-label={label}><span aria-hidden="true">•••</span></summary><div className="ds-action-menu__panel">{children}</div></details>;
}
