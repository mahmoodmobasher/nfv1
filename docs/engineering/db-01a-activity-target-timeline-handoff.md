# DB-01A Activity target timeline handoff

## Identity and boundary

- Exact base: `920cbf50f24ae1c42e540668ce35ec8eea0c8aea`.
- Branch: `codex/db-01a-activity-target-timeline`.
- Migration: `0024_db_01a_activity_target_timeline`; ledger index 24 / 25 entries; timestamp `1787782332432`.
- Seven database-only files. No runtime, writer activation, legacy reconciliation, deployment, or UAT mutation.

## Contract

DB-01A adds the non-content ordering projection `activity_record_references.occurred_at timestamptz NOT NULL` and index `(workspace_id, record_type, record_id, occurred_at DESC, activity_id DESC)`. This permits Lead-target keyset traversal to start from the target stream rather than scanning the Workspace activity timeline.

Migration posture A is deliberately fail-closed: both dormant DB-01 tables, `activity_records` and `activity_record_references`, must be empty. Any residue raises stable error `db_01a_activity_tables_must_be_empty`; no row is inspected, deleted, copied, reconciled, or backfilled. Legacy Leads-owned `lead_activities` is outside the precondition and remains unchanged.

The Activities-owned `activity_reference_derive_occurred_at_v1` trigger locks and reads the same-Workspace root on reference insert or relevant update. It fills an omitted projection, accepts an exactly equal supplied value, and rejects missing/cross-Workspace roots or a mismatch without disclosing root content. `activity_record_freeze_referenced_occurred_at_v1` rejects root chronology changes after a reference exists. Root insertion followed by reference insertion in one PoolClient transaction is supported. Other activity fields are unaffected.

The existing one-target reference primary key and `crm.lead` type constraint remain authoritative. All FKs retain `NO ACTION`; only the same-owner timestamp is projected. Subject, details, direction, outcome, creator, authorization facts, and legacy Lead activity facts are not copied or indexed.

## Intended query

Filter `activity_record_references` by Workspace, `crm.lead`, and Lead ID; apply the strict cursor `(ref.occurred_at, ref.activity_id) < ($occurredAt, $activityId)`; order both fields descending; request `pageSize + 1`; then join `activity_records` by the Workspace-qualified key. Runtime must still authorize the current-visible Lead before create/list and keep protected activity text out of Audit, Outbox, and idempotency payloads.

## Evidence

- Fresh and exact-0023 forward-empty migration, health, ledger 25/head, and no-op rerun.
- Root-only and referenced residue rejection with unchanged ledger, schema, and rows.
- Late-statement rollback after the column statement.
- Trigger derivation, direct mismatch, cross-Workspace root rejection, and referenced-root time immutability.
- Bounded deterministic traversal of 100 target activities amid 100 newer unrelated same-Workspace activities with a page-size-plus-one sentinel, equal-time ties crossing a page boundary, unique IDs, no omissions, and a terminal empty page.
- Catalog fidelity for the exact target timeline index and `occurred_at NOT NULL`, plus execution of the intended target-filtered tuple-cursor query shape. This package makes no large-row or latency claim.
- TypeScript, scoped ESLint, Drizzle no-drift, snapshot fidelity, and diff checks.

Future activity rescheduling/editing requires a separately frozen projection maintenance/version contract; it is not implied by this create/list-only package.
