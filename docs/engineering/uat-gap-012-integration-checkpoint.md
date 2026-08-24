# UAT-GAP-012 controlled integration checkpoint

Date: 2026-08-24

Status: **GO for a separate Product promotion/release-preflight decision; NO-GO for main push, tagging, deployment, UAT access, configuration/database/provider/infrastructure mutation, email, production, or Phase 5.**

Branch: `codex/uat-gap-012-integration-checkpoint`

Verified fresh-main baseline: `6f4cc7138e5bae694c43c2f7f777c4addeb3c0a2`

Accepted immutable candidate: `dc004634e0dda7d3109d9b574e410f7b5d32f07f`

Backend/Security acceptance: `96c00e17a320f75ac2f48fa63a2514b6c83b1ec3`

Architecture acceptance source: `0c2c9fca37bfe22e19ddfd7614f2738745f89677`

Pre-handoff integrated tree: `abb29b6a19d70aeadc32ee943cf219e2a8ccecee`

## Integration method and ancestry

- `git fetch origin --prune` confirmed `origin/main` remained exactly the authorized baseline before integration.
- The integration branch was created at Backend/Security acceptance `96c00e1`, whose direct parent is accepted candidate `dc00463`; the complete candidate and exact Backend/Security commit therefore retain their original ancestry and identities.
- The Architecture acceptance document was cherry-picked from `0c2c9fc` as `abb29b6` because its source parent belongs to the independent Architecture rejection/review lineage. This preserves the accepted record byte-for-byte without importing unrelated review history.
- No conflict occurred and no semantic resolution or file edit was required.

## Exact inventory and identity

Relative to baseline, the pre-handoff tree changes exactly seven accepted files:

- `deploy/uat/validate-edge-location.mjs`
- `tests/uat-edge-location-contract.test.ts`
- `package.json`
- `docs/engineering/uat-gap-012-release-harness-handoff.md`
- `docs/release/uat-release-gap-register.md`
- `docs/engineering/uat-gap-012-status-line-remediation-peer-review.md`
- `docs/architecture/uat-gap-012-status-line-remediation-review-dc00463.md`

Blob-ID comparison proves the five candidate files are byte-identical to `dc00463`, the Backend/Security record is byte-identical to `96c00e1`, and the Architecture record is byte-identical to `0c2c9fc`. No application, Proxy, route, Caddy, Compose, Dockerfile, dependency lockfile, security/identity/Session/token, Workspace/tenant, database/migration, provider/configuration, or infrastructure file changed.

This handoff file is the only additional checkpoint artifact.

## Verification

- `git diff --check 6f4cc71..abb29b6`: passed.
- Exact seven-file inventory comparison: passed.
- Candidate and review blob-ID comparison: passed.
- `npm run test:uat-edge-location`: **100/100 passed** in one file.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm test -- --reporter=dot`: exit 0; **244/244 executable tests passed across 22 files**, with 124 PostgreSQL-gated tests skipped by the direct suite as designed.

One initial read-only inventory command used zsh's reserved tied variable name `path`, which made later `git` invocations in that subprocess return `command not found`. It made no repository change. The check was immediately rerun with `candidate_file`; the inventory, byte-identity, and diff gates passed.

No production build, PostgreSQL, browser, Caddy, Compose, provider, UAT, email, or infrastructure operation was authorized or performed. Both independent acceptances permit unchanged broader evidence to remain deferred unless a later promotion/integration creates a semantic conflict.

## Disposition

The checkpoint contains the accepted tooling-only remediation and both independent acceptance records without semantic modification or unrelated review ancestry. `UAT-GAP-012` is implementation-remediated but remains operationally P2/open until a separately authorized immutable release passes the complete public-edge matrix from probe one. `UAT-GAP-009` remains P3/non-blocking and unchanged.

Product's next decision is whether to authorize a fail-closed, non-force promotion of this exact immutable checkpoint from the still-current main baseline, followed by a separate release-preflight decision. A future UAT identifier must be no earlier than `v0.5.0-uat.6`; `.1` through `.5` remain permanently rejected and unmoved.
