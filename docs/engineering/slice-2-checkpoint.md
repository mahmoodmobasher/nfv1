# Architect Slice 2 implementation checkpoint

**Date:** 2026-08-20  
**Status:** Final local Slice 2 engineering evidence; ready for Architect re-review  
**Boundary:** Local PostgreSQL and Mailpit only. No Google OIDC, workspace/Owner provisioning, Lightsail, UAT, Caddy, or production credential was used.

## Completed foundation

- Random opaque verification/reset tokens with only keyed hashes in token persistence, purpose binding, expiry, replacement, and atomic single-use consumption.
- Authenticated encryption for email outbox envelopes, so raw identity tokens are not stored in token rows or plaintext outbox JSON.
- Argon2id password hashing, verification, configured costs, dummy-hash verification for unknown accounts, and rehash detection/update.
- Transactional pending-user registration creating User, password credential, onboarding progress, verification token, audit event, and outbox message together. It creates no Workspace, membership, entitlement, or trial.
- Verification, resend, reset request, and reset completion services with generic public responses where account enumeration is relevant.
- Opaque PostgreSQL sessions with hashed identifiers, idle/absolute expiry, login rotation, current/all-device revocation, password-reset revocation, and active-user/security-version validation.
- Concurrency-safe sliding idle-session renewal uses a bounded touch interval and caps renewal at absolute expiry; suspended users cannot establish request context.
- Same-origin Origin/Referer enforcement plus double-submit CSRF protection for browser mutations.
- Session-derived identity request context; no browser-provided role or workspace context is accepted.
- A single server password policy (12–256 characters, number, and symbol) is enforced before registration/reset hashing or persistence, including direct domain calls.
- PostgreSQL fixed-window rate limits apply network plus account/destination/token dimensions to registration, login, verification, resend, reset request, and reset completion. Forwarded client addresses are accepted only from explicitly configured trusted proxies presenting the configured proxy secret; local direct requests use a non-spoofable fallback bucket.
- Local Mailpit adapter and restartable outbox processing with `FOR UPDATE SKIP LOCKED`, leases, retry, provider message IDs, and dead-letter state. Persisted lease owner/generation fencing prevents stale workers from finalizing reclaimed work, provider idempotency keys survive retries, and stored delivery failures are sanitized.
- Safe audit events for registration, verification, resend, reset request/completion, login success/denial, and logout paths.
- Existing registration/login/verification/recovery UI wired to local identity routes with explicit local/non-production labeling. Workspace creation remains preview-only and is not server-provisioned.
- `/workspace/create` requires a current server session and redirects unauthenticated requests to local sign-in.

## Verification evidence

| Check | Result |
| --- | --- |
| Empty local database migration | Passed, all 5 checked-in migrations |
| Immediate migration rerun | Passed |
| Database health | Passed: `{ ok: true, latencyMs: 17 }` |
| Unit and direct route tests | Passed: 22 tests; 30 live-only tests skipped by design |
| Live PostgreSQL tests | Passed: 30 tests across 2 serial files |
| Lint | Passed with no warnings/errors |
| Production build | Passed with Next.js 16.3.1; 9 dynamic auth routes and dynamic protected workspace entry |
| Playwright identity/session suite | Passed: 5 browser journeys |
| Real Mailpit delivery | Passed: separate worker processes delivered verification/reset messages; Mailpit API reported 31 messages after the final suite |
| Online npm audit | 0 critical, 0 high, 4 moderate development-tool findings |

Live PostgreSQL coverage includes duplicate registration concurrency, transactional rollback/audit atomicity, verification/reset replay, session rotation/revocation/expiry, concurrent bounded idle refresh with absolute-expiry capping, suspended-user denial, reset revocation, enumeration-safe reset responses, multidimensional rate limits, outbox lease concurrency and stale-worker fencing, successful delivery, retries, sanitized failures, and dead-letter transition. Existing Slice 1 tenant and state tests continue to pass.

## Slice 2 gate-blocker remediation

The four blockers recorded in `docs/architecture/slice-2-gate-review.md` are implemented locally:

1. Session reads atomically renew idle expiry only after the configured touch interval, remain valid under concurrent reads, and never extend beyond absolute expiry.
2. Registration and password-reset completion share one server-owned password policy. Route and domain tests prove weak passwords are rejected before Argon2 hashing, user creation, or reset-token consumption.
3. Arbitrary `X-Forwarded-For` input is ignored. Trusted forwarding requires explicit enablement plus a constant-time checked proxy secret, and sensitive flows consume both network and subject-specific PostgreSQL buckets.
4. Outbox claims persist worker ownership and monotonically increasing lease generation. Delivered/retry/dead-letter transitions require the matching fence; a stale worker cannot finalize after expiry and reclaim. Provider calls carry a stable idempotency key and persisted errors are reduced to an allowlisted safe category.

Migration `0004_tired_mother_askani.sql` adds the outbox fencing/idempotency columns and constraints. It was applied through Drizzle and immediately rerun successfully. Database health after the final rerun was `{ ok: true, latencyMs: 15 }`.

## Completed browser and route evidence

Playwright now covers:

- registration → separate Mailpit worker process → email verification → verified login → protected workspace-preview entry;
- verification token replay plus invalid and expired verification links;
- invalid, expired, and replayed reset links;
- current-device logout while another device remains active;
- all-device logout invalidating the remaining device;
- session idle expiry;
- password reset revoking an authenticated session;
- unauthenticated protected-route redirect and back-button behavior after logout;
- interrupted worker recovery: a separate worker cannot take an active lease, then a new process reclaims and delivers it after lease expiry.

Direct route tests prove malformed JSON rejection, missing and mismatched CSRF rejection, cross-origin Origin/Referer rejection, same-origin Referer acceptance, and `HttpOnly`/`SameSite=Lax` cookie behavior with `Secure` absent for local HTTP and present for production HTTPS configuration.

The completion run exposed and repaired two client/browser defects and one worker defect: strict-mode duplicate verification submission, stalled post-login client navigation, and unreclaimable expired `processing` leases. All final checks pass without weakening an acceptance criterion.
