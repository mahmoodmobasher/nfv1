# Feature 2 Work Item 2 — authority-aware role controls

Date: 2026-08-21

Status: **Work Item 2 complete; ready for Architecture and Graphics re-review.**

## Delivered boundary

- Role mutation treats caller context only as a hint. Before replay or target access, one transaction locks and revalidates the active User, owned Session, revocation/idle/absolute expiry, matching security version, active Workspace, active actor Membership, and persisted Role.
- It then locks the tenant-scoped target and requires an active non-self, non-Owner membership. Generic Owner input is impossible at route validation and rejected by the service boundary. Suspended, removed, cross-tenant, self, Owner, stale-version, Admin, and Member bypass attempts make no role/version/success-audit/idempotency change.
- Owner Member→Admin and Admin→Member writes atomically update one Membership version, one safe `workspace.membership_role_changed` audit, and one replay record. Denials produce bounded safe denial evidence without duplicate service/route audits.
- People and invitation choices are derived from persisted server policy. Owner sees Member/Admin, Admin sees Member only, Member has no invitation action, and generic controls never contain Owner.
- Member→Admin uses the approved alert-dialog title/body, Cancel-first focus, focus containment, Escape cancellation, trigger restoration, `Saving role…`, and authoritative success state.
- Stale authority is an alert with **Reload latest**, refreshing people and actor capabilities and removing stale options. Rows and invitation entries expose associated busy/status/error semantics.
- Narrow layout keeps page-level width bounded while the native People table remains an explicit internal horizontal scroll region at 320px and browser 200% zoom.

## Exact verification

- Docker Compose status: PostgreSQL 16 and Mailpit both **healthy**, bound to `127.0.0.1` (`54329`, `1025`, `8025`).
- Focused PostgreSQL WI2 matrix: **5/5 passed**. It covers both Owner transitions, replay, exactly-one audit, Admin/Member ceilings, Owner input, self/Owner/inactive/cross-tenant targets, stale/forged context, user/session/security/workspace/membership invalidation, concurrent writes, and direct route bypass.
- Complete PostgreSQL integration regression: **95/95 passed across 10 files**.
- Unit/direct-route suite: **36/36 passed**; 95 integration-gated cases skipped in the non-DB command and executed successfully by the integration command above.
- Focused Work Item 2 Playwright: **2/2 passed** (desktop authority/keyboard/stale reload/Admin invitation and 320px/browser-200%-zoom).
- Relevant existing tenant-admin Playwright: **2/2 passed** (multi-entry invitation partial retry and People suspend/restore/remove regression).
- Complete Playwright diagnostic: **11/15 passed** serially. The four failures are pre-existing/out-of-scope stale journeys: old CRM mobile trigger name (`Open navigation` vs implemented `Open CRM navigation`), old post-join heading (`Welcome to your workspace` vs current Leads home), an obsolete native-dialog expectation for the accepted custom Team confirmation, and a pre-existing invitation resend timing assertion. None intersect the WI2 role implementation; all WI2-focused and directly relevant journeys pass.
- `npm run lint`: passed.
- `npm run build`: passed on Next.js 16.3.1; TypeScript passed and all 30 pages generated.

## Review disposition

All Work Item 2 Product checklist items are checked. Architecture should re-review the locked transactional authority boundary, atomic audit/idempotency behavior, and adversarial evidence. Graphics should re-review server-derived invitation choices, elevation dialog, stale-authority reconciliation, live regions, keyboard behavior, and 320px/200% evidence.

No workspace switcher or Feature 3 work was performed.
