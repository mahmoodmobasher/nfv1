# Architect Slice 1 Gate Review

Status: **ACCEPT — Slice 1 complete**  
Review date: 2026-08-20  
Scope: Architect Slice 1 implementation and evidence against `concrete-stack-decision.md` and the Production Identity + Workspace Provisioning gate  
Boundary: documentation review only; no application code, Compose configuration, UAT, Lightsail, Caddy, or other infrastructure was modified.

## Verdict

Slice 1 is accepted. Develop closed every blocker from the initial review: local services are loopback-only, safe local environment placeholders are documented, migration `0002_fat_serpent_society.sql` completes the required tenant/audit/catalog foundation, and the expanded live PostgreSQL evidence passes.

The wider Production Identity + Workspace Provisioning gate remains incomplete by design. Slice 1 was not expected to deliver real authentication, Google OIDC, or atomic workspace provisioning.

## Evidence checked

- `docs/architecture/concrete-stack-decision.md`
- `docs/architecture/production-identity-workspace-gate.md`
- `docs/architecture/security-data-contracts.md`
- `docs/engineering/baseline-verification.md`
- `docs/engineering/slice-1-local.md`
- `package.json` and `package-lock.json`
- `docker-compose.local.yml`
- `drizzle.config.ts` and checked-in Drizzle migrations/metadata
- `src/server/env.ts`
- Database client, health, migration, transaction, schema, authorization-context, and workspace-membership repository code
- Unit, route, server-foundation, and live PostgreSQL integration tests
- Recorded pre/post-upgrade audit snapshots

The reviewer independently confirmed that the locked top-level dependencies resolve to Next.js 16.3.1, React/React DOM 19.2.0, Drizzle ORM 0.45.2, Drizzle Kit 0.31.10, and PostgreSQL driver 8.23.0. Compose configuration validation, Drizzle migration-history validation, unit tests, lint, and the production build passed during re-review. The completed empty-database, migration-rerun, health, and 16-test live PostgreSQL evidence in `baseline-verification.md` is the applicable database execution record.

## Criterion decisions

| Criterion | Decision | Evidence and reason |
| --- | --- | --- |
| Next 16 upgrade and audit remediation | **ACCEPT** | Next.js and `eslint-config-next` are 16.3.1 with React 19.2. Pre-upgrade evidence records 3 high findings; post-upgrade evidence records 0 critical, 0 high, and 4 moderate development-tool findings. Lint and build pass. |
| Local-only configuration | **ACCEPT** | PostgreSQL, SMTP, and Mailpit UI bind explicitly to `127.0.0.1`. `.env.example` contains local placeholders only and warns against production/vendor credentials. |
| Empty-database migration and safe rerun | **ACCEPT** | The baseline records all three migrations applied against an empty database, an immediate safe rerun through the Drizzle ledger, 12 application tables, and valid migration metadata. This does not claim raw SQL files are independently idempotent. |
| Required table and constraint coverage | **ACCEPT FOR SLICE 1** | Migration 0002 adds outbox workspace scope, the required audit foundation, versioned/effective plan catalog fields, composite audit-membership scope, and database checks for security-significant values. |
| Tenant-scope evidence | **ACCEPT FOR SLICE 1** | Live tests prove workspace-filtered membership reads, cross-workspace role rejection, outbox workspace foreign keys, and rejection of cross-workspace audit membership references. A session-derived context resolver remains correctly assigned to Slice 2. |
| Transaction/repository foundation | **ACCEPT AS FOUNDATION** | A database transaction helper, typed workspace context, and scoped membership repository exist. Atomic workspace/Owner provisioning is correctly deferred. |
| No false authentication claims | **ACCEPT** | Routes remain explicitly labelled as non-production previews, state nothing is authenticated, and continue to use demonstration browser state only. |
| No UAT/Lightsail access | **ACCEPT ON RECORDED EVIDENCE** | Engineering evidence states that only local Compose services and local ports were used. No UAT, Lightsail, Caddy, identity-provider, or email-provider values are present in the reviewed workspace. |

