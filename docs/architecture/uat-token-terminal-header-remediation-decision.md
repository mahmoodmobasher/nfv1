# UAT token terminal/denial header remediation Architecture decision

Date: 2026-08-24

Rejected deployment reviewed: `aa64658` / `v0.5.0-uat.3`

Application revision attempted: `82b81044443a61d25926608d57c943b9ed89dfe1`

Authority: `f907e7028a3ed637c6d077be15aa809a717d475a`

Gaps: `UAT-GAP-008`, `UAT-GAP-009`

Scope: implementation-ready application header-boundary decision only; no code, configuration, infrastructure, secret, provider, DNS, live-UAT, or deployment mutation is authorized

## Decision

**REJECT the current release boundary; ACCEPT the bounded fall-forward remediation contract below for implementation.**

P0: none.

P1: `UAT-GAP-008` — verification and reset completion denials do not receive application `Referrer-Policy: no-referrer` and therefore receive the broader edge default.

P2: none.

P3: `UAT-GAP-009` — identical repeated `Cache-Control: private, no-store` field-values are non-canonical but preserve effective privacy and do not block the fall-forward release.

Responsible implementation role: Backend/Dev2, with focused Security peer review, Architecture re-review, Release Engineering integration evidence, and separate Product deployment authorization.

`v0.5.0-uat.1`, `v0.5.0-uat.2`, and `v0.5.0-uat.3` remain permanently retired. The next attempt is no earlier than `v0.5.0-uat.4` and requires a new immutable revision, image, checksums, release directory, backup, tag, authorization, and deployment result.

## P1 root cause

`src/proxy.ts` applies application `private, no-store` and `no-referrer` only when `tokenDocument` matches:

- `/verify-email`
- `/verify-email/capture`
- `/reset-password`
- `/reset-password/capture`
- `/workspace/invitations/accept`

The website uses same-origin POST aliases `/verify-email/complete` and `/reset-password/complete`. Their underlying API handlers correctly reject missing/untrusted CSRF/Origin before business work and make identity responses private/no-store, but the aliases are absent from the proxy privacy set. On a 403 early return, no application Referrer-Policy exists, so the accepted Caddy default-if-absent behavior correctly supplies `strict-origin-when-cross-origin`.

The Caddy remediation is working as designed and must not be reverted or made route-aware. The missing policy belongs in the application token-surface contract.

## Canonical protected token-route set

Backend must replace the ad hoc `tokenDocument` array with one named, exported/testable exact-path predicate or immutable set covering the complete website token lifecycle:

### Verification

- `/verify-email`
- `/verify-email/capture`
- `/verify-email/complete`

### Password reset

- `/reset-password`
- `/reset-password/capture`
- `/reset-password/complete`

### Workspace invitation acceptance

- `/workspace/invitations/accept`
- `/workspace/invitations/accept/complete`
- `/workspace/invitations/accept/intent`
- `/workspace/invitations/accept/intent/clear`
- `/workspace/invitations/accept/terminal`

This is contract completion, not authority expansion. These are existing capture, clean, mutation, clear/retired, and terminal endpoints whose responses can carry or consume short-lived token intent. The set must use exact normalized path equality—not substring, suffix, wildcard, query-controlled, or arbitrary prefix matching. Query parameters do not change membership. Near-miss paths such as an added suffix must not inherit token authority, though normal safe edge defaults still apply.

The invitation completion, retired intent, valid clear, and terminal handlers already set `no-referrer` on their normal handled responses. They remain in the canonical set so proxy-level privacy also covers framework responses and early mutation-guard denials. In particular, `/workspace/invitations/accept/intent/clear` currently returns its CSRF rejection before its route-local `no-referrer` assignment; this is a symmetric missing denial outcome and must be covered.

The direct compatibility APIs `/api/auth/verify`, `/api/auth/reset-complete`, and `/api/invitations/accept` are not document routes and are excluded by the current proxy matcher. Do not change the matcher or duplicate them into document-path policy for this remediation. Their website aliases inherit the existing handlers, and their established API responses remain private/no-store. Any future requirement to make Referrer-Policy an API-response invariant belongs in the shared identity/workspace HTTP-helper contract and needs separate compatibility review.

## Required header behavior

For every exact protected website token path, every HTTP method, and every status produced through proxy, route handler, mutation guard, framework method denial, redirect, or unexpected bounded failure:

- set application `Referrer-Policy: no-referrer` exactly once as the effective public value;
- set application `Cache-Control: private, no-store`; no `public`, `max-age`, `s-maxage`, `immutable`, or stale-serving directive may coexist;
- retain the per-response CSP nonce and `strict-dynamic` contract; production remains free of `unsafe-inline` and `unsafe-eval`;
- preserve the configured token-intent and Session cookie attributes, independent multiple `Set-Cookie` fields, exact token-free `Location`, and existing `Vary` behavior;
- never reflect raw or URL-encoded verification, reset, or invitation tokens in HTML, RSC, JSON error bodies, headers, cookies in plaintext, history, storage, outbound URLs, logs, Audit, or provider evidence.

The proxy header operation must use `Headers.set`, not append. Caddy remains `?Referrer-Policy`, so it preserves the one upstream value and supplies its default only on non-token responses where the application is silent. No new Caddy path matcher or header override is permitted.

## CSRF, Origin, and transaction preservation

The remediation is header classification only. It must not reorder, bypass, weaken, or duplicate the shared CSRF plus trusted-Origin guard. Missing token, missing/mismatched CSRF, absent/untrusted Origin, malformed JSON, invalid/expired/replaced/consumed intent, replay, rate limit, and unexpected failures retain their current generic status/body semantics and must perform no unauthorized business mutation.

