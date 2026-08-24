# UAT-GAP-013 pool-lifecycle remediation Architecture review

Date: 2026-08-24

Immutable candidate: `2840495bf34cf75c4e1ab1829c41facfb5844702`

Implementation: `4393974a728dbfa6497460bec5f0aa921858cf3c`

Architecture authority: `7d9b42ba9844eb0e193f7ead12a96b278d7318ff`

Fresh baseline: `e0ad785d3efe5ef16a995602aad1e24affe34acb`

Backend/Security acceptance reviewed: `4203a9cfd2b82a5083e2ffd91ab4bed0e71c4231`

Scope: independent read-only Architecture review; documentation is the only changed artifact in this worktree

## Verdict

**ACCEPT — no material Architecture blockers in immutable candidate `2840495`.**

- P0: none.
- P1: none in the candidate. `UAT-GAP-013` is implementation-remediated but remains operationally open until a separately authorized immutable attempt later than rejected `.7` proves the live denial/Audit/log contract.
- P2: none.
- P3: existing evidence-tooling and duplicate-effective-cache findings remain non-blocking, unchanged, and outside this increment.

Candidate `2840495` and fresh Backend/Security record `4203a9c` may proceed unchanged to Product-authorized controlled fresh-main integration. This acceptance authorizes no merge, push, tag, deployment, UAT access, tester admission, controlled-recipient email, configuration, database, provider, infrastructure, production, or Phase 5 activity.

## Scope and implementation findings

The candidate is based exactly on `e0ad785`; its application commit changes nine route files and exactly ten Architecture-authorized `auditedFailure(...)` branches. Every application edit adds only `await`. The complete corrected handler set is:

1. invitation list GET and invitation create POST;
2. invitation resend;
3. invitation revoke;
4. Membership Team assignment;
5. ownership transfer;
6. Role-policy update;
7. Workspace settings GET;
8. Team update; and
9. Teams GET.

The ten call sites exactly match authority `7d9b42b`. No materially identical pool-owning API handler retains a non-awaited `auditedFailure(...)` call. Invitation acceptance and Membership change remain the already-safe controls.

Existing `finally { await pool.end() }`, `serviceOwnsDenial` branches, action/target metadata, request IDs, validation, response mapping, trusted-mutation guards, rate limits, permission checks, service calls, helper implementations, success paths, and transaction ownership are byte-semantically unchanged. No shared/global pool, retry, background Audit, helper refactor, response redesign, denial-policy expansion, schema, migration, Caddy, Compose, configuration, provider, infrastructure, or tenant-authority change is present.

The corrected lifecycle is now ordered: route work rejects; route awaits `auditedFailure`; actor resolution and `safeDenialAudit` finish; the Audit client commits or rolls back and releases; the bounded failure response is created; then the route's unchanged `finally` closes its request-owned pool exactly once. The helper never owns or closes the pool.

## Response, Audit, rollback, concurrency, and disclosure findings

The focused evidence proves every valid-shape no-Session handler returns bounded HTTP 401 `authentication_required` with a UUID request ID rather than empty 500. Each normal case commits exactly one minimized system denial Audit with null Workspace, actor, Membership, Session, and target; the approved route action; `denied`; `authentication_required`; matching request ID; and only bounded `tenant_admin_denial` metadata.

Authenticated wrong-Workspace and insufficient-permission representatives retain tenant-safe HTTP 404 with minimized actor-only attribution and no unverified Workspace, Membership, or target association. Service-owned invitation denial remains singular, so the await correction does not duplicate route/service Audit ownership.

Denied requests create no Workspace, Membership, invitation, Team, Team-membership, Outbox, idempotency, rate-limit, or success-Audit mutation. An injected delayed Audit failure rolls back and releases, commits no Audit, preserves the original 401, closes the pool once, leaves PostgreSQL healthy, and emits no unhandled rejection. Delayed success proves Audit settlement precedes pool closure. Twelve simultaneous mixed denials produce twelve bounded responses, distinct request IDs and Audits, and twelve independent single pool closes without cross-request, duplicate, pool-ended, or unhandled failure.

Response checks exclude pool, PostgreSQL, SQL, stack, Workspace-ID, and target-ID disclosure. The code delta introduces no path for tokens, cookies, request bodies, emails, credentials, unverified tenant identifiers, or Audit failure detail to reach response, Audit metadata, or logs.

Authorization and Workspace Foundation truth are unchanged: trusted active Workspace Session context, active Membership, Owner/Admin/Member authority, ownership invariants, Team and visibility access, entitlements, tenant-safe not-found behavior, success transactions, and service-owned denial behavior retain their prior source.

## Evidence reviewed

Architecture independently verified:

- exact `e0ad785` ancestry and candidate inventory;
- exact ten-call-site await-only application diff;
- `git diff --check`: pass;
- focused AST/source invariant: **2/2 pass**;
- full direct suite: **246/246 executable tests pass**, with 139 PostgreSQL-gated tests skipped by design;
- ESLint: pass;
- TypeScript: pass; and
- Next.js 16.3.1 production build: pass, including all affected dynamic routes and 42/42 static generation tasks.

Candidate evidence and fresh Backend/Security acceptance `4203a9c` independently report:

- fresh migration apply and idempotent rerun: pass/pass;
- focused PostgreSQL lifecycle suite: **15/15 pass**;
- lifecycle plus existing Audit/Role authority suites: **25/25 pass**;
- PostgreSQL health after injected failure/concurrency: pass;
- broader existing serialized tenant-admin suites: **32/32 pass** in the implementation handoff; and
- production-build HTTP evidence: **3/3 pass** for settings GET, invitation GET, and invitation POST, with three minimized Audits, zero business/Outbox/idempotency effects, and no pool-ended or unhandled server error.

The peer review could not independently repeat the container HTTP probe because its local Docker daemon was unavailable. This is not contradictory evidence: it independently exercised all ten route handlers against a fresh isolated PostgreSQL cluster, rebuilt the production artifact, and reviewed the candidate's recorded production-build HTTP evidence. Fresh public runtime proof remains a mandatory deployment gate.

## Controlled integration and later-than-`.7` prerequisites

Controlled fresh-main integration: **GO**, only for immutable candidate `2840495`, Backend/Security record `4203a9c`, and this Architecture record, unchanged and under separate Product authorization.

Integration must preserve exact candidate/review ancestry or byte identity and rerun the focused AST and serialized PostgreSQL lifecycle gates, direct tests, lint, TypeScript, and production build. Any conflict, missing handler/await, response-status change, missing or duplicate Audit, disclosure, pool error, scope expansion, or Workspace/security-authority change stops integration and requires fresh review.

Rejected `v0.5.0-uat.7` must never be moved, repaired, or reused. After accepted integration, Product may separately authorize a new immutable attempt later than `.7`. Before tester admission or controlled-recipient email, that attempt must freshly prove:

1. exact integrated source/image provenance and normal disposable-UAT preflight;
2. unauthenticated settings GET plus at least one affected read and one affected mutation route return bounded 401;
3. exactly one minimized denial Audit per probe and zero business/Outbox mutation;
4. no `Cannot use a pool after calling end on the pool`, unhandled rejection, SQL/stack disclosure, or fatal app log; and
5. the remaining minimum disposable-UAT acceptance gates that stopped after `UAT-GAP-013` in `.7`.

Rollback is omission/revert of implementation `4393974` and its immutable image. No schema, data, Caddy, configuration, provider, or infrastructure rollback is required.
