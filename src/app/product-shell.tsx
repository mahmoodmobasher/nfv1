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
import type {
  ProductNavGroup,
  ProductNavIcon,
  ProductNavItem,
} from "./product-navigation";
import { AccountThemeSync } from "./account-theme-sync";
import { Brand } from "./onboarding/components";
import { securePost } from "./onboarding/api";
import { WorkspaceControl } from "./workspace/workspace-control";

type ShellKind = "crm" | "admin";
const icons: Record<
  ProductNavIcon,
  React.ComponentType<{ "aria-hidden"?: boolean }>
> = {
  contact: Contact,
  home: House,
  kanban: Kanban,
  mail: Mail,
  plus: Plus,
  settings: Settings,
  user: UserRound,
  users: Users,
};

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

type IsolationState = {
  element: HTMLElement;
  inert: boolean;
  ariaHidden: string | null;
  tabStops: Array<{ element: HTMLElement; tabindex: string | null }>;
};
function isolate(element: HTMLElement): IsolationState {
  const state: IsolationState = {
    element,
    inert: element.inert,
    ariaHidden: element.getAttribute("aria-hidden"),
    tabStops: [],
  };
  element.inert = true;
  element.setAttribute("aria-hidden", "true");
  const focusableSelector = "a[href],button,input,select,textarea,[tabindex]",
    tabStops = [
      ...(element.matches(focusableSelector) ? [element] : []),
      ...element.querySelectorAll<HTMLElement>(focusableSelector),
    ];
  tabStops.forEach((node) => {
    state.tabStops.push({
      element: node,
      tabindex: node.getAttribute("tabindex"),
    });
    node.setAttribute("tabindex", "-1");
  });
  return state;
}
function restoreIsolation(state: IsolationState) {
  state.element.inert = state.inert;
  if (state.ariaHidden === null) state.element.removeAttribute("aria-hidden");
  else state.element.setAttribute("aria-hidden", state.ariaHidden);
  state.tabStops.forEach(({ element, tabindex }) =>
    tabindex === null
      ? element.removeAttribute("tabindex")
      : element.setAttribute("tabindex", tabindex),
  );
}

export function ProductShell({
  kind,
  workspace,
  role,
  navigation,
  banner,
  children,
}: {
  kind: ShellKind;
  workspace: string;
  role: string;
  navigation: ProductNavGroup[];
  banner: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname(),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null),
    skip = useRef<HTMLAnchorElement>(null),
    panel = useRef<HTMLDivElement>(null),
    rail = useRef<HTMLElement>(null),
    topbar = useRef<HTMLElement>(null),
    mobileContext = useRef<HTMLDivElement>(null),
    main = useRef<HTMLElement>(null),
    previousPath = useRef(pathname),
    openFrame = useRef<number | null>(null),
    restoreFrame = useRef<number | null>(null);
  function close(focus = true) {
    setOpen(false);
    if (focus)
      restoreFrame.current = requestAnimationFrame(
        () => trigger.current?.isConnected && trigger.current.focus(),
      );
  }
  useEffect(() => {
    if (pathname === previousPath.current) return;
    previousPath.current = pathname;
    if (open) close(false);
  }, [pathname, open]);
  useEffect(() => {
    if (!open) return;
    const targets = [
        skip.current,
        rail.current,
        topbar.current,
        mobileContext.current,
        trigger.current,
        main.current,
      ].filter((node): node is HTMLElement => Boolean(node)),
      isolated = targets.map(isolate),
      bodyOverflow = document.body.style.overflow,
      htmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    openFrame.current = requestAnimationFrame(() =>
      panel.current
        ?.querySelector<HTMLElement>("button,a[href],input,select,textarea")
        ?.focus(),
    );
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = panel.current?.querySelectorAll<HTMLElement>(
        "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])",
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
    return () => {
      document.removeEventListener("keydown", key);
      isolated.forEach(restoreIsolation);
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
      if (openFrame.current !== null) cancelAnimationFrame(openFrame.current);
      openFrame.current = null;
    };
  }, [open]);
  useEffect(
    () => () => {
      if (openFrame.current !== null) cancelAnimationFrame(openFrame.current);
      if (restoreFrame.current !== null)
        cancelAnimationFrame(restoreFrame.current);
    },
    [],
  );
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
  const signOutControl = (
    <button className="product-signout" onClick={logout} disabled={busy}>
      <LogOut aria-hidden="true" />
      <span>{busy ? "Signing out…" : "Sign out"}</span>
    </button>
  );
  const item = (entry: ProductNavItem) => {
    const active = entry.exact
        ? pathname === entry.href
        : pathname === entry.href || pathname.startsWith(`${entry.href}/`),
      ItemIcon = icons[entry.icon];
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
  const navigationContent = (drawer = false) => (
    <div
      className={
        drawer ? "product-drawer-content" : "product-navigation-content"
      }
    >
      {drawer && <WorkspaceControl name={workspace} role={role} />}
      <nav
        aria-label={kind === "crm" ? "CRM navigation" : "Workspace navigation"}
      >
        {navigation.map((group) => (
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
      </nav>
    </div>
  );
  const legacyClass = kind === "crm" ? "crm-preview" : "admin-shell",
    mobileClass = kind === "crm" ? "mobile-crm" : "admin-mobile",
    menuName = kind === "crm" ? "CRM navigation" : "workspace navigation",
    menuId = kind === "crm" ? "crm-menu" : "workspace-menu";
  return (
    <div
      className={`product-shell experience-product ${legacyClass}`}
      data-drawer-open={open || undefined}
    >
      <a ref={skip} className="skip-link" href="#product-main">
        Skip to main content
      </a>
      <AccountThemeSync />
      <aside ref={rail} className="product-rail">
        <Brand />
        {navigationContent()}
      </aside>
      <header ref={topbar} className="product-topbar">
        <WorkspaceControl name={workspace} role={role} />
        <div className="product-topbar-actions">
          <Link
            className="product-icon-action"
            href="/settings#preferences"
            aria-label="Appearance settings"
          >
            <Palette aria-hidden="true" />
          </Link>
          {signOutControl}
        </div>
      </header>
      <header className={`${mobileClass} product-mobile`}>
        <div ref={mobileContext}>
          <Brand />
          <span>{workspace}</span>
        </div>
        <div className="product-mobile-account">{signOutControl}</div>
        <button
          ref={trigger}
          className="menu-button"
          aria-label={`${open ? "Close" : "Open"} ${menuName}`}
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() =>
            open
              ? close()
              : setOpen(true)
          }
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
              aria-labelledby={`${menuId}-title`}
            >
              <div className="product-drawer-header">
                <h2 id={`${menuId}-title`}>{menuName}</h2>
                <button
                  className="product-drawer-close"
                  aria-label={`Close ${menuName}`}
                  onClick={() => close()}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
              {navigationContent(true)}
            </div>
          </div>
        )}
      </header>
      <main ref={main} id="product-main" tabIndex={-1} className="product-main">
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
