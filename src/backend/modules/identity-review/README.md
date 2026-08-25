# Identity Review module

Purpose: own pending review, bounded candidate evidence, effective Hold/Resolve decision lineage, and authorized candidate presentation.

- Public entry: `index.ts`.
- Owns: `lead_identity_reviews`, `lead_identity_candidates`, `lead_identity_decisions`, `lead_identity_decision_heads`.
- Allowed dependencies: Platform transaction and Contact/Company public candidate types; it never issues SQL against Lead, intake, Contact, or Company tables.
- Routes: no independent route authority. Leads owns the thin identity-review GET/POST operations and consumes Identity Review public participants.
- Read trace: Leads protected query -> active actor -> Identity Review reference -> Leads-owned assigned-visible pending Lead/intake context -> Identity Review evidence -> Contact/Company public presentation participants -> bounded response.
- Invariants: explicit Hold advances effective pending lineage but creates/links nothing; Resolve completes both identity dimensions atomically; resolved reviews never reopen.
- Tests: P1A contract, PostgreSQL, route, privacy, replay, concurrency, and dependency suites.
- Deferred: automatic matching/merge, expanded review designer, import review orchestration.
