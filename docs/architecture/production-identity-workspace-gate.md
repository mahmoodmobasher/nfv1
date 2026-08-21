# Production Identity + Workspace Provisioning Gate

Status: approved architecture decision package  
Scope: first production slice after the onboarding UI prototype  
Authority: this package operationalizes `security-data-contracts.md`; the security/data contract remains authoritative if wording conflicts.

## 1. Gate objective

Enable a real user to complete:

`Select plan -> Register -> Verify identity -> Create workspace -> Become Owner -> Enter CRM -> Logout/login`

with all identity, onboarding, workspace, membership, entitlement, session, and audit state authoritative on the server. No CRM business data or protected workspace feature may be released behind this gate until every checklist item in section 12 passes.

## 2. Decisions implementable now

These are provider-neutral defaults and may be built without waiting for vendor credentials:

- Keep authentication behind an application-facing identity adapter with operations for registration, login, verification, recovery, provider callback, session validation, rotation, and revocation.
- Use opaque UUID-equivalent identifiers, UTC timestamps, normalized email comparisons, optimistic concurrency versions, and database-enforced uniqueness.
- Use a relational transactional persistence boundary for User, IdentityCredential, OnboardingProgress, Workspace, Role, WorkspaceMembership, Team, TeamMembership, PlanCatalogEntry, WorkspaceEntitlementSnapshot, IdempotencyRecord, OutboxMessage, and AuditEvent.
- Keep password hashing, token generation, token hashing, expiry, single-use consumption, and breached-password checks behind the identity adapter. Passwords and raw tokens never enter application logs or persistence.
- Use server sessions represented by an opaque cookie and server-side session records or an equivalent revocable session reference. Do not put mutable roles, entitlements, or workspace authorization in durable browser state.
- Require `Idempotency-Key` on every mutation and bind idempotency records to principal, operation, and request hash.
- Implement workspace provisioning as one transaction: validate active verified user, validate server catalog, create provisioning workspace, create/reuse Owner role, create active Owner membership, snapshot entitlement/trial, activate workspace, complete onboarding, and enqueue/write audit events.
- Resolve authorization in the contract order: session, active membership, role, team, ownership, visibility, entitlement, decision/audit. Return tenant-safe not-found responses for unauthorized resources.
- Use a transactional outbox for email and audit side effects. Workers must carry explicit workspace context and be safe to retry.
- Treat the current UI's query parameters and `sessionStorage` values as hints only. The server derives onboarding step, plan, cadence, workspace, role, entitlement, and CRM destination.
- Test the security boundary before feature breadth: duplicate requests, refresh/retry, cross-tenant access, stale versions, token replay, session revocation, last-Owner protection, and safe error disclosure.

## 3. Required secure configuration interfaces

Application code should consume typed server-only configuration. Missing required production values must fail startup or deployment validation; no secret has a `NEXT_PUBLIC_` equivalent.

| Interface | Required values | Supplied later by Product/Operations |
| --- | --- | --- |
| `APP_ORIGIN` | Canonical HTTPS application origin; allowlisted return origins | Production domain and HTTPS certificate/termination |
| `DATABASE_URL` / database binding | TLS database connection or managed binding; migration target | Selected database service, region, backup/restore policy |
| `SESSION_KEYS` | Rotatable signing/encryption or cookie key material | Secret-store placement and rotation ownership |
| Identity provider | Provider tenant/issuer, client identifiers, server credentials, callback URLs | Chosen identity vendor and account policy |
| Email provider | API credential, verified sender/domain, template identifiers, webhook secret | Vendor, sending domain, templates, bounce handling, support address |
| Google OIDC | issuer, client ID/secret, exact callback URI, allowed origins | Google Cloud project, consent screen, OAuth values |
| Rate/risk controls | rate-limit store/binding, bot/risk keys where selected | Thresholds, exemptions, monitoring ownership |
| Plan catalog | Server-managed catalog version and effective entries | Final prices, cadences, limits, trials, billing/Enterprise policy |
| Observability | redaction-safe log/trace sink and alert destination | Retention, access, on-call and incident process |

Secrets belong in the deployment secret store. Configuration validation must reject insecure production origins, wildcard callback/return URLs, missing token signing keys, and browser-exposed credentials.

## 4. Authentication and provider boundaries

The identity adapter owns password policy, adaptive hashing, email verification, password recovery, provider assertions, account status, and credential linking. The application owns onboarding progression, workspace membership, authorization, and audit correlation.

Password flows must provide generic public responses, account/IP/destination rate limits, single-use hashed tokens, 24-hour verification links, one-hour reset links, session revocation after reset, and recent-authentication support for sensitive actions.

