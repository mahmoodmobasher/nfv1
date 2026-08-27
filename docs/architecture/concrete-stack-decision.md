# Concrete Stack Decision

> Retained foundational stack authority. Current source, UAT, and feature status are recorded in `docs/handover/PROJECT-STATUS.md`.

Status: approved implementation default for the Production Identity + Workspace Provisioning gate  
Date: 2026-08-20  
Scope: local development and later Docker Compose deployment behind Caddy with PostgreSQL  
Constraint: documentation only; no UAT, Lightsail, Caddy, or application changes are authorized by this record.

## Decision summary

Use the smallest server-owned stack that works locally and maps directly to the intended Docker/Lightsail shape:

**Next.js 16.3.1 + React 19 compatibility line, PostgreSQL, `pg`, Drizzle ORM/migrations, Argon2id, PostgreSQL-backed sessions and outbox, `zod`, `nodemailer` development email, `openid-client` behind an identity adapter, Vitest, and Playwright.**

## Concrete choices

### Next upgrade

The Next upgrade happens first. Upgrade `next` and `eslint-config-next` together from 15.5.23 to 16.3.1, resolve the required React peer versions, regenerate the lockfile, and pass lint, type validation, production build, and audit before adding persistence or authentication behavior.

The reported three high-severity audit findings are treated as unresolved until Develop verifies the post-upgrade audit result. The target version is not evidence by itself.

### PostgreSQL, ORM, and migrations

- PostgreSQL is the only relational database for this gate, using the same major-version family locally and in the later Compose deployment.
- Use `pg` for the connection pool and **Drizzle ORM + `drizzle-kit`** for schema definitions and migrations.
- Check migrations into the repository and run them explicitly during deployment. Do not use runtime schema synchronization.
- Use explicit transactions and database constraints for identity uniqueness, membership uniqueness, tenant-scoped foreign keys, idempotency, invitation consumption, and last-Owner protections.
- Local PostgreSQL runs in a disposable Docker Compose service. UAT/production PostgreSQL values are injected externally; no existing environment is accessed.

### Passwords and tokens

- Use `argon2` with Argon2id and configurable cost parameters. Store only the encoded password hash and support rehash-on-login when parameters change.
- Use Node’s built-in `crypto` for `randomBytes`, SHA-256 token digests, and constant-time comparisons.
- Verification, reset, invitation, and idempotency values are opaque random secrets. Store only purpose-bound hashes with expiry, single-use, replacement, and replay protection.
- Use `jose` only when a signed or encrypted protocol token is required; do not use JWTs as the browser session store.

### Sessions, cookies, and CSRF

- Store sessions in PostgreSQL with an opaque, high-entropy session reference in the browser cookie.
- Use `Secure`, `HttpOnly`, `SameSite=Lax`, narrow path/domain, idle expiry, absolute expiry, rotation, and revocation.
- Login, password reset, privilege changes, and other high-risk transitions rotate sessions.
- Current-device logout invalidates the current session and clears the cookie. All-device logout revokes all sessions or increments a security version.
- Use a synchronizer token or signed double-submit CSRF design, plus Origin/Referer checks. All non-idempotent mutations require CSRF validation.
- Server authorization reads current User, session, membership, role, team, visibility, and entitlement state. Browser storage and query parameters are never authoritative.

### Validation and rate limiting

- Use `zod` at server request and domain-command boundaries for parsing, normalization, and stable error codes.
- Implement initial rate limiting with PostgreSQL-backed fixed/sliding windows; no Redis dependency is required for Slice 1.
- Rate-limit account, IP/risk signal, destination, login, provider start/callback, verification, reset/resend, invitation, and workspace provisioning operations.
- Public authentication and recovery responses remain enumeration-safe.

### Email and outbox

- Define an `EmailAdapter` interface owned by the application.
- Use `nodemailer` with a local SMTP sink such as Mailpit during development.
- Use PostgreSQL transactional outbox records for verification, reset, invitation, and audit side effects.
- A small restartable worker claims messages with leases, retries safely, records provider message IDs, and supports dead-letter state.
- The production email provider and credentials are selected later without changing domain services.

