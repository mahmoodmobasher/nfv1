# Authenticated CRM Home Dashboard Contract

Status: **implementation-ready product contract**  
Date: 2026-08-21  
Scope: authenticated CRM home using the accepted Lead/Pipeline/Ownership/Team/Activity foundation  
Product references: user dashboard mock and `CRM Flow-Start Up.jpg`  
Boundary: architecture/data/API/test contract only; no application code or pre-UAT hardening work

## 1. Product decision

Add an authenticated CRM overview at **`/crm/home`**. Keep the accepted `/crm` Lead list and `/crm/pipeline` journey unchanged. Add **Home** to the protected CRM navigation and make dashboard links lead only to existing authorized CRM routes.

The diagram's current implemented product chain is:

**Workspace → persisted Role/Team/Ownership/Visibility → Leads → Pipeline state → Activities**

The dashboard must be honest about that boundary. It may combine:

1. **Live CRM data** calculated from tenant-scoped Leads, Pipeline Stages, Lead ownership/visibility, Teams, and Lead Activities.
2. **Static product-preview data** for Deals, conversion, Projects, delivery, and reporting, each unmistakably labelled **Demo preview**.

Live and demo values must never be blended into one total, chart, trend, export, alert, recommendation, or business decision.

## 2. Dashboard information architecture

### Live section: “CRM snapshot”

Display a **Live workspace data** badge and a generated-at time.

| Surface | Definition | Safe destination |
| --- | --- | --- |
| Visible Leads | Count of the authorized Lead population after selected filters | `/crm` with validated filters |
| Open | Authorized Leads with `status='open'` | `/crm?status=open` |
| Won | Authorized Leads with `status='won'` | `/crm?status=won` |
| Lost | Authorized Leads with `status='lost'` | `/crm?status=lost` |
| Pipeline distribution | Count of authorized Leads grouped by same-Workspace stage, ordered by stage position | `/crm/pipeline` with stage filter |
| Ownership workload | Count of authorized Leads grouped by active same-Workspace owner Membership/display label | `/crm` with owner filter |
| Team-visible work | Count of authorized Team-visible Leads grouped by teams the actor may use as filters | `/crm` with team filter |
| Recent activity | Latest authorized Lead Activities with Lead label, type, actor display label, and timestamp | authorized `/crm/leads/:leadId` |

“Won” and “Lost” are Lead outcomes, not Deals, revenue, conversion, or delivery completion. Do not attach currency to them.

### Demo section: “Coming next”

Place this in a visually separate region after the live section. The region heading and every card must include **Demo preview**; explanatory copy must say: **“Sample values only — this feature is not connected to workspace data.”**

Permitted static previews:

| Preview | Permitted presentation | Prohibited claim |
| --- | --- | --- |
| Deals | Sample pipeline value/count | Real opportunity/deal records or revenue |
| Conversion | Sample percentage/funnel | Lead-to-customer conversion calculated from Won Leads |
| Projects | Sample active/on-track counts | Persisted project/customer-delivery records |
| Delivery | Sample health or milestone cards | Delivery SLA, completion, capacity, or risk authority |
| Reporting | Sample chart/image state | Analytics, forecasting, export, or historical truth |

Demo cards have no live metric links. Their only action may be a non-navigating **Preview** affordance or a disabled **Coming later** label. Do not create empty routes that imply these capabilities exist.

## 3. Authorization contract

The dashboard is server-rendered from a server-derived `TenantContext`. Every request must resolve:

- an unexpired, unrevoked PostgreSQL Session for an active User;
- one active Workspace Membership for the selected Workspace;
- its current persisted Role and Membership version; and
- current persisted Team Memberships.

Workspace ID, Membership ID, Role, ownership, visibility, and Team access must not come from query parameters, client state, cookies other than the opaque Session reference, hidden inputs, or demo configuration.

The authorized Lead predicate is the accepted CRM predicate:

- persisted Owner/Admin: all Leads in the current Workspace;
- persisted Member: Workspace-visible Leads, Leads owned by that Membership, and Leads visible through one of that Membership's current active Teams.

All dashboard aggregates must begin from this authorized Lead population. It is forbidden to aggregate all Workspace Leads and filter the result afterward. Activity queries must join back to the authorized Lead population before ordering or limiting; otherwise hidden Lead activity could affect counts or recency.

