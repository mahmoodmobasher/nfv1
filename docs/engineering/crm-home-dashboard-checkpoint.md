# CRM home dashboard checkpoint

Date: 2026-08-21  
Route: `/crm/home`  
Status: implemented locally; focused dashboard acceptance checks pass

## Inputs and boundary

- Read `AGENTS.md` before editing.
- Read the relevant bundled Next.js 16.3.1 guides completely: App Router linking/navigation, Server and Client Components, data fetching, caching without Cache Components, page conventions, CSS, metadata, authentication, cookies, and Playwright testing.
- Implemented `docs/architecture/crm-home-dashboard-contract.md` and used `CRM Flow-Start Up.jpg` plus the existing accepted light CRM design as the visual/product context.
- `docs/design/crm-home-dashboard-spec.md` was not present anywhere in the workspace before or after implementation. This is the only missing requested input; no visual requirements were invented as business authority.
- No external provider, deployment, Lightsail, domain, email-provider, billing, Deals, Projects, Delivery, reporting, or migration work was performed.

## Delivered behavior

- Added the dynamic authenticated `/crm/home` route and protected Home navigation for desktop and mobile.
- Added a single server-owned dashboard read model. It uses one checked-out PostgreSQL connection and one read-only repeatable-read transaction.
- The read begins by re-resolving the active User, unrevoked/unexpired Session, active Workspace, active Membership, persisted Role, Membership version boundary, and active Team Memberships. Caller/query Role, Workspace, Membership, visibility, and Team authority are not accepted.
- Owner/Admin metrics include all current-Workspace Leads. Member metrics begin from the accepted union of Workspace-visible, owned, and current-active-Team-visible Leads. All summaries, stage distribution, owner/team groupings, and recent activities derive from the same filtered authorized Lead CTE.
- Added allowlisted AND filters for status, stage, owner/mine, team, and Lead-created period. Malformed filters fail safely; unauthorized/cross-tenant UUIDs return tenant-safe not-found from the service.
- Added active zero-count stages, referenced archived stages, deterministic ordering, bounded one-line 160-character activity previews, safe future-kind labels, generated-at time, and read-only/no-business-side-effect behavior.
- Added welcome/start, KPI, pipeline health, ownership workload, team-visible work, needs-attention, recent activity, empty/no-match/error, loading, filter-result announcement, and safe existing-route actions.
- Dashboard Lead KPI links now carry only validated filters to `/crm`; the existing Lead list applies those status/stage/owner/team/period filters and preserves them during search.
- Added a separately typed, immutable `source: "demo"` presentation object for Deals, Conversion, Projects, Delivery, and Reporting. The region and every card say `Demo preview`, repeat the exact sample-only disclosure, contain no feature links, and never enter PostgreSQL, aggregates, audits, outbox, exports, or authorization.
- Added responsive card/list layouts at 320 px, no page-level horizontal overflow in the focused browser run, semantic regions/lists, text chart alternatives, visible labels, polite status, and retained the existing 44 px mobile menu, Escape/focus-return, route-close, and secure server logout behavior.

## Verification evidence

Local services:

- PostgreSQL container: healthy, loopback `127.0.0.1:54329`.
- Mailpit container: healthy, loopback SMTP `127.0.0.1:1025`, UI `127.0.0.1:8025`.
- `npm run db:health`: `{ ok: true, latencyMs: 18 }`.

Focused dashboard checks:

- `npm test -- --run tests/crm-home.test.ts tests/routes.test.ts`: 2 files, 5/5 tests passed.
- `RUN_DB_INTEGRATION=1 npm test -- --run tests/crm-home.integration.test.ts`: 1 file, 4/4 tests passed.
- The PostgreSQL suite proves Owner tenant exclusion, Member visibility, hidden activity exclusion, persisted Team removal, archived Team handling, UTC exact-boundary filters, archived/zero-stage rules, cross-tenant filter denial, Membership suspension, Session revocation, bounded activity bodies, and unchanged Audit/Outbox/Activity row counts.
- `npx playwright test tests/e2e/crm.spec.ts --reporter=line`: 1/1 passed in 10.0 seconds. The browser journey covers persisted Lead create/edit/activity, CRM home live totals, recent activity, URL filter apply/refresh/no-match/clear destination, all five demo-only cards with no links, Home navigation, and 320 px overflow/navigation.

Regression checks:

- `npm run lint`: passed with zero warnings/errors.
- `npm test -- --run`: 9 files passed, 8 database suites intentionally skipped by the non-integration command; 36/36 selected tests passed.
- `RUN_DB_INTEGRATION=1 npm run test:integration`: 8 files, 82/82 tests passed, including the 4 dashboard tests and all existing CRM/identity/ownership/Slice 3/Slice 4 suites.
- `npm run build`: passed on Next.js 16.3.1; TypeScript passed and `/crm/home` is reported as a dynamic server-rendered route.
- `git diff --check`: passed.

Broader browser baseline:

- The dashboard-focused test passes in isolation.
- The existing default parallel `npm run test:e2e -- --reporter=line` completed 7/12 and exhibited shared-database/fixture interference (including the focused CRM test failing before dashboard navigation while another suite changed shared state).
- A serial `npm run test:e2e -- --workers=1 --reporter=line` improved this to 8/12. Four existing tenant-admin/onboarding assertions remain outside this dashboard change: stale expected mobile label `Open navigation`, stale post-invitation heading `Welcome to your workspace`, a controlled Team Membership checkbox that does not uncheck, and an old invitation-link invalidation copy assertion. None execute dashboard service code; the focused CRM/dashboard journey passes serially. They were not rewritten in this bounded package.

## Files changed for this package

- `src/app/crm/home/page.tsx`
- `src/app/crm/home/loading.tsx`
- `src/app/crm/home/demo.ts`
- `src/app/crm/crm-shell.tsx`
- `src/app/crm/page.tsx`
- `src/app/globals.css`
- `src/server/crm/home.ts`
- `src/server/crm/home-links.ts`
- `src/server/crm/leads.ts`
- `src/server/crm/page.ts`
- `tests/crm-home.test.ts`
- `tests/crm-home.integration.test.ts`
- `tests/e2e/crm.spec.ts`
- `tests/routes.test.ts`
- `docs/engineering/crm-home-dashboard-checkpoint.md`

## Remaining limitations

1. The requested design screen spec is missing. A design review should compare this implementation against that file once it is supplied.
2. There is no stage/status history, Deals, revenue, conversion, Projects, Delivery, or reporting authority. Those surfaces remain clearly isolated static demo previews by contract.
3. The four unrelated serial Playwright baseline failures above remain for their owning Slice 4/onboarding package; the dashboard-specific browser and all database regressions pass.
4. This is local-only. No production providers or external systems were accessed.
