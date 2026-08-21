# Architect Slice 2 Gate Review

Status: **ACCEPT — Slice 2 complete**  
Review date: 2026-08-20  
Scope: Slice 2 against the exact acceptance criteria in `slice-1-gate-review.md` and the governing production security/data contract  
Boundary: review and documentation only; no application code, local Compose configuration, UAT, Lightsail, Caddy, vendor account, or external infrastructure was modified or accessed.

## Verdict

Slice 2 is accepted. Develop closed all four security-semantic blockers with checked-in implementation, migration `0004_tired_mother_askani.sql`, expanded unit/route/PostgreSQL/Playwright evidence, and updated engineering documentation.

The accepted boundary now includes server-owned password policy, random hashed single-use identity tokens, sliding/absolute PostgreSQL sessions, current/all-device revocation, CSRF/origin checks, trusted-proxy-aware multidimensional rate limits, session-derived identity context, transactional audit/outbox creation, fenced outbox processing, local Mailpit delivery, and protected workspace-preview entry.

## Evidence inspected

- `docs/architecture/slice-1-gate-review.md`
- `docs/architecture/security-data-contracts.md`
- `docs/engineering/slice-2-checkpoint.md`
- `package.json`, lockfile, Playwright/Vitest configuration, local Compose, and server environment validation
- Drizzle schema, migrations `0003_smooth_diamondback.sql` and `0004_tired_mother_askani.sql`, and migration metadata
- Identity service, password/token primitives, sessions, CSRF/origin handling, rate limiting, audit writing, request helpers, email adapter, outbox claimant/processor, and worker
- All nine authentication API routes and the protected workspace entry
- Registration, login, verification, recovery, and reset UI wiring
- Unit, route, live PostgreSQL integration, and Playwright identity/session test sources

## Independent checks

The reviewer ran the following local, non-destructive checks:

| Check | Result |
| --- | --- |
| Compose configuration validation | Passed |
| Drizzle migration-history validation | Passed |
| Unit/direct-route suite | Passed on re-review: 22 tests; 30 database tests skipped by the normal command as designed |
| Lint | Passed |
| Next.js 16.3.1 production build | Passed; nine dynamic authentication routes and dynamic protected workspace entry were generated |
| Live PostgreSQL rerun | Not independently executable in the review sandbox: loopback connections were denied with `EPERM` before database assertions ran |
| Playwright rerun | Not attempted because the same sandbox prevents its PostgreSQL/Mailpit loopback dependencies |

The loopback denial is a review-environment limitation, not evidence of an application failure. The updated checkpoint's completed local evidence—30 PostgreSQL tests, five Playwright journeys, all five migrations plus immediate rerun, database health, and real Mailpit delivery—is accepted as the execution record. The reviewer independently passed Compose validation, Drizzle migration-history validation, the 22-test unit/direct-route suite, lint, and the Next.js production build.

## Exact acceptance-criteria assessment