The service must re-resolve persisted Membership/Role/Team state for the request and must not trust a caller-supplied `context.role`. Suspension, removal, Role change, ownership change, Team removal, Team archive, and Session revocation take effect on the next dashboard request.

## 4. Filter contract

Supported query fields:

| Field | Values | Semantics |
| --- | --- | --- |
| `status` | `all`, `open`, `won`, `lost` | Lead outcome; default `all` |
| `stage` | `all` or one UUID | Current same-Workspace Pipeline Stage |
| `owner` | `all`, `mine`, or one UUID | Current Lead owner Membership |
| `team` | `all` or one UUID | Lead has selected persisted visible-Team assignment |
| `period` | `all`, `7d`, `30d`, `90d` | Lead `created_at` is on/after the server-computed UTC boundary; default `all` |

Rules:

- Filters combine with logical AND and are applied inside the authorized Lead CTE/population.
- `period` describes **Leads created**, not pipeline movement, conversion, revenue, or historical stage state. The UI must label a non-`all` selection accordingly, for example **“Leads created in the last 30 days.”**
- Recent activity is constrained to the filtered authorized Lead population. Its own list is the latest 10 items regardless of activity date; the Lead creation-period filter still applies to which Leads are eligible.
- Pipeline and status are current snapshots. The schema has no stage/status history suitable for historical funnel reporting.
- Owner options contain active same-Workspace Memberships represented in authorized Leads, plus `mine`. An option does not grant access.
- Owner/Admin Team options may include all active Teams in the Workspace. Member Team options include only current persisted Team memberships. A Workspace-visible Lead does not match a Team filter unless it has that selected `lead_visible_teams` assignment.
- Archived stages may be represented only when an authorized Lead still references them; mark them **Archived**, do not silently omit their Leads.
- Unknown syntax returns `400 invalid_filter`. Well-formed cross-Workspace, inactive, archived-Team, or unauthorized filter IDs return the same `404 resource_not_found`; do not disclose whether the ID exists elsewhere.
- Filters are allowlisted and normalized server-side. Ignore no unknown field silently; reject it with `400 invalid_filter` so links and analytics do not become ambiguous.
- Filter links may carry only the allowlisted fields above. They never carry Workspace, Membership, Role, visibility authority, email, or user IDs other than the validated owner filter.

## 5. Read-model contract

Implement one server-owned read service, conceptually:

```ts
crmHome(database, authenticatedIdentity, rawFilters): Promise<CrmHomeModel>
```

The service—not the page—resolves tenant authorization, parses filters, builds the authorized Lead population, and returns a presentation-safe model.

Minimum live response shape:

```ts
type CrmHomeModel = {
  source: "live";
  generatedAt: string;
  workspace: { id: string; name: string };
  filters: {
    status: "all" | "open" | "won" | "lost";
    stage: "all" | string;
    owner: "all" | "mine" | string;
    team: "all" | string;
    period: "all" | "7d" | "30d" | "90d";
  };
  summary: { visible: number; open: number; won: number; lost: number };
  pipeline: Array<{ stageId: string; name: string; position: number; archived: boolean; count: number }>;
  owners: Array<{ membershipId: string; displayName: string; count: number }>;
  teams: Array<{ teamId: string; name: string; count: number }>;
  recentActivity: Array<{
    activityId: string;
    leadId: string;
    leadLabel: string;
    kind: string;
    bodyPreview: string;
    actorLabel: string;
    occurredAt: string;
  }>;
};
```

Data rules:

- Counts are non-negative PostgreSQL integer counts; do not infer missing groups from demo data.
- Return active Pipeline Stages with zero counts so the current process remains understandable. Add an archived stage only when at least one authorized filtered Lead references it.
- Owner and Team groups with no matching Leads may be omitted from metric lists but may remain in authorized filter-option metadata if the UI needs them.
- `bodyPreview` is plain text, normalized to one line, bounded to 160 characters, and rendered escaped. The dashboard is not an activity export.
- Activity kinds are labels from persisted activity records. Unknown future kinds render as **Activity**, not raw internal values.
- Ordering is deterministic: stages by `position,id`; owners/teams by count descending then normalized label and ID; activity by `created_at desc,id desc`.
- The response returns no normalized email, Session ID, Role policy JSON, hidden Lead ID, token, audit metadata, outbox state, or unbounded note body.
- This is read-only. Rendering or refreshing the dashboard creates no Audit Event, Outbox Message, idempotency record, activity, or other database mutation. Existing Session idle-touch behavior may operate as part of accepted authentication.