## Evidence reconciliation

`slice-1-local.md` previously preserved an earlier state in which the Docker daemon was unavailable and database execution remained pending. `baseline-verification.md` now records the completed remediated run: loopback-only PostgreSQL and Mailpit became healthy, all three empty-database migrations and their immediate rerun passed, database health passed, and all 16 PostgreSQL integration tests passed.

The stale statement in `slice-1-local.md` has been corrected. `baseline-verification.md` is the authoritative final execution record; the earlier Docker failure is retained only as historical context.

## Remaining Slice 1 blockers

None. All seven initial blockers are closed with checked-in implementation and updated verification evidence.

## Exact Develop Slice 2

Develop may now proceed locally with Slice 2: **server-owned password identity and session foundation**. It does not include Google OIDC or workspace/Owner provisioning.

No vendor credential, production email account, Google OAuth project, production domain, UAT access, Lightsail access, or Caddy change is required for Slice 2. Local PostgreSQL, Mailpit, placeholder session key material, and test-only browser flows are sufficient. Production values must continue to fail closed and remain externally supplied.

### Scope

1. Add verification and password-reset token persistence using random opaque values, hashes at rest, purpose binding, expiry, replacement, and single-use consumption.
2. Add Argon2id password hashing, verification, configurable cost parameters, and rehash-on-login support.
3. Implement password registration as one transaction that creates a pending User, password credential, onboarding progress, audit event, and verification outbox message. It must not create a Workspace or begin a trial.
4. Implement email verification, verification resend, password-reset request, and password-reset completion with enumeration-safe responses and transactional token consumption.
5. Implement PostgreSQL-backed opaque sessions with Secure/HttpOnly/SameSite cookies, idle and absolute expiry, session rotation, current-device logout, all-device revocation, and password-reset revocation.
6. Implement CSRF protection and Origin/Referer enforcement for all non-idempotent browser mutations.
7. Implement a server request-context resolver that derives the active User and session from the cookie. Workspace role and membership must not be accepted from browser input or an unverified caller-constructed context.
8. Implement PostgreSQL-backed rate limits for registration, login, verification, resend, and recovery by account, destination, and IP/risk key as applicable.
9. Implement `EmailAdapter` delivery to local Mailpit and a restartable, lease-based outbox worker with safe retries, dead-letter state, and token-safe logging.
10. Emit contract-safe audit events for registration, verification, login success/denial, recovery completion, logout, and session revocation.

### Slice 2 acceptance criteria

- [ ] Registration creates no Workspace, membership, entitlement snapshot, or trial.
- [ ] Passwords use Argon2id and are never logged or returned.
- [ ] Verification/reset tokens are random, hashed at rest, expiring, purpose-bound, single-use, replaceable, and replay-tested.
- [ ] Public login/recovery/verification responses do not disclose whether an account exists or why authentication failed.
- [ ] Session cookies are opaque, Secure in HTTPS environments, HttpOnly, SameSite constrained, rotated, expiring, and server-revocable.
- [ ] Current-device and all-device logout are idempotent and tested; password reset revokes existing sessions.
- [ ] CSRF and origin checks reject missing, invalid, and cross-origin mutation requests.
- [ ] Suspended users and revoked/expired sessions cannot obtain an authenticated request context.
- [ ] Rate-limit behavior and safe responses are covered by deterministic tests.
- [ ] Email and audit side effects share the transaction/outbox boundary and retries do not duplicate the protected mutation.
- [ ] PostgreSQL integration tests cover concurrency, token replay, session rotation/revocation, outbox leasing, and audit atomicity.
- [ ] Playwright covers registration through verification, login, expiry/logout, protected-route redirect, and back-button behavior using local PostgreSQL and Mailpit.
- [ ] No Google credential, production email account, domain, UAT, Lightsail, or Caddy access is required or used.

Google OIDC and atomic Workspace + initial Owner provisioning are reserved for Slice 3 after the password/session boundary passes this review.
