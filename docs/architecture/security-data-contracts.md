# NexaFlow CRM onboarding MVP: security and data contracts

> Retained foundational security contract. Later CRM verticals inherit these boundaries; current delivery status is recorded in `docs/handover/PROJECT-STATUS.md`.

Status: product/architecture contract for implementation planning  
Scope: plan selection, account creation, identity verification, workspace provisioning, owner assignment, CRM entry, invitations, roles, optional teams, sessions, and recovery  
Out of scope: UI implementation, billing collection, lead-domain schema, and vendor-specific integration code

## 1. Architectural boundaries and invariants

The MVP journey is:

`Select Plan -> Create Account -> Verify Identity -> Create Workspace -> Assign Workspace Owner -> Enter CRM`

After entry, the Owner may perform the optional setup journey:

`Invite Users -> Assign Roles -> Optional Teams`

The following are non-negotiable invariants:

- A human identity is represented once; its access to each workspace is represented separately.
- Every business record belongs to exactly one workspace. Cross-workspace reads and writes are denied by default.
- Workspace creation and initial Owner membership are one atomic operation. A workspace without an Owner must never be committed.
- The first successfully provisioned member is the sole initial Owner.
- Authentication proves identity; authorization separately determines access to a workspace and record.
- Roles are required for active memberships. Team membership is optional.
- Plan entitlements constrain available capabilities but never grant record access by themselves.
- Protected actions and security-administration changes produce immutable audit events.
- The server is authoritative for onboarding status, entitlements, roles, ownership, and visibility. Client-supplied equivalents are hints only.

## 2. Core data model

Identifiers are opaque, immutable UUIDs (or an equivalent non-sequential type). Timestamps are UTC ISO-8601 values. Mutable entities include `created_at`, `updated_at`, and a concurrency token/version. Email comparisons use a normalized form while retaining the user-entered display form.

### Identity and account

**User**

- `id`
- `primary_email_normalized` (unique when present)
- `primary_email_display`
- `display_name`
- `status`: `pending_verification | active | suspended | deleted`
- `email_verified_at` (nullable)
- `created_at`, `updated_at`

**IdentityCredential**

- `id`, `user_id`
- `provider`: `password | google`
- `provider_subject`: unique with provider; for password this is an internal credential identifier
- `password_hash` (password provider only; never returned or logged)
- `created_at`, `last_used_at`

A User may link multiple credentials. Provider email is not a durable identity key; Google `sub` is. Linking a Google credential to an existing account requires proof of control of the signed-in account and the Google identity; matching email alone is insufficient unless the selected identity vendor explicitly guarantees a verified email and the client approves account auto-linking.

### Workspace and membership

**Workspace**

- `id`
- `name`
- `slug` (unique routing label; not an authorization boundary)
- `status`: `provisioning | active | suspended | closed`
- `plan_code`
- `billing_cadence`: `monthly | annual | sales_managed`
- `trial_started_at`, `trial_ends_at` (nullable)
- `created_by_user_id`
- `created_at`, `updated_at`

**WorkspaceMembership**

- `id`, `workspace_id`, `user_id`
- `role_id`
- `status`: `active | suspended | removed`
- `joined_at`, `removed_at` (nullable)
- unique `(workspace_id, user_id)`

**Role**

- `id`, `workspace_id` (nullable only for immutable system templates)
- `code`: MVP system codes `owner | admin | member`
- `permissions` (versioned permission-set reference)
- `is_system`, `created_at`, `updated_at`

MVP semantics:

- **Owner:** full workspace administration, including ownership transfer and workspace-critical settings.
- **Admin:** user, configuration, and CRM administration except Owner-only actions.
- **Member:** CRM actions permitted by ownership, team, visibility, and plan rules.

There must always be at least one active Owner. Removing, suspending, or downgrading the last Owner is rejected. Ownership transfer must atomically promote the successor before demoting the prior Owner.

**Team**

- `id`, `workspace_id`, `name`, `created_by_user_id`
- `created_at`, `updated_at`
- unique normalized team name within a workspace

**TeamMembership**

- `team_id`, `workspace_membership_id`
- `created_at`, `created_by_user_id`
- unique `(team_id, workspace_membership_id)`

Both sides must belong to the same workspace.

### Onboarding state

**OnboardingProgress**

