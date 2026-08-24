# UAT-GAP-013 audited-denial pool-lifecycle Architecture decision

Date: 2026-08-24

Current main authority: `e0ad785d3efe5ef16a995602aad1e24affe34acb`

Deployed application authority: `386d10c5cc8eee9ff9f6d622d1a1e1a144c06ef2`

Observed release: rejected `v0.5.0-uat.7`

Scope: documentation-only Architecture decision; no application, UAT, main, tag, database, provider, configuration, or infrastructure mutation

## Decision

**GO — implement the bounded ten-handler route-level await correction and focused lifecycle regressions. NO-GO for integration or another UAT attempt until fresh Backend/Security and Architecture reviews accept the immutable candidate.**

`e0ad785` changes only release evidence relative to deployed application authority `386d10c`; the affected application source is byte-identical. The reproduced P1 is caused by an async JavaScript lifecycle rule: returning the unresolved `auditedFailure(...)` Promise enters the route `finally`, closes the request-owned PostgreSQL pool, and only then allows denial attribution/Audit work to continue. The result is an empty HTTP 500 and `Cannot use a pool after calling end on the pool` instead of the bounded original denial.

The correction must preserve the accepted tenant-admin service, Audit helper, response mapper, pool ownership, authorization, and transaction contracts. A shared wrapper refactor is not required for this expedited remediation.

## Complete materially identical scope

The following ten handlers call asynchronous `auditedFailure(...)` without awaiting it and close the same pool in `finally`. All ten are mandatory remediation scope:

1. `GET /api/workspaces/[workspaceId]/invitations` — `src/app/api/workspaces/[workspaceId]/invitations/route.ts`;
2. `POST /api/workspaces/[workspaceId]/invitations` — the same file's non-service-owned denial path;
3. invitation resend — `src/app/api/workspaces/[workspaceId]/invitations/[invitationId]/resend/route.ts`;
4. invitation revoke — `src/app/api/workspaces/[workspaceId]/invitations/[invitationId]/revoke/route.ts`;
5. membership Team assignment — `src/app/api/workspaces/[workspaceId]/memberships/[membershipId]/teams/route.ts`;
6. ownership transfer — `src/app/api/workspaces/[workspaceId]/ownership/transfer/route.ts`;
7. Role-policy update — `src/app/api/workspaces/[workspaceId]/roles/[roleId]/policy/route.ts`;
8. `GET /api/workspaces/[workspaceId]/settings` — `src/app/api/workspaces/[workspaceId]/settings/route.ts`;
9. Team update — `src/app/api/workspaces/[workspaceId]/teams/[teamId]/route.ts`; and
10. `GET /api/workspaces/[workspaceId]/teams` — `src/app/api/workspaces/[workspaceId]/teams/route.ts`.

The following are inspected controls, not remediation targets:

- invitation acceptance and Membership change already use `await auditedFailure(...)` before `pool.end()`;
- `auditedMutationGuard(...)` owns its separate pool and awaits `safeDenialAudit(...)` before closing it;
- recent-auth routes await `safeDenialAudit(...)`;
- routes returning synchronous `failure(...)`, including Workspace-settings PATCH and Team POST, cannot exhibit this specific Promise/finally race; and
- CRM/account/identity routes that do not call `auditedFailure(...)` are outside this defect family.

This decision does not authorize broad denial-audit completion work, response redesign, route reformatting, or conversion of unrelated pools to global/shared lifetime.

## Required implementation contract

Backend must make the smallest explicit correction at each of the ten call sites:

- await `auditedFailure(...)` before returning its response, either as `return await auditedFailure(...)` or by assigning `const response = await auditedFailure(...)` and then returning it;
- retain each route's existing `finally { await pool.end() }`;
- retain the `serviceOwnsDenial ? failure(error) : ...` split, adding await only to the route-owned denial branch; and
- make no semantic change to action names, target types, target IDs, response mapping, permission checks, rate limits, mutation guards, service calls, or success paths.

Do not attempt to fix the race by removing `pool.end()`, starting background Audit work, swallowing the returned Promise, adding arbitrary delay/retry, moving pool closure into `auditedFailure`, sharing a mutable global pool, or making denial Audit fire-and-forget. Those alternatives either leak resources, preserve the race, obscure ownership, or enlarge the blast radius.

## Await, transaction, and ownership guarantees

The route exclusively owns the pool returned by `localDatabase()` and must close it exactly once after every awaited route activity settles. `auditedFailure` borrows that live pool; it must never close it.

`auditedFailure` must complete, in order:

1. generate the bounded request ID;
2. resolve only trusted actor context when available;
3. await `safeDenialAudit`;
4. allow `safeDenialAudit` to acquire and release its client and complete commit or rollback; and
5. create the original bounded failure response.

