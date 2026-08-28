"use client";

export default function WorkspaceSelectionError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-xl px-5 py-10"><section className="rounded-panel border border-line bg-surface p-6 sm:p-8"><p className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-faint">Workspace setup</p><h1>We couldn’t load your saved plan</h1><p className="mt-2 max-w-3xl text-[13px] leading-6 text-ink-muted">Your server-backed onboarding selection has not been replaced by a URL or browser default.</p><button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-accent bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-on-accent hover:bg-accent-ink disabled:opacity-45" onClick={reset}>Try again</button></section></main>;
}
