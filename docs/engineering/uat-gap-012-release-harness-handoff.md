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

## Superseding remediation after Architecture rejection

Architecture review `99ab72db72f9208e8c4be997f5d58d72fb53d5b3` rejected candidate `32d601ec1792309570bcb600545be7cf4fc3bcb9` at P2 because URL normalization and permissive response parsing could erase or ignore malformed raw evidence. Backend/Security acceptance `57d4133d8e213547ddd1c7cda0db178f7778a6be` does not carry forward. The preceding handoff remains historical evidence only and is superseded by this append-only update.

Remediation implementation: `a6290dd31ca103717d80172a2058c37c0bab9836`

The tooling-only remediation now:

- rejects raw `?` and `#` delimiters whether empty or populated before URL parsing;
- rejects raw `.` and `..` path segments in relative and absolute inputs before normalization;
- validates the untrimmed response-header field name, so space or tab before `:` fails;
- rejects every non-empty unrecognized or malformed response block and every prohibited control in status lines or response-header values;
- permits informational responses only before exactly one final response, which must remain one 303 with one clean Location; and
- retains the existing origin/path equality, encoding, backslash, scheme-relative, userinfo, status, duplicate/comma-joined Location, safe-probe, and output-suppression boundaries.

Deterministic fixtures cover the Architecture examples symmetrically for `/verify-email` and `/reset-password`, including empty and populated delimiters, relative and absolute dot segments, malformed preamble/suffix/whitespace blocks, invalid field names, prohibited controls, informational ordering, and clean relative/absolute destinations following ordered informational responses.

Verification on `a6290dd31ca103717d80172a2058c37c0bab9836`:

- `git diff --check`: passed.
- `npm run test:uat-edge-location`: **78/78 passed** in one file.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed. The repository has no `typecheck` npm script; `npm run typecheck` therefore returned `Missing script: "typecheck"` before the direct command was used.
- `npm test`: **222/222 executable tests passed across 22 files**; 124 PostgreSQL-gated tests remained skipped by the direct suite as designed.

No production build, PostgreSQL, browser, Caddy, Compose, provider, UAT, or external-state gate was run because this correction remains byte-bounded to the release validator and deterministic fixtures. Architecture `99ab72d` explicitly does not require those suites for this isolated tooling delta unless later integration introduces a semantic application or configuration conflict.

Status: **GO for fresh, distinct Backend/Security review and then Architecture review of the new immutable candidate; NO-GO for integration, main push, tagging, deployment, UAT access, email, or release publication.** Reviewers must verify the exact remediation implementation and the candidate documentation commit containing this update. `UAT-GAP-012` remains P2/open blocking until both reviews accept, Product authorizes controlled integration, and a separately authorized release no earlier than `v0.5.0-uat.6` passes the complete public-edge matrix from probe one.

## Superseding status-line remediation after second Architecture rejection

Architecture review `16122427324ccd574ba4fafbe3dcf514aea92617` rejected candidate `0f65d0887e178c379b0bd37e24e6a0e22095e9f0` at P2 because its case-insensitive, arbitrary-version status prefix could accept malformed evidence. Backend/Security acceptance `3b62423` does not carry forward. All preceding candidate status statements remain append-only history and are superseded by this update.

Status-line remediation implementation: `12e7f76f38e43666ce3dee4b074d2a3acdcef09e`

The validator now accepts only uppercase `HTTP/` with the explicit versions `HTTP/1.0`, `HTTP/1.1`, `HTTP/2`, and `HTTP/3`; one literal ASCII space; a status from 100 through 599; and an optional reason phrase introduced by one ASCII space. When present, the reason is 1–128 printable ASCII characters, begins and ends with a non-space printable character, and contains no Unicode, control, leading-extra-space, trailing-space, or unbounded syntax.

The deterministic gate retains all previous 78 cases and adds four supported positive forms plus negatives for alphabetic/arbitrary versions, lowercase protocol, NBSP/EM SPACE/tab separators, `HTTP/2.0`, `HTTP/999`, malformed and missing version punctuation, out-of-range/short/long statuses, doubled/trailing separators, control-tailed/non-ASCII reasons, and an overlong reason. Every prior Location, response ordering, malformed block/header, safe-probe, and output-suppression boundary remains unchanged.

Verification on `12e7f76f38e43666ce3dee4b074d2a3acdcef09e`:

- `git diff --check`: passed.
- `npm run test:uat-edge-location`: **100/100 passed** in one file.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm test`: **244/244 executable tests passed across 22 files**; 124 PostgreSQL-gated tests remained skipped by the direct suite as designed.

No application build, PostgreSQL, browser, Caddy, Compose, provider, UAT, or external-state gate was run because the exact delta remains limited to the release validator and deterministic fixtures. No application, Proxy, route, Caddy, configuration, database, provider, infrastructure, UAT, tag, or main state changed.

Status: **GO only for entirely fresh Backend/Security and Architecture review of the immutable candidate containing `12e7f76f`; NO-GO for integration, main push, tagging, deployment, UAT access, email, or release publication.** Review must confirm the exact status grammar, preservation of all 100 focused cases and suppression boundaries, and the tooling-only inventory. `UAT-GAP-012` remains P2/open blocking through independent acceptance, separately authorized integration, and live edge-first closure in a separately authorized immutable release no earlier than `v0.5.0-uat.6`.
