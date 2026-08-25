# Identity Review module

Purpose: own pending review, bounded candidate evidence, effective Hold/Resolve decision lineage, and authorized candidate presentation.

- Public entry: `index.ts`.
- Owns: `lead_identity_reviews`, `lead_identity_candidates`, `lead_identity_decisions`, `lead_identity_decision_heads`.
- Allowed dependencies: Platform transaction/authorization and Contact/Company public presentation/query participants; it never reads their tables directly.
- Routes: Lead identity-review GET and POST adapters.
- Read trace: protected query -> active actor -> assigned-visible pending Lead -> Identity Review evidence -> Contact/Company public presentation participants -> bounded response.
- Invariants: explicit Hold advances effective pending lineage but creates/links nothing; Resolve completes both identity dimensions atomically; resolved reviews never reopen.
- Tests: P1A contract, PostgreSQL, route, privacy, replay, concurrency, and dependency suites.
- Deferred: automatic matching/merge, expanded review designer, import review orchestration.
