# UAT-GAP-013 audited-denial pool-lifecycle remediation handoff

Date: 2026-08-24

Status: **IMPLEMENTATION COMPLETE — GO FOR FRESH BACKEND/SECURITY AND ARCHITECTURE REVIEW; NO-GO FOR INTEGRATION OR RELEASE**

## Authority and immutable source

- Product implementation authorization: bounded remediation of P1 `UAT-GAP-013` only.
- Architecture authority: `7d9b42b`, `docs/architecture/uat-gap-013-audited-failure-pool-lifecycle-decision.md`.
- Fresh baseline: `e0ad785d3efe5ef16a995602aad1e24affe34acb`.
- Implementation commit: `4393974a728dbfa6497460bec5f0aa921858cf3c`.
- Branch: `codex/uat-gap-013-pool-lifecycle-remediation`.

Rejected `v0.5.0-uat.7` remains immutable and diagnosis-only. This increment did not access or change UAT, tags, database schema, migrations, Caddy, Compose, provider, protected configuration, DNS, TLS, infrastructure, production, or Phase 5.

## Exact implementation

The implementation adds only the required `await` to the route-owned `auditedFailure(...)` branch at all ten Architecture-listed call sites:

1. invitation list `GET` and create `POST` in `src/app/api/workspaces/[workspaceId]/invitations/route.ts`;
2. invitation resend in `src/app/api/workspaces/[workspaceId]/invitations/[invitationId]/resend/route.ts`;
3. invitation revoke in `src/app/api/workspaces/[workspaceId]/invitations/[invitationId]/revoke/route.ts`;
4. Membership Team assignment in `src/app/api/workspaces/[workspaceId]/memberships/[membershipId]/teams/route.ts`;
5. ownership transfer in `src/app/api/workspaces/[workspaceId]/ownership/transfer/route.ts`;
6. Role-policy update in `src/app/api/workspaces/[workspaceId]/roles/[roleId]/policy/route.ts`;
7. Workspace settings `GET` in `src/app/api/workspaces/[workspaceId]/settings/route.ts`;
8. Team update in `src/app/api/workspaces/[workspaceId]/teams/[teamId]/route.ts`; and
9. Teams `GET` in `src/app/api/workspaces/[workspaceId]/teams/route.ts`.

Route delta: **9 files, 10 insertions, 10 deletions**. Every insertion is the explicit await. Existing `pool.end()`, `serviceOwnsDenial ? failure(error) : ...` splits, action/target metadata, target IDs, request IDs, response mapping, guards, authorization, rate limits, service calls, transactions, and success paths are byte-semantically unchanged.

No shared/global pool, retry, background Audit, helper refactor, response redesign, or denial-audit broadening was added.

## Regression evidence added

- `tests/uat-gap-013-audited-failure-lifecycle.test.ts`:
  - asserts the exact ten authorized handler/file pairs;
  - parses TypeScript AST and requires each route-owned `auditedFailure` call to be awaited before its awaited `pool.end()`; and
  - scans every API Route Handler so a future pool-owning handler cannot return an un-awaited `auditedFailure` Promise.
- `tests/uat-gap-013-route-lifecycle.integration.test.ts`:
  - invokes all ten handlers with valid request shape and no Session;
  - proves bounded 401 `authentication_required`, one minimized system denial Audit per request, zero success Audit, zero Outbox/idempotency/rate/business mutation, and no disclosure;
  - proves authenticated wrong-Workspace and insufficient-permission tenant-safe 404 attribution;
  - proves an existing service-owned invitation denial remains singular;
  - injects delayed failing Audit persistence and proves rollback, original 401 preservation, one pool close, no committed Audit, healthy database, and no unhandled rejection;
  - delays successful Audit persistence and proves `pool.end()` occurs only after Audit completion; and
  - runs 12 mixed affected-handler denials concurrently, requiring 12 bounded responses, 12 unique Audits, exactly 12 independent pool closes, no duplicate/cross-request failure, and no unhandled rejection.
- `docs/engineering/uat-gap-013-route-lifecycle-inventory.md` preserves the pre-implementation exhaustive inventory, safe comparisons, adjacent characterization boundary, and test contract.

The Architecture-excluded adjacent question—service/route Audit ownership in mutation routes without a `serviceOwnsDenial` flag—was not changed. The required accepted service-owned representative remains singular. Any broader normalization requires separate authority.

## Verification results

All commands ran against the exact implementation tree.

| Gate | Result |
| --- | --- |
| `git diff --check` | PASS |
| Focused AST/direct lifecycle suite | **2/2 PASS** |
| Focused route lifecycle PostgreSQL suite | **15/15 PASS** |
| Fresh PostgreSQL migration apply + idempotent rerun | **PASS / PASS** |
| Fresh PostgreSQL lifecycle + existing Audit/Role route suites | **25/25 PASS** |
| Existing serialized tenant-admin stale/ownership/Slice 4 suites | **32/32 PASS**, including existing invitation concurrency orders |
| Full direct/unit `npm test` | **246 PASS, 139 PostgreSQL-gated skips**, 23 passing files / 16 skipped files |
| Full ESLint | PASS |
| TypeScript `npx tsc --noEmit` | PASS |
| Next.js 16.3.1 production build | PASS; 42/42 static generation tasks and all dynamic API routes emitted |
| Production-build HTTP probes | **3/3 PASS**: Workspace settings GET, invitation GET, invitation POST |

The production probes used an isolated, freshly migrated PostgreSQL 16 container and synthetic local-only production configuration. All three routes returned HTTP 401 `authentication_required`, a bounded request ID, and no pool/SQL/stack/Workspace/target disclosure. PostgreSQL recorded exactly three minimized system denials, zero business rows, and no success/Outbox/idempotency side effects. The successful server emitted no `Cannot use a pool after calling end on the pool`, unhandled rejection, or error output. The isolated container was removed after verification.

One contained evidence-harness attempt used an unavailable local database hostname and correctly failed with `getaddrinfo ENOTFOUND` before the valid probe run. It touched only the isolated local test target. The probe was restarted with a resolvable loopback-only hostname, then passed as recorded above; this is not application-failure evidence.

## Security and transaction disposition

- No-Session denial is 401 rather than empty 500.
- Wrong-Workspace and insufficient-permission responses remain minimized 404.
- Route-owned denial Audit completes before pool shutdown and commits exactly once when available.
- Injected Audit failure rolls back/releases without replacing the original denial or leaking failure detail.
- Concurrent requests retain independent request IDs, pools, and Audits.
- Denied routes create no success Audit, Outbox, idempotency, rate, tenant, invitation, Team, Membership, or Workspace mutation.
- Workspace Session/Membership/Role, Owner/Admin/Member authority, ownership, Team, visibility, entitlement, and tenant-safe response contracts are unchanged.

## Rollback and review request

Rollback is omission/revert of implementation commit `4393974`; it requires no schema or data rollback.

Backend/Security review should independently verify all ten call sites, AST completeness, 401/404 and disclosure contracts, exact Audit cardinality/minimization, failure rollback/client release, pool ordering, concurrency, and unchanged service-owned branches. Architecture should then compare the immutable candidate against `7d9b42b`.

Integration, pushing main, creating a later UAT tag, deployment, tester admission, controlled-recipient email, and Phase 5 remain prohibited until both reviews ACCEPT and Product separately authorizes each next step.
