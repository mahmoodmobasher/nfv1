# UAT token terminal header remediation peer review

Date: 2026-08-24

Reviewer: Dev3 backend/security peer review

Immutable candidate: `2629616bc8104620ff5cfd6ea43fc35f397af1b5`

Implementation: `5fdec7b8d31cc06aed85c96a2960a1fe6d837716`

Architecture authority: `0035fd1dc5650a4789d9f0df6fbdb06f8b5910da`

Baseline: `aa64658cf74f1d8be12fa6751e70a1718aa2fe9c`

## Decision

**ACCEPT for integration. NO-GO for deployment until Product separately authorizes a new immutable UAT attempt no earlier than `v0.5.0-uat.4`.**

- P0: none.
- P1: none in the immutable candidate. `UAT-GAP-008` remains open operationally until the complete authorized public-edge matrix passes on a new deployment.
- P2: none.
- P3: `UAT-GAP-009` remains open, non-blocking, and non-weakened. The candidate intentionally does not normalize identical repeated Workspace Cache-Control fields.

`v0.5.0-uat.1`, `.2`, and `.3` remain permanently retired and must not be reused or moved.

## Independent review

### Ancestry and bounded scope

- The merge base with the declared baseline is exactly `aa64658`.
- Candidate ancestry contains Architecture authority `0035fd1`, its preservation merge `f2f01b3`, implementation `5fdec7b`, engineering handoff `41eb198`, and final evidence count `2629616`.
- Runtime code changes are confined to `src/proxy.ts`. The other deltas are focused tests and append-only Architecture/engineering/gap records.
- No App Router route handler, direct compatibility API, server service, database schema/migration, Caddyfile, Compose file, package authority, deployment script, provider, or infrastructure configuration changed.
- The existing Proxy matcher is byte-identical to the baseline and continues to exclude direct `/api` compatibility routes. `git diff --check` passed.

### Exact token lifecycle contract

The exported frozen contract contains exactly eleven unique website paths and no others:

- verification: `/verify-email`, `/verify-email/capture`, `/verify-email/complete`;
- reset: `/reset-password`, `/reset-password/capture`, `/reset-password/complete`;
- invitation: `/workspace/invitations/accept`, `/workspace/invitations/accept/complete`, `/workspace/invitations/accept/intent`, `/workspace/invitations/accept/intent/clear`, `/workspace/invitations/accept/terminal`.

Membership uses exact normalized pathname equality through a private `ReadonlySet`; query parameters do not affect membership. Trailing-slash, suffix, prefix, similarly named, and direct API near misses remain excluded. Candidate boundary tests passed 22/22 and independently assert the immutable duplicate-free list, all five representative methods on every path, query independence, and nine near misses.

### Header behavior and privacy

- One helper uses `Headers.set` for both `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`. Repeated helper application replaces prior public/default values and retains one effective value rather than appending.
- The helper is applied to Proxy-owned capture redirects and to the shared downstream response for every protected exact path. This covers normal route responses, redirects, framework method outcomes, CSRF/Origin guard denials, and bounded failures without changing their body/status logic.
- Focused browser evidence passed 4/4 with one worker and zero retries. It exercised all eleven paths under GET and PUT/framework outcomes; missing/mismatched CSRF, absent/cross Origin on all four mutation/clear paths; three exact near misses; and invitation HTML/RSC capture plus Back/forward behavior.
- Protected responses retained `no-referrer`, nonce-bearing `strict-dynamic` CSP, and private/no-store where asserted. Near misses remained application-silent for Referrer-Policy/cache classification so the existing Caddy default remains authoritative after deployment.
- No matcher, Caddy, route handler, cookie helper, redirect target, CSP construction, or RSC/Vary behavior changed. Browser evidence retained the token-free relative Location and found no raw synthetic token in response bodies/headers, cookies, page HTML, history, local/session storage, or outbound URLs.
- The implementation adds no log, Audit, email, provider, or persistence operation. No email or external provider call occurred during review.

### Authority, transactions, and replay

- The change classifies response headers only. It does not alter CSRF/Origin guard ordering, authentication, token parsing/sealing/consumption, User verification, password mutation locking, Session authority, Workspace invitation validation, seat/entitlement enforcement, ownership, Roles, Teams, Memberships, visibility, idempotency, or Audit behavior.
- Independent migrations applied and reran cleanly on disposable database `nexaflow_dev3_token_peer_2629616`; the candidate adds no migration.
- The full serialized PostgreSQL suite passed 124/124 across 15 files. This includes 17 identity tests and 24 tenant-administration tests covering verification/reset single use and replay, password/reset serialization, all-Session revocation, rate limiting, late rollback with no partial credential/token/security-version/Session/Audit state, invitation atomicity/idempotency/concurrency, singular committed success effects, and identity/seat/role/team/tenant denials.
- Therefore denial headers do not create business mutation or authority expansion, and accepted transaction/replay behavior remains unchanged.

### Caddy and P3 UAT-GAP-009

- `deploy/uat/Caddyfile` is byte-identical to the baseline: one `?Referrer-Policy` default-if-absent remains, with no route-aware matcher or unconditional/add/delete alternative.
- Candidate Caddy/cache tests passed 4/4. The raw Cache-Control evaluator requires at least one field, identical normalized raw values, and an effective directive set containing only `private` and `no-store`.
- It accepts the known repeated identical `private, no-store` fields and fails closed for absence, conflicting values, missing directives, public/positive-age, stale-serving, unknown, or otherwise unparsable/weakened policy.
- This preserves the application policy plus existing Caddy `/workspace/*` defense in depth. It does not claim canonical single-field cache shape. `UAT-GAP-009` remains P3/non-blocking until separately normalized or explicitly accepted as permanent.

## Reproduced verification

- Focused lifecycle and Caddy/cache unit tests: 26/26 pass.
- Full direct/unit/security suite: 124/124 executable tests pass across 20 files; 124 database-gated tests skipped as designed in that run.
- Full serialized PostgreSQL suite: 124/124 pass across 15 files after migration apply and rerun.
- Focused Playwright: 4/4 pass, one worker, zero retries.
- ESLint: pass.
- TypeScript (`tsc --noEmit`): pass.
- Next.js 16.3.1 production build: pass, including Proxy compilation and 42 routes.

## Disposition

Backend/security peer-review gate: **ACCEPT** immutable candidate `2629616bc8104620ff5cfd6ea43fc35f397af1b5` for integration without modification.

Deployment gate: **NO-GO pending separate Product authorization** for a new immutable `.4` attempt. That attempt must repeat artifact provenance, Option A environment parity, backup/restore, migration apply/rerun, Caddy/Compose validation, rollback readiness, and the complete direct/public-edge token matrix from `0035fd1`. Public acceptance must prove one `no-referrer` on all protected outcomes, default policy on near misses/non-token routes, CSP/cache/cookie/Location/Vary/token preservation, and strict raw-field non-weakening for UAT-GAP-009.

No deployment, code/infrastructure modification, main push, tag mutation, live-UAT mutation, or email occurred during this review.
