"use client";

import Link from "next/link";
import { Building2, ContactRound } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ActionLink, Button, EmptyState, FeedbackState, StatusBadge } from "@/frontend/design-system";
import {
  COMPANY_LIFECYCLE,
  CONTACT_LIFECYCLE,
  companyResultEnvelopeSchema,
  contactResultEnvelopeSchema,
  customerGraphErrorEnvelopeV1Schema,
  customerGraphListEnvelopeSchema,
  type CustomerGraphError,
  type CustomerGraphKind,
  type CustomerGraphList,
  type CustomerGraphStatus,
} from "../contracts/customer-graph.contracts";
import { customerGraphErrorDisposition } from "./customer-graph";
import { CustomerGraphLoading } from "./customer-graph-feedback";

type Item = CustomerGraphList["items"][number];
type Feed = {
  items: Item[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: CustomerGraphError | null;
  moreError: string;
};

const emptyFeed = (loading = false): Feed => ({ items: [], nextCursor: null, loading, loadingMore: false, error: null, moreError: "" });
const plural = (kind: CustomerGraphKind) => kind === "company" ? "companies" : "contacts";
const singular = (kind: CustomerGraphKind) => kind === "company" ? "Company" : "Contact";
const title = (kind: CustomerGraphKind) => kind === "company" ? "Companies" : "Contacts";
const endpoint = (workspaceId: string, kind: CustomerGraphKind, id?: string) => `/api/workspaces/${workspaceId}/${plural(kind)}${id ? `/${id}` : ""}`;
const safeError = (value: unknown): CustomerGraphError => {
  const parsed = customerGraphErrorEnvelopeV1Schema.safeParse(value);
  return parsed.success ? parsed.data.error : { code: "unexpected_error", message: "The request could not be completed.", retryable: true, reconciliation: { required: true, action: "retry_same_request" } };
};
const isAuthorityLoss = (error: CustomerGraphError) => customerGraphErrorDisposition(error) === "authority_loss";
async function json(response: Response) { try { return await response.json(); } catch { return null; } }
async function csrf() { const response = await fetch("/api/auth/csrf", { cache: "no-store" }); if (!response.ok) throw new Error(); return (await response.json() as { token: string }).token; }
function mergeItems(current: Item[], incoming: Item[]) { const merged = new Map(current.map(item => [item.id, item])); for (const item of incoming) { const existing = merged.get(item.id); if (!existing || item.version >= existing.version) merged.set(item.id, item); } return [...merged.values()]; }
function date(value: string) { return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value)); }

function AuthorityState({ kind, error }: { kind: CustomerGraphKind; error: CustomerGraphError }) {
  const back = `/crm/${plural(kind)}`;
  return <FeedbackState tone="danger" autoFocus title={`${title(kind)} unavailable`} action={<ActionLink href={error.code === "authentication_required" ? `/login?next=${encodeURIComponent(back)}` : "/crm/home"}>{error.code === "authentication_required" ? "Sign in again" : "Back to Home"}</ActionLink>}>
    <p>Your authority changed or these records are no longer available. Protected rows, actions, results, and requests were cleared.</p>
  </FeedbackState>;
}

