# P1A-01 PostgreSQL gate-closure evidence

Date: 2026-08-25. Runtime: isolated native PostgreSQL using accepted migrations through `0014`; no schema changes.

## Correctness and concurrency

- Focused contract/module/route/security suite: 4 files, 17 tests passed.
- Focused P1A presentation/transaction PostgreSQL suites: 2 files, 27 tests passed.
- Full serialized repository PostgreSQL suite: 22 files, 192 tests passed; the performance gate is separate and was executed explicitly.
- Replay coverage binds intake and decision results to the original actor and revalidates current Workspace, Membership, Role, assignment, visibility, and disclosure. Cross-actor, authority-loss, assignment-loss, and Workspace-switch attempts return tenant-safe denial with no new effects.
- Concurrency coverage includes same-key intake, competing Hold/Resolve, same-identity distinct-key creation, and controlled intake-versus-resolution contention. The deadlock regression holds the shared Contact advisory key externally, waits until resolution holds the matching Company row and blocks on that Contact key, then starts intake with a distinct Company key that resolves to the same Company row. `pg_blocking_pids` must prove `barrier -> resolution -> intake` before the barrier is released. Both commands then complete, so the test cannot pass through serial scheduling and would expose the former Contact-before-Company inversion.
- Candidate fidelity coverage includes exact command target ID/version mismatch for Contact and Company, stale locked targets, normalized Company-domain rerun, mixed probable Contact+Company rerun, exact email/phone/name+Company per-class caps, deterministic UUID ordering, and a protected combined result of 30.
- Rollback injection covers Lead insert; review, candidate, initial decision and decision-head inserts; receipt outcome completion; governing intake Audit; both intake events; Company and Contact creation; decision append; Lead/review updates; governing Resolve Audit; every Resolve event; Hold Audit; and Hold Outbox. Every failure restores prior counts/state and the same idempotency key succeeds after the injected failure is removed.
- All nine Contact/Company `create | link | dismiss` action permutations produced one governing success Audit and their exact unique required event set; replay produced no additional Audit/event.
- Presentation coverage proves Owner capabilities, Member no-link authority, assignment loss, suspended Membership, cross-tenant denial, archived-target withholding, runtime raw-field rejection, deterministic cursor continuity, filter/cursor validation, private/no-store route transport, authentication-before-filter validation, and no raw candidate email in detail or queue JSON.

## Representative scale

Fixture at measurement: 100,001 Leads, 100,030 Contacts, 25,010 Companies, 10,001 pending reviews, and 10,030 identity-candidate rows in one Workspace. The protected measured review contains exactly 30 candidates: 10 email, 10 phone, and 10 name+Company. Statistics were refreshed before EXPLAIN and latency measurement. PostgreSQL reported `enable_seqscan=on`; the test does not alter planner settings. Each p95 measurement used exactly 30 samples.

| Query/command | Samples | Observed p95 | Target |
| --- | ---: | ---: | ---: |
| Contact normalized email | 30 | 0.277 ms | <100 ms |
| Contact normalized phone | 30 | 0.188 ms | <100 ms |
| Contact name + Company | 30 | 0.408 ms | <200 ms |
| Company normalized name | 30 | 0.197 ms | <200 ms |
| Protected review-queue operation | 30 | 4.357 ms | <200 ms |
| Protected candidate-detail operation | 30 | 2.762 ms | <200 ms |
| Canonical manual intake | 30 | 5.525 ms | <500 ms |

Default-planner EXPLAIN ANALYZE observations:

| Path | Chosen plan/index | Execution | Buffers |
| --- | --- | ---: | --- |
| Contact email | Index Scan, `contacts_workspace_email_idx` | 0.021 ms | 4 shared hits |
| Contact phone | Index Scan, `contacts_workspace_phone_idx` | 0.188 ms | 4 shared hits |
| Contact name+Company | Nested Loop using `contacts_workspace_name_company_idx` and `companies_workspace_name_idx` | 0.340 ms | 9 shared hits, 2 reads |
| Company name | Index Scan, `companies_workspace_name_idx` | 0.170 ms | 4 shared hits |
| Pending review queue | Index Scan, `lead_identity_reviews_workspace_state_idx`; estimated/actual result population 10,001, bounded to 50 | 0.262 ms | 52 shared hits |
| Protected presentation queue | Backward `lead_identity_reviews_workspace_state_idx`, then candidate lookups through `lead_identity_candidates_workspace_review_id_uq`; 51 review refs/80 joined rows/36 kB sort | 0.661 ms | 221 shared hits |
| Queue target freshness/cap | `lead_identity_candidates_workspace_review_id_uq` plus partition window; 51 review IDs/80 rows | 0.525 ms | 120 shared hits |
| Full capped candidate detail | `lead_identity_candidates_review_idx` plus evidence partition window; actual 30 rows/29 kB sorts | 0.482 ms | 16 shared hits |

The executable test logs the complete plans as `P1A_PLAN_EVIDENCE` and the exact 30-sample measurements as `P1A_PERFORMANCE_EVIDENCE`. It explicitly rejects sequential scans on `leads`, `contacts`, `companies`, `lead_identity_reviews`, and `lead_identity_candidates`. Candidate SQL remains Workspace-leading, exact-only, deterministically ordered, and capped; no fuzzy predicate or unbounded scan was introduced.

## Commands executed

- `npx tsc --noEmit`: passed.
- scoped ESLint over backend, Workspace Lead routes, and P1A tests: passed with no findings.
- Next.js 16.3.1 production build: passed; the Lead and identity-review route handlers compiled as dynamic server routes.
- focused contract/module/route/security Vitest suite: 17/17 passed.
- focused P1A presentation/transaction PostgreSQL suites: 27/27 passed.
- full serialized repository PostgreSQL suite: 192/192 passed across 22 files; performance test intentionally skipped there and executed separately.
- representative-scale PostgreSQL performance suite: 1/1 passed with the 30-sample results above.
- ordinary full Vitest suite: 267 active tests passed; one unchanged unrelated `design-system-boundary` test failed on the existing `box-shadow` token assertion in untouched frontend CSS. No P1A test failed.