- `id`, `user_id`
- `selected_plan_code`, `billing_cadence`
- `current_step`: `account | identity_verification | workspace | complete`
- `workspace_id` (nullable until provisioned)
- `completed_at` (nullable)
- `version`, `created_at`, `updated_at`

Progress is server-derived from durable facts. A returning user resumes at the first incomplete step. A selected plan may be changed before workspace provisioning. `complete` requires an active, verified User plus an active Workspace and active Owner membership.

## 3. Atomic workspace and Owner provisioning

`Create Workspace` executes in one database transaction:

1. Confirm the authenticated User is active and identity-verified.
2. Confirm the onboarding record is not already attached to another active workspace.
3. Validate the selected plan/cadence against the server-side plan catalog.
4. Create the Workspace in `provisioning` state.
5. Create or reference the system Owner role.
6. Create the active WorkspaceMembership with Owner role.
7. Create initial plan entitlement snapshot and begin the trial.
8. Mark the Workspace `active` and onboarding `complete`.
9. Write the workspace-created and owner-assigned audit events in the same transaction/outbox boundary.

If any step fails, none are committed. Repeated requests with the same idempotency key return the original result; they do not create another workspace or restart the trial.

## 4. Authentication, sessions, and logout

- Passwords are stored only as adaptive one-way hashes using the identity platform's current recommended settings. Password policy and breached-password checks are server-side.
- Browser sessions use `Secure`, `HttpOnly`, `SameSite=Lax` (or stricter where compatible) cookies. Session identifiers and refresh tokens are never exposed to browser JavaScript.
- Session rotation occurs at login, privilege change, password reset, and other high-risk transitions.
- State-changing requests require CSRF protection appropriate to the chosen framework/provider, plus origin checks.
- Sessions carry identity and session references, not trusted mutable role/entitlement claims. Authorization uses current server state or short-lived, invalidatable claims.
- Idle and absolute lifetimes are configurable. Sensitive account and Owner actions require recent authentication.
- **Logout current device** invalidates the current server session and clears cookies even if invalidation is already complete.
- **Logout all devices** increments a user session/security version or revokes all active sessions. Password reset revokes all existing sessions by default.
- Suspended users and removed memberships lose access immediately; caching must not extend access beyond the agreed revocation target.

## 5. Email verification and password recovery

Verification and reset tokens are single-use, cryptographically random, stored only as hashes, bound to purpose and user, and invalid after consumption, replacement, or expiry.

Recommended defaults pending vendor confirmation:

- Email-verification link lifetime: 24 hours.
- Password-reset link lifetime: 1 hour.
- Resending verification invalidates older unconsumed links or otherwise guarantees only one can succeed.
- Changing the account email resets email verification and requires confirmation of the new address.

All request/resend/recovery endpoints are rate-limited by account, IP/risk signal, and destination. Public responses are deliberately indistinguishable (for example, “If an account exists, we sent instructions”) to prevent account enumeration. Tokens, full email addresses, passwords, and authentication headers are never logged.

## 6. Google identity contract

- Use OpenID Connect Authorization Code flow with PKCE, exact registered redirect URIs, `state`, and `nonce` validation.
- Validate issuer, audience, signature, expiry, nonce, and provider subject server-side.
- Request the minimum scopes: `openid email profile`.
- Treat Google `sub` as the provider identity. Persist only required profile data.
- A successful, valid Google assertion with a provider-verified email satisfies identity verification for that credential.
- Cancellation or provider failure returns the user to a safe onboarding state without creating a Workspace or starting a trial.
- Account-linking policy, Google Cloud project, consent screen, client IDs/secrets, allowed origins, and redirect URIs remain client/vendor configuration decisions.

## 7. Invitations

**WorkspaceInvitation**

- `id`, `workspace_id`
- `email_normalized`, `email_display`
- `role_id`
- optional `team_ids` snapshot/association
- `token_hash`
- `status`: `pending | accepted | revoked | expired`
- `expires_at`, `accepted_at`, `accepted_by_user_id`
- `invited_by_membership_id`, `created_at`

Invitation rules:

- Default lifetime is 7 days, pending confirmation.
- Pending invitations do not consume seats. Acceptance checks current seat and plan entitlement atomically.
- The inviter must currently hold permission to invite and assign the requested role/teams.
- MVP invitations cannot grant Owner. Owner transfer uses a dedicated recent-authentication flow.
- Acceptance requires authentication and proof of the invited email, unless an approved admin override policy is later introduced.
- Acceptance atomically consumes the invitation, creates/reactivates one membership, assigns permitted teams, and audits the result.
- Repeated acceptance returns the existing membership result without duplication. Revoked, expired, wrong-workspace, and already-consumed tokens do not reveal sensitive details.

