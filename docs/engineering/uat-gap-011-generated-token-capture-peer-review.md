# UAT-GAP-011 generated-token capture Backend/Security peer review

Date: 2026-08-24

Reviewer: Dev3 Backend/Security

Immutable candidate: `0da5caad1c4c1421a4c6bee74311dd57854447a3`

Implementation: `47efe632f07be09b5d0da552f86727f27ddea346`

Architecture authority: `263281dc848223b419a2d0fa4c7d5e7cd0be12bf`

Baseline: `106e5104c064e42cddd6bd5e263d21acefbe2ec8`

## Decision

**ACCEPT for integration without modification. NO-GO for deployment until Architecture accepts the same immutable candidate and Product separately authorizes a new immutable UAT attempt no earlier than `v0.5.0-uat.5`.**

- P0: none.
- P1: none in the candidate. `UAT-GAP-011` remains operationally P1/open until an authorized public-edge deployment matrix proves closure.
- P2: none.
- P3: `UAT-GAP-009` remains open, non-blocking, unchanged, and unnormalized.

`v0.5.0-uat.1`, `.2`, `.3`, and `.4` remain permanently retired and must not be reused or moved.

## Independent findings

### Scope and framework boundary

- The candidate merge base is exactly `106e5104`; Architecture authority is preserved through merge `fde3f5d` before implementation `47efe63` and handoff `0da5caa`.
- Application behavior changes only in `src/proxy.ts`. Other changes are the named framework gate, focused tests/configuration, and append-only Architecture/engineering/gap evidence.
- App Router routes, direct APIs, server/business services, database schema/migrations, Caddy, Compose, Next configuration, package lock, providers, and deployment scripts are byte-identical to the baseline.
- The Proxy matcher retains exactly the accepted `/api`, `/_next/static`, `/_next/image`, and `favicon.ico` exclusions. Removing only the two prefetch `missing` predicates makes Proxy eligibility independent of HTML/RSC/prefetch presentation.
- Installed Next.js 16.3.1 documentation confirms Proxy precedes filesystem routing, matcher predicates control eligibility, and response headers/direct responses are supported. The candidate exercises the package's shipped matcher utility under the documented Proxy name, creating a visible framework-upgrade gate.

### Exact capture behavior

- One frozen exact mapping binds `/verify-email/capture` and `/verify-email` only to `email_verification` and clean `/verify-email`; `/reset-password/capture` and `/reset-password` only to `password_reset` and clean `/reset-password`.
- Existing invitation capture remains exact and receives the same presentation-independent matcher coverage. The eleven protected lifecycle paths remain unchanged.
- Capture occurs before `NextResponse.next()` and filesystem routing whenever an exact entry contains a `token` key. No implementation branch trusts RSC, `_rsc`, router-state, or prefetch headers.
- GET with exactly one valid-shape value returns 303 and seals the existing purpose-bound intent. HEAD returns the same bodyless clean 303 but clears authority. Unsupported methods return bodyless 405, `Allow: GET, HEAD`, no Location, and clear authority.
- Duplicate, empty, malformed, oversized, and undecodable values replace stale authority with bounded clearing cookies. Exact mapping and token-count checks prevent prefix/suffix confusion and ambiguous capture.
- Clean destinations remove the entire query and fragment, preventing token, duplicate keys, `_rsc`, continuation, and unknown parameters from surviving in Location. Verification continuation is retained only inside the sealed envelope for the exact allowlisted invitation path.

### Privacy, cookies, and response behavior

