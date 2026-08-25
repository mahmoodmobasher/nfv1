# P1A-01 PostgreSQL remediation evidence

Date: 2026-08-25. Runtime: native PostgreSQL with the accepted 15-migration ledger. Planner setting `enable_seqscan=on`; the executable evidence does not alter planner behavior. No schema, migration, index, or data-repair change is part of this candidate.

## Correctness, atomicity, and concurrency

- Phone validation completes before transaction entry. Every rejected class snapshots and proves zero delta across `leads`, `lead_intakes` (durable idempotency authority), `lead_activities`, `lead_identity_reviews`, `lead_identity_candidates`, `lead_identity_decisions`, `lead_identity_decision_heads`, `contacts`, `companies`, `audit_events`, and `outbox_messages`.
- Accepted formatted, leading-1, and international inputs assert persisted display, E.164, actual calling code, and `p1a-identity-v2`. Blank phone plus valid email is equivalent to absent phone for replay; absent email plus blank phone rejects with no durable receipt.
- Request-hash fixtures prove unchanged replay and changed display, canonical phone, effective national country, and semantic body conflicts. Explicit international input is country-selector independent because its effective country is null.
- Compatible v1/v2 identity serialization uses the same stable sorted email/phone/Company advisory namespace. The controlled regression retains a v1 pending review and races its resolution against v2 intake for the same email, phone, and Company. Candidate recheck after the final lock produces one canonical Contact/Company outcome, a truthful held/review result for the waiter, no missed candidate, no partial mutation, and no deadlock.
- Existing injected failures still roll back Lead, intake outcome, review/candidate/head, governing Audit, and every required outbox boundary. Retry with the same key succeeds after the fault is removed. Accepted commands retain exactly one governing Audit and exact unique required event set; replay adds none.
- Canonical list/detail success and denial snapshot the same protected table set plus Lead versions, timestamps, assignment, visibility, review/decision state, Audit, and outbox. Every GET is zero-write.
- List visibility runs in tenant-scoped SQL. Tests cover a sparse Member beyond the former 201-row boundary, multi-page stage/search filters, null assignment, Team visibility removal, role/session/assignment loss, identical-timestamp keysets, and concurrent update semantics with no duplicate/skip for the documented traversal.
- The current-disclosure fixture changes Lead/authority facts between the presentation snapshot and serialization. A separate fresh transaction must reject drift; capabilities use the fresh role. Cross-Workspace and guessed identifiers remain indistinguishable `resource_not_found`.
- Legacy PATCH rejects canonical intake lineage before body parsing or legacy update invocation. Route and modular gates prove zero mutation and no canonical DTO path to the legacy required-field editor.

## Representative scale and exact public-operation latency

Fixture at measurement: 100,001 Leads, 100,030 Contacts, 25,010 Companies, 10,001 pending reviews, and 10,030 identity candidates in one Workspace. The protected full review contains 30 candidates (10 per evidence class). The sparse Member has 450 invisible Leads ahead of 50 visible Team Leads. Each distribution contains exactly 30 observations.

| Operation | p50 | p95 | Target |
| --- | ---: | ---: | ---: |
| Owner Lead detail | 2.439 ms | 3.050 ms | <200 ms |
| Owner default Lead list | 3.604 ms | 4.404 ms | <200 ms |
| Owner stage-filtered list | 3.682 ms | 4.977 ms | <200 ms |
| Owner cursor page | 3.561 ms | 5.298 ms | <200 ms |
| Owner real substring search (`scale lead 999`) | 60.446 ms | 69.538 ms | <200 ms |
| Pipeline stage registry | 1.357 ms | 1.719 ms | <200 ms |
| Sparse Member detail | 2.898 ms | 3.787 ms | <200 ms |
| Sparse Member default list | 81.424 ms | 95.917 ms | <200 ms |
| Sparse Member real substring search (`scale lead`) | 122.725 ms | 131.213 ms | <200 ms |
| Protected review queue | — | 10.370 ms | <200 ms |
| Protected 30-candidate detail | — | 4.852 ms | <200 ms |
| Contact email candidate | — | 0.255 ms | <100 ms |
| Contact phone candidate | — | 0.229 ms | <100 ms |
| Contact name + Company candidate | — | 0.484 ms | <200 ms |
| Company name candidate | — | 0.171 ms | <200 ms |
| Canonical manual intake | — | 4.737 ms | <500 ms |

