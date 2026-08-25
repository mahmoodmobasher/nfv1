# Identity Review module

Purpose: own pending review, bounded candidate evidence, effective Hold/Resolve decision lineage, and authorized candidate presentation.

- Public entry: `index.ts`.
- Owns: `lead_identity_reviews`, `lead_identity_candidates`, `lead_identity_decisions`, `lead_identity_decision_heads`.
- Allowed dependencies: platform transaction/authorization and public Contact/Company contract types.
- Routes: Lead identity-review GET and POST adapters.
- Invariants: hold creates/links nothing; resolve completes both identity dimensions atomically; resolved reviews never reopen.
- Tests: P1A contract, PostgreSQL, route, privacy, replay, concurrency, and dependency suites.
- Deferred: automatic matching/merge, expanded review designer, import review orchestration.
