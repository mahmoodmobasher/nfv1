# Leads module

Purpose: own Workspace Lead inquiry lifecycle and the canonical P1A manual intake transaction.

- Public entry: `index.ts`.
- Owns: `leads`, `lead_lifecycle_definitions`, and `lead_intakes` as the bounded manual intake-row/receipt authority.
- Public operations: `submitLeadInquiryV1`, legacy manual compatibility translation, and the Leads-owned identity-resolution orchestrator.
- Consumes: Contacts, Companies, and Identity Review public transaction participants; Platform tenancy/authorization, database, idempotency, Audit, and Outbox ports.
- Write trace: route -> public command -> trusted actor -> validation/canonicalization -> idempotency -> canonical locks -> module participants -> one governing Audit + required events -> commit/result.
- Invariants: every accepted command creates one Lead at `new`; Workspace ownership is permanent; hold never mutates identity; no automatic/fuzzy merge.
- Tests: P1A contract, modular boundary, PostgreSQL transaction/replay/concurrency/rollback/privacy, and route suites.
- Deferred: CSV/XLSX, web/public adapters, conversion, routing, merge, expanded CRM workspaces.
