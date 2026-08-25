# P1A-01 PostgreSQL gate-closure evidence

Date: 2026-08-25. Runtime: local PostgreSQL 16-compatible native instance on an isolated database with accepted migrations through `0014`; no schema changes.

## Correctness and concurrency

- Accepted schema + modular backend + legacy CRM: 3 files, 38 tests passed.
- Full serialized repository PostgreSQL integration suite: 21 files, 181 tests passed; the performance gate is intentionally separate and was executed explicitly.
- P1A modular suite: 16 tests passed, covering secure replay after cross-actor, assignment, Membership, visibility, and Workspace changes; explicit Hold replay/conflict; competing Hold/Resolve; same-identity distinct-key serialization; stale candidates; >10 caps/order; cross-tenant denial; all nine Contact/Company action permutations with exact replay event sets; and no-leak cardinality.
- Write-boundary injection covered Company insert, Contact insert, decision append, Lead link update, review transition, governing Audit, and each required Resolve Outbox topic. Every injected failure preserved the pending review and restored all table counts.
- Accepted schema suite covers all Contact/Company `create | link | dismiss` permutations and effective decision transition enforcement.

## Representative scale

Fixture: 100,000 Leads, 100,000 Contacts, and 25,000 Companies in one Workspace; statistics refreshed with `ANALYZE`.

| Query/command | Samples | Observed p95 | Target | Plan evidence |
| --- | ---: | ---: | ---: | --- |
| Contact normalized email | 30 | 0.535 ms | <100 ms | `contacts_workspace_email_idx`; execution 0.017 ms; 4 shared-buffer hits |
| Contact normalized phone | 30 | 0.261 ms | <100 ms | `contacts_workspace_phone_idx`; execution 0.009 ms; 4 shared-buffer hits |
| Contact name + Company | 30 | 0.417 ms | <200 ms | `companies_workspace_name_idx` + `contacts_workspace_name_company_idx`; execution 0.032 ms; 8 shared-buffer hits |
| Company normalized name | 30 | 0.295 ms | <200 ms | `companies_workspace_name_idx`; execution 0.009 ms; 4 shared-buffer hits |
| Canonical manual intake | 30 | 8.665 ms | <500 ms | full transaction; minimum 3.881 ms, maximum 33.897 ms |

All representative candidate plans used Index Scan/Index-supported nested-loop access. None used an unbounded sequential scan of Leads, Contacts, or Companies. Candidate SQL remains Workspace-leading, exact-only, deterministically ordered, and capped; no fuzzy predicate was introduced.

## Commands executed

- `tsc --noEmit`
- focused ESLint over P1A backend, routes, and tests
- focused contract/module/route/security Vitest suite
- accepted-schema, modular intake, and legacy CRM PostgreSQL Vitest suite with one worker
- representative-scale PostgreSQL performance Vitest suite
- full repository Vitest suite, with the separately recorded unrelated design-token baseline failure unchanged

The final ordinary full suite produced 263 passing active tests and one unchanged unrelated `design-system-boundary` failure for the existing `box-shadow` token assertion. No P1A test failed.
