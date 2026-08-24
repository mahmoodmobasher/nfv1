# UAT-GAP-013 route lifecycle inventory

Date: 2026-08-24

Status: **READ-ONLY INVENTORY COMPLETE — SUPERSEDED BY ARCHITECTURE AUTHORITY `7d9b42b`**

Baseline: `origin/main` `e0ad785d3efe5ef16a995602aad1e24affe34acb`

This record responds to Product authorization to inventory materially identical route-owned PostgreSQL lifecycle hazards before any application edit. It does not authorize a fix, UAT mutation, tester admission, email journey, deployment, tag, or infrastructure/configuration/database change.

## Confirmed lifecycle defect

An async route that executes `return auditedFailure(...)` inside `try`/`catch` enters its `finally` without awaiting the returned Promise. Where that `finally` calls `await pool.end()`, `auditedFailure` can still be resolving identity or writing the denial Audit against the same pool.

`auditedFailure` in `src/server/tenant-admin/http.ts` awaits identity resolution and `safeDenialAudit`. `safeDenialAudit` in `src/server/tenant-admin/denial.ts` calls `await pool.connect()` before its internal `try`. If route cleanup has started pool shutdown, the connection rejection escapes, the intended bounded response is replaced by HTTP 500, and the denial Audit does not commit. Live `.7` evidence recorded three occurrences of `Cannot use a pool after calling end on the pool`, an empty public body, zero mutation, and zero denial Audit.

## Materially identical handlers

Static inspection found **10 handlers in 9 files** with the same route-owned pool, non-awaited async denial, and `finally { await pool.end() }` ordering.

| Route handler | Exact file | Hazardous denial branch |
| --- | --- | --- |
| Workspace settings `GET` | `src/app/api/workspaces/[workspaceId]/settings/route.ts` | every caught denial |
| Teams `GET` | `src/app/api/workspaces/[workspaceId]/teams/route.ts` | every caught denial |
| Team `PATCH` | `src/app/api/workspaces/[workspaceId]/teams/[teamId]/route.ts` | every caught denial |
| Role policy `PATCH` | `src/app/api/workspaces/[workspaceId]/roles/[roleId]/policy/route.ts` | every caught denial |
| Membership Teams `PUT` | `src/app/api/workspaces/[workspaceId]/memberships/[membershipId]/teams/route.ts` | every caught denial |
| Invitations `GET` | `src/app/api/workspaces/[workspaceId]/invitations/route.ts` | every caught denial |
| Invitations `POST` | `src/app/api/workspaces/[workspaceId]/invitations/route.ts` | pre-service route denial while `serviceOwnsDenial` is false |
| Invitation resend `POST` | `src/app/api/workspaces/[workspaceId]/invitations/[invitationId]/resend/route.ts` | pre-service route denial while `serviceOwnsDenial` is false |
| Invitation revoke `POST` | `src/app/api/workspaces/[workspaceId]/invitations/[invitationId]/revoke/route.ts` | pre-service route denial while `serviceOwnsDenial` is false |
| Ownership transfer `POST` | `src/app/api/workspaces/[workspaceId]/ownership/transfer/route.ts` | pre-service route denial while `serviceOwnsDenial` is false, including route rate/tenant failures |

No other `localDatabase` plus route-owned `pool.end()` handler was found to start unawaited asynchronous database work from its return path.

## Safe comparison patterns

- `src/app/api/invitations/accept/route.ts` and `src/app/api/workspaces/[workspaceId]/memberships/[membershipId]/route.ts` explicitly await `auditedFailure` before pool shutdown.
- Account profile/preferences/password and recent-auth routes explicitly await `safeDenialAudit`.
- `auditedMutationGuard` owns a separate pool and awaits its audit before closing it.
- Workspace switching awaits its denial-audit operation.
- Plain `failure(...)` is synchronous and does not use the route pool.
- Service operations and service-owned `withDenialAudit` wrappers are awaited before the route returns.

These comparisons are evidence, not a prescribed implementation. Architecture must decide whether the bounded correction is per-route awaiting, a shared route-lifecycle helper, helper hardening, or another accepted design.

## Adjacent characterization boundary

`changeTeam`, `assignMembershipTeams`, and `updateRolePolicy` already use service-owned denial auditing, while their routes do not have the `serviceOwnsDenial` distinction used by invitations, ownership transfer, and Membership changes. A post-service failure may therefore create both service and route denial Audits. This is distinct from the pool-shutdown race.

