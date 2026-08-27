# Fast-track feature development decision

> Historical Product decision that remains authoritative for the fast-track working model. Its baseline and initial feature sequence have since been completed; current identities and next work are recorded in `docs/handover/PROJECT-STATUS.md`.

Authority date: 2026-08-26
Product development baseline: `c5209634b8852792d698d813996034b009351c91`

## Decision

Product accepts the integrated dormant database foundation through migration 0022 as the combined baseline for feature development without a separate combined migration rehearsal.

The absence of that rehearsal is an explicit Product speed trade-off, not an unrecorded missing gate. Individual accepted migration/package evidence is sufficient to start backend and frontend feature work. The separate combined rehearsal is removed as a prerequisite for development and disposable UAT.

This decision does not claim production/customer migration proof. Production release may require a later migration/preflight check appropriate to the release being shipped, but it must not block ordinary feature implementation now.

## Delivery policy

- Development uses local `main` at exact accepted baseline `c520963`.
- Each implementation role validates its bounded change and returns one immutable SHA.
- Product fast-forwards validated work to local `main` promptly.
- Architecture and Graphics remain support/review roles, invoked for material boundary or UX questions rather than mandatory serial gates on every increment.
- UAT has no real users or retained data and may be refreshed destructively.
- UAT deployment may use Git pull/install and fresh migration/bootstrap so user validation begins quickly.
- Publication, deployment, and user validation are Product-controlled but do not require preservation of prior UAT state.

## Feature activation sequence

The fastest dependency-correct vertical sequence is:

1. Companies/Contacts backend activation using the accepted DB-05A customer graph.
2. Companies/Contacts frontend activation against the accepted typed backend contract.
3. Manual Deals/Pipeline backend activation using DB-08A and real Company/Contact participants.
4. Manual Deals/Pipeline frontend activation.
5. Lead-to-Deal conversion as a later bounded increment.

Dev2 owns backend/service/route/transport implementation. Dev1 owns frontend implementation. Dev3 owns additional database changes only when a real feature proves they are necessary. Architecture and Graphics do not implement.

## First active increment

The first active increment is `CUSTOMER-GRAPH-01`: usable Companies and Contacts.

Backend scope includes Workspace-scoped, capability-filtered Company and Contact list/detail/create/edit/archive/restore; Contact-to-Company affiliation; deterministic keysets; expected-version writes; Platform authorization, Audit, Outbox, and Idempotency; current-authority fences; private/no-store responses; tenant-safe failures; and strict transport contracts.

The backend must use the accepted DB-05A schema and existing Companies/Contacts module boundaries. It must not add Deals, Lead conversion, imports, providers, communications, custom fields, broad duplicate resolution, or customer migration.

Frontend begins as soon as Dev2 returns the stable transport contract and may proceed while final backend validation completes, provided it uses only the typed contract and no fabricated server behavior.
