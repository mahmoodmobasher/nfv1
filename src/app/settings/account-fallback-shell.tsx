"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import { AccountThemeSync } from "../account-theme-sync";
import { Brand } from "../onboarding/components";
import { securePost } from "../onboarding/api";

export function AccountFallbackShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  function close(focus = true) {
    setOpen(false);
    if (focus) requestAnimationFrame(() => trigger.current?.focus());
  }
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() =>
      menu.current
        ?.querySelector<HTMLElement>("a[href],button:not([disabled])")
        ?.focus(),
    );
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target))
        close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const items = menu.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([disabled])',
      );
      if (!items?.length) return;
      event.preventDefault();
      const current = Array.from(items).indexOf(
        document.activeElement as HTMLElement,
      );
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : event.key === "ArrowUp"
              ? (current - 1 + items.length) % items.length
              : (current + 1) % items.length;
      items[next].focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const { response } = await securePost("/api/auth/logout", {
        scope: "current",
      });
      if (!response.ok) throw new Error("logout_failed");
      window.location.replace("/login?signedOut=1");
    } catch {
      setError(
        "We couldn’t securely sign you out. Your session remains active; try again.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <AccountThemeSync reconcile={false} />
      <a
        className="fixed left-3 top-3 z-50 -translate-y-24 rounded-control bg-accent px-3 py-2 font-semibold text-on-accent focus:translate-y-0"
        href="#account-main"
      >
        Skip to main content
      </a>
      <header className="flex min-h-[60px] items-center justify-between border-b border-line bg-surface px-4 sm:px-6">
        <Brand />
        <div className="relative">
          <button
            ref={trigger}
            className="inline-flex min-h-11 items-center gap-2 rounded-control border border-control bg-surface px-3 text-xs font-semibold text-ink hover:bg-surface-muted"
            aria-label="Account menu"
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={() => (open ? close() : setOpen(true))}
          >
            <span
              className="grid size-8 place-items-center rounded-full bg-accent-soft text-accent-ink [&_svg]:size-4"
              aria-hidden="true"
            >
              <UserRound />
            </span>
            <span>Account</span>
          </button>
          {open && (
            <div
              ref={menu}
              className="absolute right-0 z-30 mt-2 grid min-w-56 gap-1 rounded-panel border border-line bg-surface p-2 shadow-[0_4px_16px_rgb(0_0_0/.25)] [&_[role=menuitem]]:flex [&_[role=menuitem]]:min-h-11 [&_[role=menuitem]]:items-center [&_[role=menuitem]]:gap-2 [&_[role=menuitem]]:rounded-control [&_[role=menuitem]]:px-3 [&_[role=menuitem]]:text-xs [&_[role=menuitem]]:font-semibold [&_[role=menuitem]]:text-ink hover:[&_[role=menuitem]]:bg-surface-muted"
              role="menu"
              aria-label="Account menu"
            >
              <Link
                href="/settings"
                role="menuitem"
                onClick={() => close(false)}
              >
                <UserRound aria-hidden="true" />
                <span>Personal settings</span>
              </Link>
              <button
                role="menuitem"
                className="border-0 bg-transparent text-left disabled:opacity-45"
                disabled={busy}
                onClick={signOut}
              >
                <LogOut aria-hidden="true" />
                <span>{busy ? "Signing out…" : "Sign out"}</span>
              </button>
              {error && (
                <p
                  className="rounded-card border border-danger/30 bg-danger-soft p-3 text-xs text-danger"
                  role="alert"
                >
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      </header>
      <main id="account-main">{children}</main>
    </div>
  );
}
