# Feature 2 — Membership Lifecycle Implementation Checkpoint

Date: 2026-08-21  
Feature stage: **In implementation**  
Increment: **Work item 1 — Membership lifecycle UI**

## Delivered

- Added Suspend and Remove controls for eligible active Memberships.
- Added Restore and Remove controls for eligible suspended Memberships.
- Removed Memberships remain visible as historical records and direct administrators to re-invite rather than silently reactivate.
- Added accessible confirmation dialogs with access-impact copy, cancel-first focus, Escape handling, focus containment, and trigger-focus restoration.
- Added actor-aware disabled states for self, Owner, and targets above an Admin's authority ceiling.
- Added loading, success, seat-limit, general failure, and stale-version recovery states.
- Added **Reload latest** recovery that reads current server state and focuses the affected person.
- Updated the client from the authoritative mutation result after every success.
- Restricted server lifecycle transitions to `active → suspended|removed` and `suspended → active|removed`; invalid and no-op transitions do not increment versions.
- Added distinct transactional success audits: `workspace.membership_suspended`, `workspace.membership_restored`, and `workspace.membership_removed`.
- Retained tenant scoping, persisted actor/Role resolution, expected-version enforcement, seat-capacity checks, idempotency, and bounded denial auditing.

## Validation evidence

- Unit suite: **36 passed**.
- Focused PostgreSQL tenant-administration suite: **24/24 passed**.
- Complete PostgreSQL regression suite: **90/90 passed** across nine files.
- Focused Playwright lifecycle journey: **1/1 passed**.
- ESLint: **passed**.
- Next.js production build and TypeScript validation: **passed**; 30 routes generated.

The focused browser test verifies disabled Owner actions, confirmation UX, persisted suspend/restore/remove states, refreshed table state, removed-Membership guidance, and the three distinct success audits.

## Scope held

- No Workspace switcher or active-Workspace selection work was started.
- No Feature 3 personal profile/preferences/security work was started.
- Removed Membership reactivation remains invitation-only, consistent with the approved contract.

## Next work item

Proceed to **Work item 2 — Authority-aware role assignment**, followed by stale-data handling. Feature 2 is not yet accepted.
