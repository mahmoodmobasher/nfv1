# CRM Home Dashboard Architecture Review

Status: **ACCEPT**  
Review date: 2026-08-21  
Scope: implemented `/crm/home` against `crm-home-dashboard-contract.md`  
Review threshold: material cross-tenant exposure/mutation, authentication bypass, false data authority, or broken primary dashboard only  
Boundary: local source and local tests only; no external system accessed

## Verdict

The authenticated CRM home dashboard is accepted. The implementation uses server-derived identity and persisted tenant authorization, builds every live metric and recent activity item from one filtered authorized Lead population, executes the aggregate in a read-only repeatable-read transaction, and keeps static future-module previews visibly and structurally separate from PostgreSQL and business authority.

No material cross-tenant, authentication, or data-authority blocker was found. The focused primary dashboard journey passes. Deferred pre-UAT hardening is not reopened by this decision.

## Evidence reviewed

- `docs/architecture/crm-home-dashboard-contract.md`
- `docs/engineering/crm-home-dashboard-checkpoint.md`
- `/crm/home` page, loading UI, demo presentation object, protected CRM navigation, and linked Lead list behavior
- CRM home read model, filter parser, link builders, tenant/session context, and accepted Lead visibility services
- Dashboard unit/route, PostgreSQL integration, and focused CRM Playwright tests

Independent focused results:

| Check | Result |
| --- | --- |
| Dashboard unit and route tests | **5/5 passed** |
| Dashboard PostgreSQL integration | **4/4 passed** |
| Focused CRM/dashboard Playwright journey | **1/1 passed** |

The checkpoint's broader evidence—36/36 normal selected tests, 82/82 serial PostgreSQL tests, lint, production build, and dynamic route generation—is consistent with the inspected implementation. Unrelated legacy/Slice 4 browser failures are outside this narrow dashboard decision because the focused dashboard journey passes and they do not execute its read service.

## Contract assessment

### Server-derived tenant context — ACCEPT

The page first resolves the opaque Session through the accepted server identity path. The dashboard read then independently joins persisted Session, active User/security version, active Workspace, active Membership, and persisted Role using `userId + sessionId + workspaceId`. It accepts no caller Role, Membership, Team membership, visibility, or Workspace authority from dashboard filters or demo state.

Revoked/expired Session, suspended Membership, inactive Workspace, or mismatched User/Session cannot produce an actor row. PostgreSQL evidence covers Membership suspension and Session revocation. The dashboard renders no live or demo metrics when its live read fails.

### Member visibility union — ACCEPT

The `authorized_leads` population implements the required union:

- persisted Owner/Admin: every Lead in the active Workspace;
- Member: Workspace-visible Leads;
- Member: Leads owned by the persisted Membership; and
- Member: Leads assigned to one of the actor's current persisted active Teams.

Team-derived visibility joins active Teams and current Team Memberships. Removal of Team Membership takes effect on the next read. An owned Lead remains visible through ownership independently of a Team being archived, which is the intended union behavior.

All downstream summary, stage, owner, Team, and activity queries derive from `filtered_leads`, which derives only from this authorized population. There is no aggregate-all-then-filter pattern.

### Filters and tenant-safe references — ACCEPT

The parser allowlists exactly status, stage, owner/mine, Team, and period; rejects unknown keys, arrays, invalid enums, and malformed UUIDs; applies filters with logical AND inside the authorized population; and computes Lead-created period boundaries from server time.

Stage, owner, and Team UUIDs are validated against options derived from the current actor and Workspace. Well-formed cross-tenant or unauthorized IDs return the same safe `resource_not_found`. `mine` resolves inside SQL to the persisted actor Membership. Filter values cannot grant visibility.

The linked Lead list preserves only the allowlisted fields and retains its own Workspace/Lead visibility predicate. Fixed local route builders do not accept protocol, host, return URL, Workspace, Role, or visibility authority.

### Repeatable-read and no business side effects — ACCEPT

