# UAT-GAP-012 status-line remediation Architecture review

Date: 2026-08-24

Immutable candidate: `dc004634e0dda7d3109d9b574e410f7b5d32f07f`

Remediation: `12e7f76f38e43666ce3dee4b074d2a3acdcef09e`

Rejected predecessor: `0f65d0887e178c379b0bd37e24e6a0e22095e9f0`

Architecture rejection closed: `16122427324ccd574ba4fafbe3dcf514aea92617`

Backend/Security acceptance reviewed: `96c00e17a320f75ac2f48fa63a2514b6c83b1ec3`

Scope: independent read-only Architecture review; documentation is the only changed artifact in this worktree

## Verdict

**ACCEPT — no material Architecture blockers in immutable candidate `dc00463`.**

- P0: none.
- P1: none.
- P2: none in the candidate. `UAT-GAP-012` is implementation-remediated but remains operationally open until a separately authorized `.6` workflow proves the complete live public-edge matrix.
- P3: existing `UAT-GAP-009` remains non-blocking, unchanged, and outside this increment.

Candidate `dc00463` and fresh Backend/Security record `96c00e1` may proceed together to Product-authorized controlled fresh-main integration without modification. This acceptance does not authorize merge, push, tag, deployment, UAT access, configuration, database, provider, infrastructure, or email activity.

## Architecture findings

The anchored, case-sensitive status grammar accepts only uppercase `HTTP/` with explicit curl/Caddy evidence versions `1.0`, `1.1`, `2`, or `3`; one literal ASCII space; status 100–599; and an optional 1–128 character printable-ASCII reason phrase with non-space endpoints. It rejects every example from `1612242`: alphabetic/arbitrary versions, lowercase protocol, NBSP or other Unicode whitespace, `HTTP/2.0`, and `HTTP/999`. The expanded matrix also rejects malformed/missing version punctuation, tabs and doubled separators, invalid status width/range, empty or trailing separators, control/non-ASCII/trailing syntax, and oversized reasons.

All 78 previously accepted Location, response-block ordering, malformed-header, safe-probe, and output-suppression cases remain present and passing. Clean relative and canonical absolute same-origin destinations remain accepted. Raw query/fragment delimiters, dot segments, normalization ambiguity, encoding, backslash, scheme-relative, userinfo, cross-origin, response chains, unsafe status, duplicate/comma-joined Location, malformed blocks and headers, and prohibited controls remain fail-closed.

CLI output remains limited to fixed labels/reason codes and a validated bounded probe identifier. It does not reflect response headers, Location, tokens, recipients, header-file paths, origins, or expected destinations.

Relative to `0f65d08`, behavior changes only in `deploy/uat/validate-edge-location.mjs`; deterministic fixtures and append-only evidence are expanded. Relative to baseline `6f4cc7138e5bae694c43c2f7f777c4addeb3c0a2`, the complete harness increment remains limited to the release validator, focused tests, one package script, and documentation. Application, Proxy/routes, Caddy, Compose, Dockerfile, dependency lockfile, identity/token/Session, CSRF/Origin, Workspace/Membership/Role/entitlement/Audit, database/migrations, provider/configuration, infrastructure, and live UAT authority are unchanged.

## Evidence

Architecture independently verified:

- `git diff --check 0f65d08..dc00463`: pass;
- `npm run test:uat-edge-location`: **100/100** pass;
- `npm run lint -- --quiet`: pass;
- `npx tsc --noEmit`: pass;
- `npm test`: **244/244 executable tests** pass across 22 files, with 124 PostgreSQL-gated tests skipped by design; and
- exact ancestry/inventory, grammar boundaries, earlier P2 preservation, and secret-safe CLI output by source and fixture inspection.

Fresh Backend/Security acceptance `96c00e1` binds to the same candidate and remediation, reports P0–P2 none, independently reproduces the gates above, and confirms manual supported/rejected grammar boundaries. Its findings are consistent with this review.

No production build, PostgreSQL, browser, Caddy, Compose, provider, configuration, email, UAT, or infrastructure operation was required for this tooling-only delta. Those unchanged results may be reused unless controlled integration produces a semantic conflict.

## Controlled integration and `.6` prerequisites

Controlled fresh-main integration: **GO**, only for immutable candidate `dc00463` plus the fresh Backend/Security and Architecture records, unchanged and under separate Product authorization.

After integration, record exact ancestry and inventory and rerun diff checks, `npm run test:uat-edge-location`, lint, TypeScript, and the direct suite. Any conflict, scope expansion, validator ambiguity/failure, malformed evidence acceptance, secret-bearing output, or changed application/Caddy/security/tenant boundary stops integration and requires fresh review.

Product may authorize a new immutable release attempt no earlier than `v0.5.0-uat.6` only after the integrated checkpoint passes artifact provenance, protected-environment parity, backup/restore, migration rerun, pinned Caddy/Compose validation, readiness/health, and rollback preflight. Deployment must restart the complete public-edge matrix from probe one. Any non-303 or multi-Location outcome, malformed evidence, token/privacy/security mismatch, validator failure, or unexpected state/configuration difference is a mandatory stop-and-rollback condition before email or broader UAT.

`v0.5.0-uat.1` through `.5` remain permanently rejected and must never be moved, repaired, or reused.
