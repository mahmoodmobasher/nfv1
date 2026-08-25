# Companies module

Purpose: own minimum Workspace-scoped Company identity and bounded exact name/domain candidate behavior for P1A.

- Public entry: `index.ts`.
- Owns: `companies`.
- Allowed dependencies: Platform database transaction; the explicit read-only `companyContactCandidateReadModel` may join Contacts because Companies owns the Company-name predicate. It cannot write Contacts.
- Public operations: bounded name/domain candidate query, sorted candidate-set lock/freshness check, protected presentation, create/link participant, and reviewed exact name+Company Contact read model.
- Invariants: normalized names are indexed but non-unique; no automatic merge or cross-Workspace access.
- Tests: P1A manual-intake PostgreSQL and module-boundary suites.
- Deferred: expanded Company workspace, hierarchy, merge, analytics.
