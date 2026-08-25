# P1A-01 PostgreSQL gate-closure evidence

Date: 2026-08-25. Runtime: isolated native PostgreSQL using accepted migrations through `0014`; no schema changes.

## Correctness and concurrency

- Focused contract/module/route/security suite: 4 files, 15 tests passed.
- Focused P1A modular PostgreSQL suite: 22 tests passed.
- Full serialized repository PostgreSQL suite: 21 files, 187 tests passed; the performance gate is separate and was executed explicitly.
- Replay coverage binds intake and decision results to the original actor and revalidates current Workspace, Membership, Role, assignment, visibility, and disclosure. Cross-actor, authority-loss, assignment-loss, and Workspace-switch attempts return tenant-safe denial with no new effects.
- Concurrency coverage includes same-key intake, competing Hold/Resolve, same-identity distinct-key creation, and intake-versus-resolution contention. No deadlock or duplicate/partial effect was observed.
- Candidate fidelity coverage includes exact command target ID/version mismatch for Contact and Company, stale locked targets, normalized Company-domain rerun, mixed probable Contact+Company rerun, exact email/phone/name+Company per-class caps, deterministic UUID ordering, and a protected combined result of 30.
- Rollback injection covers Lead insert; review, candidate, initial decision and decision-head inserts; receipt outcome completion; governing intake Audit; both intake events; Company and Contact creation; decision append; Lead/review updates; governing Resolve Audit; every Resolve event; Hold Audit; and Hold Outbox. Every failure restores prior counts/state and the same idempotency key succeeds after the injected failure is removed.
- All nine Contact/Company `create | link | dismiss` action permutations produced one governing success Audit and their exact unique required event set; replay produced no additional Audit/event.

## Representative scale

Fixture: 100,000 Leads, 100,000 Contacts, and 25,000 Companies in one Workspace. Each p95 measurement used exactly 30 samples. Candidate, review-queue, and candidate-detail EXPLAIN evidence used bounded indexed access; statistics were refreshed before measurement.

| Query/command | Samples | Observed p95 | Target |
| --- | ---: | ---: | ---: |
| Contact normalized email | 30 | 0.230 ms | <100 ms |
| Contact normalized phone | 30 | 0.187 ms | <100 ms |
| Contact name + Company | 30 | 0.251 ms | <200 ms |
| Company normalized name | 30 | 0.154 ms | <200 ms |
| Pending review queue | 30 | 0.209 ms | <200 ms |
| Protected candidate-detail operation | 30 | 1.645 ms | <200 ms |
| Canonical manual intake | 30 | 8.004 ms | <500 ms |

The executable test logs the full measurement object as `P1A_PERFORMANCE_EVIDENCE` and asserts every target. Candidate SQL remains Workspace-leading, exact-only, deterministically ordered, and capped; no fuzzy predicate or unbounded scan was introduced.

## Commands executed

- `npx tsc --noEmit`: passed.
- scoped ESLint over backend, Workspace Lead routes, and P1A tests: passed with no findings.
- Next.js 16.3.1 production build: passed; the Lead and identity-review route handlers compiled as dynamic server routes.
- focused contract/module/route/security Vitest suite: 15/15 passed.
- focused P1A PostgreSQL Vitest suite: 22/22 passed.
- full serialized repository PostgreSQL suite: 187/187 passed across 21 files; performance test intentionally skipped there and executed separately.
- representative-scale PostgreSQL performance suite: 1/1 passed with the 30-sample results above.
- ordinary full Vitest suite: 265 active tests passed; one unchanged unrelated `design-system-boundary` test failed on the existing `box-shadow` token assertion in untouched frontend CSS. No P1A test failed.
