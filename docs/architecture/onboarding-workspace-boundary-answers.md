# Onboarding and Workspace Boundary Answers

Status: **ACCEPT WITH PRODUCT LIMITATIONS**  
Review date: 2026-08-21  
Scope: current local source, migrations, accepted architecture contracts, and recorded test evidence  
Boundary: no application code or external systems changed or accessed

## Executive answer

The current implementation safely separates identity creation from tenant creation. A selected package becomes Workspace authority only when atomic Workspace provisioning copies the validated selection into both the Workspace and its initial entitlement snapshot. Provisioning failure leaves onboarding resumable and does not leave a partial tenant.

A User can belong to multiple Workspaces through separate Workspace Memberships, including invitation acceptance, but can self-provision only one Workspace through the current onboarding record. The current CRM navigation does not provide Workspace selection and chooses the earliest active Membership, so multi-Workspace UX is incomplete even though tenant authorization remains scoped and safe.

Local OIDC is a security-focused fixture, not a real Google integration. Real Google sign-in is currently unavailable and must not be represented as enabled.

## Seven Product boundary answers

### 1. Is the selected package attached to the provisioned Workspace and entitlement?

**YES.**

Accepted behavior:

- Registration may save an initial `selected_plan_code` and `billing_cadence` in the User's onboarding record, but these remain onboarding state only.
- Before provisioning, `POST /api/onboarding/plan` validates the code/cadence against an active, effective server-side catalog entry.
- The provisioning transaction locks the onboarding record and validates that selection again against the current effective catalog.
- The transaction copies the selection into `workspaces.plan_code` and `workspaces.billing_cadence`.
- It also creates `workspace_entitlement_snapshots` with the same plan code, the selected catalog version, effective feature flags, and the included active-seat limit.
- Trial timestamps are calculated from the selected catalog entry and stored on the Workspace in the same transaction.

Browser-supplied price or entitlement values are never accepted as authority.

### 2. May one User belong to multiple Workspaces?

**CONDITIONAL — yes by membership model and invitation flow; no for repeated self-provisioning; incomplete in current UX.**

Current accepted behavior:

- `workspace_memberships` is unique on `(workspace_id, user_id)`, not on `user_id` globally. A User may therefore hold one Membership in each of multiple Workspaces.
- Invitation acceptance can create or reactivate a Membership for an existing User in another Workspace, subject to email proof, seat, role, and tenant checks.
- The current onboarding record is unique per User and stores one `workspace_id`. After successful provisioning it is complete, so the same User cannot use onboarding to self-provision a second Workspace.
- `workspaceSummary` currently orders active Memberships by join time and returns only the first. `/crm/home` therefore has no explicit Workspace picker or URL-selected tenant boundary.

Future intent in the accepted data contract is compatible with multi-Workspace Users because identity is global and access is Membership-based. Before Product presents multi-Workspace use as a supported journey, Develop must add an explicit server-validated Workspace selection/switching experience. Until then, additional Memberships can exist safely, but the primary UI effectively operates in one selected-by-server Workspace.

### 3. Can a User recover if signup succeeds but Workspace provisioning fails?

**YES.**

Accepted behavior:

- Signup commits the User, password credential, onboarding progress, verification token/outbox, and registration audit independently of Workspace provisioning.
- Verification advances the durable onboarding record to the Workspace step.
- Workspace provisioning is a later transaction. Any error rolls back the Workspace, roles, initial Membership, stages, entitlement, trial activation, onboarding completion, audits, outbox message, and idempotency result together.
- After a failed transaction, the onboarding record remains incomplete and the User can log in and resume `/workspace/create`.
- A failed attempt that never commits its idempotency record can be retried. If provisioning committed but the response was lost, replaying the same principal/key/request returns the stored Workspace result without duplication.
- A stale or no-longer-valid package must be replaced with a currently valid selection before retrying.

No manual database cleanup is required for an ordinary provisioning failure.

### 4. What happens when package selection changes before or after provisioning?

**CONDITIONAL.**

Before provisioning:

- The authenticated User may change plan/cadence through `POST /api/onboarding/plan` while `onboarding_progress.workspace_id` is null.
- Each accepted change is validated against the active/effective catalog and increments onboarding version.
- Provisioning uses the latest persisted selection and revalidates it transactionally.

After provisioning:

- The onboarding update is guarded by `workspace_id is null`, so it cannot change the completed Workspace selection.
- Existing `workspaces.plan_code`, billing cadence, trial, and entitlement snapshot remain unchanged.
- No upgrade, downgrade, billing, replacement-entitlement, proration, or post-provision plan-change service is implemented.

Material Product limitation: the plan endpoint currently returns the requested plan/cadence even when its guarded update affects no completed onboarding row. This does not alter Workspace or entitlement authority, but its success-shaped response is misleading. Product should treat post-provision plan changes as unavailable until a dedicated entitlement/billing workflow exists and the endpoint reports a conflict or ineligible state.