## 8. Tenant isolation and authorization

Every tenant-owned table includes `workspace_id` directly, including child/resource tables where practical. Unique constraints and foreign keys include `workspace_id` to prevent accidental cross-tenant references. All repository/service queries require workspace context sourced from the authenticated route/session, never solely from request payload. Background jobs carry an explicit workspace context. Object storage keys, cache keys, search indexes, queues, exports, telemetry, and backups preserve tenant boundaries.

Authorization evaluates, in order:

1. **Identity/session:** is the request authenticated with an active session and active User?
2. **Workspace membership:** is membership active for the route's Workspace?
3. **Role permission:** does the role permit the action type?
4. **Team membership:** do applicable team-scoped rules permit the resource/action?
5. **Ownership:** does the user own the record, where ownership is required or grants access?
6. **Visibility:** do record visibility rules permit access (for example private, team, or workspace)?
7. **Plan entitlement:** is the feature/action available and within limits?
8. **Decision and audit:** deny by default; audit security-sensitive decisions and all mutations.

Plan checks do not override a failed security check. Resource existence and authorization should be evaluated without leaking cross-tenant existence; unauthorized tenant resources generally return `404` rather than `403`.

## 9. Audit contract

**AuditEvent** is append-only:

- `id`, `occurred_at`
- `workspace_id` (nullable only for pre-workspace identity events)
- `actor_user_id`, `actor_membership_id` (nullable for system actions)
- `actor_type`: `user | system | support`
- `session_id` or correlation-safe hash
- `action` (stable machine code)
- `target_type`, `target_id`
- `outcome`: `success | denied | failure`
- `reason_code`
- `request_id`, `correlation_id`
- `source_ip` (minimized/retained per policy), `user_agent` (sanitized)
- `before` and `after` security-safe diffs or field-name lists
- `metadata` (allowlisted, versioned)

Audit events include login/logout, verification, password recovery completion, workspace creation, role/team/membership changes, invitations, ownership transfer, entitlement changes, denied privileged actions, and CRM mutations. Secrets, tokens, passwords, raw authorization headers, and unnecessary personal data are prohibited. Audit writes use the same transaction or a transactional outbox for protected mutations. Retention, export, tamper evidence, and privileged viewer access require client policy decisions.

## 10. Plan entitlements

**PlanCatalogEntry** (server-managed configuration)

- `code`, `name`, `status`
- allowed billing cadences
- `included_active_seats`
- feature flags and numeric limits
- trial duration
- catalog/version effective dates

**WorkspaceEntitlementSnapshot**

- `workspace_id`, `plan_code`, `catalog_version`
- effective feature flags/limits
- `effective_at`, optional `expires_at`
- subscription/trial state

The UI may display plan metadata, but the server validates a stable `plan_code` and cadence. Prices sent by a browser are never trusted. Proposed initial seat defaults are Essentials 1, Growth 3, Scale 5, Enterprise 10+, but these are not authoritative until the client confirms the commercial catalog. Enterprise remains sales-managed unless self-service provisioning is approved. Billing enforcement, grace periods, downgrade behavior, and payment provider are unresolved.

## 11. Product/API contracts

These are transport-independent contracts. Concrete paths and schemas may adapt to the selected identity/backend platform. All mutation requests accept `Idempotency-Key`; responses include a request/correlation identifier.

