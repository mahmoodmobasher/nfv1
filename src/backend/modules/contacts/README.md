# Contacts module

Purpose: own minimum Workspace-scoped Contact identity, exact candidate queries, and authorized identity creation/link validation for P1A.

- Public entry: `index.ts`.
- Owns: `contacts`.
- Allowed dependencies: Platform database transaction; Companies only through public contracts when later required.
- Public operations: bounded exact candidate query, transaction participant create/lock.
- Invariants: duplicate email/phone remain representable; no fuzzy matching, automatic merge, or cross-Workspace access.
- Tests: P1A manual-intake PostgreSQL and module-boundary suites.
- Deferred: expanded Contact workspace, multiple emails/phones, merge, communications.
