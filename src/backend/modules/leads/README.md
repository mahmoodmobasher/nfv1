# Leads module

Purpose: own Workspace Lead inquiry lifecycle and the canonical P1A manual intake transaction.

- Public entry: `index.ts`.
- Owns: `leads`, `lead_lifecycle_definitions`, `lead_intakes`, `lead_activities`, `lead_visible_teams`, and P1A reads of `pipeline_stages`.
- Public operations: `submitLeadInquiryV1`, legacy manual compatibility translation, and `decideLeadIdentityReviewV1` for explicit Hold/Resolve.
- Consumes: Contacts, Companies, and Identity Review public transaction participants; Platform tenancy/authorization, database, idempotency, Audit, and Outbox ports.
- Write trace: route -> public command -> non-locking trust lookup -> idempotency/intake -> Lead/review/head -> Company then Contact identities -> Platform assignment/visibility references -> final authority revalidation -> one governing Audit + exact events -> commit/result.
- Invariants: every accepted command creates one Lead at `new`; Workspace ownership is permanent; hold never mutates identity; no automatic/fuzzy merge.
- Tests: P1A contract, modular boundary, PostgreSQL transaction/replay/concurrency/rollback/privacy, and route suites.
- Deferred: CSV/XLSX, web/public adapters, conversion, routing, merge, expanded CRM workspaces.