| Operation | Authentication | Request essentials | Success result | Important failures |
| --- | --- | --- | --- | --- |
| Select plan | Optional onboarding session | `plan_code`, `billing_cadence` | persisted onboarding selection and next step | invalid/unavailable plan |
| Register password account | Anonymous/onboarding session | email, password, display name, accepted policy versions | pending User; verification dispatched; no Workspace | generic conflict/validation/rate limit |
| Start Google sign-in | Anonymous/onboarding session | return intent | provider redirect with protected state/PKCE | invalid return target/rate limit |
| Google callback | Provider callback | code, protected state | active verified User and next onboarding step | safe provider/authentication failure |
| Verify email | Anonymous token holder | opaque token | active verified User and next step | generic invalid/expired/used token |
| Resend verification | Anonymous or pending session | email or pending-account context | generic accepted response | rate limit only after generic response |
| Login | Anonymous | email/password or provider flow | rotated session and authorized destination | generic invalid credentials/suspended/rate limit |
| Request password reset | Anonymous | email | generic accepted response | rate limit only after generic response |
| Complete password reset | Token holder | token, new password | password changed; sessions revoked; fresh login required | generic invalid/expired/used token |
| Get onboarding status | Authenticated | none | server-derived plan, current step, workspace reference | unauthenticated |
| Create workspace | Verified authenticated User | workspace name; optional confirmed plan code | active Workspace, active Owner membership, trial state | validation, conflict, entitlement failure |
| Logout | Authenticated or stale session | scope `current | all` | idempotent success and cleared cookie | none disclosed |
| Invite user | Active Owner/Admin with permission | email, permitted role, optional teams | pending invitation | seat policy, role/team validation, rate limit |
| Accept invitation | Authenticated verified invitee | opaque token | active membership and workspace destination | generic invalid/expired/revoked, seat limit |
| Change role/team | Authorized administrator | membership, role and/or team changes, expected version | updated membership associations | last-Owner guard, stale version, forbidden |
| Evaluate CRM action | Active membership | route workspace, action, resource reference | action result or denial | tenant-safe not-found/forbidden |

### Response and validation conventions

- Validation failures return stable field/reason codes and user-safe text; internal stack traces and vendor messages are not returned.
- Authentication failures avoid distinguishing unknown email, wrong password, or unlinked provider.
- Cross-tenant and unauthorized resource lookups return a tenant-safe not-found response unless the caller is known to have visibility of the resource.
- Conflicts use an expected-version/concurrency contract rather than silent last-write-wins for roles, membership, ownership, and workspace settings.
- Redirect/return URLs are selected from an allowlist; arbitrary browser-provided URLs are rejected.

## 12. Idempotency and concurrency

- Idempotency records are scoped to authenticated principal (or protected onboarding session), operation, and key; they store a request hash and original outcome for a defined retention window.
- Reusing a key with different input is rejected.
- Critical uniqueness is enforced in the database: provider identity, normalized primary email policy, one user membership per workspace, one team membership pair, and invitation consumption.
- Workspace provisioning, invitation acceptance, ownership transfer, trial start, and entitlement/seat reservation use transactions and locks or serializable constraints as appropriate.
- Email and audit side effects use a transactional outbox; retries must not send materially duplicate invitations or verification messages without an explicit resend request.

## 13. Security operations and minimum controls

- TLS/HTTPS is mandatory in production. The current raw HTTP IP address is not suitable for production authentication or Google redirect registration.
- Secrets remain server-side in an approved secret store and are rotated. No credentials are copied from the old project.
- Apply rate limits, bot/risk controls, secure headers, dependency scanning, centralized safe logging, monitoring, and alerting before production launch.
- Collect explicit acceptance of the current Terms and Privacy policy versions during account creation if legally required.
- Define data deletion, retention, export, support access, incident response, regional storage, and backup/restore policies before launch.

## 14. Unresolved client/vendor configuration

Implementation cannot be production-final until the client decides or supplies:

1. Production domain(s), HTTPS certificates, canonical application URL, and allowed origins.
2. Identity implementation/provider and whether password authentication is managed or application-owned.
3. Google Cloud OAuth project, consent screen, client IDs/secrets, redirect URIs, and account-linking policy.
4. Transactional email provider, verified sending domain, templates, bounce handling, and support/from addresses.
5. Authoritative package catalog: prices, cadences, seat limits, trial duration, Enterprise self-service versus Contact Sales, feature entitlements, upgrades/downgrades, and billing provider.
6. Session idle/absolute lifetimes, revocation target, MFA requirements, and recent-authentication window for sensitive actions.
7. Password policy and whether breached-password screening is required.
8. Privacy jurisdiction, data region, audit and account-data retention, deletion/export rules, and IP-address handling.
9. Whether invitation email must exactly match the accepting account and whether verified-domain or SSO policies are planned.
10. Visibility rules for CRM records (`private`, `team`, `workspace`) and default lead ownership/routing policy.
11. Support/admin access model, emergency access procedure, and audit reviewers.

Until these are resolved, development may use explicit local placeholders, but no placeholder is a production default and no secret belongs in browser-visible configuration.