Public list output is capped at 50; SQL reads one additional sentinel solely to calculate `hasMore`. Search evidence is the real application `position(... lower(concat_ws(...)))` predicate, not a surrogate exact-email lookup.

## Default-planner `EXPLAIN (ANALYZE, BUFFERS)` evidence

| Exact path | Principal access path | Execution |
| --- | --- | ---: |
| Contact email | `contacts_workspace_email_idx` | 0.022 ms |
| Contact phone | `contacts_workspace_phone_idx` | 0.191 ms |
| Contact name + Company | `contacts_workspace_name_company_idx` + `companies_workspace_name_idx` | 0.332 ms |
| Company name | `companies_workspace_name_idx` | 0.177 ms |
| Pending review queue | `lead_identity_reviews_workspace_state_idx`, 50 rows | 0.310 ms |
| Presentation review queue | same review index + `lead_identity_candidates_workspace_review_id_uq`, 51 refs | 0.848 ms |
| Queue target freshness/cap | candidate review index + partition window, 80 rows | 0.580 ms |
| Full candidate detail | `lead_identity_candidates_review_idx` + per-class window, 30 rows | 0.557 ms |
| Owner Lead detail | `leads_workspace_id_id_uq` | 0.312 ms |
| Owner default Lead list | backward `leads_workspace_updated_idx`, 51 sentinel rows | 0.883 ms |
| Owner stage-filtered list | tenant-leading Lead update index + stage filter | 0.434 ms |
| Owner exact cursor page | tenant-leading `(workspace_id,updated_at,id)` condition; exact microsecond boundary, 51 rows | 0.249 ms |
| Owner real substring search | tenant-leading Lead update index + real filter, 51 rows | 45.169 ms |
| Platform visibility participant | Team membership/visibility indexes | 0.376 ms |
| Membership presentation | Workspace membership + user indexes | 0.096 ms |
| Team presentation | Workspace Team index | 0.085 ms |
| Company presentation | Company primary key + Workspace/status filter | 0.036 ms |
| Pipeline stage registry | Workspace Pipeline-stage index + bounded order | 0.077 ms |
| Sparse Member default Lead list | tenant-leading Lead index + Platform disclosure subplan, 50 rows after 450 invisible | 100.652 ms |
| Sparse Member real substring search | same disclosure plan + real substring filter, 50 rows | 115.134 ms |

The executable test logs complete plans as `P1A_PLAN_EVIDENCE` and exact distributions as `P1A_PERFORMANCE_EVIDENCE`. It explicitly rejects sequential scans on `leads`, `contacts`, `companies`, `lead_identity_reviews`, and `lead_identity_candidates`. All plans are Workspace-qualified, and no new index is indicated.

## Validation commands

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with zero errors; one pre-existing unused-variable warning remains in the out-of-scope Dev1 browser test.
- focused contract/module suite: 31/31 passed.
- focused manual-intake/presentation PostgreSQL suite: 70/70 passed.
- ordinary full Vitest suite: 326/326 active tests passed; environment-gated integration tests skipped there by design.
- full serialized PostgreSQL suite: 235/235 passed across 23 files; the explicit performance file is separately gated.
- `RUN_P1A_PERFORMANCE=1 npx vitest run tests/p1a-performance.integration.test.ts --no-file-parallelism --maxWorkers=1 --testTimeout=180000`: 1/1 passed.
- Next.js 16.3.1 production build: passed, including the Lead collection/detail and Pipeline-stage dynamic routes.

Exact pass counts and the immutable candidate SHA are recorded in `/private/tmp/nexaflow-p1a01-uat-defects-dev2-remediation-completion.md` at handoff.