The remediation tests must characterize the existing post-service count and report any duplicate. They must not silently change audit ownership unless Architecture explicitly includes that behavior in the bounded scope.

## Existing evidence and coverage gap

- `tests/feature2-audit-completion.integration.test.ts` directly invokes invitation revoke and covers one route-owned denial.
- `tests/feature2-role-authority.integration.test.ts` invokes Membership `PATCH`, whose route already awaits `auditedFailure`.
- `tests/slice4.integration.test.ts`, `tests/feature2-stale-data.integration.test.ts`, `tests/ownership-remediation.integration.test.ts`, and the audit-completion suite cover service rollback, concurrency, and Audit semantics.
- No test directly invokes Workspace settings `GET`, Teams `GET`/`PATCH`, Invitations `GET`/create/resend, Membership Teams `PUT`, ownership transfer, or role-policy denial while exercising the route-owned pool lifecycle.

## Prepared regression contract

After Architecture defines the exact route family, add one table-driven PostgreSQL route-lifecycle suite for every authorized handler:

1. Invoke an unauthenticated request. Mutation routes must carry valid same-origin/CSRF evidence so the request reaches the route-owned pool rather than stopping in the pre-pool guard.
2. Assert the existing bounded HTTP 401 `authentication_required`, never 500.
3. Assert exactly one system denial Audit with the route's accepted action and reason, no success Audit, no Outbox/idempotency/business mutation, and no pool-shutdown rejection.
4. Invoke a valid User/Session from Workspace A against Workspace B. Assert the existing tenant-safe HTTP 404 `resource_not_found`, one actor-bound but target/Workspace-minimized denial Audit, and zero cross-tenant disclosure or mutation.
5. Cover the applicable bounded validation, permission, rate, stale, and conflict responses without changing their bodies/statuses.
6. Run concurrent identical pre-service denials and require every response to remain bounded, exactly one denial Audit per request, and no retry/duplicate business effect.
7. Force or delay denial-audit completion in a direct lifecycle test and prove the response waits for audit completion before the route-owned pool closes.
8. Characterize one post-service denial for each included service-audited mutation route. Treat a duplicate Audit as separate evidence unless Architecture includes audit-ownership normalization.

Add a small static/direct boundary that enumerates Architecture's exact authorized files and rejects a returned DB-backed denial Promise that is not an `AwaitExpression` before a route-owned `pool.end()`. The PostgreSQL route invocation remains authoritative; a static check alone is insufficient.

## Planned verification after implementation authority

Use the repository's isolated local PostgreSQL service and serialized execution:

```text
docker compose -f docker-compose.local.yml up -d --wait
DATABASE_URL=<local-test-database-url> npm run db:migrate
DATABASE_URL=<local-test-database-url> npm run db:migrate
RUN_DB_INTEGRATION=1 DATABASE_URL=<local-test-database-url> npx vitest run tests/tenant-admin-route-lifecycle.integration.test.ts tests/feature2-audit-completion.integration.test.ts tests/feature2-role-authority.integration.test.ts --no-file-parallelism --maxWorkers=1
RUN_DB_INTEGRATION=1 DATABASE_URL=<local-test-database-url> npx vitest run tests/slice4.integration.test.ts tests/feature2-stale-data.integration.test.ts tests/ownership-remediation.integration.test.ts --no-file-parallelism --maxWorkers=1
npx vitest run tests/tenant-admin-route-lifecycle.test.ts
npm run lint
npm run typecheck
npm run build
```

The exact package-script names and relevant installed Next.js 16.3.1 Route Handler documentation must be rechecked immediately before implementation. Production-route evidence should then prove bounded status/body/cache/privacy behavior with no pool error, identifier disclosure, or duplicate Audit.

## Architecture disposition and continuation

At the time this inventory was completed, no post-`e0ad785` Architecture decision existed in fetched refs and application/test files remained unchanged. Architecture subsequently committed `7d9b42b`, `docs/architecture/uat-gap-013-audited-failure-pool-lifecycle-decision.md`, accepting exactly the ten handlers listed above and requiring an explicit awaited `auditedFailure` at each call site.

The decision keeps `safeDenialAudit`, pool ownership, service-owned splits, response mappings, and adjacent denial-audit behavior unchanged. Backend may implement only that bounded decision and its mandatory regressions. Fresh Backend/Security and Architecture acceptance remain required before integration or release.
