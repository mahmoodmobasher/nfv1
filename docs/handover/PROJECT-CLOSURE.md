# NexaFlow project transfer and closure record

Prepared: 2026-08-26; superseded for live status by `PROJECT-STATUS.md` dated 2026-08-27.

> Historical transfer record: exact SHAs and holds below describe the database-first transition at that time, not the current deployed application.

This is a transfer closure, not a product shutdown or production release. It closes the current ChatGPT/Codex working program into a durable state so new sessions can resume without relying on chat history.

## Transfer definition of done

- [x] Donor-first/database-first direction documented.
- [x] Published UAT and local dormant baselines distinguished.
- [x] Accepted and rejected immutable database candidates recorded.
- [x] G1/G2/G7 and the non-replaceable Platform spine recorded.
- [x] Donor reuse/rejection rules and reviewed source provenance recorded.
- [x] Lead-vNext single-writer and UAT20 parity requirements recorded.
- [x] Performance deferral and exact 100-row DB-06B fast-track recorded.
- [x] Role-specific restart prompts created.
- [x] Explicit held scopes and forbidden actions recorded.
- [x] DB-06B replacement `62b1ed09398b79d826cec8c612976f0e24ff4f49` received explicit Dev2 ACCEPT.
- [x] Product integrated exact DB-06B `62b1ed0` locally after combined acceptance.
- [x] Handover files updated to the post-integration local SHA and preserved dirty documentation state.
- [ ] Documentation is committed/published if Product chooses to preserve it in Git.

## Authority snapshot after final DB-06B decision

- Published UAT/origin authority: `7ecc1a6b4927d5cc85258ce985a65a460a2d277c`, tag `v0.5.0-uat.20`.
- Local accepted database baseline: `c5209634b8852792d698d813996034b009351c91`, 23 commits ahead of `origin/main`.
- DB-06B organized candidate: `62b1ed09398b79d826cec8c612976f0e24ff4f49`, parent `849e4e4159d66bfb5207b2f4bbf62c21cdcf6544`, base `d1d48c3`.
- Architecture disposition for `62b1ed0`: ACCEPT.
- Dev2 disposition for `62b1ed0`: ACCEPT after independent code/evidence inspection.
- Product integration: exact `62b1ed0` fast-forwarded into local `main`; no database tests rerun, publication, deployment, activation, reconciliation, backfill, cutover, or UAT mutation.
- DB-08A: exact replacement `c5209634b8852792d698d813996034b009351c91` accepted by Architecture and Dev2 and integrated locally. Rejected `5534f4d` must never integrate or transfer acceptance.
- Migration ledger/head: 23 / `1787768262741` after dormant DB-08A migration 0022.
- Donor evidence authority: `mahmoodmobasher/NexaFlowSystem` at `57d38b0c2091f1376344614720890c9544916933`.

## What is complete

- Workspace/Membership/RBAC/Visibility and Platform Audit/Outbox/Idempotency foundation remains authoritative.
- UAT20 Lead Management is user accepted and is the Lead-vNext parity floor.
- Local dormant persistence is accepted through Activities, Notes, Documents, Customization, Customer Graph DB-05A, Lead-vNext DB-06A, and the Platform Audit lookup prerequisite.
- DB-06B functional integrity scope is complete under the user-directed 100-row fast track; large-scale proof is deliberately deferred.
- The old feature-by-feature roadmap and Canonical Lead Preservation Addendum are superseded.

## Not complete or not authorized

- No local dormant database package after UAT20 is published or deployed.
- No DB-05B/C reconciliation, Lead reconciliation, backfill, activation, cutover, or writer switch.
- No combined full-foundation migration rehearsal has yet been recorded after all planned packages.
- No backend/frontend donor capability activation after the database-first hold.
- No DB-07 projection-delivery DDL; it waits for a real consumer.
- DB-09 through DB-14 still require Product freeze and dependency-ordered implementation.
- No backend or frontend feature implementation exists for the local dormant database packages.
- No production/customer migration, provider credentials, secrets, DNS, deployment, or UAT mutation.
- P1A-LEAD-MGMT-02 and P1A-DUP-01/`f313785` remain held.

## Deferred mandatory release gates

Before Lead-vNext activation/cutover, separately authorize and pass full page-boundary, 100,001+ cardinality, natural-planner, HMAC throughput/memory, and repeated p95 evidence. The current 100-row DB-06B acceptance does not satisfy or claim those gates.

Before any activation wave, confirm complete migration rehearsal, single-writer fencing, reconciliation barriers, rollback/fall-forward, functional/security/evidence parity, and consolidated disposable-UAT/user verification.

## First actions for the receiving session

1. Read the handover index and donor-first handover completely.
2. Inspect `git status`, `main`, `origin/main`, tag, worktrees, and migration journal; update this record if the DB-06B integration completed after preparation.
3. Preserve the recorded Architecture and Dev2 exact-SHA ACCEPT for integrated `62b1ed0`; never transfer acceptance to a different candidate.
4. Do not rerun DB-06B testing unless a later Product scope explicitly reopens it.
5. Decide whether to freeze DB-09 next or authorize the combined dormant database-foundation rehearsal first. DB-07 remains deferred.
6. Keep all activation/deployment/UAT/customer-data scopes held until explicitly authorized.

## Handover files

- `docs/handover/README.md`
- `docs/handover/PROJECT-STATUS.md`
- `docs/handover/DONOR-FIRST-DATABASE-HANDOVER.md`
- `docs/handover/ROLE-RESTART-PROMPTS.md`
- `docs/handover/CONTINUATION-PROMPT.md`
- `docs/handover/PROJECT-CLOSURE.md`

Older architecture, engineering, and design handovers remain useful historical evidence, but the dated donor-first documents above take precedence when they conflict.
