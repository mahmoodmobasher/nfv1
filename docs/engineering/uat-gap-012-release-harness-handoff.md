# UAT-GAP-012 release-harness remediation handoff

Date: 2026-08-24

Status: **GO for distinct Backend/Security and Architecture review; NO-GO for integration, tagging, deployment, UAT access, or release publication until both reviews accept this immutable candidate and Product separately authorizes the next workflow.**

Baseline: `6f4cc7138e5bae694c43c2f7f777c4addeb3c0a2`

Implementation: `b5654dd6862f046d3f4889073987d75fd310ff0e`

Branch: `codex/uat-gap-012-release-harness`

## Bounded tooling contract

- `deploy/uat/validate-edge-location.mjs` reads a curl-style response-header file without printing its path or contents. Callers provide only a validated safe probe ID, canonical request origin, and expected clean path.
- The validator requires exactly one final non-informational response, status exactly 303, and exactly one non-empty `Location` field. It resolves either `/expected-path` or the equivalent absolute same-origin URL against the supplied origin, then requires exact origin and pathname equality with empty query and fragment.
- It rejects 307/308 and every other status; missing, empty, duplicate, or comma-joined Location; response chains; scheme-relative, cross-origin, userinfo, whitespace/control, backslash-normalized, encoded, ambiguous relative, query-bearing, fragment-bearing, token-bearing, and wrong-path values; malformed/folded headers; and invalid origin/expected-path authority.
- Probe IDs are limited to lowercase ASCII letters/numbers plus `.`, `_`, and `-`, beginning alphanumerically and bounded to 64 characters. Every CLI outcome emits only `pass`/`fail`, the validated probe or literal `invalid`, and a fixed reason code. Raw Location, response headers, tokens, recipients, header-file paths, origins, and expected paths are never emitted.
- `npm run test:uat-edge-location` is the named deterministic review and future release gate. Fixtures cover both accepted forms and all required negative classes, including CLI suppression behavior.

No application runtime, `src/proxy.ts`, route, Caddyfile, Compose, Dockerfile, dependency/lockfile, provider/configuration, database schema/migration, Session, identity-token, Workspace, Membership, Role, entitlement, Audit, or live-UAT behavior changed.

## Files and verification

- `deploy/uat/validate-edge-location.mjs` — repository-owned token-blind Location validator/CLI.
- `tests/uat-edge-location-contract.test.ts` — deterministic positive, adversarial, parser, CLI, and suppression fixtures.
- `package.json` — adds only the named focused test command.
- `docs/release/uat-release-gap-register.md` — append-only implementation status for `UAT-GAP-012`.
- `docs/engineering/uat-gap-012-release-harness-handoff.md` — this immutable review handoff.

Verification on the implementation tree:

- `git diff --check`: passed.
- `npm run test:uat-edge-location`: **34/34** passed in one file.
- `npm run lint -- --quiet`: passed.
- `npx tsc --noEmit`: passed.
- `npm test`: **178/178 executable tests passed across 22 files**; 124 PostgreSQL-gated tests skipped by the direct suite as designed.
- Secret-suppression audit: all CLI output paths are restricted to fixed labels/reasons and validated probe IDs; token-bearing fixture values and unreadable header paths were absent from stdout/stderr.

A production build was not run because this increment changes no application source, build configuration, dependency, lockfile, Dockerfile, or runtime artifact input. PostgreSQL, Playwright, Caddy, Compose, provider, and live-UAT gates are likewise unaffected and were not accessed.

## Review requirements

Backend/Security must independently review the exact immutable candidate and:

1. rerun the 34-test focused gate, lint, TypeScript, and direct suite;
2. inspect final-response/header parsing, 303-only behavior, single-Location enforcement, URL resolution, canonical origin/path/query/fragment comparison, scheme-relative/userinfo/backslash/percent-encoding and response-chain rejection;
3. prove every CLI failure emits only a fixed reason plus a validated safe probe identifier and cannot reflect raw headers, Location, token/recipient values, file paths, origin, or expected path;
4. confirm the tool is read-only toward its header input and grants no application, authentication, tenant, database, provider, or infrastructure authority; and
5. report ACCEPT/REJECT with P0–P3 and whether `UAT-GAP-012` is implementation-remediated but operationally open.

Architecture must review the same immutable candidate plus Backend/Security evidence and:

1. confirm accepting relative and absolute same-origin serialization only after exact tuple normalization conforms to the clean-destination contract;
2. confirm every documented dangerous representation remains fail-closed and no existing security/application/Caddy boundary changed;
3. confirm the named gate is suitable for the complete public-edge matrix and that `.1` through `.5` remain immutable/rejected; and
4. issue ACCEPT/REJECT for controlled fresh-main integration only. A new identifier no earlier than `v0.5.0-uat.6` still requires separate Product artifact/deployment authorization and must restart public-edge evidence from probe one.

Rollback before integration is omission of this tooling-only candidate. No data, configuration, image, provider, or infrastructure rollback exists or is required.