Google uses OIDC Authorization Code + PKCE. The server validates state, nonce, issuer, audience, signature, expiry, and provider `sub`. Provider email is not the durable identity key. Account linking requires proof of both identities; matching email alone is not sufficient unless the approved provider policy explicitly guarantees verified-email auto-linking.

## 5. Persistence and transaction boundaries

The database is the source of truth for identity references, onboarding, workspaces, memberships, roles, teams, entitlements, idempotency, outbox messages, and audit events. Every tenant-owned table carries `workspace_id` directly where practical; foreign keys and unique constraints include workspace scope.

The workspace transaction must lock or otherwise serialize competing provisioning requests. Reuse of an idempotency key with different input is rejected. A retry with the same key returns the original result. Trial start, Owner membership, entitlement snapshot, workspace activation, onboarding completion, and protected audit events cannot be partially committed.

## 6. Sessions, logout, and route protection

Use `Secure`, `HttpOnly`, `SameSite=Lax` (or stricter where compatible) cookies. State-changing requests require framework-appropriate CSRF protection and origin checks. Sessions contain identity/session references, not trusted mutable permissions.

Privilege changes, password reset, login, and other high-risk transitions rotate sessions. Current-device logout is idempotent and clears the cookie. All-device logout increments a security/session version or revokes all sessions. Suspensions and removed memberships must take effect within the approved revocation target. Protected routes and server actions must deny access independently of client navigation.

## 7. Plan catalog and entitlements

The server owns plan code, cadence, catalog version, prices, seats, features, limits, trial duration, effective dates, and billing state. Browser prices and seat counts are never trusted. A workspace receives an immutable entitlement snapshot at provisioning, with explicit rules for upgrades, downgrades, trial expiry, grace periods, seat reservation, and Enterprise sales handling.

## 8. Authorization and tenant isolation

All repositories/services require an authenticated workspace context; request payload workspace IDs are never sufficient. Cache keys, object storage paths, search documents, queues, exports, telemetry, and background jobs preserve workspace scope. Cross-workspace references are rejected by constraints and service checks.

Roles are `owner`, `admin`, and `member` with versioned permission sets. There is always at least one active Owner. Owner transfer promotes the successor before demoting the prior Owner in one transaction. Role/team/membership writes use expected versions and audit both success and denial where security-sensitive.

## 9. Audit and operational controls

AuditEvent is append-only and records actor, session/correlation references, workspace, action, target, outcome, reason, request metadata, and safe before/after information. It covers login/logout, verification, recovery completion, provisioning, role/team/membership changes, invitations, ownership transfer, entitlement changes, denied privileged actions, and CRM mutations.

Secrets, passwords, tokens, raw authorization headers, full reset/verification URLs, and unnecessary personal data are prohibited. Audit retention, export, tamper evidence, privileged viewers, IP handling, deletion, and regional storage follow the approved Product policy once supplied.

## 10. Deployment boundaries

The marketing/onboarding frontend may render forms and call the application API, but it must not own identity, authorization, plan truth, or tenant state. Server-only identity, persistence, email, outbox workers, and audit components run behind the approved HTTPS origin and secret store. Database migrations, worker deployment, and application deployment must be separately observable and rollback-aware.

No Lightsail access, infrastructure mutation, credential creation, or vendor provisioning is included in this Architect package.

## 11. Product/Operations values still required

Approval of the architecture does not manufacture vendor or environment values. Before production deployment, Product/Operations must provide and approve:

1. Canonical domain, HTTPS termination, allowed origins, callback URLs, and deployment/data regions.
2. Identity provider, password ownership model, MFA decision, session lifetimes, revocation target, and recent-authentication window.
3. Google Cloud OAuth project and account-linking policy.
4. Transactional email provider, verified sender, templates, bounce handling, and support contact.
5. Final plan catalog, billing provider, trial/seat rules, Enterprise policy, upgrade/downgrade/grace behavior.
6. Privacy jurisdiction, retention, deletion/export, backup, IP-address, support-access, and emergency-access policies.
7. CRM visibility and lead ownership/routing rules.
8. Audit reviewers, alert recipients, and incident-response ownership.

## 12. Develop acceptance checklist

Develop must attach evidence for every item below before declaring the gate complete:

- [ ] Provider adapters are selected and configured without exposing credentials to browser code.
- [ ] Production HTTPS/origin/redirect allowlists reject HTTP, wildcard, and arbitrary return URLs.
- [ ] Registration creates a pending User and dispatches verification without creating a Workspace.
- [ ] Verification and recovery tokens are random, hashed at rest, purpose-bound, single-use, expiring, replaceable, rate-limited, and absent from logs.
- [ ] Password login, Google callback, generic failures, account status, and approved linking behavior are tested.
- [ ] Sessions use secure cookies, rotate at required transitions, support current/all-device logout, and enforce configured expiry/revocation.
- [ ] Protected routes/actions reject unauthenticated users, suspended users, removed memberships, and stale sessions server-side.
- [ ] Database schema enforces opaque IDs, normalized-email policy, membership uniqueness, role/team integrity, tenant-scoped foreign keys, and version/concurrency rules.
- [ ] Plan selection and onboarding progress are persisted and server-derived; client plan/cadence/workspace values cannot override server state.
- [ ] Workspace provisioning is atomic and idempotent, creates exactly one active initial Owner, snapshots entitlements, starts the trial once, and cannot commit an Ownerless workspace.
- [ ] Last-Owner removal/demotion and ownership transfer protections are covered by transaction/concurrency tests.
- [ ] All tenant queries require workspace context; cross-tenant reads/writes, references, cache keys, jobs, exports, and searches are denied or isolated.
- [ ] Authorization tests cover role, team, ownership, visibility, entitlement, safe 404 behavior, and privileged denials.
- [ ] Transactional outbox retries are safe; verification, reset, and audit side effects are observable and non-duplicating.
- [ ] Audit events are append-only, security-safe, correlated, and emitted for all contract-required actions and denials.
- [ ] Rate limits, CSRF/origin checks, security headers, redacted logging, monitoring, dependency scanning, and alerting are enabled.
- [ ] End-to-end tests cover the complete journey, refresh/retry, duplicate submission, session expiry, logout, provider cancellation/failure, token replay, and deployment configuration validation.
- [ ] Database backup/restore, migration rollback, secret rotation, incident response, and data deletion/export procedures have evidence and an owner.
- [ ] The frontend no longer labels production paths as local preview and contains no protected-state authority in `sessionStorage` or query parameters.

## 13. Concrete implementation-stack decision record

Decision date: 2026-08-20  
Target: local Docker development and the existing PostgreSQL/Caddy/Lightsail Compose shape, without accessing or modifying that environment.

### Chosen stack

| Concern | Concrete default | Boundary/notes |
| --- | --- | --- |
| Web runtime | Next.js 16.3.1, React version selected by its peer requirements | Upgrade the existing Next package and `eslint-config-next` together. Keep the upgrade isolated before adding backend behavior. |
| Relational persistence | PostgreSQL already present in the target stack | Use one application database/schema initially; preserve an explicit `workspace_id` boundary in every tenant-owned table. |
| Schema and migrations | Drizzle ORM + `drizzle-kit` | SQL-first schema definitions, checked-in migrations, explicit transactions, and migration status in deployment. Do not use runtime schema synchronization. |
| Database access | `pg` connection pool with Drizzle repositories/services | Keep SQL/ORM access server-only. Repository methods receive a typed authorization/workspace context; no route handler may construct unrestricted tenant queries. |
| Password hashing | `argon2` with Argon2id and deployment-configurable cost parameters | Hashing runs server-side; store only the encoded hash. Add a rehash-on-login path when parameters change. |
| Token primitives | Node `crypto` (`randomBytes`, `createHash`, `timingSafeEqual`) | Store only SHA-256 or stronger hashes of verification, reset, invitation, and idempotency secrets. Use opaque random values, purpose binding, expiry, and single-use constraints. Use `jose` only where signed/encrypted protocol tokens are required. |
| Identity protocol | Application identity adapter; Google via `openid-client` behind that adapter | The adapter owns provider discovery, authorization-code + PKCE, state, nonce, issuer/audience/signature/expiry checks, and subject mapping. Application code consumes a normalized result. |
| Sessions | PostgreSQL `sessions` table plus opaque cookie | Cookie contains only an unguessable session reference; server lookup checks user status, security version, expiry, and current authorization. No JWT-only browser session for MVP. |
| Cookies/CSRF | Next/server cookie APIs; synchronizer token or signed double-submit token, plus Origin/Referer checks | Use `Secure`, `HttpOnly`, `SameSite=Lax`, narrow `Path`/`Domain`, and constant-time token comparison. All non-idempotent mutations require CSRF validation. |
| Email | `EmailAdapter` interface with a development SMTP adapter using `nodemailer`; production provider adapter selected later | Verification/reset/invitation sends are outbox messages. A worker claims messages with leases, retries safely, and records provider message IDs without logging tokens. |
| Outbox | PostgreSQL outbox table and a small worker process/command in the Compose deployment | No queue service is required for the first slice. The worker must be independently restartable and use explicit retry/dead-letter states. |
| Validation | `zod` schemas shared by server request boundaries and domain commands | Validate and normalize at the server boundary; never use client schemas as authorization or entitlement checks. |
| Rate limiting | PostgreSQL-backed fixed/sliding windows implemented in the application boundary | Cover account, IP/risk signal, destination, provider start/callback, login, verification, reset, resend, invitation, and provisioning. A Redis binding is a later optimization, not an MVP prerequisite. |
| Unit/integration tests | Vitest, existing project test direction, plus a disposable PostgreSQL test database | Test repositories, transactions, authorization, token replay, concurrency, and outbox behavior against PostgreSQL rather than mocks alone. |
| Browser/system tests | Playwright | Add a real-browser journey against the local app and test protected-route behavior, cookie/session expiry, redirects, and safe error states. |
| Local configuration | Docker Compose for PostgreSQL and an SMTP sink such as Mailpit; `.env.example` with names only | Local secrets live in an untracked `.env.local`/Compose env file. Production secret injection remains external. No Lightsail or Caddy configuration is changed by this work package. |