Use one bounded read-only database request/connection. Prefer an authorized CTE reused by aggregate queries. A read-only repeatable-read transaction may be used for cross-card consistency, but must not lock business rows. Include `generatedAt` so slight snapshot timing is visible. Do not add summary tables or schema changes for the first slice; measure before optimizing.

## 6. Demo-data isolation contract

Demo values live in a separately named immutable presentation object such as `CRM_HOME_DEMO_PREVIEW`. They must satisfy all of the following:

- never be inserted into PostgreSQL or any external store;
- never depend on Workspace, User, Lead, activity, audit, or provider data;
- never be passed into live aggregate functions;
- never emit audit/outbox/business events;
- never appear in CSV/PDF/export, API integrations, notifications, forecasts, billing, or entitlement checks;
- never be used to decide visibility, ownership, priority, conversion, project health, delivery status, or access;
- remain identical across tenants except presentation localization; and
- carry an explicit typed/source discriminator such as `source: "demo"`, while live sections carry `source: "live"`.

Do not expose demo preview values from a general CRM data API. Prefer composing them in the page/presentation layer after the authorized live model succeeds. A test must prove that changing demo constants causes no database query or persisted side effect.

When live data fails, do not show a full dashboard of demo cards that could be mistaken for the tenant's workspace. Show the live error first and keep the demo region collapsed or visibly unavailable beneath it.

## 7. Route, caching, and response behavior

- Canonical page: `GET /crm/home`.
- Optional JSON read route, only if the client needs filter refresh without navigation: `GET /api/crm/home` using the exact same server service and authorization contract.
- Treat both as dynamic authenticated responses. Do not statically generate, pre-render across users, or place them in a shared/CDN cache.
- Send `Cache-Control: private, no-store, max-age=0` for JSON. The page must use the framework's current no-store/dynamic mechanism and avoid cached helpers whose key omits User, Workspace, Membership, Team state, or filters.
- Browser back/forward may restore visual state, but refresh must resolve current Session, authorization, and metrics from PostgreSQL.
- Do not use service workers, local storage, session storage, cookies, or URL fragments as metric caches or authority.
- If client-side filter navigation races, only the latest request may update the visible dashboard; abort or ignore older responses.

## 8. Safe navigation

Allowed live destinations:

- `/crm` for Lead results;
- `/crm/pipeline` for stage results;
- `/crm/leads/:leadId` for an ID returned in the authorized recent-activity model;
- `/crm/leads/new` for the existing Add Lead journey.

Generate paths server-side or with fixed route builders. Never accept a return URL, protocol, host, or arbitrary path from dashboard data. Preserve only validated dashboard filters. Destination routes independently reauthorize; dashboard inclusion never grants future access.

Demo preview cards must not deep-link to unimplemented Deal, Project, Delivery, or Report routes. Use **Coming later** rather than `#`, `javascript:`, or fabricated URLs.

## 9. Error and empty-state contract

| Condition | Behavior |
| --- | --- |
| No valid Session | Existing sign-in redirect with bounded `next=/crm/home` |
| Active identity but no active Workspace Membership | Existing Workspace selection/create recovery; no metrics |
| Suspended/removed User, Membership, or Workspace | Generic authenticated access denial/redirect; no existence detail |
| Invalid filter syntax | `400 invalid_filter`, **“Review the dashboard filters and try again.”** |
| Well-formed unauthorized/cross-tenant filter | `404 resource_not_found`, **“This dashboard view is unavailable.”** |
| Database/read failure | `500 dashboard_unavailable`, **“We couldn’t load your CRM overview. Try again.”** |
| No authorized Leads | Zero live cards, empty pipeline stages, **“No leads to summarize yet.”**, **Add lead** |
| Filters match no Leads | Zero live cards, **“No leads match these filters.”**, **Clear filters** |

Do not reveal row counts from another tenant, hidden Lead/Team/owner names, SQL text, stack traces, database health, query timing, or whether a cross-tenant identifier exists. Log a bounded correlation identifier server-side; it is not an Audit Event and must not contain filter secrets or raw note bodies.

The page may render independent live sections together from one model. If a single aggregate cannot be produced safely, fail the live dashboard rather than mixing old and new data. Demo previews never serve as fallback metrics.

