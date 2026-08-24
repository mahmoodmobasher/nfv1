# UAT-GAP-013 audited-denial pool-lifecycle Backend/Security peer review

Date: 2026-08-24

Reviewer: Dev3 Backend/Security

Immutable candidate: `2840495bf34cf75c4e1ab1829c41facfb5844702`

Implementation: `4393974a728dbfa6497460bec5f0aa921858cf3c`

Architecture authority: `7d9b42ba9844eb0e193f7ead12a96b278d7318ff`

Baseline: `e0ad785d3efe5ef16a995602aad1e24affe34acb`

## Decision

**ACCEPT for controlled integration without modification. NO-GO for deployment until Architecture accepts this same immutable candidate and Product separately authorizes a new immutable UAT attempt later than rejected `v0.5.0-uat.7`.**

- P0: none.
- P1: none in the candidate. `UAT-GAP-013` remains operationally P1/open until a separately authorized later-than-`.7` release proves the live denial/Audit/log contract.
- P2: none.
- P3: existing evidence-tooling and duplicate-effective-cache findings remain non-blocking, unchanged, and outside this increment.

Rejected `v0.5.0-uat.7` must not be moved, repaired, or reused.

## Scope and implementation review

- `e0ad785` is the exact candidate merge base. The only candidate commits are implementation `4393974` and docs-only handoff `2840495`.
- The application delta is exactly ten additions of `await` at the Architecture-listed route-owned `auditedFailure(...)` calls in nine route files. `git diff --check` passes.
- The ten handlers are invitation list GET/create POST, invitation resend, invitation revoke, Membership Team assignment, ownership transfer, Role-policy update, Workspace settings GET, Team update, and Teams GET.
- Existing `finally { await pool.end() }`, action/target metadata, validation, response mapping, rate limits, permission checks, service calls, success paths, and transaction ownership are unchanged.
- Invitation create/resend/revoke retain `serviceOwnsDenial ? failure(error) : await auditedFailure(...)`; therefore service-owned mutation denials remain singular and route-owned pre-service denials are awaited.
- No matcher, Proxy, Caddy, Compose, schema, migration, provider, environment, Workspace authorization, role, entitlement, ownership, Session, Outbox, or business-service behavior changed.

The AST test enumerates the exact ten handler/file pairs and requires one awaited `auditedFailure` plus awaited `pool.end()` in each. Its repository-wide scan also rejects any un-awaited `auditedFailure` within an API function that owns an awaited pool shutdown. Independent execution passed 2/2.

## Response, privacy, Audit, and transaction findings

- All ten valid-shape no-Session calls return bounded 401 `authentication_required` JSON with a UUID request ID rather than an empty 500.
- Each call commits exactly one minimized system denial Audit: null Workspace, actor, Membership, Session, and target; the approved action; `denied`; `authentication_required`; matching request ID; and only `{ "operation": "tenant_admin_denial" }` metadata.
- Response checks reject pool, PostgreSQL, SQL, stack, Workspace-ID, and target-ID disclosure. No token, cookie, submitted body, email, or unverified tenant identifier is added to Audit evidence.
- Authenticated wrong-Workspace and insufficient-permission representatives remain tenant-safe bounded 404 `resource_not_found`, with minimized `invalid_target` attribution and no unverified Workspace/Membership/target association.
- The service-owned invitation denial produces exactly one denial Audit and no invitation or Outbox row.
- Every no-Session case proves zero Workspace, Membership, invitation, Team, Team-membership, Outbox, idempotency, and rate-limit mutation; no success Audit is present.
- An injected delayed Audit trigger failure is caught by `safeDenialAudit`, rolls back, releases the client, preserves the original 401, closes the route pool exactly once, commits no Audit, leaves the database healthy, and emits no unhandled rejection.
- A delayed successful Audit trigger proves the denial Audit settles before `pool.end()` is invoked.
- Twelve simultaneous mixed affected-route denials produce twelve bounded responses, twelve distinct request IDs/Audits, twelve independent single pool closes, and no duplicate, cross-request, pool-ended, or unhandled failure.

These results are consistent with the reviewed helper contract: `auditedFailure` awaits actor resolution and `safeDenialAudit`; `safeDenialAudit` owns begin/commit-or-rollback/release but not the pool; only after it returns does the route's unchanged `finally` close that request-owned pool.

## Independent verification

All executable checks used the exact candidate tree. PostgreSQL checks used a fresh, isolated temporary local cluster and database; no shared or UAT data was accessed or changed.

| Gate | Result |
| --- | --- |
| Candidate ancestry, name/status diff, and `git diff --check` | PASS |
| Focused AST/source invariant | **2/2 PASS** |
| Fresh migration apply and idempotent rerun | **PASS / PASS** |
| Focused PostgreSQL route lifecycle suite | **15/15 PASS** |
| Lifecycle plus existing Audit/Role authority PostgreSQL suites | **25/25 PASS** |
| PostgreSQL health after failure/concurrency coverage | **PASS**, `{ ok: true }` |
| Full direct/unit `npm test` | **246 PASS**, 139 PostgreSQL-gated skips; 23 files passed / 16 skipped |
| ESLint `npm run lint -- --quiet` | PASS |
| TypeScript `npx tsc --noEmit` | PASS |
| Next.js 16.3.1 production build | PASS; all routes emitted and 42/42 static generation tasks completed |

The candidate's recorded production-build HTTP probe evidence covers Workspace settings GET, invitation GET, and invitation POST with 3/3 bounded 401 results, exactly three minimized Audits, zero business/Outbox/idempotency effects, and no pool-ended or unhandled server error. This review independently reproduced the same route behavior directly against freshly migrated PostgreSQL and independently rebuilt the production artifact. Docker/Compose probe reproduction was unavailable because the local Docker daemon was not running (`Cannot connect to the Docker daemon`); this is an environment limitation, not contradictory product evidence, and the direct PostgreSQL lifecycle coverage is broader than the three recorded HTTP probes.

## Integration, release, and rollback disposition

Backend/Security gate: **ACCEPT** immutable candidate `2840495bf34cf75c4e1ab1829c41facfb5844702` for controlled fresh-main integration unchanged.

Integration remains prohibited until Architecture accepts this exact candidate and this review record. Integration must preserve candidate byte identity/ancestry and rerun the focused AST/PostgreSQL gates, direct tests, lint, TypeScript, and production build. Any conflict, missing await, status or Audit-cardinality change, disclosure, pool error, Workspace-authority change, or expanded scope is a mandatory stop for fresh review.

Deployment remains **NO-GO**. Product must separately authorize a new immutable release later than `.7`, including disposable-UAT admission and fresh unauthenticated denial/Audit/log probes before tester admission or controlled-recipient email.

Rollback is omission/revert of implementation `4393974`; no schema or data rollback is required. No app/code change, main mutation, merge, push, tag, UAT access, configuration, database-provider, infrastructure mutation, deployment, or email occurred during this review.
