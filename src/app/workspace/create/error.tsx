"use client";

export default function WorkspaceSelectionError({ reset }: { reset: () => void }) {
  return <main className="onboarding-narrow"><section className="flow-card"><p className="eyebrow">Workspace setup</p><h1>We couldn’t load your saved plan</h1><p className="lead">Your server-backed onboarding selection has not been replaced by a URL or browser default.</p><button className="primary" onClick={reset}>Try again</button></section></main>;
}