- Every handled capture outcome sets nonce-bearing production CSP with `strict-dynamic`, `Cache-Control: private, no-store`, and `Referrer-Policy: no-referrer` using replacement semantics.
- Valid GET writes only the existing encrypted/authenticated, purpose-bound, short-lived HttpOnly intent cookie. Invalid, HEAD, and unsupported-method outcomes write clearing cookies. Invitation capture retains independent intent/return cookie handling.
- Focused tests prove exact 303/405 status, token-free clean Location, bodyless HEAD/405, single effective policy, private/no-store, CSP, expected null Vary on direct capture, bounded cookies, loop prevention, stale-cookie replacement, and raw/once-/twice-encoded token absence from headers, body, and Location.
- Browser evidence covers final/history/Back/refresh URLs, DOM, local/session storage, plaintext cookies, subsequent requests, referrers, console, responsive overflow, landmarks/headings, and keyboard focus. No token-bearing navigation after the initial capture was observed.
- Generated `/capture` Route Handlers remain unchanged as defense-in-depth fallbacks. Direct API behavior, CSRF/Origin mutation guards, generic denials, rate limits, logs/Audit payloads, email templates, and Outbox services are unchanged.

### Outbox, database, and business regression evidence

- The named production gate creates synthetic verification and reset links through the real registration/reset services and encrypted Outbox template, extracts them only inside the test process, and probes the immutable production server under HTML, RSC, router prefetch, purpose prefetch, and combined presentations.
- Fixture setup uses unique synthetic identifiers. Its teardown is transactional and scoped to the fixture User, related Audit/Outbox rows, and derived rate-limit hashes. It does not invoke the worker or provider and sends no email.
- Recorded immutable-candidate evidence reports production response/browser 4/4, one worker, zero retries, covering two real encrypted Outbox links across eight presentations plus the broader five-entry/method/query/browser matrix.
- Recorded serialized PostgreSQL evidence is 124/124 across 15 files after migration apply/rerun. The relevant unchanged suites cover generated Outbox paths, invalid/expired/replaced/consumed/replayed verification/reset tokens, Session revocation, rate limits, singular success Audit effects, late rollback, tenant/seat/identity denials, and invitation concurrency/replay.
- This independent review did not rerun the Outbox fixture or PostgreSQL suite because the authorization explicitly prohibited database mutation. Their commands, fixture scoping/cleanup, assertions, unchanged business code, and reported results were inspected. No evidence inconsistency was found.
- Capture itself performs no verification, password change, token consumption, Session/User/Workspace/Membership mutation, success Audit, Outbox write, or provider call. Authentication, ownership, seat, entitlement, Role, and transaction authority are not expanded.

## Reproduced checks

- `git diff --check 106e5104..0da5caa`: pass.
- Focused matcher/capture gate without database mutation: 57/57 pass across four files.
- Full direct/unit suite: 144/144 executable tests pass across 21 files; 124 database-gated tests skipped by design.
- ESLint quiet: pass.
- TypeScript `tsc --noEmit`: pass.
- Next.js 16.3.1 production build: pass; Proxy and 42 routes compiled.
- Existing non-mutating focused Playwright security suite: 4/4 pass, one worker, zero retries.
- Expected `NO_COLOR`/`FORCE_COLOR` startup warnings were the only warnings.

No app code, infrastructure, configuration, database, UAT, provider, email, tag, or release state was changed during review.

## Regression risk and disposition

The matcher now runs Proxy for eligible prefetch requests previously skipped. This is intentional and applies existing CSP/header behavior to the same non-API/non-static route set; it grants no business authority. The main residual risk is framework behavior changing in a future Next upgrade, contained by `npm run test:framework-capture` and its matcher plus immutable-production response probes.

Backend/Security gate: **ACCEPT** candidate `0da5caad1c4c1421a4c6bee74311dd57854447a3` for controlled integration unchanged.

Deployment gate: **NO-GO** until Architecture accepts this exact candidate, integration provenance is recorded, Product separately authorizes a new immutable `.5` attempt, and pre-switch artifact/environment/backup/migration/Caddy/Compose/health/rollback gates pass. The authorized attempt must restart the complete public-edge matrix from probe one. Any 307/308 or query-bearing redirect, token reflection, missing privacy header, cookie-purpose failure, business mutation during capture, or weakened P3 cache policy is a stop-and-rollback condition.

No merge, push, tag, deployment, email, configuration change, database mutation, or live-UAT access was performed.