| Acceptance criterion | Decision | Evidence/reason |
| --- | --- | --- |
| Registration creates no Workspace, membership, entitlement snapshot, or trial | **ACCEPT** | Registration transaction creates User, credential, onboarding progress, verification token, audit, and outbox only. PostgreSQL tests assert zero workspaces and rollback atomicity. |
| Passwords use Argon2id and are never logged or returned | **ACCEPT** | Registration and reset use one shared 12–256-character, number-and-symbol policy at both route and domain boundaries before hashing or persistence. Argon2id, dummy verification, rehash support, and weak-password bypass tests pass. |
| Verification/reset tokens are random, hashed at rest, expiring, purpose-bound, single-use, replaceable, and replay-tested | **ACCEPT** | 32-byte opaque tokens, keyed hashes, purpose checks, expiry predicates, replacement, row locking, consumption, encrypted email envelopes, and replay tests are present. |
| Public login/recovery/verification responses do not disclose account existence or failure detail | **ACCEPT** | Login is generic; reset/resend responses are indistinguishable; invalid verification/reset tokens use a generic invalid-or-expired response. Unknown-login password verification uses a dummy Argon2 hash. |
| Session cookies are opaque, Secure for HTTPS, HttpOnly, SameSite constrained, rotated, expiring, and server-revocable | **ACCEPT** | Authenticated reads atomically touch sessions after a bounded interval, refresh idle expiry, and cap it at absolute expiry. Concurrent touch, idle expiry, absolute cap, cookie, rotation, and revocation evidence pass. |
| Current/all-device logout are idempotent; password reset revokes sessions | **ACCEPT** | Current session revocation uses idempotent updates; all-device logout increments user security version and revokes rows; reset calls the same all-device revocation transactionally. Integration and browser evidence cover both scopes. |
| CSRF and origin checks reject missing, invalid, and cross-origin mutations | **ACCEPT** | Double-submit token validation plus exact Origin/Referer origin checks cover every auth mutation route; direct route tests exercise missing, mismatched, cross-origin, and same-origin cases. |
| Suspended users and revoked/expired sessions cannot obtain authenticated context | **ACCEPT** | Session resolution requires active User, matching security version, unrevoked row, and both expiry predicates. A live PostgreSQL test now explicitly proves suspended-user denial. |
| Rate-limit behavior and safe responses have deterministic tests | **ACCEPT** | Sensitive flows consume network plus subject/account/destination/token buckets. Arbitrary forwarding headers are ignored in direct mode; trusted forwarding requires explicit enablement and a constant-time verified proxy secret. Route and PostgreSQL tests cover spoof resistance and dimensions. |
| Email and audit side effects share transaction/outbox boundary; retries do not duplicate protected mutation | **ACCEPT** | Enqueue remains transactional. Migration 0004 adds stable provider idempotency keys, lease owner, and monotonic generation. Finalization requires the matching fence; stale success/failure is rejected, retries retain provider idempotency, and stored errors use safe categories. |
| PostgreSQL tests cover concurrency, replay, session rotation/revocation, outbox leasing, and audit atomicity | **ACCEPT** | Thirty recorded live tests include the original coverage plus concurrent sliding touches, absolute capping, suspended users, multidimensional limits, weak-password persistence prevention, stale-worker fencing, provider idempotency, and sanitized failures. |
| Playwright covers registration/verification, login, expiry/logout, protected redirects, and back navigation | **ACCEPT ON CHECKPOINT EVIDENCE** | Five journeys cover all required paths, including browser-observed session touch, idle expiry, reset revocation, token replay, and interrupted-worker recovery. |
| No Google, production email/domain, UAT, Lightsail, or Caddy access | **ACCEPT ON RECORDED EVIDENCE** | Only local PostgreSQL/Mailpit values and explicit local/non-production UI language are present. |

## Remaining Slice 2 blockers

None. Sliding idle renewal, centralized server password policy, trusted-proxy/multidimensional limits, outbox fencing/provider idempotency/error sanitization, and explicit suspended-user denial are implemented and evidenced.

## Slice 2 re-review evidence disposition

All requested evidence is present: migration 0004 and metadata, route/domain tests, 30 recorded live PostgreSQL tests, browser session-touch evidence, updated checkpoint results, all-five-migration empty database application, immediate migration rerun, health check, lint, build, and local Mailpit delivery.

## Exact Slice 3 recommendation

Slice 3 may now begin locally. It is **Google OIDC plus atomic Workspace/initial Owner provisioning**:

1. Implement Google Authorization Code + PKCE behind the identity adapter with state, nonce, issuer, audience, signature, expiry, exact redirect allowlist, and provider `sub` validation.
2. Implement the approved account-linking policy without treating matching email as a durable identity key.
3. Persist plan selection in server onboarding state and validate plan/cadence against the versioned active server catalog.
4. Implement idempotent workspace provisioning as one database transaction: verified active User, provisioning Workspace, Owner role, sole initial active Owner membership, entitlement snapshot, one-time trial start, workspace activation, onboarding completion, and audit/outbox records.
5. Bind idempotency records to authenticated principal, operation, key, and request hash; same-key retries return the original result and changed-input reuse is rejected.
6. Replace workspace-ready/CRM-entry authority from query parameters and `sessionStorage` with server-derived workspace, membership, role, plan, and onboarding state.
7. Resolve workspace authorization context only from the authenticated session plus active membership; add tenant-safe not-found behavior and cross-tenant denial tests.
8. Add last-Owner database/service protections and transaction tests, while keeping invitations and teams optional after CRM entry.
9. Add audit coverage for Google success/failure/linking, provisioning success/failure, Owner assignment, entitlement snapshot, idempotent replay, and privileged denials.
10. Add PostgreSQL and Playwright journeys for password and Google onboarding, provider cancellation/failure, duplicate workspace submission, refresh/retry, logout/login resume, and cross-tenant access.

Develop may use a local test OIDC fixture for Slice 3 and may implement/test atomic Workspace/initial Owner provisioning entirely against local PostgreSQL. Real Google acceptance, account-linking sign-off, production callback/origin validation, and provider secrets remain blocked on the Product/Operations Google Cloud project, canonical HTTPS domain, redirect URIs, and credentials. No UAT, Lightsail, or Caddy access is authorized by this gate decision.