### Upgrade order

1. Upgrade `next` and `eslint-config-next` from 15.5.23 to 16.3.1 together, resolve peer requirements using the repository's React 19 line, and regenerate the lockfile.
2. Run lint, type validation, production build, and the existing audit check. Resolve framework migration warnings before adding server persistence.
3. Add the database/migration foundation (`pg`, `drizzle-orm`, `drizzle-kit`) and a health-checked local PostgreSQL connection.
4. Add domain validation and persistence primitives, then identity/session behavior, then outbox/email, then Google OIDC, and finally protected workspace provisioning.
5. Add Vitest integration coverage and Playwright journey coverage before switching prototype routes to production behavior.

The Next upgrade is a release prerequisite because the current audit finding is reported as remediated by 16.3.1. Develop must verify the actual post-upgrade audit result; no severity is assumed resolved solely from the target version.

### Dependencies Develop may install now

These packages do not require production credentials to install or use locally:

- `next@16.3.1` and matching `eslint-config-next`; compatible React peer versions as required by the release.
- `pg`, `drizzle-orm`, and `drizzle-kit`.
- `argon2`, `jose`, `openid-client`, `zod`, and `nodemailer`.
- `vitest` (already present) and `playwright` plus its approved browser runtime.

Develop may also add non-secret local Compose support for PostgreSQL and Mailpit, provided it does not touch the existing UAT/Lightsail stack.

### Values/accounts still required later

The following are not npm dependencies and must come from Product/Operations before UAT or production wiring:

- Canonical HTTPS application origin, Caddy certificate/domain configuration, allowed origins, and exact Google callback URL.
- PostgreSQL database URL/database credentials for UAT and production, including backup/restore ownership.
- Session secret/key material and secret-store injection mechanism.
- Transactional email provider account, API/SMTP credential, verified sender domain, templates, webhook/bounce credentials, and support address.
- Google Cloud OAuth project, client ID/secret, consent-screen approval, and account-linking policy.
- Final plan catalog, billing rules, trial/seat behavior, and entitlement values.
- Rate-limit thresholds, risk controls, observability sinks, retention, alert routing, and operational ownership.

No credential, real email provider, domain, Caddy certificate, or Lightsail access is needed for the first local implementation slice.

## 14. Develop first implementation slice

The first slice is **framework upgrade plus persistence foundation**, not authentication UI replacement:

1. Upgrade Next and its framework lint integration; pass lint, build, type validation, and audit.
2. Add typed server-only environment validation with safe local defaults pointing only to a local PostgreSQL container.
3. Add Drizzle schema/migrations for User, IdentityCredential, OnboardingProgress, Workspace, Role, WorkspaceMembership, PlanCatalogEntry, WorkspaceEntitlementSnapshot, Session, IdempotencyRecord, OutboxMessage, and AuditEvent.
4. Add a PostgreSQL health check and migration command that are safe to run repeatedly.
5. Add repository transaction helpers and a workspace-context type, including tests proving tenant-scoped queries cannot omit workspace context.
6. Add a disposable local PostgreSQL + Mailpit Compose profile and `.env.example`; do not alter application routes, UAT, Lightsail, or Caddy.

The slice is complete when the upgraded app builds cleanly, migrations apply/reapply cleanly to an empty local database, schema constraints are tested, secrets are not required for local startup, and no production route has been falsely represented as authenticated.
