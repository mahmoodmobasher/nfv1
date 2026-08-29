"use client";

import { Button } from "@/frontend/design-system";

export default function WorkspaceSelectionError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-xl px-5 py-10"><section className="rounded-panel border border-line bg-surface p-6 sm:p-8"><p className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-faint">Workspace setup</p><h1>We couldn’t load your saved plan</h1><p className="mt-2 max-w-3xl text-[13px] leading-6 text-ink-muted">Your server-backed onboarding selection has not been replaced by a URL or browser default.</p><Button variant="primary" className="disabled:opacity-45" onClick={reset}>Try again</Button></section></main>;
}
