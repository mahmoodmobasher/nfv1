# P1A-01 migration ownership and change impact

Status: implementation handoff for migration `0013_p1a_lead_intake_foundation`
Authority: frozen P1A planning package at checkpoint `e12389b7d97f6a745730f8cf89024e1c8296efd4` and the modular-monolith contract.

## Ownership and transaction boundary

| Durable data | Single logical owner | Cross-module rule |
| --- | --- | --- |
| `leads`, `lead_lifecycle_definitions` | Leads | Only Leads writes; legacy CRM requires a compatibility adapter. |
| `contacts` | Contacts | Candidate query/create/link occurs through the Contacts public contract. |
| `companies` | Companies | Candidate query/create/link occurs through the Companies public contract. |
| `lead_identity_reviews`, `lead_identity_candidates`, `lead_identity_decisions`, `lead_identity_decision_heads` | Identity Review | Lead Intake orchestrates through the Identity Review public contract. |
| `lead_intakes` manual receipt and manual intake-row authority | Leads / Lead Intake orchestrator | For this bounded slice, `lead_intakes.id` is the manual `intake_row_id` authority and owns `lead-inquiry-intake.v1` replay plus its one-Lead result. Future import rows call the same command but remain Imports-owned. |
| `audit_events` | Platform Audit | The feature supplies allowlisted action and metadata through the platform writer. |
| `outbox_messages` | Platform Outbox | The feature supplies its required versioned event set; Platform owns persistence and delivery. |
| generic idempotency mechanism | Platform Idempotency | Lead Intake owns receipt semantics and uses the platform mechanism. |

`lead-inquiry-intake.v1` owns the cross-module transaction. Canonical lock order is idempotency authority; intake receipt or row; Lead and review; Companies sorted by UUID; Contacts sorted by UUID; assignment references. Business mutations, receipt outcome, governing Audit record, and complete required outbox event set commit atomically through reviewed transaction participants. Table ownership is not relaxed by the shared PostgreSQL transaction.

## Expand, backfill, and retained-data declaration

Migration 0013 is the committed expand checkpoint and adds compatibility columns as nullable. The database migration runner commits that migration before starting retained-data work. It then backfills Leads in deterministic UUID order in transactions of at most 500 rows using `FOR UPDATE SKIP LOCKED`. Each committed batch advances `p1a_migration_checkpoints`; re-entry selects only incomplete rows, so interruption rolls back at most the active batch and resumes without rewriting completed rows. Migration 0014 is applied only after the durable checkpoint is complete and validates coverage before tightening constraints.

The backfill derives only facts already present: `display_name` from retained structured names, original source category from legacy `source`, and `received_at` from `created_at`. It does not alter Lead IDs, Workspace ownership, structured names, email, phone, company, assignment, stage, source, or legacy `open | won | lost` status. Validation fails closed if required compatibility coverage, Workspace ownership, or legacy status preservation is invalid before constraints are validated. Lifecycle remains null for every retained legacy Lead; no legacy `won` fact is mapped to `converted`.

The later removal of legacy columns and mapping of ambiguous legacy lifecycle facts requires a separate Product-authorized contract migration. Until then, new P1A receipts require the immutable `new` lifecycle ID while retained rows may have a null lifecycle ID.

## Rollback and rebuild

Before application adoption, rollback is a database restore or explicit removal of the additive objects after confirming no P1A receipts exist. After any P1A write, destructive rollback would discard durable Lead, Contact, Company, review, Audit, and event lineage and is prohibited; use forward correction or restore the complete pre-migration database snapshot. Disposable UAT may be rebuilt from migrations without retaining data. Production requires backup/restore rehearsal and forward compatibility evidence.

## Change-impact record

- Changed capability: Lead Intake database foundation across Leads, Contacts, Companies, Identity Review, Platform Outbox.
- Public contracts: persistent identities added for `lead-inquiry-intake.v1` and `lead-identity-review-decision.v1`; no route or TypeScript public API added.
- Routes/pages, commands/queries, UI/accessibility: unchanged.
- Tables/migrations: new minimum identity, receipt, review/decision tables; additive Lead and Outbox columns; migration 0013.
- Audit actions: storage unchanged; production of Audit records is deferred to the application transaction.
- Events: outbox operation/result-version uniqueness added; event production is deferred.
- Authorization/tenant behavior: Workspace-qualified foreign keys added; manual receipts require a Workspace Membership actor.
- Dependencies: no runtime dependency change.
- Known limitations: no repository/service, adapter, import worker, candidate query, correction UI, automatic merge, conversion, routing, or deployment is included.
- Verification: schema diff/type gates, fresh migration, forward-from-0012 fixtures, migration-ledger no-op rerun, and serialized PostgreSQL tests are recorded in the implementation handoff.

## Combined-gate assignments

Polymorphic Outbox aggregate ownership, service authorization, exact Audit/outbox cardinality, same-hash replay versus changed-hash conflict results, failure injection across module participants, and actor active-status/Role/visibility checks require the Dev2 application transaction and are explicitly assigned to the combined backend integration gate. This database slice supplies storage and uniqueness constraints but does not claim service-policy evidence.

## Executed verification evidence

Executed 2026-08-25 against an isolated PostgreSQL 16-compatible local instance:

- Fresh `npm run db:migrate`: passed; ledger contained 15 migrations through 0014.
- Immediate `npm run db:migrate` no-op rerun: passed; ledger count remained 15.
- `npm run db:health`: passed with `{ ok: true, latencyMs: 8 }`.
- Forward-from-0012 rehearsal: passed with 1,203 retained Leads, three independently committed 500/500/203 backfill batches, zero incomplete rows, unchanged Lead/Workspace/status/phone/source digest, all `open | won | lost` counts preserved, zero lifecycle mappings, and zero converted lineage.
- `RUN_DB_INTEGRATION=1 ... p1a-schema ... p1a-migration`: 13/13 tests passed.
- Full serialized `npm run test:integration`: 165/165 tests passed across 20 files.
- `npx tsc --noEmit`, Drizzle history check, migration regeneration no-diff, scoped ESLint, and Git diff checks: passed.
- Non-database `npm test -- --run`: 250 passed, one unrelated pre-existing design-system token assertion failed in untouched CSS (`design-system-boundary.test.ts`, box-shadow token form).