## 10. Product and accessibility requirements

- Visible H1: **CRM home**. Support: **“See the customer work you can access in this workspace.”**
- Live and demo regions use separate headings and programmatic landmarks.
- Every live metric includes a text label; charts have an equivalent list/table. Color is not the only status signal.
- Filter controls have labels, a visible **Apply filters** action unless implemented as accessible navigation, and **Clear filters** when active.
- Loading preserves layout and states **“Loading CRM overview…”**. Result changes announce a concise summary through a polite live region.
- At 320 px, cards stack, charts become readable lists, labels do not truncate essential meaning, and there is no page-level horizontal overflow.
- At 200% zoom, keyboard navigation, focus indicators, demo badges, empty/error states, and links remain usable.
- Demo badges and explanatory copy must be available to assistive technology; a color treatment alone is insufficient.
- Primary product action remains **Add lead**. The dashboard must accelerate the existing Lead journey rather than present unavailable modules as equal actions.

## 11. Acceptance test matrix

### PostgreSQL integration

1. Owner/Admin counts include all Leads in their Workspace and exclude every other Workspace.
2. Member counts include Workspace-visible, owned, and current-Team-visible Leads and exclude hidden-Team Leads.
3. Summary, stage, owner, Team, and activity aggregates all use the same authorized Lead population.
4. Hidden Lead activity cannot affect counts, latest-activity order, labels, or timestamps.
5. A forged caller Role does not expand metrics; persisted Role is authoritative.
6. Membership suspension/removal and Session revocation deny the next request.
7. Team Membership removal and Team archive remove Team-derived visibility on the next request while preserving access through any independent Workspace/ownership rule.
8. Cross-tenant stage/owner/team filter UUIDs return tenant-safe not-found and reveal no label/count.
9. Filter intersections (`status + stage + owner + team + period`) return exact deterministic counts.
10. Period boundaries use server UTC and test exactly-before/exactly-at timestamps.
11. Active zero-count stages and referenced archived stages follow the response rules.
12. Activity preview is escaped/bounded; unknown kinds map to the generic label.
13. Dashboard reads create no CRM activity, Audit Event, Outbox Message, or idempotency record.
14. Database failure returns the safe dashboard error without partial live metrics.

### Unit/route

1. Allowlisted filters parse and canonicalize; unknown fields/values fail with `invalid_filter`.
2. `mine` resolves to persisted Membership ID, never a client-provided identity.
3. Live links contain only fixed local routes and validated query fields.
4. Demo models have `source:"demo"`; live models have `source:"live"`; type/tests prevent combining them.
5. Demo constants do not call repositories, write audit/outbox, or enter exports.
6. Authenticated page/API responses are private/no-store and have no shared cache behavior.
7. JSON/error serialization contains no Session, email, SQL, hidden identifier, raw note body, or stack trace.

### Playwright

1. Owner and Member see different live totals from the same seeded Workspace according to visibility.
2. Applying and clearing filters updates every live section consistently and survives refresh through URL state only.
3. A recent-activity link opens an authorized Lead; a removed Team membership makes the same direct link tenant-safe unavailable after refresh.
4. Empty Workspace and no-match states keep **Add lead**/**Clear filters** usable.
5. Live-data failure cannot make demo values look live.
6. Every demo card visibly and accessibly states **Demo preview** and has no fabricated feature link.
7. Opaque Session/logout/protected-route behavior remains unchanged.
8. Keyboard, 320 px, 200% zoom, chart alternatives, loading, and error announcements pass.

## 12. Delivery boundary

Develop may implement this dashboard locally using the accepted CRM tables and authorization predicate. No migration is required for the first slice. If a metric cannot be computed truthfully from current data, it belongs in the separated Demo preview region or is omitted.

This contract does not authorize Deals, revenue, conversion analytics, Projects, delivery records, reporting infrastructure, forecasts, exports, automation, billing, provider integrations, or generalized data warehousing. It does not reopen deferred pre-UAT hardening.

Product decisions required only if the mock conflicts with this contract:

- whether `/crm/home` later replaces `/crm` as the default CRM landing route;
- final visual copy/order for static Demo preview cards; and
- whether to omit demo previews entirely in UAT/production until those modules exist.

None of those decisions block implementation of the live tenant-scoped CRM snapshot.