Valid verification remains single-use and activates only the global User. Valid reset remains under the accepted per-User lock and one transaction for password, replacement of reset tokens, security version, Session revocation, success Audit, and rollback. Invitation acceptance remains authenticated, intended-verified-email-bound, seat/entitlement checked, Admin/Member-only, transactional, idempotent, and audited. Header work grants no User, Session, Workspace, Membership, Owner, Role, Team, visibility, seat, or entitlement authority.

## Required regression matrix

### Static/unit boundary

- Assert the canonical set contains every exact path above once and no other route.
- Table-test all members for private/no-store and no-referrer and all near-miss paths for non-membership.
- Assert `Headers.set`/single-value semantics and retain configured Session-cookie privacy behavior.
- Assert the Caddyfile still contains exactly one `?Referrer-Policy` default and no unconditional/add/remove alternative.

### Direct application responses

Run the exact production build without Caddy and inspect:

- verification/reset capture: missing, empty, malformed, valid-shape, and legacy direct query entry;
- clean verification/reset documents: missing, valid, invalid, expired, replaced, consumed, Back, refresh, and terminal UI states, HTML and RSC where applicable;
- verification/reset completion POST: valid success, invalid/expired/replaced/consumed/replay, malformed input, rate limit, late transactional failure/rollback, missing CSRF, mismatched CSRF, missing Origin, and cross-origin denial;
- invitation capture, clean preview, completion, retired intent, clear, and terminal: valid, missing, malformed, expired/revoked/consumed, unauthenticated, wrong identity, seat denial, replay, CSRF/Origin denial, HTML/RSC/API as applicable;
- wrong method/framework 405 on protected lifecycle paths where supported.

For every result assert status/body remains canonical, application headers contain one `no-referrer` and private/no-store, and no business mutation occurs on denial. Assert terminal cookie clearing only where the existing contract requires it; header remediation must not consume valid retryable intent.

### Public edge

After separate deployment authorization, restart the entire public matrix from the first probe with redirects disabled when inspecting redirects:

- all direct-application cases above at representative positive, negative, denied, and terminal outcomes;
- HTML and RSC token capture/clean requests;
- exactly one public `Referrer-Policy: no-referrer` for every protected path/status;
- Caddy default `strict-origin-when-cross-origin` exactly once on representative public/auth/health/authenticated/static routes where upstream is silent;
- one nonce-consistent CSP, effective private/no-store, independent bounded cookies, exact token-free Location, unchanged Vary, and raw plus encoded token absence from response/body/history/storage/outbound/logs.

The matrix must also rerun configured valid/stale Session cache privacy, disabled OIDC 404s, unauthenticated CRM protection, and immutable `_next` public caching. No direct-container pass substitutes for the public result through Caddy.

## P3 UAT-GAP-009 decision

**Defer normalization; retain as non-blocking defense-in-depth evidence.**

The duplicate Workspace values are identical `private, no-store`, arise from application policy plus the existing Caddy `/workspace/*` private-document defense, and do not weaken effective caching. Changing the Caddy cache operation in the same P1 application remediation would broaden scope and introduce avoidable cache-regression risk after three failed release attempts.

For `v0.5.0-uat.4`, repeated Cache-Control is acceptable only when all field-values are semantically identical and their combined effective directives contain `private` and `no-store` with no public/shared-cache/positive-age/stale directive. Missing, conflicting, unparsable, or weakened values are a release blocker. Evidence must count raw fields and parse the combined effective policy rather than relying on one header-library representation.

Future optional cleanup requires a separately reviewed edge-only change, preferably converting the `/workspace/*` Caddy setter to default-if-absent semantics so the application value is preserved and the edge supplies privacy only when upstream is silent. That change must prove all Workspace document/API success and denial states remain private/no-store, stale/invalid Session privacy remains intact, public/auth/health behavior is unchanged, and `_next` assets remain public immutable. Do not delete the edge defense without equivalent negative proof.

`UAT-GAP-009` stays open P3/non-blocking until canonicalized or explicitly accepted as permanent. It does not block `.4` under the strict effective-policy evidence above.

## Rollback and fall-forward gates

The backend implementation must be one bounded application commit plus tests/handoff, based on current accepted `main`. No migration, Caddy, Compose, secret, provider, DNS, or protected-configuration change belongs in it. Rollback is the prior immutable application image with its matching protected Option A configuration and accepted Caddyfile; no database rollback or data rewrite is expected.

Before integration:

1. Backend/Dev2 supplies exact diff, canonical-set tests, direct production-response matrix, lint, TypeScript, full direct/security tests, PostgreSQL identity/reset/invitation regressions, production build, and focused browser token-security evidence.
2. Security peer review verifies route completeness, CSRF/Origin ordering, generic denials, token absence, transaction/replay behavior, header uniqueness, and no authority expansion.
3. Architecture reviews the same immutable candidate and evidence; Product separately authorizes integration/deployment.

Before a new UAT attempt, repeat immutable artifact provenance, Option A environment parity, encrypted backup/restore, migration apply/rerun, Caddy adapt/validate, Compose render, health/readiness, worker startup, and rollback inputs. After switching, run the complete public edge matrix before any approved-recipient email or broader UAT journey. Then close live sender/email journeys and the full Phase 1–4 Product UAT matrix.

Any P1/P2 failure restores prior application/config authority immediately. Fall forward again under a new identifier; never repair or reuse a failed tag. No production or Phase 5 deployment is authorized by this decision.