### Google OIDC boundary

Use `openid-client` only inside the identity adapter. The adapter owns discovery, Authorization Code + PKCE, state, nonce, exact redirect validation, issuer, audience, signature, expiry, and provider `sub` checks. It returns a normalized identity result to the application. Google email is not the durable identity key, and account linking requires the approved proof-of-control policy.

### Testing

- Use Vitest for unit and integration tests.
- Run repository, transaction, authorization, token, concurrency, and outbox tests against disposable PostgreSQL; mocks alone are insufficient for tenant and transaction guarantees.
- Use Playwright for the browser journey, protected-route redirects, cookies, session expiry, logout, provider cancellation/failure, and safe error states.

## Packages Develop may install now

These packages require no production credentials or vendor accounts:

- `next@16.3.1`
- matching `eslint-config-next`
- React peer versions required by the selected Next release
- `pg`
- `drizzle-orm`
- `drizzle-kit`
- `argon2`
- `jose`
- `openid-client`
- `zod`
- `nodemailer`
- `playwright`

The existing `vitest` dependency may be retained. Develop may add local-only Docker Compose support for PostgreSQL and Mailpit, but must not change the existing UAT/Lightsail stack.

## Values still blocked on Product/Operations

These are not package-installation blockers for local work, but they are required before UAT or production wiring:

- Canonical HTTPS application domain, Caddy certificate/termination, allowed origins, and exact Google callback URL.
- UAT/production PostgreSQL URLs, credentials, database region, backup, and restore ownership.
- Session signing/encryption keys and secret-store injection/rotation policy.
- Transactional email vendor, API/SMTP credentials, verified sender domain, templates, bounce/webhook secret, and support address.
- Google Cloud OAuth project, client ID/secret, consent-screen approval, and account-linking policy.
- Final plan catalog, prices, cadence, seat limits, trials, billing provider, and Enterprise policy.
- Rate-limit thresholds, risk controls, observability sink, retention, alert routing, and operational owners.
- Privacy jurisdiction, data retention/deletion/export, IP handling, support access, and audit reviewer policy.

## Develop Slice 1: framework and persistence foundation

Slice 1 is deliberately before real authentication UI wiring:

1. Upgrade Next and `eslint-config-next` to the approved target and resolve peer compatibility.
2. Pass lint, type validation, production build, and verify the audit result.
3. Add typed server-only environment validation with local-only defaults for a PostgreSQL container.
4. Add Drizzle schema and checked-in migrations for User, IdentityCredential, OnboardingProgress, Workspace, Role, WorkspaceMembership, PlanCatalogEntry, WorkspaceEntitlementSnapshot, Session, IdempotencyRecord, OutboxMessage, and AuditEvent.
5. Add a repeatable migration command, PostgreSQL health check, and transaction helper.
6. Add a typed workspace authorization context and repository tests proving tenant-scoped access cannot omit workspace context.
7. Add local PostgreSQL and Mailpit Compose support without touching UAT, Lightsail, or Caddy.

### Slice 1 acceptance criteria

- [ ] Next 16.3.1 and matching framework lint integration are locked and the application passes lint, type validation, and production build.
- [ ] Post-upgrade audit output is recorded; any remaining high-severity issue is explicitly triaged rather than ignored.
- [ ] Local startup requires no production credential and connects only to the disposable local PostgreSQL service.
- [ ] Empty-database migrations apply successfully, are safe to rerun, and are checked into the repository.
- [ ] Required identity, onboarding, workspace, membership, role, entitlement, session, idempotency, outbox, and audit tables/constraints exist.
- [ ] Tenant-owned records have workspace scope and cross-tenant foreign-key references are rejected.
- [ ] Transaction helpers and repository tests exercise PostgreSQL rather than mocks only.
- [ ] No application route is represented as authenticated, and no client-side state is treated as production authority.
- [ ] No UAT/Lightsail/Caddy environment was accessed or modified.

This slice does not include real provider credentials, production email delivery, Google OAuth registration, Lightsail deployment, or replacement of the prototype authentication screens.