Only after those steps may the route's `finally` await `pool.end()`.

The existing denial Audit remains an isolated best-effort transaction. A normal denial must commit exactly one denial event. If Audit persistence is deliberately failed, `safeDenialAudit` must roll back/release cleanly and the route must still return the original bounded denial rather than convert it to 500 or disclose database detail. Success Audit/Outbox/business mutations remain governed by their existing service transactions and must not be created on a denied route.

No retry is added. Concurrent requests retain independent request-owned pools and request IDs. One request's Audit failure, pool closure, or response must not affect another request.

## Denial and disclosure contract

For the reported no-Session case, every affected handler reached with otherwise valid inputs must return HTTP 401 with bounded `authentication_required` JSON and its request ID. It must commit exactly one system denial Audit when the database is available, with no actor, Membership, Workspace, unverified target ID, token, cookie, submitted body, email, or synthetic path identifier recorded.

Authenticated but unselected/wrong-Workspace access must retain tenant-safe 404 behavior. Authenticated permission and trusted-mutation denials must retain their existing 403 or service-defined bounded status. Route-owned and service-owned branches must produce exactly one denial Audit, never zero from premature pool close and never two from both layers.

Public bodies, headers, and logs must not expose stack traces, SQL, connection details, internal identifiers, credentials, request bodies, or Audit failure details. The exact pool-shutdown error must disappear for the covered routes.

## Mandatory regression evidence

The immutable candidate must include:

1. a source/AST-style invariant that fails if any pool-owning route returns `auditedFailure(...)` without awaiting it;
2. direct route tests for every one of the ten handlers using valid request shape and no Session, asserting bounded 401 rather than empty 500;
3. freshly migrated PostgreSQL tests proving exactly one corresponding denial Audit per route, zero business mutation, zero success Audit, and zero Outbox side effect;
4. authenticated wrong-Workspace and insufficient-permission representatives proving tenant-safe 404/403 and no unverified target/workspace attribution;
5. service-owned denial representatives proving the existing route/service split does not duplicate Audit;
6. an injected late Audit-write failure proving rollback/client release, preservation of the original denial response, pool close only after the Audit Promise settles, and no unhandled rejection;
7. a deterministic concurrency test with multiple simultaneous affected-route denials proving independent responses/Audits and no pool-ended, double-close, connection-leak, or cross-request failure;
8. explicit lifecycle instrumentation or a delayed Audit barrier proving `pool.end()` is not invoked before `auditedFailure` settles;
9. existing serialized tenant-admin PostgreSQL, unit/direct, lint, TypeScript, and production-build gates; and
10. bounded production-build HTTP probes for at least Workspace settings plus one read and one mutation route from another affected family, with log assertions for absence of `Cannot use a pool after calling end on the pool` and unhandled rejection/error output.

Tests must preserve the accepted Workspace Foundation: trusted active Workspace Session context, active Membership, fixed Owner/Admin/Member authority, ownership constraints, Team/visibility access, Audit minimization, and entitlements. No test may weaken expected responses merely to avoid the Audit path.

## Review, integration, release, and rollback gates

Backend owns the ten-call-site correction and deterministic tests. Backend/Security must independently verify complete scope, response/Audit cardinality, transaction rollback, pool ordering, concurrency, disclosure, and unchanged authorization. Architecture must then review the exact immutable candidate and fresh Backend/Security record.

Controlled integration is **NO-GO** until both reviews ACCEPT. Integration must use a fresh `e0ad785` baseline, preserve exact candidate/review ancestry or byte identity, and rerun the focused lifecycle/PostgreSQL suite, direct tests, lint, TypeScript, and production build. Any conflict, missing handler, non-awaited Audit path, response-status change, duplicate/missing Audit, pool error, scope expansion, or Workspace/security-authority change stops integration and requires fresh review.

The correction is application-only: no migration, Caddy, Compose, protected environment, database, provider, DNS, TLS, or infrastructure change is authorized. Rollback is omission/revert of the exact application increment and its immutable image. No data rollback is required because the change must add no schema or business mutation.

Rejected `v0.5.0-uat.7` must never be moved, repaired, or reused. After accepted integration, Product may separately authorize a new immutable UAT attempt later than `.7`; it must rerun the minimum disposable-UAT admission gates affected by the stop, including fresh unauthenticated denial/Audit/log evidence before controlled-recipient email or cohort creation.

## Final disposition

P0: none identified.

P1: open `UAT-GAP-013`; bounded remediation is authorized as specified.

P2: none newly identified within this decision.

P3: existing evidence-tooling and duplicate-effective-cache findings remain non-blocking and unchanged.

**GO for implementation and tests only. NO-GO for integration, tag, deployment, tester admission, Phase 5, or production until the stated independent gates pass.**
