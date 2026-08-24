# UAT-GAP-011 controlled integration checkpoint

Date: 2026-08-24

Status: **GO for Product's separate promotion/release decision; NO-GO for deployment, tagging, or release publication without separate authorization.**

## Authority and provenance

- Fresh fetched main baseline: `4383e1ec4131c194e427ebdd41df313b71853497`.
- Architecture implementation authority: `263281dc848223b419a2d0fa4c7d5e7cd0be12bf`.
- Accepted implementation: `47efe632f07be09b5d0da552f86727f27ddea346`.
- Immutable accepted candidate/handoff: `0da5caad1c4c1421a4c6bee74311dd57854447a3`.
- Backend/Security acceptance: `9d22612efa708731f0e6d558a3b74ebc2eac35bc`.
- Architecture acceptance: `32a38a9ce2d96277050db1fa935d72090b1f1e89`.
- Pre-checkpoint integrated tree commit: `9942e09a1091027d1c5b5d9466a80b273d1ab2e8`.
- Integration branch: `codex/uat-gap-011-integration-checkpoint`.

The candidate was merged without modification onto the fresh main baseline. The Backend/Security review merged normally. The Architecture review branch diverged before implementation, so its authority was preserved with an `ours` merge and only its exact committed review record was imported. This prevented unrelated Architecture-branch history from changing the integrated tree. The root main checkout and its four untracked Product documents were not accessed for writes or changed.

## Exact integrated delta

The accepted candidate files are byte-identical to `0da5caa`:

- `docs/architecture/uat-generated-token-capture-rsc-remediation-decision.md`
- `docs/engineering/uat-generated-token-capture-rsc-remediation-handoff.md`
- `docs/release/uat-release-gap-register.md`
- `package.json`
- `playwright.framework-capture.config.ts`
- `src/proxy.ts`
- `tests/e2e/generated-token-capture-security.spec.ts`
- `tests/e2e/generated-token-capture.setup.ts`
- `tests/generated-token-capture-boundary.test.ts`

The acceptance records are byte-identical to their source commits:

- `docs/architecture/uat-generated-token-capture-rsc-remediation-final-review-0da5caa.md`
- `docs/engineering/uat-gap-011-generated-token-capture-peer-review.md`

This checkpoint document is the only additional file. There was no conflict resolution, application rewrite, dependency-lock change, migration, Caddy/configuration change, or other semantic delta.

## Verification on the integrated tree

- Fetch and remote-drift check: `origin/main` remained exactly `4383e1e`.
- Candidate and both acceptance commits are preserved in integration ancestry.
- Exact inventory, accepted-file byte identity, and review-record byte identity: passed.
- `git diff --check origin/main..HEAD`: passed before this checkpoint; final diff check passed after adding it.
- `npm run lint -- --quiet`: passed.
- `npx tsc --noEmit`: passed.
- `npm test`: **144/144 executable tests passed across 21 files**; 124 PostgreSQL-gated tests skipped by the direct suite as designed.
- `npm run test:framework-capture`: **57/57** focused direct/matcher tests across four files; Next.js 16.3.1 production build passed; immutable production/real-Outbox/browser suite **4/4**, one worker, zero retries.

The only warning was the known non-blocking `NO_COLOR`/`FORCE_COLOR` warning. No semantic conflict or additional application/configuration delta occurred, so the condition for broader PostgreSQL or full Playwright reruns was not met.

## Disposition and rollback

`UAT-GAP-011` is accepted and integrated in this checkpoint but remains operationally P1/open until a separately authorized immutable `v0.5.0-uat.5` attempt passes the public-edge matrix from probe one. `UAT-GAP-009` remains P3/open non-blocking and unnormalized. Releases `v0.5.0-uat.1` through `.4` remain permanently retired.

Rollback for this unpromoted checkpoint is simply to retain `origin/main` at `4383e1e`; no database, configuration, provider, or infrastructure rollback is required. No push to main, deployment, tag, UAT/config/database/provider mutation, or email occurred.
