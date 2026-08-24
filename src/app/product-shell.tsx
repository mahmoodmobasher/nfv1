"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Contact,
  House,
  Kanban,
  LogOut,
  Mail,
  Menu,
  Palette,
  Plus,
  Settings,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { AccountThemeSync } from "./account-theme-sync";
import { Brand } from "./onboarding/components";
import { securePost } from "./onboarding/api";
import { WorkspaceControl } from "./workspace/workspace-control";

type ShellKind = "crm" | "admin";
type Icon = React.ComponentType<{ "aria-hidden"?: boolean }>;
type NavItem = { href: string; label: string; icon: Icon; exact?: boolean };

const crmNavGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Workspace",
    items: [{ href: "/crm/home", label: "Home", icon: House, exact: true }],
  },
  {
    label: "Customers",
    items: [
      { href: "/crm", label: "Leads", icon: Contact, exact: true },
      { href: "/crm/pipeline", label: "Pipeline", icon: Kanban, exact: true },
      { href: "/crm/leads/new", label: "Add lead", icon: Plus, exact: true },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/workspace/settings/people",
        label: "People and roles",
        icon: Users,
      },
      {
        href: "/workspace/settings",
        label: "Workspace settings",
        icon: Settings,
        exact: true,
      },
    ],
  },
];

const adminNavGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Workspace",
    items: [{ href: "/crm", label: "CRM overview", icon: House }],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/workspace/settings/people",
        label: "People and roles",
        icon: Users,
      },
      {
        href: "/workspace/settings/invitations",
        label: "Invitations",
        icon: Mail,
      },
      { href: "/workspace/settings/teams", label: "Teams", icon: Contact },
      {
        href: "/workspace/settings",
        label: "Workspace settings",
        icon: Settings,
        exact: true,
      },
    ],
  },
];

export function ProductPageHeader({
  title,
  description,
  action,
  context,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  context?: string;
}) {
  return (
    <header className="product-page-header">
      <div>
        {context && <p className="product-page-context">{context}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="product-page-actions">{action}</div>}
    </header>
  );
}

export function ProductShell({
  kind,
  workspace,
  role,
  banner,
  children,
}: {
  kind: ShellKind;
  workspace: string;
  role: string;
  banner: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname(),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    trigger = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null);
  function close(focus = true) {
    setOpen(false);
    if (focus) setTimeout(() => trigger.current?.focus());
  }
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() =>
      panel.current?.querySelector<HTMLElement>("a,button,input")?.focus(),
    );
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = panel.current?.querySelectorAll<HTMLElement>(
        "a[href],button:not([disabled]),input:not([disabled])",
      );
      if (!nodes?.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const { response } = await securePost("/api/auth/logout", {
        scope: "current",
      });
      if (!response.ok) throw new Error();
      window.location.replace("/login?signedOut=1");
    } catch {
      setError(
        "We couldn’t securely sign you out. Your session remains active; try again.",
      );
      setBusy(false);
    }
  }
  const item = (entry: NavItem) => {
    const active = entry.exact
        ? pathname === entry.href
        : pathname === entry.href || pathname.startsWith(`${entry.href}/`),
      ItemIcon = entry.icon;
    return (
      <Link
        href={entry.href}
        aria-current={active ? "page" : undefined}
        onClick={() => open && close(false)}
      >
        <ItemIcon aria-hidden={true} />
        <span>{entry.label}</span>
      </Link>
    );
  };
  const canAdminister = role === "owner" || role === "admin";
  const groups = kind === "crm"
    ? crmNavGroups.filter((group) => group.label !== "Administration" || canAdminister)
    : adminNavGroups;
  const navigation = (drawer = false) => (
    <div
      className={
        drawer ? "product-drawer-content" : "product-navigation-content"
      }
    >
      {drawer && <WorkspaceControl name={workspace} role={role} />}
      <nav
        aria-label={kind === "crm" ? "CRM navigation" : "Workspace navigation"}
      >
        {groups.map((group) => (
          <section
            className="product-nav-group"
            aria-label={group.label}
            key={group.label}
          >
            <h2>{group.label}</h2>
            {group.items.map((entry) => (
              <div key={entry.href}>{item(entry)}</div>
            ))}
          </section>
        ))}
        <section className="product-nav-group" aria-label="Account">
          <h2>Account</h2>
          <div>
            {item({
              href: "/settings",
              label: "Personal settings",
              icon: UserRound,
              exact: true,
            })}
          </div>
        </section>
        <button className="signout" onClick={logout} disabled={busy}>
          <LogOut aria-hidden={true} />
          <span>{busy ? "Signing out…" : "Sign out"}</span>
        </button>
      </nav>
    </div>
  );
  const legacyClass = kind === "crm" ? "crm-preview" : "admin-shell",
    mobileClass = kind === "crm" ? "mobile-crm" : "admin-mobile";
  const menuName = kind === "crm" ? "CRM navigation" : "workspace navigation",
    menuId = kind === "crm" ? "crm-menu" : "workspace-menu";
  return (
    <div className={`product-shell ${legacyClass}`}>
      <AccountThemeSync />
      <aside className="product-rail">
        <Brand />
        {navigation()}
      </aside>
      <header className="product-topbar">
        <WorkspaceControl name={workspace} role={role} />
        <div className="product-topbar-actions">
          <Link
            className="product-icon-action"
            href="/settings#preferences"
            aria-label="Appearance settings"
          >
            <Palette aria-hidden="true" />
          </Link>
          <Link
            className="product-icon-action"
            href="/settings"
            aria-label="Account settings"
          >
            <UserRound aria-hidden="true" />
          </Link>
        </div>
      </header>
      <header className={`${mobileClass} product-mobile`}>
        <div>
          <Brand />
          <span>{workspace}</span>
        </div>
        <button
          ref={trigger}
          className="menu-button"
          aria-label={`${open ? "Close" : "Open"} ${menuName}`}
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => (open ? close() : setOpen(true))}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
        {open && (
          <div id={menuId} className="mobile-menu product-drawer">
            <button
              className="menu-backdrop"
              aria-label={`Close ${menuName}`}
              onClick={() => close()}
            />
            <div
              ref={panel}
              className="mobile-menu-panel"
              role="dialog"
              aria-modal="true"
              aria-label={menuName}
            >
              {navigation(true)}
            </div>
          </div>
        )}
      </header>
      <main className="product-main">
        <div className="preview-banner">{banner}</div>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