The dashboard checks out one connection and executes one `REPEATABLE READ READ ONLY` transaction. The aggregate takes no business-row lock and performs no dashboard write. Source inspection shows no Audit Event, Outbox Message, CRM activity, idempotency record, or business mutation. PostgreSQL evidence proves Audit, Outbox, and activity counts are unchanged across the dashboard read. Existing Session idle-touch behavior remains an accepted authentication side effect outside the dashboard aggregate.

### Hidden activity exclusion — ACCEPT

Recent activity joins `lead_activities` to `filtered_leads` on both Lead and Workspace before ordering and limiting. Hidden and cross-tenant activities therefore cannot influence list membership, recency, labels, counts, or previews.

The fixture places newer hidden and cross-tenant activity around authorized activity and verifies the Member result excludes the hidden Lead. Activity bodies are normalized to one line, bounded to 160 characters, escaped by React, and unknown kinds map to the generic **Activity** label.

### Safe links and primary journey — ACCEPT

Dashboard links are fixed to `/crm`, `/crm/pipeline`, `/crm/leads/new`, authorized Lead detail IDs, or an in-page recent-activity anchor. The Lead destination reauthorizes direct access. Demo cards contain no anchors or fabricated feature routes.

The focused browser journey proves authenticated dashboard rendering, live Lead/Won totals, authorized recent activity, filter apply/refresh/no-match/clear behavior, navigation, five demo cards with no links, and 320-pixel navigation/overflow behavior.

### Static demo isolation and truthful labeling — ACCEPT

Deals, Conversion, Projects, Delivery, and Reporting exist only in `CRM_HOME_DEMO_PREVIEW`, a separately named and frozen presentation constant with `source: "demo"`. The server read model independently returns `source: "live"` and imports no demo values.

The page composes demo cards only after a successful authorized live model. On any live read error it renders `DashboardError` and explicitly shows neither workspace metrics nor sample previews. The demo region and every individual card state **Demo preview**, repeat **“Sample values only — this feature is not connected to workspace data.”**, and end with **Coming later**.

No demo value enters SQL, tenant authorization, aggregate calculations, audit, outbox, activities, exports, alerts, or business decisions. There is no general dashboard JSON/export route carrying demo values and no Deal/Project/Delivery/Reporting destination.

### Dynamic/no-store behavior — ACCEPT

`/crm/home` is explicitly dynamic and resolves current cookie/session/database state on every request. No cached helper, service worker, browser storage, shared cache, or static generation path is used. There is no optional JSON dashboard endpoint requiring a separate cache header.

## Bounded non-blocking findings

These do not meet the material blocker threshold and do not prevent continued product work:

1. **Browser role breadth:** PostgreSQL tests prove Member visibility and hidden-activity exclusion, while the focused browser journey uses an Owner. Add a compact Member browser assertion when the dashboard suite is next expanded; do not create a separate gate for it.
2. **Safe error HTTP semantics:** the server component renders safe invalid-filter/not-found content after catching domain errors, but current tests do not assert an HTTP 400/404 status at the page boundary. The data is denied safely and no identifier is disclosed. If Product/API consumers require status semantics, add a thin JSON route or route-level handling and assertions later.
3. **Integration assertion clarity:** the Owner activity test's explicit `not.toContain` comparison uses the other tenant Membership ID rather than the other tenant Lead ID. The newer cross-tenant activity is still excluded implicitly by the asserted ordering, but the direct assertion should use the Lead ID when this fixture is next touched.

## Authorization and next scope

The `/crm/home` slice is accepted for local product delivery. Develop may proceed with user-visible CRM improvements while preserving:

- the persisted Member visibility union;
- aggregate-from-authorized-population ordering;
- repeatable-read/read-only behavior;
- tenant-safe filter resolution and destination reauthorization;
- no-store authenticated rendering; and
- strict `live` versus `demo` type, labeling, persistence, event, export, and link separation.

Deals, conversion authority, Projects, Delivery, reporting, forecasting, exports, and other future modules remain unimplemented. Static preview cards do not authorize those data models or capabilities.
