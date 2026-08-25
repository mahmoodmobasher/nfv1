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
| `lead_intakes` manual receipt | Leads / Lead Intake orchestrator | Owns `lead-inquiry-intake.v1` replay and its one-Lead result. Future import rows call the same command but remain Imports-owned. |
| `audit_events` | Platform Audit | The feature supplies allowlisted action and metadata through the platform writer. |
| `outbox_messages` | Platform Outbox | The feature supplies its required versioned event set; Platform owns persistence and delivery. |
| generic idempotency mechanism | Platform Idempotency | Lead Intake owns receipt semantics and uses the platform mechanism. |

`lead-inquiry-intake.v1` owns the cross-module transaction. Canonical lock order is idempotency authority; intake receipt or row; Lead and review; Companies sorted by UUID; Contacts sorted by UUID; assignment references. Business mutations, receipt outcome, governing Audit record, and complete required outbox event set commit atomically through reviewed transaction participants. Table ownership is not relaxed by the shared PostgreSQL transaction.

## Expand, backfill, and retained-data declaration

Migration 0013 first adds compatibility columns as nullable. It then backfills Leads in deterministic UUID order in batches of at most 500 using `FOR UPDATE SKIP LOCKED`. Each batch reports its affected-row count. Re-entry selects only incomplete rows, so an interrupted/retried execution is resumable and does not rewrite completed rows.

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
- Verification: schema diff/type gates, fresh migration, forward-from-0012 fixtures, migration-ledger no-op rerun, and serialized PostgreSQL tests are required evidence for this candidate.
