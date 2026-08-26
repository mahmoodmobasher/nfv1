"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Contact,
  House,
  Kanban,
  LogOut,
  Mail,
  Menu,
  Palette,
  Plus,
  Search,
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
import {
  activeProductNavigation,
  isProductNavItemActive,
  navigationFromCapabilities,
} from "./product-navigation";
import {
  workspaceNavigationCapabilitiesV1Schema,
  workspaceNavigationErrorEnvelopeV1Schema,
} from "@/frontend/shared/contracts/workspace-navigation";
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
  children,
}: {
  kind: ShellKind;
  workspace: string;
  role: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname(),
    [open, setOpen] = useState(false),
    [navigation, setNavigation] = useState<ProductNavGroup[]>([]),
    [canAddLead, setCanAddLead] = useState(false),
    [navigationState, setNavigationState] = useState<"loading" | "ready" | "retry" | "cleared">("loading"),
    [reloadNavigation, setReloadNavigation] = useState(0),
    [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set()),
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
    previousPath = useRef(pathname),
    openFrame = useRef<number | null>(null),
    restoreFrame = useRef<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setNavigation([]);
    setCanAddLead(false);
    setExpandedGroups(new Set());
    setNavigationState("loading");
    setOpen(false);
    async function loadNavigation() {
      try {
        const workspaceResponse = await fetch("/api/workspaces/selectable", {
          cache: "no-store", signal: controller.signal,
        });
        const workspacePayload = await workspaceResponse.json();
        const current: Array<{ id?: unknown; current?: unknown }> = workspaceResponse.ok && Array.isArray(workspacePayload?.workspaces)
          ? workspacePayload.workspaces.filter((entry: unknown) => entry && typeof entry === "object" && (entry as { current?: unknown }).current === true)
          : [];
        if (current.length !== 1 || typeof current[0].id !== "string") throw new Error("clear");
        const workspaceId = current[0].id;
        const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/navigation-capabilities`, {
          cache: "no-store", signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) {
          const error = workspaceNavigationErrorEnvelopeV1Schema.safeParse(payload);
          if (error.success && error.data.error.code === "navigation_unavailable") throw new Error("retry");
          throw new Error("clear");
        }
        const parsed = workspaceNavigationCapabilitiesV1Schema.safeParse(payload?.data);
        if (!parsed.success || parsed.data.workspaceId !== workspaceId) throw new Error("clear");
        const groups = navigationFromCapabilities(parsed.data);
        setNavigation(groups);
        setCanAddLead(parsed.data.capabilities.leads.canCreate);
        setExpandedGroups(new Set());
        setNavigationState("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        setNavigation([]);
        setCanAddLead(false);
        setExpandedGroups(new Set());
        setOpen(false);
        setNavigationState(error instanceof Error && error.message === "retry" ? "retry" : "cleared");
      }
    }
    void loadNavigation();
    return () => controller.abort();
  }, [workspace, reloadNavigation]);
  useEffect(() => {
    if (navigationState !== "ready") return;
    const active = activeProductNavigation(pathname, navigation);
    if (active) setExpandedGroups((current) => new Set(current).add(active.groupId));
  }, [pathname, navigation, navigationState]);
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
      const candidates = panel.current?.querySelectorAll<HTMLElement>(
        "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])",
      ), nodes = candidates ? [...candidates].filter((node) =>
        !node.closest("[hidden],[inert]") && node.getClientRects().length > 0
      ) : [];
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
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
  const item = (entry: ProductNavItem, drawer = false) => {
    const active = isProductNavItemActive(pathname, entry),
      ItemIcon = icons[entry.icon];
    return (
      <Link
        href={entry.href}
        aria-current={active && (drawer ? open : !open) ? "page" : undefined}
        onClick={() => open && close(false)}
      >
        <ItemIcon aria-hidden={true} />
        <span>{entry.label}</span>
      </Link>
    );
  };
  const activeNavigation = activeProductNavigation(pathname, navigation),
    canViewLeads = navigation.flatMap((group) => group.items).some((entry) => entry.href === "/crm"),
    breadcrumbGroup = activeNavigation?.group ?? "Workspace",
    breadcrumbPage = activeNavigation?.entry.label ?? "Current page";
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
        {navigation.map((group) => {
          const expanded = expandedGroups.has(group.id), groupActive = activeNavigation?.groupId === group.id;
          return (
          <section
            className="product-nav-group"
            key={group.label}
            data-active={groupActive || undefined}
          >
            <h2><button type="button" aria-expanded={expanded} aria-controls={`product-nav-${drawer ? "drawer" : "rail"}-${group.id}`}
              onClick={() => setExpandedGroups((current) => { const next = new Set(current); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next; })}>
              <span>{group.label}</span><ChevronDown aria-hidden="true" />
            </button></h2>
            <div id={`product-nav-${drawer ? "drawer" : "rail"}-${group.id}`} hidden={!expanded}>
              {group.items.map((entry) => <div key={entry.href}>{item(entry, drawer)}</div>)}
            </div>
          </section>
        )})}
      </nav>
    </div>
  );
  const shellVariant = `product-shell--${kind}`,
    menuName = kind === "crm" ? "CRM navigation" : "workspace navigation",
    menuId = kind === "crm" ? "crm-menu" : "workspace-menu";
  return (
    <div
      className={`product-shell experience-product ${shellVariant}`}
      data-drawer-open={open || undefined}
    >
      <a ref={skip} className="skip-link" href="#product-main">
        Skip to main content
      </a>
      <AccountThemeSync />
      <aside ref={rail} className="product-rail">
        <Brand />
        {navigationState === "ready" && navigationContent()}
      </aside>
      <header ref={topbar} className="product-topbar">
        <nav className="product-breadcrumbs" aria-label="Breadcrumb">
          <Link href={kind === "crm" ? "/crm/home" : "/crm"}>
            {breadcrumbGroup}
          </Link>
          <ChevronRight aria-hidden="true" />
          <span aria-current="page">{breadcrumbPage}</span>
        </nav>
        <div className="product-topbar-actions">
          {kind === "crm" && canAddLead && (
            <Link className="product-create-action" href="/crm/leads/new">
              <Plus aria-hidden="true" />
              <span>Add lead</span>
            </Link>
          )}
          {kind === "crm" && canViewLeads && (
            <form
              className="product-global-search"
              action="/crm"
              role="search"
            >
              <label className="sr-only" htmlFor="product-lead-search">
                Search leads
              </label>
              <Search aria-hidden="true" />
              <input
                id="product-lead-search"
                name="q"
                type="search"
                placeholder="Search leads"
                maxLength={200}
              />
            </form>
          )}
          {navigationState === "ready" && <WorkspaceControl name={workspace} role={role} />}
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
      <header className="product-mobile">
        <div ref={mobileContext}>
          <Brand />
          <span>{navigationState === "ready" ? workspace : "Workspace"}</span>
        </div>
        <div ref={mobileAccount} className="product-mobile-account">
          {signOutControl}
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
              {navigationState === "ready" && navigationContent(true)}
            </div>
          </div>
        )}
      </header>
      <main ref={main} id="product-main" tabIndex={-1} className="product-main">
        {navigationState !== "ready" ? <section className="admin-content narrow-admin product-navigation-state" tabIndex={-1}>
          <div className={`alert ${navigationState === "cleared" ? "error" : ""}`} role={navigationState === "loading" ? "status" : "alert"}>
            <h1>{navigationState === "loading" ? "Loading workspace" : navigationState === "retry" ? "Navigation is temporarily unavailable" : "Workspace access is unavailable"}</h1>
            <p>{navigationState === "loading" ? "Checking the latest workspace access…" : navigationState === "retry" ? "No workspace navigation or protected page details are shown. Try again safely." : "No workspace navigation or protected page details are shown. Sign in again or return to a safe page."}</p>
            {navigationState === "retry" && <button className="secondary" onClick={() => setReloadNavigation((value) => value + 1)}>Retry navigation</button>}
            {navigationState === "cleared" && <Link className="secondary link-button" href="/login">Return to sign in</Link>}
          </div>
        </section> : <>{error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}{children}</>}
      </main>
    </div>
  );
}
