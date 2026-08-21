# Slice 4 Tenant Administration and Invitations Contract

Status: **implementation-ready local architecture contract**  
Date: 2026-08-20  
Authorized by: `docs/architecture/slice-3-gate-review.md`  
Scope: local tenant administration, invitations, roles, memberships, optional teams, recent-authenticated Owner actions, settings/people reads, audit, outbox, and acceptance evidence  
Boundary: local PostgreSQL, Mailpit, and test fixtures only. No real Google, production email/domain/provider credentials, deployment, Lightsail, UAT, or Caddy access is authorized.

## 1. Outcome and mandatory invariants

Slice 4 converts the accepted identity/Workspace foundation into a tenant-administration boundary. Develop may implement this contract without additional Product input by using the defaults in section 15.

The following invariants are mandatory:

1. Route/session state supplies the User, Session, Workspace, and Membership context. Request bodies never supply authoritative actor role, permission, Workspace, or entitlement data.
2. Every tenant-owned row is directly Workspace-scoped. Composite foreign keys prevent cross-Workspace Role, Membership, Invitation, Team, and TeamMembership references.
3. A Workspace always retains at least one active Owner. Owner assignment and transfer are separate from invitation role assignment; invitations never grant Owner.
4. Invitation tokens are random, single-use, purpose-bound, expiry-bound, stored only as keyed hashes, and never logged, audited, persisted to idempotency outcomes, or returned after creation/resend.
5. Invitation acceptance requires an active authenticated User whose verified normalized primary email equals the invitation email. Email similarity, provider profile email without local verification, and possession of the token alone are insufficient.
6. Seat capacity is checked from current authoritative entitlement and active Membership count inside the acceptance transaction. Pending invitations do not reserve or consume seats.
7. Security-sensitive writes use expected-version optimistic concurrency in addition to database locks and row-count assertions. There is no silent last-write-wins behavior.
8. Protected writes, successful or denied, produce safe immutable audits. Email dispatch uses an explicit invitation-email outbox consumer and the accepted lease/fencing/idempotency pattern.
9. Tenant-safe reads and denials do not reveal whether another Workspace's invitation, membership, role, or team exists.
10. Owner transfer and other critical administration require recent authentication and reuse the accepted persisted-actor, Workspace-lock, scoped-write, rollback, audit, and last-Owner controls.

## 2. Local implementation defaults

These choices are approved architecture defaults, not open Product questions:

| Concern | Local default |
| --- | --- |
| Invitation lifetime | 7 days; server setting `INVITATION_TTL_HOURS=168`, allowed range 1–720 hours |
| Invitation token | 32 random bytes, base64url encoded; only keyed HMAC/hash stored using the existing server secret primitive with purpose prefix `workspace_invitation:v1:` |
| Token presentation | Fragment-free HTTPS-style application path `/invite/accept?token=...`; local HTTP is allowed only in development/test |
| Resend | Explicit mutation; rotate token, increment generation/version, replace all older usable tokens, extend expiry from resend time, enqueue one new email |
| Resend throttle | At most one accepted resend per invitation per 60 seconds plus existing network/actor/destination rate-limit dimensions |
| Invite role | `admin` or `member`; never `owner` |
| Admin delegation | Admin may invite/assign `member`, manage member status/teams, and read people/settings; only Owner may invite/assign `admin`, change Admin status/role, transfer ownership, or change Workspace-critical settings |
| Seat counting | Active Memberships only; suspended/removed Memberships and pending Invitations do not count |
| Duplicate pending invite | One usable pending invitation per Workspace + normalized email; return the existing invitation summary unless explicit resend is requested |
| Recent authentication | 10 minutes, server setting `RECENT_AUTH_MINUTES=10`, allowed range 1–30 minutes |
| Idempotency retention | 24 hours for mutations; accepted-invitation replay is durable through invitation terminal fields and Membership uniqueness after the idempotency record expires |
| Pagination | Cursor pagination, default 25, maximum 100; stable order `(created_at, id)` or `(display_name, id)` as specified by endpoint |
| Teams | Implement local persistence and APIs in Slice 4; UI may remain minimal. Team assignment remains optional |
| Removed membership | Reactivation updates the existing unique Workspace/User row; a second Membership row is never created |

## 3. Permission model

System Roles remain Workspace-local rows with codes `owner`, `admin`, and `member`. Their effective permissions are server-defined by a versioned policy registry; JSON stored on Role rows is a snapshot for audit/display and may not add unknown permissions.

### Permission codes

