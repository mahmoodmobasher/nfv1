# Feature 3 Phase 1 release readiness

Date: 2026-08-23

Status: **Product, Architecture, and Graphics accepted; engineering gate green; ready for UAT deployment authorization**

Proposed immutable candidate: `v0.3.0-uat.1`

Application boundary before this documentation commit: `81cc1c76578140e46a33751dcc3cf422f913e105`

## Delivered scope

- Global Personal settings, independent of Workspace administration and Workspace RBAC.
- Authenticated display-name read/update.
- Typed global appearance, locale, and time-zone preferences with versioned stale-write protection.
- Recent-authenticated current-password change.
- Transactional invalidation of outstanding reset tokens, Session revocation, and bounded Audit evidence.
- Global theme behavior across Personal settings, CRM, and Workspace administration.
- Accessible password feedback, show/hide controls, mobile layout, and preference reload recovery.

Verified evidence is recorded in [`feature-3-phase-1-integration-checkpoint.md`](../engineering/feature-3-phase-1-integration-checkpoint.md).

## Release evidence

- Migration apply plus immediate rerun: passed.
- Database health: passed.
- PostgreSQL integration: **119/119**.
- Unit/direct-route: **52/52**.
- Playwright: **26/26**.
- ESLint, TypeScript, and Next.js production build: passed.
- Architecture: accepted after reset-token invalidation and rollback proof.
- Graphics: accepted after global-theme and password-accessibility remediation.

## Deployment boundary

This candidate is not yet deployed. UAT replacement, image publication, migration execution on UAT, and smoke validation require a separate deployment action and recorded result.

Migration `0011_white_masque.sql` is additive. Rollback of application behavior may restore the prior immutable UAT image, but the added preferences table and indexes should remain unless a separately reviewed database rollback is explicitly authorized. Do not delete user preference data as part of routine application rollback.

The existing UAT authority remains `v0.2.1-uat.2` until a new deployment report records successful replacement and validation.
