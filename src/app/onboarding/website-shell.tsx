import Link from "next/link";
import type { ReactNode } from "react";

export type WebsiteAction = "login" | "plans" | "help" | "none";

export function WebsiteBrand() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2.5 text-ink no-underline"
      aria-label="NexaFlow home"
    >
      <span className="grid size-9 place-items-center rounded-control bg-accent text-xs font-extrabold text-on-accent">
        NF
      </span>
      <b className="grid text-[15px] leading-tight">
        NexaFlow
        <small className="text-[10px] font-medium uppercase tracking-[.08em] text-ink-faint">
          Sales to delivery CRM
        </small>
      </b>
    </Link>
  );
}

export function WebsiteShell({
  children,
  action = "login",
}: {
  children: ReactNode;
  action?: WebsiteAction;
}) {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-control bg-ink px-3 py-2 text-sm text-surface focus:translate-y-0"
        href="#website-main"
      >
        Skip to main content
      </a>
      <header className="mx-auto flex min-h-[68px] max-w-6xl items-center justify-between gap-4 border-b border-line px-5">
        <WebsiteBrand />
        <div className="text-xs text-ink-muted [&_a]:font-semibold [&_a]:text-accent-ink">
          {action === "login" ? (
            <>
              Already have an account? <Link href="/login">Sign in</Link>
            </>
          ) : action === "plans" ? (
            <Link href="/select-plan">Choose a plan</Link>
          ) : action === "help" ? (
            <a href="mailto:info@nexaflowsystems.com">Need help?</a>
          ) : null}
        </div>
      </header>
      <main id="website-main" tabIndex={-1}>
        {children}
      </main>
      <footer className="flex flex-wrap justify-center gap-5 border-t border-line px-5 py-8 text-xs text-ink-faint">
        <span>Privacy · pending publication</span>
        <span>Terms · pending publication</span>
        <a className="text-accent-ink" href="mailto:info@nexaflowsystems.com">
          Need help?
        </a>
      </footer>
    </div>
  );
}

export function WebsiteEnvironmentNotice({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div
      className="border-b border-line bg-accent-soft px-5 py-2 text-center text-[10px] font-bold uppercase tracking-[.08em] text-accent-ink"
      role="note"
    >
      {children}
    </div>
  );
}
