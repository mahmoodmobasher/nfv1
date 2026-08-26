# DB-08A dormant Deals/Pipeline database handoff

## Candidate identity

- Product freeze: `docs/product/db-08-deals-pipeline-product-freeze.md` (read from the canonical Product checkout).
- Exact base: `62b1ed09398b79d826cec8c612976f0e24ff4f49`.
- Branch: `codex/db-08a-deals-pipeline-v2`.
- Replaces rejected candidate `5534f4d81e61a4aeac3e003d49bf2e06e54a7dd4`; that SHA must not integrate.
- Candidate: the single commit containing this handoff; Product records the immutable SHA after commit.
- Migration: `0022_db_08_deals_pipeline_v1.sql`, journal index `22`, timestamp `1787768262741`; resulting ledger has 23 entries.
- DB-07 remains deferred and is not required by this additive, opaque-RecordRef package.

## Physical package

The migration adds seven empty, dormant, Sales-owned tables: `sales_pipelines`,
`deal_stage_definitions`, `deals`, `deal_party_refs`, `deal_visible_teams`,
`deal_stage_transitions`, and `lead_deal_conversion_lineage`. Existing
`pipeline_stages` and all retained rows remain untouched.

Workspace-qualified keys and `NO ACTION` foreign keys retain owned records.
Company, Contact, and Lead references are opaque typed UUID RecordRefs with no
cross-owner target foreign keys or copied authority data. Money is an all-null
or complete `(numeric(20,0) amount_minor, USD|CAD currency_code, exponent 2)`
tuple. Database constraints cover lifecycle/outcome/close tuples, stage/outcome
agreement, 1..20 party and Team slots, active uniqueness, versions, idempotency
identities, and bounded codes. Four narrow triggers make pipeline code and stage
code/outcome immutable and make transition/conversion evidence insert-only.

## Evidence

All tests used disposable local PostgreSQL databases; none touched UAT.

- Focused database suite: 2 files, 13 tests passed.
- Fresh install: healthy, seven new tables empty, exact 23-entry ledger/head.
- No-op: second migration run retained the same ledger count and head.
- Forward rehearsal: exact `0021_db_00a_01_platform_audit_target_lookup` state to
  `0022`; retained legacy `pipeline_stages` count/digest stayed byte-stable and
  every new table remained empty.
- Failure/rollback: deliberate late failure removed every DB-08A relation and
  retained the 22-entry pre-DB-08A ledger.
- Constraint/concurrency: money, lifecycle, outcome/stage, slots, opaque refs,
  `NO ACTION`, immutability, and insert-only evidence were exercised. Concurrent
  races for active default pipeline, customer Company, Contact slot, primary
  Contact, and Lead conversion each proved one winner and one unique rejection;
  the three party races also proved surviving cardinality one.
- Keysets: Deal list, board stage, populated active party reverse lookup, stage
  history, responsible Membership, responsible Team, and overdue candidates each
  traversed exactly 100 unique IDs in five 17-row pages, one 15-row page, and an
  empty terminal page. Timestamp/date ties crossed page boundaries; exact tuple
  cursors produced no omission or duplicate.
- Planner/catalog: plans selected the frozen Deal list, board, stage-history,
  responsible-Membership, responsible-Team, and overdue indexes. PostgreSQL
  selected the stricter active-party uniqueness index for the populated active
  reverse query; catalog evidence separately proves the frozen general reverse
  index has `(workspace_id, record_type, record_id, lifecycle, deal_id)` order.
- Transaction fidelity: every test transaction, including fixture setup and
  planner `SET LOCAL`, used one acquired `PoolClient` through commit/rollback and
  released it in `finally`.
- Privacy: evidence/reference tables contain no copied names, labels, email,
  phone, affiliation, narrative, payload, authorization, or money fields.
- Static fidelity: `npx tsc --noEmit`, scoped ESLint, and `npx drizzle-kit check`
  passed; snapshot, migration, schema, and journal agree.
- Runtime drift: the candidate changes only the seven Product-authorized paths;
  no runtime, route, allowlist, bootstrap, UI, backfill, activation, deployment,
  or UAT files are changed.

## Dormant boundary and limitations

This package creates no pipeline or stage rows and activates no feature. Future
services must atomically enforce complete party/Team sets, active-stage selection,
responsibility/visibility authorization, optimistic version increments, Audit and
Outbox writes, governing-operation semantics, and the Leads-owned conversion
command. The database intentionally permits temporarily incomplete aggregate sets
inside that future service transaction boundary. No reconciliation, backfill,
cutover, rollback execution, deployment, or main integration was performed.
