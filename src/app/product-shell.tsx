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
    [accountOpen, setAccountOpen] = useState<"desktop" | "mobile" | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null),
    skip = useRef<HTMLAnchorElement>(null),
    panel = useRef<HTMLDivElement>(null),
    rail = useRef<HTMLElement>(null),
    topbar = useRef<HTMLElement>(null),
    mobileContext = useRef<HTMLDivElement>(null),
    mobileAccount = useRef<HTMLDivElement>(null),
    main = useRef<HTMLElement>(null),
    accountMenu = useRef<HTMLDivElement>(null),
    activeAccountTrigger = useRef<HTMLButtonElement | null>(null),
    previousPath = useRef(pathname),
    openFrame = useRef<number | null>(null),
    restoreFrame = useRef<number | null>(null),
    accountOpenFrame = useRef<number | null>(null),
    accountRestoreFrame = useRef<number | null>(null);
  function close(focus = true) {
    setOpen(false);
    if (focus)
      restoreFrame.current = requestAnimationFrame(
        () => trigger.current?.isConnected && trigger.current.focus(),
      );
  }
  function closeAccount(focus = true) {
    setAccountOpen(null);
    if (focus)
      accountRestoreFrame.current = requestAnimationFrame(
        () =>
          activeAccountTrigger.current?.isConnected &&
          activeAccountTrigger.current.focus(),
      );
  }
  useEffect(() => {
    if (pathname === previousPath.current) return;
    previousPath.current = pathname;
    if (open) close(false);
    if (accountOpen) closeAccount(false);
  }, [pathname, open, accountOpen]);
  useEffect(() => {
    if (!accountOpen) return;
    accountOpenFrame.current = requestAnimationFrame(() =>
      accountMenu.current
        ?.querySelector<HTMLElement>("a[href],button:not([disabled])")
        ?.focus(),
    );
    const pointer = (event: PointerEvent) => {
        const target = event.target as Node;
        if (
          accountMenu.current?.contains(target) ||
          activeAccountTrigger.current?.contains(target)
        )
          return;
        closeAccount();
      },
      key = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeAccount();
          return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
          return;
        const items = accountMenu.current?.querySelectorAll<HTMLElement>(
          '[role="menuitem"]:not([disabled])',
        );
        if (!items?.length) return;
        event.preventDefault();
        const current = Array.from(items).indexOf(
            document.activeElement as HTMLElement,
          ),
          next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : event.key === "ArrowUp"
                  ? (current - 1 + items.length) % items.length
                  : (current + 1) % items.length;
        items[next].focus();
      };
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("keydown", key);
      if (accountOpenFrame.current !== null)
        cancelAnimationFrame(accountOpenFrame.current);
      accountOpenFrame.current = null;
    };
  }, [accountOpen]);
  useEffect(() => {
    if (!open) return;
    const targets = [
        skip.current,
        rail.current,
        topbar.current,
        mobileContext.current,
        mobileAccount.current,
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
      if (accountOpenFrame.current !== null)
        cancelAnimationFrame(accountOpenFrame.current);
      if (accountRestoreFrame.current !== null)
        cancelAnimationFrame(accountRestoreFrame.current);
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
  const accountControl = (placement: "desktop" | "mobile") => {
    const expanded = accountOpen === placement;
    return (
      <div className="product-account">
        <button
          className="product-account-trigger"
          aria-label="Account menu"
          aria-expanded={expanded}
          aria-haspopup="menu"
          onClick={(event) => {
            activeAccountTrigger.current = event.currentTarget;
            if (expanded) closeAccount();
            else {
              if (open) close(false);
              setAccountOpen(placement);
            }
          }}
        >
          <span className="product-account-avatar" aria-hidden="true">
            <UserRound />
          </span>
          <span>Account</span>
        </button>
        {expanded && (
          <div
            ref={accountMenu}
            className="product-account-menu"
            role="menu"
            aria-label="Account menu"
          >
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => closeAccount(false)}
            >
              <UserRound aria-hidden="true" />
              <span>Personal settings</span>
            </Link>
            <button
              role="menuitem"
              className="product-account-signout"
              disabled={busy}
              onClick={logout}
            >
              <LogOut aria-hidden="true" />
              <span>{busy ? "Signing out…" : "Sign out"}</span>
            </button>
            {error && (
              <p className="product-account-error" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };
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
        <button className="signout" onClick={logout} disabled={busy}>
          <LogOut aria-hidden={true} />
          <span>{busy ? "Signing out…" : "Sign out"}</span>
        </button>
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
          {accountControl("desktop")}
        </div>
      </header>
      <header className={`${mobileClass} product-mobile`}>
        <div ref={mobileContext}>
          <Brand />
          <span>{workspace}</span>
        </div>
        <div ref={mobileAccount} className="product-mobile-account">
          {accountControl("mobile")}
        </div>
        <button
          ref={trigger}
          className="menu-button"
          aria-label={`${open ? "Close" : "Open"} ${menuName}`}
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() =>
            open
              ? close()
              : (accountOpen && closeAccount(false), setOpen(true))
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
        {error && !accountOpen && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