### 5. How does local OIDC/Google behave for a brand-new versus existing User?

**CONDITIONAL — accepted local fixture behavior; real Google is disabled.**

Local fixture behavior:

- The OIDC start/completion boundary uses one-time stored state, nonce, PKCE verifier/challenge, exact allow-listed redirect URI, expiry, signature, issuer, audience, verified-email, and non-empty subject checks.
- A brand-new provider subject with an email not present locally creates an active, email-verified User, a Google credential keyed by provider `sub`, onboarding at the Workspace step, a default local `growth/monthly` selection, a Session, and `identity.oidc_account_created` audit.
- An existing provider subject logs into its already-linked User and writes `identity.oidc_login`.
- A new provider subject whose asserted email matches an existing local User is rejected with `linking_proof_required`; email matching alone never links accounts.
- Proof-based linking requires an already authenticated local Session plus successful OIDC completion. It creates the credential for that same User and writes `identity.oidc_linked`.
- If that provider subject already belongs to another User, linking fails with `link_conflict` and no identity/session mutation commits.
- OIDC completion creates identity/session state only. A new OIDC User must still confirm onboarding selection and provision a Workspace through the standard transaction.

Differences from real Google:

- Only `OIDC_MODE=fixture` routes are implemented; when fixture mode is disabled, OIDC start/callback routes fail closed with 404.
- The fixture issues an HS256 token locally using a shared test secret, local issuer, and local audience. It does not redirect to Google, exchange an authorization code at Google's token endpoint, validate Google's asymmetric signature/JWKS, use a Google client ID/secret, or apply Google's production issuer/redirect configuration.
- The fixture's default `growth/monthly` onboarding choice is local convenience, not a Google claim or commercial decision.
- Therefore real Google supports neither new-account sign-in nor existing-account login/linking today. The proof/link/collision policy is accepted for reuse at the provider adapter boundary, but the Google adapter and credentials remain required.

### 6. Are registration, verification, login, and Workspace creation audited?

**YES, with method-specific event names.**

Password identity events:

| Operation | Audit action | Outcome/context |
| --- | --- | --- |
| Successful registration | `identity.registered` | User target; password method; pre-Workspace (`workspace_id` null) |
| Successful email verification | `identity.email_verified` | User target; pre-Workspace |
| Successful password login | `identity.login` | Session target and Session ID; password method |
| Denied password login | `identity.login` | `denied` with bounded `invalid_credentials`; no secret/password data |
| Successful Workspace creation | `workspace.created` | Workspace-scoped; actor User, initial Owner Membership, Session, Workspace target |
| Initial Owner assignment | `workspace.initial_owner_assigned` | Same transaction; Membership target |

OIDC uses provider-specific completion events: `identity.oidc_account_created`, `identity.oidc_login`, or `identity.oidc_linked`. A new OIDC account is already provider-verified, so it does not generate a separate `identity.email_verified` event. Failed OIDC callback handling records a bounded `identity.oidc_failure` or `identity.oidc_link_conflict` denial audit without token contents.

Workspace audit events commit in the same provisioning transaction as the Workspace, sole initial Owner Membership, entitlement, activation, outbox, and idempotency outcome.

### 7. Does `/crm/home` load only after active Workspace Membership is confirmed?

**YES.**

The page boundary:

1. resolves the opaque Session against the current active User and Session state;
2. resolves an active Workspace reached through that User's active Membership;
3. resolves current tenant context from persisted Workspace, Membership, and Role records; and
4. redirects unauthenticated Users to login and Users without a usable Workspace to Workspace creation.

The dashboard query then independently re-resolves the same active User/Session security version, unrevoked and unexpired Session, requested active Workspace, active Membership, and Workspace-scoped Role inside a repeatable-read, read-only transaction. If any authority is absent it returns a safe access denial and does not show live or demo dashboard content.

Member metrics are further restricted to the accepted visibility union. Neither query parameters nor browser state grant Workspace Membership or tenant authority.

## Material gaps and Product decisions

1. **Multi-Workspace product experience:** schema and invitations allow it, but no Workspace picker or explicit active-Workspace selection exists. Product must decide whether near-term UX supports multiple Workspaces or deliberately limits the visible journey to one.
2. **Post-provision package changes:** unavailable. Product must define upgrade/downgrade, billing, entitlement effective dates, trial treatment, and provider behavior before Develop exposes this journey.
3. **Plan endpoint response after completion:** the guarded write preserves data safety but currently returns a success-shaped object after a zero-row update. Develop should return an explicit ineligible/conflict response before this endpoint is reused outside onboarding.
4. **Real Google:** unavailable until a production Google adapter, client configuration, HTTPS canonical domain, redirect URIs, and secrets are supplied. Fixture mode must remain clearly local/UAT-only or disabled.

No material gap was found in atomic initial provisioning, recovery, sole initial Owner assignment, audit attribution, or `/crm/home` tenant authorization.

