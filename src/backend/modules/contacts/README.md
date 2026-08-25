# Contacts module

Purpose: own minimum Workspace-scoped Contact identity, exact candidate queries, and authorized identity creation/link validation for P1A.

- Public entry: `index.ts`.
- Owns: `contacts`.
- Allowed dependencies: Platform database transaction. Contacts does not issue Company SQL; exact name+Company matching is the declared Company-hosted reviewed read model.
- Public operations: bounded exact email/phone candidate query, sorted candidate-set lock/freshness check, protected presentation, and create/link participant.
- Invariants: duplicate email/phone remain representable; no fuzzy matching, automatic merge, or cross-Workspace access.
- Tests: P1A manual-intake PostgreSQL and module-boundary suites.
- Deferred: expanded Contact workspace, multiple emails/phones, merge, communications.