| Permission | Owner | Admin | Member |
| --- | ---: | ---: | ---: |
| `workspace.settings.read` | yes | yes | no |
| `workspace.settings.write` | yes, recent auth for critical fields | no | no |
| `members.read` | yes | yes | no |
| `members.invite_member` | yes | yes | no |
| `members.invite_admin` | yes | no | no |
| `members.manage_member` | yes | yes | no |
| `members.manage_admin` | yes | no | no |
| `members.transfer_owner` | yes, recent auth | no | no |
| `roles.policy.write` | yes, recent auth | no | no |
| `teams.read` | yes | yes | assigned-team self-view only if later required |
| `teams.write` | yes | yes | no |
| `audit.read` | deferred; no UI/API in Slice 4 | deferred | no |

Authorization order is: active Session/User → active Workspace → active Membership → persisted Role/policy version → operation permission → target-role ceiling → recent-auth requirement → entitlement/seat check → expected version → mutation/audit. A plan entitlement never repairs a failed authorization decision.

Role escalation rules:

- Owner cannot be granted through generic invitation or role-change APIs.
- Admin cannot create, promote, suspend, remove, or alter an Owner or Admin.
- Owner may promote an active Member to Admin or demote/suspend/remove an Admin, subject to expected version and safe audit.
- Owner-to-Owner change uses the dedicated transfer endpoint only.
- No actor may mutate their own role/status through generic membership endpoints. Owner self-removal requires successful transfer; other self-service leave behavior is outside Slice 4.
- Role-policy writes may select only a version that exists in the server policy registry for that same fixed Role code. Arbitrary permission arrays, custom Role codes, removal of Owner critical permissions, and browser-authored policy JSON are rejected.

## 4. Additive relational schema contract

One additive migration is expected. Names below are normative unless PostgreSQL identifier limits require an equivalent clear name.

### 4.1 Version existing mutable administration rows

Add:

- `workspaces.version integer not null default 1 check (version > 0)`
- `roles.version integer not null default 1 check (version > 0)`
- `workspace_memberships.version integer not null default 1 check (version > 0)`
- `sessions.authenticated_at timestamptz not null default now()`
- `sessions.auth_method text not null default 'legacy' check (auth_method in ('password','google','fixture','legacy'))`

The migration backfills existing Sessions with `authenticated_at=created_at` and `auth_method='legacy'`; legacy sessions never satisfy recent-auth checks until explicit re-authentication. Every successful Workspace, Role, or Membership administration write increments its version exactly once and returns the new version. New login/OIDC completion sets `authenticated_at=now()` and the actual method. Ordinary sliding-session touches do not update it. Successful explicit re-authentication updates it; privilege writes do not.

For every existing active Workspace, the migration inserts missing Workspace-local immutable system Role rows for `admin` and `member` using the current policy-registry version; existing `owner` rows are updated only when their permission snapshot is structurally invalid. All three Role rows remain unique by `(workspace_id, code)`. Application startup does not silently mutate Role policy; future policy changes require an explicit migration/versioned operation.

### 4.2 Workspace invitations

`workspace_invitations`:

- `id uuid primary key default gen_random_uuid()`
- `workspace_id uuid not null`
- `email_normalized text not null`
- `email_display text not null`
- `role_id uuid not null`
- `status text not null default 'pending'`
- `token_hash text not null`
- `token_generation integer not null default 1`
- `version integer not null default 1`
- `expires_at timestamptz not null`
- `last_sent_at timestamptz not null`
- `accepted_at timestamptz null`
- `accepted_by_user_id uuid null`
- `accepted_membership_id uuid null`
- `revoked_at timestamptz null`
- `revoked_by_membership_id uuid null`
- `invited_by_membership_id uuid not null`
- `created_at`, `updated_at timestamptz not null`

Constraints and indexes:

- composite FK `(workspace_id, role_id) → roles(workspace_id, id)`
- composite FK `(workspace_id, invited_by_membership_id) → workspace_memberships(workspace_id, id)`
- composite FK `(workspace_id, revoked_by_membership_id) → workspace_memberships(workspace_id, id)`
- composite FK `(workspace_id, accepted_membership_id) → workspace_memberships(workspace_id, id)`
- FK `accepted_by_user_id → users(id)`
- unique `token_hash`
- unique `(workspace_id, id)` to support composite references
- partial unique index on `(workspace_id, email_normalized)` where `status='pending'`
- indexes `(workspace_id, status, created_at, id)`, `(workspace_id, email_normalized)`, and `(status, expires_at)`
- checks:
  - `status in ('pending','accepted','revoked','expired','superseded')`
  - `length(email_normalized) between 3 and 320` and `email_normalized=lower(btrim(email_normalized))`
  - `token_generation > 0`, `version > 0`, `expires_at > created_at`
  - accepted state requires all three acceptance fields and forbids revoke fields
  - revoked state requires `revoked_at` and `revoked_by_membership_id` and forbids acceptance fields
  - pending/superseded/expired forbid acceptance fields; pending forbids revoke fields

