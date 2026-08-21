# Feature 2 Work Item 3 — stale-data handling

Date: 2026-08-21

Status: **Complete; ready for Architecture and Graphics re-review.**

## Delivered behavior

- Every role, suspend, restore, and remove request sends the last confirmed Membership version. The client does not optimistically change authority, Role, status, or available actions.
- Every successful mutation performs a fresh no-cache People read and replaces role, status, version, actor-derived capabilities, and role choices with server-authoritative values before announcing success.
- A version conflict leaves the last confirmed values visible, announces the conflict as an alert, and exposes **Reload latest**. Reload announces completion and returns focus to the affected control.
- A tenant-safe denial caused by stale actor authority or a stale/removed/suspended target automatically reloads People and capabilities. Stale role/action controls disappear before another submission can be made.
- Row controls are disabled while their mutation is pending. Failed and conflicted requests never commit draft UI state.
- The service remains the security boundary: it transactionally locks and revalidates User, Session, security version, Workspace, actor Membership and persisted Role, then locks the active target and applies expected-version predicates. Client state is never trusted as authority.

## Exact evidence

- Focused PostgreSQL WI2/WI3 matrix: **8/8 passed across 2 files**. The three new tests prove serial concurrent role conflict/reload/retry, exact two-success audit and idempotency effects, suspended/removed target denial without overwrite, and lifecycle conflict preserving the newer server state. The five WI2 tests retain adversarial actor/target and atomic audit coverage.
- Complete PostgreSQL integration regression: **98/98 passed across 11 files**.
- Unit and direct-route suite: **36/36 passed across 9 files**; **98** database-gated cases were skipped by that command and executed successfully by the integration command above.
- Focused and relevant browser regression: **7/7 passed**. Coverage includes two-tab concurrent edits, visible conflict, authoritative reload, exact-once retry effects, stale target suspension/removal auto-reconciliation, stale actor authority, elevation confirmation, Admin invitation choices, 320px/browser-200% usability, multi-entry invitation regression, and suspend/restore/remove regression.
- `npm run lint`: passed.
- `npm run build`: passed with Next.js 16.3.1, including TypeScript and all 30 generated pages.

## Stale-bypass proof

In the browser matrix, a second tab submits version 1 after the first tab committed version 2. PostgreSQL rejects the stale write; the UI retains the confirmed prior display and requires an authoritative reload. A retry uses the newly read version and commits once. Separate journeys suspend or remove the target behind an open page; the stale role request is denied, triggers an automatic server reload, and removes the role control. The locked service tests independently prove stale/forged caller context and inactive targets cannot mutate Role/version, emit a success audit, or create an idempotency success record.

## Known carry-forward

The previously documented complete Playwright diagnostic remains **11/15** with four unrelated legacy expectations: the old CRM mobile trigger name, old post-join heading, obsolete native Team confirmation expectation, and invitation resend timing assertion. Work Item 3 did not touch those paths. All Work Item 3 and directly relevant Work Item 1/2 journeys pass.

No workspace selection/switcher or Feature 3 work was performed.
