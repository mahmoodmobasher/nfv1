# Feature 2 Work Item 3 — Architecture Gate Review

Status: **ACCEPT**  
Review date: 2026-08-21  
Scope: stale-data handling for Feature 2 Role and Membership mutations  
Review mode: read-only source, documentation, and local evidence; no application code or external system changed

## Final verdict

Feature 2 Work Item 3 is accepted. Current server and active People UI enforce expected-version conflicts, preserve newer server state, re-resolve persisted authority transactionally, deny inactive and cross-tenant targets, and require authoritative server reload before a stale retry can proceed.

No material blocker remains for silent overwrite, authority/session bypass, cross-tenant access, duplicate mutation/audit/idempotency effects, or the primary stale-data recovery journey.

## Evidence reviewed

- `docs/engineering/feature-2-stale-data-checkpoint.md`
- `docs/architecture/feature-2-user-role-membership-contract.md`
- accepted `docs/architecture/feature-2-work-item-2-review.md`
- `src/server/tenant-admin/role-authority.ts`
- lifecycle mutation service and Membership PATCH route
- active `src/app/workspace/settings/people/authority-people-client.tsx`
- People page and tenant-scoped People read endpoint
- `tests/feature2-role-authority.integration.test.ts`
- `tests/feature2-stale-data.integration.test.ts`
- `tests/e2e/feature2-stale-data.spec.ts`
- recorded unit, relevant browser, lint, and build evidence

An older `PeopleClient` remains in `admin-client.tsx`, but `/workspace/settings/people` imports and renders `AuthorityPeopleClient`. The obsolete component is not the Work Item 3 product path and does not undermine the accepted journey.

## Independent checks

| Check | Result |
| --- | --- |
| Focused WI2/WI3 PostgreSQL suites | **8/8 passed** |
| Complete PostgreSQL integration regression | **98/98 passed across 11 files** |
| Focused WI3 browser suite | **3/3 passed** |

Development additionally records **7/7** focused/relevant browser journeys, **36/36** unit/direct-route tests, lint success, and production build success. The independently run focused browser cases cover the material WI3 conflict and inactive-target paths.

## Material invariant assessment

### Expected-version conflict and no silent overwrite

**ACCEPT.**

- Every Role and lifecycle request sends the row's last server-confirmed Membership version.
- Server transactions lock the target, compare `expectedVersion`, and repeat Workspace/status/version predicates in the scoped update.
- A stale request rolls back and returns conflict or tenant-safe denial; it cannot overwrite the newer Role/status/version.
- Serial and concurrent PostgreSQL evidence proves one authoritative winner and preserved newer state.

### Persisted actor authority

**ACCEPT.**

The accepted WI2 Role service revalidates, in the mutation transaction and before replay/target access, the active User, owned unrevoked/unexpired Session, matching security version, active Workspace, active actor Membership, and persisted Role. Stale or forged browser state does not grant authority.

Lifecycle mutations continue to re-resolve persisted tenant actor authority under the Workspace lock. The UI consumes returned/read capabilities only for presentation; the server remains the enforcement boundary.

### Suspended, removed, and inactive target denial

**ACCEPT.**

- Generic Role mutation requires the locked target to remain active.
- A target suspended or removed after page load is denied before Role/version mutation, success audit, or idempotency result.
- Lifecycle stale-version conflicts preserve the newer status.
- Browser evidence proves both suspended and removed targets trigger reconciliation and lose stale Role controls.

### Authoritative reload after success, conflict, and denial

**ACCEPT.**

The active authority client:

- performs a `cache: "no-store"` People read after every successful Role/lifecycle mutation;
- replaces the displayed Role, status, version, and actor-derived capabilities from that server response;
- leaves confirmed values unchanged on `409`, displays an explicit conflict, and exposes **Reload latest**;
- automatically reloads after tenant-safe `404` authority/target denial; and
- removes controls no longer allowed by current persisted authority/status.

The reload endpoint derives the actor from the current Session and route Workspace and returns only tenant-scoped People data. A failed reload does not authorize or retry a mutation.

### Retry exactly once and side-effect cardinality

**ACCEPT.**

- The UI does not automatically repeat a failed mutation.
- Conflict requires an explicit authoritative reload before the user can submit a new mutation with the newly read version.
- Each retry receives a fresh idempotency key and represents one new intended state transition.
- Same-key service replay returns the original outcome without repeating mutation or audit.
- The conflict/reload/retry evidence ends at version 3 after two intended successful transitions and proves exactly two success audits and two idempotency records—none for the rejected stale attempt.
- Pending controls are disabled, preventing duplicate submissions from the same row while a request is in flight.

### Cross-tenant safety and stale-UI bypass

**ACCEPT.**

- Target reads and writes remain bound to the persisted actor Workspace.
- Cross-Workspace IDs return tenant-safe denial and cannot mutate foreign data.
- Reload uses the same authenticated tenant resolver and cannot use client-supplied Role/Membership authority.
- Stale UI can submit only a request; it cannot bypass active actor, active target, Role ceiling, Workspace, expected-version, or idempotency checks.

## Non-blocking boundaries

- The four previously recorded legacy Playwright failures concern old CRM navigation copy, an old post-join heading, an obsolete Team confirmation expectation, and invitation resend timing. They do not execute or regress the WI3 stale-data path and remain non-blocking.
- Cleanup of the obsolete unused `PeopleClient` is optional code hygiene and not a material gate item.
- Workspace switching remains a later Feature 2 work item. Feature 3 and unrelated provider/deployment hardening remain out of scope.

## Authorization

Develop may proceed to the next planned Feature 2 work item. WI3 should not be reopened unless later changes regress one of the accepted material invariants above.