`superseded` is used only when a prior invitation row is retained during a replacement workflow. Normal resend updates the same row and rotates the hash, so it does not create a superseded row.

### 4.3 Invitation team assignments

`workspace_invitation_teams`:

- `workspace_id`, `invitation_id`, `team_id` UUIDs not null
- `created_at timestamptz not null default now()`
- primary key `(invitation_id, team_id)`
- unique `(workspace_id, invitation_id, team_id)`
- composite FK `(workspace_id, invitation_id) → workspace_invitations(workspace_id, id)` on delete cascade
- composite FK `(workspace_id, team_id) → teams(workspace_id, id)` on delete cascade

This is a current assignment set, not an untrusted browser snapshot. Resend does not alter it. Invitation update may replace it under expected-version control.

### 4.4 Teams

`teams`:

- `id uuid primary key default gen_random_uuid()`
- `workspace_id uuid not null references workspaces(id) on delete cascade`
- `name text not null`
- `name_normalized text not null`
- `status text not null default 'active'`
- `version integer not null default 1`
- `created_by_membership_id uuid not null`
- `created_at`, `updated_at timestamptz not null`

Constraints:

- unique `(workspace_id, id)`
- unique `(workspace_id, name_normalized)`
- composite FK `(workspace_id, created_by_membership_id) → workspace_memberships(workspace_id, id)`
- `status in ('active','archived')`, `version > 0`
- `name_normalized=lower(btrim(name_normalized))`; name length 1–100 after trim

`team_memberships`:

- `workspace_id`, `team_id`, `workspace_membership_id` UUIDs not null
- `version integer not null default 1`
- `created_by_membership_id uuid not null`
- `created_at`, `updated_at timestamptz not null`
- primary key `(team_id, workspace_membership_id)`
- unique `(workspace_id, team_id, workspace_membership_id)`
- composite FKs to Team, assigned WorkspaceMembership, and creator WorkspaceMembership using the same `workspace_id`
- `version > 0`

Removed/suspended Workspace Memberships may retain historical TeamMembership rows but authorization ignores them. Reactivation may reuse them. Archiving a Team does not delete history; assignment mutations to archived Teams are denied.

### 4.5 Supporting constraints

- Expand the rate-limit action check to include `invite_create`, `invite_resend`, `invite_accept`, `invite_revoke`, `member_change`, `team_change`, and `recent_auth`.
- Audit metadata allowlist must add only keys required by this slice: `invitation_generation`, `assigned_role`, `team_count`, `expected_version`, `result_version`, `seat_limit`, `active_seats`, and `auth_age_bucket`. Never store email, token, raw IP, names, or full request bodies in audit metadata.
- Outbox requires no status change. Invitation email topics are explicit and handled only by the email worker.
- Idempotency table requires no schema change; principal keys for tenant mutations are `membership:<membership_id>`, and acceptance uses `user:<user_id>`.

## 5. State machines

### Invitation

`pending → accepted | revoked | expired | superseded`

- `pending → accepted`: only through successful transactional acceptance.
- `pending → revoked`: explicit authorized revoke with expected version.
- `pending → expired`: synchronously when a locked operation observes `expires_at <= now()`, or by an idempotent sweeper. Expiry never sends email.
- resend remains `pending`, rotates token, increments `token_generation` and `version`, updates expiry/last-sent time, and invalidates the old token immediately.
- terminal states never return to pending. A new invitation after revoke/expiry creates a new row and token.
- accepted replay by the same accepted User returns the accepted Membership summary. Any other token/user receives the generic invalid-invitation result.

### Workspace Membership

`active ↔ suspended`, `active|suspended → removed`, `removed → active` only through invitation acceptance or an explicit future reactivation policy.

- Active requires an allowed Workspace-local Role.
- Suspension immediately denies access and does not consume a seat under the local default.
- Removal sets `removed_at`; reactivation clears it and increments version.
- Last active Owner cannot be suspended, removed, or changed away from Owner.

### Team

`active → archived`; no unarchive in Slice 4. Archive increments version and blocks new assignments. Historical associations remain.

## 6. Invitation transaction contracts

### 6.1 Create invitation

Lock/order:

