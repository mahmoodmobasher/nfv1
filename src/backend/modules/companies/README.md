# Companies module

Purpose: own minimum Workspace-scoped Company identity and bounded exact name/domain candidate behavior for P1A.

- Public entry: `index.ts`.
- Owns: `companies`.
- Allowed dependencies: Platform database transaction only for this slice.
- Public operations: bounded candidate query, sorted candidate-set lock/freshness check, protected presentation, and create/link participant.
- Invariants: normalized names are indexed but non-unique; no automatic merge or cross-Workspace access.
- Tests: P1A manual-intake PostgreSQL and module-boundary suites.
- Deferred: expanded Company workspace, hierarchy, merge, analytics.
