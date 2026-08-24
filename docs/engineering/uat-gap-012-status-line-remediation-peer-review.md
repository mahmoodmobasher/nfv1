# UAT-GAP-012 status-line remediation Backend/Security review

Date: 2026-08-24

Reviewer: Dev3 Backend/Security

Immutable candidate: `dc004634e0dda7d3109d9b574e410f7b5d32f07f`

Status-line remediation: `12e7f76f38e43666ce3dee4b074d2a3acdcef09e`

Rejected predecessor: `0f65d0887e178c379b0bd37e24e6a0e22095e9f0`

Architecture rejection: `16122427324ccd574ba4fafbe3dcf514aea92617`

Baseline: `6f4cc7138e5bae694c43c2f7f777c4addeb3c0a2`

## Decision

**ACCEPT for controlled integration without modification. NO-GO for deployment until Architecture accepts this same immutable candidate and Product separately authorizes a new immutable UAT attempt no earlier than `v0.5.0-uat.6`.**

- P0: none.
- P1: none.
- P2: none in this candidate. `UAT-GAP-012` remains operationally P2/open until an authorized `.6` release workflow proves live public-edge closure.
- P3: `UAT-GAP-009` remains open, non-blocking, unchanged, and outside this tooling increment.

Prior Backend/Security records for `32d601e` and `0f65d08` do not carry forward. This is a fresh review of the exact status-line delta and all retained evidence.

`v0.5.0-uat.1` through `.5` remain permanently rejected and must not be reused or moved.

## Scope and ancestry

- `0f65d08` is the exact merge base of the candidate. The only new commits are status-line remediation `12e7f76` and append-only handoff/gap update `dc00463`.
- Relative to `0f65d08`, behavior changes only in the status-line expression inside `deploy/uat/validate-edge-location.mjs`; deterministic fixtures and evidence records are expanded.
- Package scripts/lockfile, application, Proxy, routes, server services, Caddy, Compose, Dockerfile, database, identity/Session/token, Workspace/tenant authority, Audit, provider/configuration, and infrastructure are byte-identical to the predecessor.
- The validator remains a read-only header-file parser with no network, process execution, file write, database, authentication, tenant, provider, release-authority, or deployment capability.

## Status-line grammar review

The anchored grammar accepts only:

- uppercase literal `HTTP/`;
- explicit version `1.0`, `1.1`, `2`, or `3`;
- one literal ASCII space;
- exactly three status digits with first digit 1–5, yielding 100–599; and
- optionally, one ASCII space followed by a 1–128 character reason phrase composed only of printable ASCII `0x20`–`0x7e`, with first and last reason characters restricted to non-space printable ASCII `0x21`–`0x7e`.

This rejects arbitrary/alphabetic versions, lowercase protocol, `HTTP/2.0`, `HTTP/999`, malformed or missing punctuation, NBSP, EM SPACE, tab or doubled separators, status below 100 or above 599, two-/four-digit statuses, empty/trailing reason separators, leading/trailing reason spaces, controls, Unicode/non-ASCII reason text, overlong reasons, and trailing invalid syntax.

Manual boundary calls confirmed all four supported versions; a one-character reason and exactly 128 printable characters pass. Lowercase protocol, Unicode separation, 129 characters, and a trailing empty reason fail as `headers_invalid`.

## Preservation of prior security contract

- The status-line change does not alter raw query/fragment or dot-segment rejection, URL/origin/path comparison, percent/backslash/scheme-relative/userinfo rejection, exact 303 enforcement, or single non-empty Location enforcement.
- Every non-empty response block must still parse; unrecognized/malformed blocks, untrimmed invalid header names, folded headers, and prohibited controls in all header values fail closed.
- Informational responses remain allowed only before exactly one final response. Late informational blocks, multiple final responses, and no-final evidence remain rejected.
- Safe probe validation and CLI output suppression are unchanged. Output remains fixed labels/reasons plus a bounded validated probe ID and cannot reflect headers, Location, tokens, recipients, paths, origin, or expected destination.
- The complete prior 78-case Location/block/header/suppression suite remains present and passing alongside the 22 new status-line cases.

## Independent verification

- `git diff --check 0f65d08..dc00463`: pass.
- `npm run test:uat-edge-location`: 100/100 passed in one file.
- `npm run lint -- --quiet`: pass.
- `npx tsc --noEmit`: pass.
- `npm test`: 244/244 executable tests passed across 22 files; 124 PostgreSQL-gated tests skipped by design.
- Manual read-only status probes confirmed supported version/reason boundaries and representative lowercase, Unicode, oversized, and trailing-syntax rejection.

No application build, PostgreSQL, browser, Caddy, Compose, provider, configuration, email, UAT, or infrastructure operation was required or performed. Architecture `1612242` permits those unchanged gates to remain deferred for this byte-bounded tooling correction unless integration creates a semantic conflict.

## Risk and disposition

The explicit status vocabulary intentionally rejects other HTTP version serializations rather than interpreting them. This is appropriate for the reviewed UAT curl/Caddy evidence forms and prevents normalization from certifying contaminated evidence. A future runbook/protocol change must update the explicit grammar and fixtures through review rather than bypass the gate.

Backend/Security gate: **ACCEPT** immutable candidate `dc004634e0dda7d3109d9b574e410f7b5d32f07f` for controlled fresh-main integration unchanged.

Deployment gate: **NO-GO** until Architecture accepts this exact candidate, integration/provenance is recorded, Product separately authorizes `.6`, and artifact, protected-environment, backup/restore, migration, Caddy/Compose, readiness/health, and rollback gates pass. The complete public-edge matrix must restart from probe one. Any malformed evidence acceptance, invalid status/version syntax, non-303 or multi-Location result, token/privacy failure, CLI disclosure, or validator failure is a mandatory stop-and-rollback condition.

No code change, main mutation, merge, push, tag, UAT access, configuration, database, provider, infrastructure mutation, deployment, or email occurred during this review.