1. Resolve active Session/User and route Workspace context.
2. Begin transaction; lock Workspace row.
3. Re-resolve actor Membership + Role and permission from persisted rows.
4. Validate normalized email, requested non-Owner Role, active Teams, target-role ceiling, and request idempotency hash.
5. If an active Membership already exists for the email's User, return `membership_exists` without revealing any other User data.
6. Lock existing pending invitation for Workspace/email. Without `resend=true`, return its safe summary; with resend, follow resend rules.
7. Generate token outside logs, persist only hash; create invitation/team rows.
8. Write `workspace.invitation_created` audit and `workspace.invitation_email_requested` outbox in the same transaction.
9. Persist idempotency outcome without token and commit.

Email dispatch failure does not roll back the invitation. It is visible through outbox retry/dead-letter operations. API success means invitation persisted and dispatch queued, not delivered.

### 6.2 Resend

- Requires the same permission needed to create the invitation's current role.
- Lock Workspace → actor → invitation.
- Require pending, unexpired or allow renewal of an expired observation by creating a new invitation row; enforce 60-second throttle.
- Rotate token/hash, increment generation/version, update expiry and last-sent timestamp.
- Enqueue `workspace.invitation_email_requested` with a new outbox ID/provider idempotency key. Old token fails immediately.
- Audit `workspace.invitation_resent`; safe `before/after` may include generation and expiry timestamps, never token/email.

### 6.3 Revoke

- Lock Workspace → actor → invitation.
- Require expected version. Pending becomes revoked; already revoked is idempotent only when request hash/key match, otherwise return its safe terminal summary.
- Set revoker from verified Membership, write `workspace.invitation_revoked`, and commit. No cancellation email is sent locally.

### 6.4 Accept

Lock/order is normative to avoid deadlocks:

1. Resolve active Session/User and confirmed `email_verified_at`; require CSRF/origin protection.
2. Begin transaction.
3. Resolve token hash and lock Invitation `for update`; do not query by browser-provided Workspace ID.
4. Lock Workspace row.
5. If expired, mark expired, write safe denial/expiry audit, commit terminal transition, then return the generic invalid result.
6. Require pending state and exact normalized verified User email match using constant-time comparison where practical.
7. Revalidate invitation Role is same-Workspace, active system `admin|member`; revalidate all invitation Teams are active and same-Workspace.
8. Lock current entitlement snapshot/catalog decision, then lock/count active Memberships. Reject atomically when `active_count >= included_active_seats`, unless this User already has an active Membership.
9. Lock existing `(workspace_id,user_id)` Membership. Create it or reactivate/update its Role with version increment. A conflicting active Membership returns the existing authorized result only for the same User.
10. Insert missing TeamMemberships idempotently and remove none not named by the invitation.
11. Set accepted fields, increment Invitation version, and clear no historical hash. The consumed token remains hashed for replay recognition.
12. Write `workspace.invitation_accepted` audit with the invitee as actor and the Membership as target; enqueue `workspace.membership_activated` non-email outbox event for a future explicit consumer.
13. Persist token-free idempotency outcome and commit.

Acceptance failure must not partially consume the invitation, create/reactivate a Membership, assign Teams, consume a seat, or emit success audit/outbox. Seat-limit denial leaves the invitation pending until expiry so an Owner can free capacity and the invitee can retry.

## 7. Administration mutation and lock contract

All tenant mutations use this common order:

`Session/User → begin → Workspace FOR UPDATE → actor Membership/Role FOR UPDATE → idempotency → target aggregate FOR UPDATE → entitlement/count if needed → expected-version write → audit/outbox → idempotency outcome → commit`

Never acquire a Workspace lock after locking one of its Membership, Invitation, Role, or Team rows. Multi-row Team assignments are locked by ascending UUID to keep ordering stable.

### Expected-version semantics

- Mutation request contains integer `expectedVersion > 0`.
- SQL mutation includes `where id=? and workspace_id=? and version=?` and sets `version=version+1`.
- A zero-row update triggers rollback and `409 stale_version` with the current safe resource summary only if the caller remains authorized; otherwise return tenant-safe `404 resource_not_found`.
- Idempotent replay with the same key/hash returns the original outcome even if the resource version has since advanced. Same key with a different canonical request hash returns `409 idempotency_conflict`.

### Owner transfer

The accepted Slice 3 ownership service remains the mutation core. The API must:

- derive actor from current Session and route Workspace;
- require `members.transfer_owner` and `authenticated_at >= now()-RECENT_AUTH_MINUTES`;
- accept successor Membership ID and both actor/successor expected versions;
- rotate or revoke the prior Owner's current Session after successful transfer; local default is rotate current session and require a fresh authorization read;
- promote successor before demoting prior Owner in one transaction;
- increment both Membership versions and assert both one-row writes;
- attribute audit actor to prior Owner Membership and target to successor Membership;
- deny self-transfer, non-active/cross-tenant successor, stale versions, absent recent auth, and any path that could leave zero Owners.