function LifecycleDialog({ item, action, busy, onCancel, onConfirm, restore }: { item: Item; action: "archive" | "restore"; busy: boolean; onCancel: () => void; onConfirm: () => void; restore: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), restoreRef = useRef(restore);
  useEffect(() => { restoreRef.current = restore; }, [restore]);
  useEffect(() => { const node = dialog.current; if (!node) return; node.showModal(); node.querySelector<HTMLElement>("button")?.focus(); return () => { if (node.open) node.close(); restoreRef.current(); }; }, []);
  return <dialog ref={dialog} className="lead-management-dialog" aria-labelledby="cg-list-dialog-title" aria-describedby="cg-list-dialog-description" onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id="cg-list-dialog-title">{action === "archive" ? "Archive" : "Restore"} {item.displayName}?</h2>
    <p id="cg-list-dialog-description">{action === "archive" ? "The record and retained history will remain available when Include archived is selected." : "The record will return to the active Companies and Contacts view."}</p>
    <div className="ds-page-actions"><Button type="button" onClick={onCancel}>Cancel</Button><Button type="button" variant={action === "archive" ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>{busy ? `${action === "archive" ? "Archiving" : "Restoring"}…` : action === "archive" ? "Archive record" : "Restore record"}</Button></div>
  </dialog>;
}

function LifecycleAction({ workspaceId, kind, item, onAuthorityLoss, onApplied, onStale }: { workspaceId: string; kind: CustomerGraphKind; item: Item; onAuthorityLoss: (error: CustomerGraphError) => void; onApplied: (message: string) => void; onStale: (status: CustomerGraphStatus) => Promise<void> }) {
  const action = item.status === "active" ? "archive" : "restore",
    allowed = action === "archive" ? item.capabilities.canArchive : item.capabilities.canRestore,
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [stale, setStale] = useState(false),
    [message, setMessage] = useState(""),
    trigger = useRef<HTMLButtonElement>(null),
    alert = useRef<HTMLDivElement>(null),
    request = useRef({ body: "", key: crypto.randomUUID() });
  if (!allowed) return null;
  async function mutate() {
    const body = JSON.stringify({ contractVersion: kind === "company" ? COMPANY_LIFECYCLE : CONTACT_LIFECYCLE, expectedVersion: item.version });
    if (request.current.body !== body) request.current = { body, key: crypto.randomUUID() };
    setBusy(true); setMessage("");
    try {
      const token = await csrf(), response = await fetch(`${endpoint(workspaceId, kind, item.id)}/${action}`, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": token, "idempotency-key": request.current.key }, body }), payload = await json(response);
      if (!response.ok) {
        const error = safeError(payload);
        if (isAuthorityLoss(error)) { request.current = { body: "", key: "" }; setOpen(false); onAuthorityLoss(error); return; }
        if (error.code === "stale_version") { setOpen(false); setStale(true); setMessage(`This ${singular(kind).toLowerCase()} changed. Reload its ${item.status} list before trying again.`); request.current = { body: "", key: crypto.randomUUID() }; requestAnimationFrame(() => alert.current?.focus()); return; }
        if (error.code === "idempotency_conflict") request.current = { body: "", key: crypto.randomUUID() };
        setOpen(false); setMessage(error.message); requestAnimationFrame(() => alert.current?.focus()); return;
      }
      const parsed = (kind === "company" ? companyResultEnvelopeSchema : contactResultEnvelopeSchema).safeParse(payload);
      if (!parsed.success) throw new Error();
      setOpen(false); request.current = { body: "", key: crypto.randomUUID() };
      onApplied(parsed.data.data.replayed ? `${singular(kind)} change was already applied.` : `${singular(kind)} ${action === "archive" ? "archived" : "restored"}.`);
    } catch { setOpen(false); setMessage(`We couldn’t ${action} this ${singular(kind).toLowerCase()}. Its saved status is unchanged; retry safely.`); requestAnimationFrame(() => alert.current?.focus()); }
    finally { setBusy(false); }
  }
  return <div className="cg-list-lifecycle">
    {message && <div ref={alert} className={`cg-list-row-feedback ${stale ? "is-stale" : ""}`} role={stale ? "alert" : "status"} tabIndex={-1}><p>{message}</p>{stale && <Button type="button" onClick={async () => { await onStale(item.status); setStale(false); setMessage("Latest loaded records are shown. Review this row before continuing."); requestAnimationFrame(() => alert.current?.focus()); }}>Reload latest</Button>}</div>}
    <button ref={trigger} type="button" className={`ds-action ds-action--${action === "archive" ? "danger" : "secondary"}`} disabled={stale} onClick={() => setOpen(true)}>{action === "archive" ? "Archive" : "Restore"}<span className="sr-only"> {item.displayName}</span></button>
    {open && <LifecycleDialog item={item} action={action} busy={busy} onCancel={() => setOpen(false)} onConfirm={() => void mutate()} restore={() => trigger.current?.focus()}/>}
  </div>;
}

export function CustomerGraphListPage({ workspaceId, kind }: { workspaceId: string; kind: CustomerGraphKind }) {
  const [active, setActive] = useState<Feed>(() => emptyFeed(true)),
    [archived, setArchived] = useState<Feed>(emptyFeed),
    [includeArchived, setIncludeArchived] = useState(false),
    [searchDraft, setSearchDraft] = useState(""),
    [search, setSearch] = useState(""),
    [canCreate, setCanCreate] = useState(false),
    [authorityError, setAuthorityError] = useState<CustomerGraphError | null>(null),
    [announcement, setAnnouncement] = useState(""),
    activeController = useRef<AbortController | null>(null),
    archivedController = useRef<AbortController | null>(null),
    archivedRetry = useRef<HTMLButtonElement>(null),
    activeRef = useRef(active),
    archivedRef = useRef(archived);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { archivedRef.current = archived; }, [archived]);
  const clearProtected = useCallback((error: CustomerGraphError) => { activeController.current?.abort(); archivedController.current?.abort(); setActive(emptyFeed()); setArchived(emptyFeed()); setCanCreate(false); setSearchDraft(""); setSearch(""); setAnnouncement(""); setAuthorityError(error); }, []);
  const load = useCallback(async (status: CustomerGraphStatus, more = false) => {
    const setFeed = status === "active" ? setActive : setArchived,
      current = status === "active" ? activeRef.current : archivedRef.current,
      controller = new AbortController();
    if (status === "active") { activeController.current?.abort(); activeController.current = controller; }
    else { archivedController.current?.abort(); archivedController.current = controller; }
    setFeed(value => ({ ...value, loading: !more, loadingMore: more, error: more ? value.error : null, moreError: "" }));
    const query = new URLSearchParams({ status, limit: "50" });
    if (more && current.nextCursor) query.set("cursor", current.nextCursor);
    try {
      const response = await fetch(`${endpoint(workspaceId, kind)}?${query}`, { cache: "no-store", signal: controller.signal }), payload = await json(response);
      if (!response.ok) throw safeError(payload);
      const parsed = customerGraphListEnvelopeSchema.safeParse(payload);
      if (!parsed.success || parsed.data.data.kind !== kind) throw safeError(null);
      setFeed(value => ({ ...value, items: more ? mergeItems(value.items, parsed.data.data.items) : parsed.data.data.items, nextCursor: parsed.data.data.nextCursor, loading: false, loadingMore: false, error: null, moreError: "" }));
      if (status === "active") setCanCreate(parsed.data.data.capabilities.canCreate);
    } catch (value) {
      if (controller.signal.aborted) return;
      const error = value && typeof value === "object" && "code" in value ? value as CustomerGraphError : safeError(null);
      if (isAuthorityLoss(error)) { clearProtected(error); return; }
      setFeed(feed => ({ ...feed, loading: false, loadingMore: false, error: more ? feed.error : error, moreError: more ? error.message : "" }));
    }
  }, [workspaceId, kind, clearProtected]);
  useEffect(() => { void load("active"); return () => { activeController.current?.abort(); archivedController.current?.abort(); }; }, [load]);
  useEffect(() => { if (includeArchived && archived.error && active.items.length === 0) requestAnimationFrame(() => archivedRetry.current?.focus()); }, [includeArchived, archived.error, active.items.length]);
  const loadedItems = mergeItems(includeArchived ? archived.items : [], active.items),
    visible = loadedItems.filter(item => item.displayName.toLocaleLowerCase().includes(search.toLocaleLowerCase())),
    base = `/crm/${plural(kind)}`,
    Icon = kind === "company" ? Building2 : ContactRound,
    loaded = loadedItems.length;
  function submitSearch(event: FormEvent) { event.preventDefault(); setSearch(searchDraft.trim()); }
  async function refresh(status: CustomerGraphStatus) { await load(status); }
  if (authorityError) return <AuthorityState kind={kind} error={authorityError}/>;
  return <div className="cg-directory">
    <header className="product-page-header cg-directory-header"><div className="cg-directory-heading"><span className="cg-directory-icon" aria-hidden="true"><Icon size={22}/></span><div><p className="eyebrow">Customer records</p><h1>{title(kind)}</h1><p className="lead">Manage the {title(kind)} visible in this Workspace.</p></div></div>{canCreate && <div className="product-page-actions"><ActionLink variant="primary" href={`${base}/new`}>Add {singular(kind).toLowerCase()}</ActionLink></div>}</header>
    <section className="cg-directory-tools" aria-label={`${title(kind)} filters`}>
      <form className="cg-directory-search" role="search" onSubmit={submitSearch}><label className="field" htmlFor={`${kind}-directory-search`}><span>Search loaded {title(kind).toLowerCase()}</span><input id={`${kind}-directory-search`} type="search" value={searchDraft} onChange={event => setSearchDraft(event.target.value)} maxLength={200}/><small>Search applies only to the records currently loaded below.</small></label><Button type="submit">Search</Button>{search && <Button type="button" onClick={() => { setSearchDraft(""); setSearch(""); }}>Clear search</Button>}</form>
      <label className="check cg-include-archived"><input type="checkbox" checked={includeArchived} onChange={event => { const checked = event.target.checked; setIncludeArchived(checked); setSearchDraft(""); setSearch(""); if (checked && !archived.items.length && !archived.loading) void load("archived"); }}/>Include archived</label>
    </section>
    <p className="cg-directory-status" role="status" aria-live="polite">{announcement || (search ? `${visible.length} of ${loaded} loaded ${title(kind).toLowerCase()} match this search.` : `${loaded} loaded ${loaded === 1 ? singular(kind).toLowerCase() : title(kind).toLowerCase()} shown.`)}</p>
    {active.loading ? <CustomerGraphLoading label={`Loading active ${title(kind).toLowerCase()}…`}/> : active.error ? <FeedbackState tone="danger" autoFocus title={`Active ${title(kind).toLowerCase()} are temporarily unavailable`} action={<Button onClick={() => void load("active")}>Retry active {title(kind).toLowerCase()}</Button>}><p>{active.error.message} No protected rows are shown.</p></FeedbackState> : active.items.length === 0 && (!includeArchived || archived.items.length === 0) && !archived.loading && !archived.error && !search ? <EmptyState title={`No ${title(kind).toLowerCase()} yet`} action={canCreate ? <ActionLink variant="primary" href={`${base}/new`}>Add {singular(kind).toLowerCase()}</ActionLink> : undefined}><p>{includeArchived ? `No active or archived ${title(kind).toLowerCase()} are currently visible.` : `No active ${title(kind).toLowerCase()} are currently visible.`}</p></EmptyState> : search && visible.length === 0 ? <EmptyState title={`No loaded ${title(kind).toLowerCase()} match your search`} action={<Button onClick={() => { setSearchDraft(""); setSearch(""); }}>Clear search</Button>}><p>Clear the search or load more records. This search does not cover records that have not been loaded.</p></EmptyState> : <section className="cg-directory-results" aria-label={`Loaded ${title(kind).toLowerCase()}`}>
      <div className="cg-directory-table-wrap"><table className="cg-directory-table"><caption>Loaded {title(kind).toLowerCase()}. Active and archived feeds keep separate server ordering.</caption><thead><tr><th scope="col">{singular(kind)}</th><th scope="col">Status</th><th scope="col">Updated</th><th scope="col">Actions</th></tr></thead><tbody>{visible.map(item => <tr key={item.id} className={item.status === "archived" ? "is-archived" : undefined}><th scope="row" data-label={singular(kind)}><Link href={`${base}/${item.id}`}>{item.displayName}</Link></th><td data-label="Status"><StatusBadge tone={item.status === "active" ? "success" : "neutral"}>{item.status === "active" ? "Active" : "Archived"}</StatusBadge></td><td data-label="Updated"><time dateTime={item.updatedAt}>{date(item.updatedAt)}</time></td><td data-label="Actions"><div className="cg-directory-actions"><ActionLink href={`${base}/${item.id}`}>View<span className="sr-only"> {item.displayName}</span></ActionLink>{item.capabilities.canEdit && <ActionLink href={`${base}/${item.id}/edit`}>Edit<span className="sr-only"> {item.displayName}</span></ActionLink>}<LifecycleAction workspaceId={workspaceId} kind={kind} item={item} onAuthorityLoss={clearProtected} onApplied={message => { setAnnouncement(message); void load("active"); if (includeArchived) void load("archived"); }} onStale={refresh}/></div></td></tr>)}</tbody></table></div>
      {includeArchived && archived.loading && <CustomerGraphLoading label={`Loading archived ${title(kind).toLowerCase()}…`}/>}
      {includeArchived && archived.error && <FeedbackState tone="warning" title={`Archived ${title(kind).toLowerCase()} could not be loaded`} action={<button ref={archivedRetry} className="ds-action ds-action--secondary" type="button" onClick={() => void load("archived")}>Retry archived {title(kind).toLowerCase()}</button>}><p>{archived.error.message} {active.items.length ? "Active records remain available above." : `No active ${title(kind).toLowerCase()} are currently visible; archived visibility is unknown until this request succeeds.`}</p></FeedbackState>}
      <div className="cg-directory-pagination">{active.nextCursor && <div>{active.moreError && <p role="alert">{active.moreError}</p>}<Button type="button" disabled={active.loadingMore} onClick={() => void load("active", true)}>{active.loadingMore ? "Loading active…" : `Load more active ${title(kind).toLowerCase()}`}</Button></div>}{includeArchived && archived.nextCursor && <div>{archived.moreError && <p role="alert">{archived.moreError}</p>}<Button type="button" disabled={archived.loadingMore} onClick={() => void load("archived", true)}>{archived.loadingMore ? "Loading archived…" : `Load more archived ${title(kind).toLowerCase()}`}</Button></div>}</div>
    </section>}
  </div>;
}
