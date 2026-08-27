# DB-01B Lead current source platform handoff

- Base: `7ed2e83f5b34e603d8f133b76e9a5b7756fa9dda`.
- Branch: `codex/db-01b-lead-source-platform`.
- Migration: `0025_db_01b_lead_source_platform`; ledger index 25 / 26 entries; timestamp `1787793528579`.
- Seven database-only files. No runtime, deployment, UAT, backfill, or provenance mutation.

`leads.source_platform` is a nullable mutable current-source fact. The fully valid tuple constraint requires a catalog value exactly when current `source='social_media'`; permitted values are `tiktok|instagram|facebook|linkedin|x|youtube|other_social`. Every non-social current source requires null. The migration takes an `ACCESS EXCLUSIVE` Leads lock and fails with stable safe error `db_01b_current_social_platform_required` if any existing current social row would require a guessed platform.

There is no default, compatibility allowance, `NOT VALID` constraint, inference, or copy from `original_source_platform`. All `original_source_*` columns, `lead_intakes`, attribution/intake provenance, Workspace ownership, FKs, retention, indexes, and disclosure rules are unchanged. Runtime must transition `source` and `source_platform` atomically and keep original/intake tuples immutable.

Evidence covers fresh and exact-0024 forward migration, retained non-social rows, exact ledger 26/head and no-op rerun, current tuple insert/update transitions and full catalog, original and Lead-intake provenance stability, social-residue rejection with complete rollback/no column/no inference, late-statement rollback, schema/snapshot fidelity, TypeScript, scoped lint, Drizzle no drift, and diff checks. No performance testing or claim is included.