### Generic membership change

- Permitted fields: `roleCode` (`admin|member`), `status` (`active|suspended|removed`), and exact `expectedVersion`.
- Actor/target role ceiling applies. Owner changes are rejected with `owner_transfer_required`.
- Activating a suspended/removed Membership requires seat capacity and explicit authorization; generic reactivation of removed Membership is disabled in Slice 4 except invitation acceptance.
- Target Team assignments use the separate bulk TeamMembership endpoint and expected Membership version.

### Versioned Role policy write

- This is an Owner-only, recent-authenticated administration operation; no custom Roles are introduced in Slice 4.
- Lock Workspace → actor → target Role. Require the fixed same-Workspace code and exact Role expected version.
- Request supplies only a server-known `policyVersion`; the server materializes its allowlisted permission snapshot. It cannot change Role code, Workspace, or `is_system`.
- The Owner policy can move only to a registry version that still contains `members.transfer_owner`, `roles.policy.write`, and last-Owner administration permissions. Admin/Member policies cannot gain Owner-only permissions.
- Update by Workspace + Role ID + expected version, increment once, write safe before/after policy-version audit, and refresh authorization from PostgreSQL on the next request.

## 8. HTTP API contract

All JSON mutations require accepted CSRF token/origin checks, `Content-Type: application/json`, authenticated server Session, and UUID route validation. Except for credential-verifying recent-auth attempts, mutations also require an `Idempotency-Key` header of 16–128 visible ASCII characters. Responses include `requestId`. Tokens appear only in the inbound invitation-accept request and never in responses.

### Success/error envelope

- Success: `{ "data": ..., "requestId": "..." }`
- Error: `{ "error": { "code": "stable_code", "fields"?: { ... } }, "requestId": "..." }`
- No internal message, SQL detail, stack, provider error, token, or cross-tenant identifier is returned.

### Endpoints

| Method/path | Permission | Request | Success |
| --- | --- | --- | --- |
| `GET /api/workspaces/:workspaceId/settings` | `workspace.settings.read` | none | Workspace safe settings, entitlement seat summary, `version` |
| `PATCH /api/workspaces/:workspaceId/settings` | Owner; recent auth for name/critical settings | `{ name?, expectedVersion }` | updated safe settings/version |
| `GET /api/workspaces/:workspaceId/people` | `members.read` | `cursor?, limit?, status?, role?` | Membership summaries and next cursor |
| `GET /api/workspaces/:workspaceId/invitations` | `members.read` | cursor/filter | invitation summaries without token/hash/full email beyond authorized UI need |
| `POST /api/workspaces/:workspaceId/invitations` | invite permission by role | `{ email, roleCode, teamIds?, resend?: false }` | `202`, safe invitation summary, `delivery: queued` |
| `POST /api/workspaces/:workspaceId/invitations/:id/resend` | invite permission by current role | `{ expectedVersion }` | `202`, incremented safe summary |
| `POST /api/workspaces/:workspaceId/invitations/:id/revoke` | invite permission by current role | `{ expectedVersion }` | revoked safe summary |
| `POST /api/invitations/accept` | active verified User | `{ token }` | Membership/Workspace destination and accepted invitation ID |
| `PATCH /api/workspaces/:workspaceId/memberships/:id` | role-ceiling permission | `{ roleCode?, status?, expectedVersion }` | updated Membership summary |
| `PUT /api/workspaces/:workspaceId/memberships/:id/teams` | `teams.write` + target ceiling | `{ teamIds, expectedMembershipVersion }` | exact assignment set and Membership version |
| `POST /api/workspaces/:workspaceId/ownership/transfer` | Owner + recent auth | `{ successorMembershipId, actorExpectedVersion, successorExpectedVersion }` | new Owner and prior-Owner Membership summaries |
| `PATCH /api/workspaces/:workspaceId/roles/:roleId/policy` | Owner + recent auth | `{ policyVersion, expectedVersion }` | fixed Role code, applied policy version, new Role version |
| `GET /api/workspaces/:workspaceId/teams` | `teams.read` | cursor/status | Team summaries |
| `POST /api/workspaces/:workspaceId/teams` | `teams.write` | `{ name }` | Team/version |
| `PATCH /api/workspaces/:workspaceId/teams/:id` | `teams.write` | `{ name?, status?, expectedVersion }` | Team/version |
| `POST /api/auth/recent/password` | active password-capable Session | `{ password }` | rotates current Session, sets password recent-auth timestamp; returns `{ recentUntil }` |
| `GET /api/auth/recent/oidc/start` | active linked-OIDC Session | allowlisted return intent only | begins proof-linked fixture OIDC flow locally |
| `GET /api/auth/recent/oidc/callback` | protected fixture callback | code/state/PKCE/nonce from flow | rotates current Session, sets fixture recent-auth timestamp, redirects to allowlisted pending action |

