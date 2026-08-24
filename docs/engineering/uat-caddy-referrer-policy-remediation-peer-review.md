# UAT Caddy Referrer-Policy remediation backend/security peer review

Date: 2026-08-24

Reviewed immutable candidate: `9e56096d45675798d10970ed7b72d19868ddb1d2`

Architecture authority: `f907e7028a3ed637c6d077be15aa809a717d475a`

Base: `313e4ab0be306d2222a5249ddafc71d8a207f588`

Review method: distinct read-only inspection and independent offline execution from the exact committed candidate. This record is the only post-candidate addition; no candidate file, application code, infrastructure authority, or live environment was changed.

## Decision

**ACCEPT.** The candidate implements the exact bounded Architecture correction and is suitable for controlled integration and a separately authorized new UAT attempt under a new immutable release identifier.

- P0: none.
- P1: none in the candidate. Public-edge acceptance remains a mandatory deployment-time gate because this review was not authorized to deploy the candidate.
- P2: none.
- P3: none.

`v0.5.0-uat.1` remains withdrawn and must not be reused or moved.

## Scope and ancestry review

The candidate is based on `313e4ab` and preserves the Architecture decision in its ancestry. Relative to that base, the complete delta is:

- one approved production configuration-line change in `deploy/uat/Caddyfile`, from unconditional `Referrer-Policy` assignment to `?Referrer-Policy` default-if-absent;
- one focused two-test Caddy precedence boundary file;
- the Architecture decision and implementation handoff records.

No application source, Compose topology, image, route, proxy, CSP, cache, cookie, Session, database, migration, secret, provider, DNS, port, TLS, release-authority, or other infrastructure behavior changed. `git diff --check` passed.

## Independent configuration and precedence evidence

- Focused candidate test: **2/2 passed**. It asserts exactly one shared `?Referrer-Policy` operation, rejects unconditional/appending/removal forms, preserves the other shared security directives and `admin off`, and models one-value upstream-present/upstream-absent behavior without comma joining.
- Pinned `caddy:2.10.2-alpine` `caddy adapt --validate`: **passed**.
- Pinned `caddy:2.10.2-alpine` `caddy validate`: **passed**.
- Independent adapted-JSON inspection found two default values and two deferred operations, one for each site importing the shared block. There is no unconditional setter. Four textual `Referrer-Policy` occurrences are expected in serialized JSON because each of the two operations contains both its response-header field match and its set operation.
- Safe Compose render with non-secret `/dev/null` environment-file references: **passed**. The service set remains `postgres`, `app`, `caddy`, and `email-worker`; Caddy remains pinned to `caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d`; the application image reference and database pin were unchanged. No environment values were emitted.

An independent disposable Docker-network rehearsal ran the exact candidate Caddyfile in the pinned Caddy image against a fixed synthetic upstream:

- upstream-present `Referrer-Policy: no-referrer`: preserved exactly once — **passed**;
- upstream-absent response: received exactly one `strict-origin-when-cross-origin` — **passed**;
- repeated or comma-joined effective Referrer-Policy: absent — **passed**;
- Caddy was running and reachable through its health route — **passed**;
- bounded Caddy logs contained no error/fatal/panic/exception or literal `token=` entry — **passed**.

This independently confirms Caddy's deferred default-if-absent behavior rather than relying solely on the JavaScript model in the focused test.

## Security and response-preservation review

The synthetic upstream response exercised a token-document-shaped 303 and a static response. Across the edge:

- application CSP remained exactly once;
- `Cache-Control: private, no-store` remained unchanged;
- token-free `Location: /clean` remained exact;
- `Vary: RSC` remained unchanged;
- two separate bounded `Set-Cookie` fields remained separate;
- the static response retained `public, max-age=31536000, immutable` and was not made private;
- the response headers contained no synthetic raw token material.

Focused application security regressions were rerun to validate the upstream contract that Caddy must preserve: **25/25 passed across four files** (`phase4-invitation-boundary`, `phase4-identity-boundary`, `phase4-identity-token-intent`, and `security.unit`). These cover invitation token capture before rendering, exact clean redirect, sealed purpose/path/expiry-bounded cookies, raw and encoded token non-reflection, malformed/stale intent denial and clearing, verification/reset purpose isolation, private/no-store behavior, and `no-referrer` on the protected capture/document boundary.

Together, the application regressions and actual Caddy rehearsal provide positive evidence for invitation, verification, and reset privacy without changing or consuming live tokens or test accounts.

## Rollback evidence

The peer rehearsal stopped and removed only the disposable candidate Caddy container, then recreated only Caddy from a prior Caddyfile byte-identical to `313e4ab`. The fixed upstream container ID remained unchanged. The prior unconditional overwrite to `strict-origin-when-cross-origin` was observed, proving the rollback artifact and behavior were distinct and deterministic. All disposable containers and the dedicated network were removed afterward.

The production rollback contract remains the inverse atomic release-pointer/config-authority switch followed by recreation of only Caddy from the pinned image. It requires no application image change, migration, database restore, Session/cookie revocation, or data rewrite.

## Integration and UAT suitability

The immutable candidate is **GO for integration planning** and **GO for a new, separately authorized UAT attempt**. It is not itself deployment authorization.

The new UAT attempt must use a new immutable release identifier, validate the staged Caddyfile before switching authority, recreate only Caddy, and run the Architecture public HTTPS matrix for HTML and RSC variants. Acceptance requires exactly one effective Referrer-Policy on every probe, preservation of application `no-referrer` on invitation/verification/reset routes, default policy on upstream-silent routes, and preservation of CSP, cache, cookies, Location, Vary, static caching, token privacy, container health, restart count, and bounded logs. Any omission, repetition, combination, weakening, or token disclosure requires immediate Caddy-only rollback to the prior healthy authority.

No deployment, push to main, release tag, production change, secret/DNS/provider change, Caddy admin API enablement, or reuse of `v0.5.0-uat.1` occurred during this peer review.
