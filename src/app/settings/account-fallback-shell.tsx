"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import { AccountThemeSync } from "../account-theme-sync";
import { Brand } from "../onboarding/components";
import { securePost } from "../onboarding/api";

export function AccountFallbackShell({ children }: { children: React.ReactNode }) {
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
    requestAnimationFrame(() => menu.current?.querySelector<HTMLElement>("a[href],button:not([disabled])")?.focus());
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
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
      const { response } = await securePost("/api/auth/logout", { scope: "current" });
      if (!response.ok) throw new Error("logout_failed");
      window.location.replace("/login?signedOut=1");
    } catch {
      setError("We couldn’t securely sign you out. Your session remains active; try again.");
      setBusy(false);
    }
  }

  return (
    <div className="account-shell">
      <AccountThemeSync reconcile={false} />
      <a className="skip-link" href="#account-main">Skip to main content</a>
      <header className="account-header">
        <Brand />
        <div className="product-account">
          <button ref={trigger} className="product-account-trigger" aria-label="Account menu" aria-expanded={open} aria-haspopup="menu" onClick={() => open ? close() : setOpen(true)}>
            <span className="product-account-avatar" aria-hidden="true"><UserRound /></span><span>Account</span>
          </button>
          {open && <div ref={menu} className="product-account-menu" role="menu" aria-label="Account menu">
            <Link href="/settings" role="menuitem" onClick={() => close(false)}><UserRound aria-hidden="true" /><span>Personal settings</span></Link>
            <button role="menuitem" className="product-account-signout" disabled={busy} onClick={signOut}><LogOut aria-hidden="true" /><span>{busy ? "Signing out…" : "Sign out"}</span></button>
            {error && <p className="product-account-error" role="alert">{error}</p>}
          </div>}
        </div>
      </header>
      <main id="account-main">{children}</main>
    </div>
  );
}