### HTTP and stable error semantics

| HTTP | Code | Meaning |
| ---: | --- | --- |
| 400 | `validation_failed` | Safe field validation failure |
| 401 | `authentication_required` | No active Session/User |
| 401 | `recent_auth_required` | Active Session is older than recent-auth window; UI may route to re-auth |
| 404 | `resource_not_found` | Unknown, cross-tenant, or unauthorized target where existence must be hidden |
| 409 | `stale_version` | Authorized caller supplied an old expected version |
| 409 | `idempotency_conflict` | Same key reused with different canonical request |
| 409 | `membership_exists` | Same-Workspace email already has Membership; no unrelated User details |
| 409 | `last_owner_required` | Visible only to an authorized Owner operating on a known same-Workspace target |
| 409 | `owner_transfer_required` | Generic endpoint attempted an Owner transition |
| 410 | `invitation_invalid` | Generic accepted/revoked/expired/unknown/wrong-email token result; UI text is identical |
| 422 | `seat_limit_reached` | Authorized same-Workspace invite acceptance or admin operation exceeds active-seat limit |
| 429 | `rate_limited` | Generic retry response with bounded `Retry-After` |

Invitation acceptance deliberately returns the same `410 invitation_invalid` body for unknown hash, revoked, expired, consumed by another User, and email mismatch. A same-User accepted replay may return `200` with the existing Membership.

## 9. Read models and tenant-safe response fields

Settings and people repositories require a server-derived `WorkspaceAuthorizationContext`; they do not accept nullable or body-derived Workspace context.

People summary may return only: Membership ID, display name, masked or full email according to the authorized people UI, Role code, Membership status, Team IDs/names, joined timestamp, and version. It never returns credential/provider subjects, session data, security version, token state, audit internals, or another Workspace reference.

Invitation summary may return: invitation ID, masked email for Admin and full email for Owner/local authorized people UI, Role code, Team summaries, status, expiry, last-sent time, inviter display label, and version. It never returns token hash, generation secret, accepted User ID, or provider delivery details.

Cross-tenant IDs and unauthorized targets return `404 resource_not_found`. List filters cannot be used as an existence oracle. Cursor values are signed/opaque or validated as same-endpoint pagination state.

## 10. Audit contract

Success audits commit in the business transaction. Denials roll back business changes and use the accepted separate safe audit boundary, re-deriving actor scope and omitting untrusted target/Workspace identifiers when authorization failed.

Required action codes:

- `workspace.invitation_created`
- `workspace.invitation_resent`
- `workspace.invitation_revoked`
- `workspace.invitation_accepted`
- `workspace.invitation_accept_denied`
- `workspace.invitation_admin_denied`
- `workspace.membership_changed`
- `workspace.membership_change_denied`
- `workspace.membership_teams_changed`
- `workspace.role_policy_changed`
- `workspace.role_policy_change_denied`
- `workspace.team_created`
- `workspace.team_changed`
- `workspace.team_change_denied`
- `workspace.settings_changed`
- `workspace.settings_change_denied`
- existing `workspace.ownership_transferred`
- existing `workspace.ownership_transfer_denied`
- `identity.recent_auth_succeeded`
- `identity.recent_auth_failed`

Actor Membership identifies the principal performing the action; target identifies Invitation, Membership, Team, or Workspace. Safe before/after contains only changed field names and non-sensitive state/version values. Do not audit invitation email, token/hash, Team names, display names, request bodies, cookies, authorization headers, raw source IP, or provider errors.

Reason codes are stable and bounded: `permission_required`, `recent_auth_required`, `invalid_target`, `invalid_role`, `invalid_team`, `email_mismatch`, `invitation_expired`, `invitation_revoked`, `invitation_consumed`, `seat_limit_reached`, `stale_version`, `last_owner_required`, `rate_limited`, `mutation_failed`.

## 11. Outbox and email contract

Email worker topics:

- existing `identity.email_verification`
- existing `identity.password_reset`
- new `workspace.invitation_email_requested`

Non-email topics, including `workspace.provisioned` and `workspace.membership_activated`, must never be claimed by the email worker.

Invitation envelope is encrypted using the accepted envelope mechanism and contains only delivery-time values: recipient, local subject/text/template key, opaque token URL, expiry display, Workspace display name, and inviter display label. The database's queryable payload must not expose token or email outside the encrypted envelope. Provider idempotency key is the Outbox Message ID. Resend creates a new Outbox Message and generation; retries of one generation reuse its provider idempotency key.

Worker leasing, generation fencing, retry/dead-letter thresholds, and sanitized error behavior remain exactly as accepted in Slice 2. API/read models expose `queued`, not provider delivery certainty.

## 12. Session, CSRF, re-authentication, and revocation

- All state-changing endpoints use the accepted double-submit/session-bound CSRF mechanism and exact origin policy.
- Recent auth is calculated from persisted `sessions.authenticated_at`; browser claims/timestamps are ignored.
- Password Users re-authenticate with their current password through `POST /api/auth/recent/password`, using the same generic failure and rate-limit protections as login.
- Local OIDC fixture Users may complete a fresh fixture OIDC proof linked to the signed-in User; production Google re-auth remains blocked on real provider configuration.
- A User with multiple credentials chooses either supported method. OIDC re-auth must return the same provider `sub` already linked to the signed-in User; it cannot link credentials or switch Users.
- Re-auth rotates the session token or at minimum its session hash, preserves absolute expiry, updates `authenticated_at`, and audits success/failure safely.
- Membership suspension/removal denies subsequent requests immediately because authorization reads current Membership state.
- Owner transfer rotates the acting Session and forces role/context re-resolution. It does not revoke unrelated devices by default; Product may later choose all-device revocation for ownership changes.

## 13. Idempotency, canonical hashing, and retries

Canonical request hashes include operation, route Workspace, normalized scalar fields, sorted unique Team IDs, expected versions, and principal identity. They exclude CSRF token, cookies, request ID, token plaintext, display-only formatting, and transport order.

Operations requiring `Idempotency-Key`: invitation create/resend/revoke/accept, membership change, Role-policy change, Team create/change/assignment, settings change, and ownership transfer. GET and recent-auth attempts do not use idempotency keys.

- Identical key + hash returns the original safe outcome and HTTP semantic.
- Same key + different hash returns `409 idempotency_conflict`.
- Outcomes never contain invitation token, token hash, encrypted envelope, credential material, or full audit payload.
- Invitation acceptance remains naturally idempotent after record expiry through locked terminal Invitation fields plus unique Workspace/User Membership.

## 14. Acceptance matrix

### PostgreSQL integration evidence

| Area | Required proof |
| --- | --- |
| Schema scope | Cross-Workspace Role, inviter/revoker Membership, InvitationTeam, TeamMembership, creator Membership, and audit actor references fail at the database boundary |
| Invitation token | Only hash stored; unique hashes; old token fails after resend; raw token absent from invitation, audit, idempotency, and queryable outbox fields |
| State machine | Valid transitions succeed; terminal-state reversal and inconsistent terminal timestamps/actors fail |
| Create/resend/revoke | Permission ceiling, pending uniqueness, generation rotation, throttle, expected version, idempotent replay, changed-input conflict, audit/outbox atomicity |
| Email proof | Unauthenticated, unverified, wrong-email, and email-changed Users cannot accept; response remains generic and no state changes |
| Acceptance atomicity | One transaction creates/reactivates exactly one Membership, applies permitted Teams, consumes Invitation, audits, and enqueues event; injected failures roll back all effects |
| Replay/races | Same token concurrent acceptance yields one commit and same-User replay result; different User cannot consume; accept-vs-revoke and accept-vs-resend serialize safely |
| Seat enforcement | Pending invite uses no seat; active count at limit rejects without consumption; concurrent last-seat accepts yield one success; suspension/removal frees capacity under local default |
| Authorization | Persisted Owner/Admin/Member policy and target-role ceiling; forged role/Workspace/body context ignored; suspended/removed actor denied |
| Expected versions | Stale Workspace, Role policy, Membership, Invitation, Team, and TeamMembership writes return conflict and change no rows/audits/outbox success events |
| Role policy | Only fixed same-code registry versions apply; arbitrary JSON/custom codes/Owner-critical permission removal/escalating Admin or Member policy are rejected; expected-version and recent-auth rules hold |
| Owner rules | Recent auth required; self/cross-tenant/stale successor denied; promote-before-demote atomic; actor/target audit attribution; concurrent changes preserve Owner |
| Teams | Same-Workspace constraints, normalized-name uniqueness, archive behavior, exact idempotent assignment set, cross-tenant denial |
| Safe audit | Success attribution and safe field diffs; denial boundary persists without untrusted scope/target or personal/token data |
| Outbox | Email worker claims invitation-email topic and existing identity topics only; non-email events remain pending; retries are fenced and idempotent |
| Reads | People/settings/invitation repositories require context; cross-tenant IDs and filters cannot disclose existence |
| Sessions | Recent-auth window boundary, re-auth rotation, expired/stale session denial, post-transfer context refresh, membership revocation immediacy |

### Playwright journeys

1. Owner opens server-derived People, invites a Member, Mailpit receives one link, invitee verifies/signs in, accepts, and enters only the invited Workspace with Member authority.
2. Old link fails generically after resend; newest link succeeds once; refresh/replay returns the same Membership without duplication.
3. Revoked and expired links, wrong signed-in email, and unknown token show identical safe failure UI and create no Membership.
4. Last available seat race permits one invite acceptance; the other receives seat-limit UI while its invitation remains retryable.
5. Admin can invite/manage a Member but cannot invite Admin, mutate Admin/Owner, transfer ownership, or infer cross-tenant targets.
6. Stale expected-version UI receives conflict, refreshes server truth, and does not overwrite a concurrent role/team change.
7. Owner recent-auth prompt gates transfer; successful re-auth and transfer update authority, preserve one Owner, rotate context/session, and attribute the audit correctly.
8. Team create/rename/archive and exact Member assignment survive refresh; cross-tenant Team/Membership IDs produce tenant-safe not-found behavior.
9. Suspended/removed Member loses protected access immediately, including Back/direct navigation; restored access follows only an authorized supported path.
10. Existing registration, OIDC fixture, provisioning, session/logout, and tenant-isolation journeys remain green.

### Required verification commands/evidence

- migration from empty database and immediate safe rerun
- Drizzle migration-history check
- unit/direct-route tests
- all serial PostgreSQL integration suites selected by the normal command
- targeted invitation race, seat race, version race, Owner/recent-auth, outbox, and schema-constraint suites
- Playwright journeys above
- lint and Next production build
- local Mailpit worker delivery/retry evidence
- npm audit report with no unresolved critical/high production dependency finding
- checkpoint explicitly confirming no external provider/infrastructure access

## 15. Genuine Product and external decisions

Development is not blocked by these decisions; local defaults above apply until Product/Operations provides approved values.

1. **Commercial seat catalog and overage behavior:** authoritative seats per plan, whether suspended Members count commercially, paid overage, grace periods, and upgrade prompts. Local enforcement uses the current entitlement snapshot and active-only counting.
2. **Admin delegation policy:** whether Admin may eventually invite/manage other Admins. Local default is no.
3. **Invitation presentation:** production email brand, sender/reply-to, legal/footer text, support contact, and whether acceptance should display inviter identity. Local Mailpit templates may use neutral NexaFlow copy.
4. **Invitation lifetime/resend policy:** Product may change the seven-day lifetime and user-facing resend cadence within the safe configuration bounds.
5. **People-directory privacy:** whether Admin sees full member email and whether Members can see a directory. Local default permits full email only to Owner/Admin and no Member directory.
6. **Post-transfer session policy:** whether ownership transfer revokes all prior Owner devices. Local default rotates the current Session only and immediately re-resolves authorization everywhere.
7. **Audit governance:** retention, export, tamper-evidence/archive system, audit viewers, support/emergency access, and privacy treatment of minimized network metadata.
8. **Real external values:** canonical HTTPS domain, real transactional-email provider/account/domain authentication, Google project/client/redirects, secret-store values, deployment topology, monitoring, backup/restore, UAT, Lightsail, and Caddy configuration.

## 16. Slice 4 development gate

Develop may begin locally with the additive schema migration, repositories, permission evaluator, invitation service, explicit invitation-email worker routing, recent-auth session fields/service, Owner/Admin APIs, Team persistence, and tests defined here.

Slice 4 is accepted only when:

- all schema and state invariants are database-enforced where specified;
- every route derives actor/Workspace authority from the active Session and persisted Membership;
- invitation acceptance and seat enforcement are atomic and race-tested;
- expected-version and idempotency semantics are demonstrated;
- Owner/recent-auth and last-Owner rules reuse the accepted Slice 3 controls;
- success/denial audit attribution and outbox routing are proven safe;
- tenant-safe settings/people UI and denial journeys pass;
- the full Slice 1–4 regression suite, build, lint, migration rerun, and local-only evidence pass.

No real provider credentials, production domain/email, deployment access, Lightsail, UAT, or Caddy work is part of this gate.
