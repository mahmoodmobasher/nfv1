# Feature 2 — User, Role & Membership Management Contract

Status: **implementation-ready Product contract**  
Date: 2026-08-21  
Depends on: accepted Feature 1 identity, onboarding, Workspace provisioning, and CRM tenant context; accepted Slice 4 invitation stabilization  
Scope: Workspace people, invitations, Membership lifecycle, fixed Roles, ownership, and explicit Workspace switching  
Out of scope: Feature 3 personal profile, preferences, personal security settings, password/provider management, notification preferences, avatar, locale, and personal account deletion

## 1. Product outcome

An authenticated User can be invited into one or more Workspaces and can explicitly choose which active Workspace to operate in. Workspace Owners and Admins can manage people only within their persisted permission ceilings. All protected decisions are derived from current server state, all material writes are atomic and idempotent, and every operation produces a safe success or denial audit.

Feature 2 reuses the existing Slice 4 schema and services where they satisfy this contract. It does not reopen unrelated pre-UAT hardening.

## 2. Feature 1 completion and non-blocking follow-ons

Feature 1 is Product-accepted and complete. The following are recorded follow-ons, not reasons to reopen Feature 1:

1. **Workspace switcher:** implemented as part of Feature 2 because multi-Workspace Membership is a Feature 2 journey.
2. **Post-provision plan changes:** deferred to a billing/entitlement feature; current Workspace and entitlement remain authoritative.
3. **Real Google OIDC:** deferred to provider/domain readiness; local fixture remains non-production only.
4. **Better suspended-access copy:** Product copy improvement; Feature 2 must provide a safe distinct state that UI can render without exposing tenant data.

## 3. Mandatory invariants

1. A User is global; access to a Workspace exists only through one active `(workspace_id, user_id)` Membership.
2. A User may have Memberships in multiple Workspaces. There is never more than one Membership row for the same User and Workspace.
3. The current Workspace is an explicit, server-validated, Session-scoped selection. “First Membership” is not authority once Feature 2 ships.
4. Roles are fixed Workspace-local policy definitions: `owner`, `admin`, and `member`. Generic APIs never create arbitrary Roles or assign `owner`.
5. Every active Workspace retains at least one active Owner. Ownership changes only through the dedicated transfer transaction.
6. Request bodies do not supply authoritative actor User, Session, Workspace, Membership, Role, permission, email-verification, or seat state.
7. Invitation possession alone grants nothing. Acceptance requires an active authenticated User and exact proof of the invited normalized email.
8. Active-seat limits are checked from the current entitlement inside the Membership activation transaction. Pending invitations do not consume seats.
9. Every mutation uses an idempotency key, expected versions where an existing aggregate changes, row locks, scoped predicates, row-count assertions, and atomic audit/outbox writes.
10. Cross-Workspace and unauthorized targets return tenant-safe results and produce bounded denial audits without secrets, invitation email, token, or foreign object facts.

## 4. Roles, permissions, and assignment ceilings

The server policy registry is authoritative. Stored Role JSON is a versioned snapshot and cannot grant unknown permissions.

| Action | Owner | Admin | Member |
| --- | ---: | ---: | ---: |
| List Workspace people/invitations | Yes | Yes | No |
| Invite Member | Yes | Yes | No |
| Invite Admin | Yes | No | No |
| Change Member to Admin | Yes | No | No |
| Change Admin to Member | Yes | No | No |
| Suspend/remove/restore Member | Yes | Yes | No |
| Suspend/remove/restore Admin | Yes | No | No |
| Affect an Owner through generic Membership API | No | No | No |
| Transfer ownership | Yes, self as current Owner, recent auth | No | No |
| Switch among own active Workspaces | Yes | Yes | Yes |

Ceiling rules:

- Admin may target only a non-self Member and may leave the target Role as `member`.
- Owner may target a non-self Admin or Member, promote Member to Admin, or demote Admin to Member.
- Neither Owner nor Admin may use generic Membership mutation to assign, demote, suspend, remove, or restore an Owner.
- No actor mutates their own Role/status through the administration endpoint.
- Owner transfer promotes one eligible active successor to Owner and demotes the verified prior Owner to Admin atomically.
- Invitations allow `admin|member` only and apply the same inviter ceiling.

## 5. State machines

### 5.1 Invitation

`pending → accepted | revoked | expired | superseded`

- Create produces `pending` and one single-use token generation.
- Resend keeps the current invitation pending, rotates the token hash, increments generation/version, and immediately invalidates the old token. If implementation retains a prior row, it becomes `superseded`.
- Revoke is an authorized expected-version transition from pending.
- Expiry is determined by server time; a locked operation may persist `expired` idempotently.
- Acceptance is terminal. Same-User replay returns the existing safe Membership result without another Membership, audit, outbox event, Role change, or seat consumption.
- Terminal invitations never return to pending. A later invite is a new aggregate.

### 5.2 Membership

`active ↔ suspended`  
`active | suspended → removed`  
`removed → active` only by authorized restore or valid invitation acceptance

- `active`: grants access according to the current Role and counts as one seat.
- `suspended`: grants no Workspace access and does not count as an active seat under the accepted local policy; history and Team associations remain.
- `removed`: grants no access, records `removed_at`, and does not count as a seat; historical references remain.
- Restore/reactivation clears `removed_at`, checks seat capacity, increments Membership version once, and reuses the existing row.
- An already-active Membership accepting an invitation retains its current Role, status, Team assignments, and version; invitation acceptance never silently demotes or promotes it.

### 5.3 Session Workspace selection

`unselected → selected(active membership)`  
`selected(A) → selected(B)`  
`selected → invalid` when Membership/User/Workspace/Session becomes unusable

- Selection is per Session, not a global User preference.
- A switch is allowed only to a Workspace for which the current User has an active Membership and the Workspace is active.
- Selection never changes Membership or Role.
- Suspending/removing the selected Membership invalidates access immediately. Other active Workspace Memberships remain available through the selector.
- If no active Membership remains, protected tenant routes deny access and show the safe no-access/suspended journey.

## 6. Data contract

Reuse current `users`, `workspaces`, `roles`, `workspace_memberships`, `workspace_invitations`, `workspace_invitation_teams`, `teams`, `team_memberships`, `sessions`, entitlement snapshots, idempotency, audit, and outbox tables and their accepted composite tenant constraints.

### 6.1 Required Workspace-selection persistence

Add `sessions.active_workspace_id uuid null references workspaces(id) on delete set null` and index `(user_id, active_workspace_id)`.

Database shape alone does not prove Membership. Every selection write and every tenant request must join:

`Session → active User/security_version → active Workspace → active Membership for Session User → Workspace-local Role`.

Migration/default rules:

- Existing Session with exactly one active Membership may be backfilled to that Workspace.
- Existing Session with zero or multiple active Memberships remains null and must select explicitly.
- New initial Workspace provisioning sets the provisioning Session's `active_workspace_id` in the provisioning transaction.
- Invitation acceptance does not silently replace an existing active selection. If the Session has no valid selection, it may select the accepted Workspace in the acceptance transaction and disclose that in the response.
- No profile/preference table stores “default Workspace” in Feature 2.

### 6.2 Existing mandatory constraints

- unique `(workspace_id, user_id)` Membership;
- composite `(workspace_id, role_id)` foreign key;
- unique Workspace-local Role code;
- unique pending `(workspace_id, email_normalized)` invitation;
- unique hashed invitation token and positive token generation/version;
- accepted/revoked/expired state consistency checks;
- Membership, Invitation, Workspace, Role, Team versions are positive;
- all Team, invitation, and Membership relationships preserve `workspace_id` in composite foreign keys.

## 7. Invitation and existing-User contracts

### Create

The server resolves the actor, Workspace, target Role, active Teams, and permission. It normalizes the email, rejects Owner invitations, and creates one pending invitation plus encrypted email outbox request atomically. Plain tokens appear only in the generated link inside the encrypted outbox envelope; only a purpose-bound keyed hash is stored.

If an active Membership already belongs to that normalized User in the Workspace, return `409 membership_exists`. If a pending invitation exists, return its safe summary; only explicit resend rotates the token.

### Accept

Acceptance requires:

- active authenticated User and Session;
- locally verified primary email equal to invitation email after canonical normalization;
- valid, unexpired, pending, single-use token;
- same-Workspace immutable system Role `admin|member`;
- all assigned Teams active and same-Workspace; and
- available active-seat capacity for a new or reactivated Membership.

Within one transaction, lock Invitation → Workspace → entitlement/active-seat boundary → existing Membership → Team rows. Then create/reactivate the one Membership, apply permitted invitation Role/Teams, consume the invitation, audit, enqueue non-email membership activation, save idempotency, and optionally establish selection only when none is valid.

For an existing active Membership, consume the same-User invitation but do not change Role, status, version, or Teams. For suspended/removed Membership, capacity applies and successful reactivation increments version once. Any failure rolls back Membership, Team, invitation, audit, outbox, and selection changes.

Public invalid-token, wrong-email, revoked, expired, and consumed responses remain generic. Internal audits retain safe bounded reason codes.

## 8. Membership administration contracts

### Role change

- Dedicated generic Membership mutation accepts `roleCode: admin|member` and `expectedVersion`.
- Server re-resolves actor and target under the Workspace lock and applies ceilings.
- Target Owner or requested Owner returns `409 owner_transfer_required` only when disclosure is safe; otherwise tenant-safe `404`.
- Successful change increments version once and takes effect on the target's next authorization check without requiring target login.

### Suspend

- Active non-Owner target becomes suspended under expected-version control.
- Access to that Workspace stops immediately because every request re-resolves active Membership.
- Existing Sessions are not globally revoked; they may still access another selected Workspace after an explicit switch.
- If suspended Workspace is selected in one of the target User's Sessions, those requests resolve selection as invalid. Implementations may clear those Session selections in the same transaction for clearer behavior.

### Remove

- Active/suspended non-Owner target becomes removed and records `removed_at`.
- Membership history is retained; no new duplicate row is created later.
- Workspace access stops immediately. Sessions remain identity-valid for other Workspaces.

### Restore

- Suspended target may return active; removed target may return active through an explicit authorized restore or valid invitation acceptance.
- Restore locks the Workspace/entitlement boundary, verifies capacity, applies ceilings, clears `removed_at`, and increments version once.
- Restore never grants Owner. Admin can restore only Member; Owner can restore Admin/Member.

## 9. Ownership contract

Owner transfer requires:

- current persisted actor is active Owner;
- recent authentication within `RECENT_AUTH_MINUTES` using a credential already linked to that User;
- active same-Workspace non-self successor;
- expected versions for prior Owner and successor;
- one idempotency key and canonical request hash; and
- current Session token eligible for the accepted recoverable rotation protocol.

Under the Workspace lock, promote successor first using a scoped one-row update, then demote the verified prior Owner to Admin using a scoped one-row update. Write one `workspace.ownership_transferred` success audit attributed to the prior Owner Membership with successor as target, rotate/recover the Session response as accepted, and commit once.

Rollback preserves the prior state on any failure. Generic Membership APIs cannot bypass this path. Concurrent transfer/removal/demotion requests must leave at least one active Owner and at most the intended accepted transfer outcome.

## 10. Explicit Workspace switching

### Read available Workspaces

`GET /api/workspaces`

Authentication: active Session/User.  
Response `200`:

```json
{
  "activeWorkspaceId": "uuid-or-null",
  "workspaces": [
    { "id": "uuid", "name": "Workspace", "slug": "workspace-slug", "role": "owner", "membershipId": "uuid" }
  ],
  "selectionRequired": false
}
```

Only active Workspaces reached through the current User's active Memberships are returned. Stable order is normalized Workspace name then Workspace ID. Suspended/removed Memberships are omitted; an optional aggregate-safe `unavailableMembershipCount` may support better copy but must reveal no Workspace details.

### Select Workspace

`POST /api/session/workspace`

Headers: standard CSRF/origin protection and `Idempotency-Key: UUID`.  
Body: `{ "workspaceId": "uuid" }`.  
Success `200`: `{ "workspace": { "id", "name", "slug", "role", "membershipId" }, "next": "/crm/home" }` plus rotated Session cookie.

Rules:

- Lock current Session, validate its current token, active User/security version, requested active Workspace, active Membership, and persisted Role.
- Do not trust a Membership or Role from the request.
- Set only this Session's `active_workspace_id`, rotate the opaque Session token, write audit and idempotency outcome atomically.
- Same key/hash replay safely recovers the same selection/rotated-session outcome using the accepted bounded Session-rotation recovery pattern. Changed-input reuse is `409 idempotency_conflict`.
- Unknown, cross-tenant, suspended, or removed target returns `404 workspace_not_available`.
- Switching does not require recent authentication and does not alter Membership, Role, entitlement, onboarding, or User profile.

### Tenant route resolution

After migration, CRM and Workspace administration routes must resolve the selected Workspace from `sessions.active_workspace_id`. Route Workspace IDs must equal that selected Workspace, or the server must require an explicit switch first. Remove `workspaceSummary(... order by joined_at limit 1)` as an authorization/navigation selector.

Safe navigation states:

- one active Membership and no selection: server may select it once and continue;
- multiple active Memberships and no valid selection: redirect to `/workspaces/select`;
- selected Membership suspended/removed but alternatives exist: redirect to selector with generic “Your access to the previous workspace is unavailable” copy;
- no active Membership: safe no-access page with invitation/onboarding guidance, never CRM data.

## 11. Endpoint contract

Existing endpoints remain normative where listed:

| Method and path | Purpose | Required authority | Body/control |
| --- | --- | --- | --- |
| `GET /api/workspaces` | List own active Workspace Memberships and selection | Active Session | no caller role/filter authority |
| `POST /api/session/workspace` | Select current Workspace | Active Membership in target | `workspaceId`; idempotency; Session rotation |
| `GET /api/workspaces/{wid}/people` | Paginated people read | selected `{wid}` + `members.read` | signed Workspace-bound cursor |
| `GET /api/workspaces/{wid}/invitations` | Paginated invitation read | selected `{wid}` + `members.read` | signed Workspace-bound cursor |
| `POST /api/workspaces/{wid}/invitations` | Invite Admin/Member | invite permission/ceiling | email, roleCode, optional teamIds; idempotency |
| `POST /api/workspaces/{wid}/invitations/{iid}/resend` | Rotate/resend | invite permission/ceiling | expectedVersion; idempotency |
| `POST /api/workspaces/{wid}/invitations/{iid}/revoke` | Revoke pending invite | invite permission/ceiling | expectedVersion; idempotency |
| `POST /api/invitations/accept` | Accept by opaque token | active verified User | token; idempotency; no Workspace ID authority |
| `PATCH /api/workspaces/{wid}/memberships/{mid}` | Role/status mutation | manage permission/ceiling | roleCode and/or `active|suspended|removed`, expectedVersion; idempotency |
| `POST /api/workspaces/{wid}/memberships/{mid}/restore` | Explicit restore | manage permission/ceiling | roleCode `admin|member`, expectedVersion; idempotency; seat check |
| `POST /api/workspaces/{wid}/ownership/transfer` | Atomic Owner transfer | current Owner + recent auth | successorMembershipId, both versions; idempotency |

Common responses:

- `400 validation_failed`
- `401 authentication_required` or `recent_auth_required`
- `404 resource_not_found` / `workspace_not_available` for tenant-safe denial
- `409 stale_version`, `idempotency_conflict`, `owner_transfer_required`, or `membership_exists`
- `410 invitation_invalid` using generic public text
- `422 seat_limit_reached`
- `429 rate_limited`

Responses contain safe IDs/state/version only. They never return invitation token hashes, normalized hidden emails, policy internals, foreign Workspace facts, Session hashes, or audit metadata.

## 12. Idempotency, concurrency, and lock order

Every mutation uses a canonical request hash and a 24-hour idempotency record:

- tenant administration principal: `membership:<actor_membership_id>`;
- invitation acceptance principal: `user:<user_id>` plus invitation terminal fields for durable replay;
- Workspace switch principal: `session:<session_id>`;
- operation names are distinct per mutation.

Same key/hash returns the original result without repeating writes. Same key/different hash returns `409 idempotency_conflict`.

Normative lock order:

`Session/User → Workspace → actor Membership/Role → idempotency → target aggregate → entitlement/seat rows → ordered Team rows → scoped mutation → audit/outbox → idempotency outcome → commit`

Invitation acceptance begins from the token-identified Invitation, then follows `Invitation → Workspace → entitlement/seat → Membership → Teams` because no trusted Workspace exists before token resolution. All competing paths touching those rows must preserve a compatible order.

Expected-version SQL includes `workspace_id`, target ID, and version and asserts exactly one changed row. Concurrent requests must produce one success plus stable replay/stale/denied outcomes, never last-write-wins.

## 13. Session and access effects

- Role/status changes take effect on every subsequent authorization query; mutable Role is never trusted from a cookie.
- Suspension/removal invalidates only that Workspace access, not the global User or unrelated Workspace Memberships.
- Ownership transfer and Workspace switch rotate the acting Session token. Other sessions re-resolve current Role and selection normally.
- Invitation acceptance may preserve the current Workspace selection; it must not unexpectedly move a User out of active work.
- Logout revokes the current Session regardless of selected Workspace.
- Recent authentication is required for Owner transfer. It is not required for ordinary invite, role, suspend/remove/restore, or switch operations under the accepted local policy.
- Suspended access copy is generic and action-oriented; it must not reveal who suspended the User, hidden Workspace data, or whether a cross-tenant target exists.

## 14. Audit taxonomy

Every authenticated mutation attempt records one safe success or denial event. Public unauthenticated invitation failures may use actor-null audit with invitation Workspace/target only after a token safely resolves; unresolved random tokens remain security telemetry to avoid audit-table abuse.

| Operation | Success action | Denial action |
| --- | --- | --- |
| List people/invitations | no success audit required (read) | `workspace.people_read_denied` |
| Create invite | `workspace.invitation_created` | `workspace.invitation_admin_denied` |
| Resend invite | `workspace.invitation_resent` | `workspace.invitation_admin_denied` |
| Revoke invite | `workspace.invitation_revoked` | `workspace.invitation_admin_denied` |
| Accept invite | `workspace.invitation_accepted` | `workspace.invitation_accept_denied` |
| Change Role/status | `workspace.membership_changed` | `workspace.membership_change_denied` |
| Restore Membership | `workspace.membership_restored` | `workspace.membership_change_denied` |
| Transfer Owner | `workspace.ownership_transferred` | `workspace.ownership_transfer_denied` |
| List/switch Workspace | `workspace.selection_changed` for switch | `workspace.selection_denied` |
| Recent authentication | `identity.recent_auth_succeeded` | `identity.recent_auth_failed` |

Audit attribution:

- `actor_user_id`, verified current `actor_membership_id`, and Session ID where known;
- Workspace ID only after server resolution;
- target invitation/Membership/Workspace ID only when safely resolved in that tenant;
- transfer actor Membership is the verified prior Owner and target is successor;
- bounded reason codes such as `forbidden`, `resource_not_found`, `stale_version`, `seat_limit_reached`, `last_owner`, `email_mismatch`, `invitation_expired`, `invitation_revoked`, `invitation_consumed`, `recent_auth_required`, `rate_limited`, and `idempotency_conflict`.

Allowed metadata is limited to operation, assigned Role, invitation generation, team count, expected/result versions, seat/active counts, auth-age bucket, and previous/new Workspace IDs for a successful switch. Never audit raw email, token/hash, password, authorization/cookie value, IP address, names, request body, or provider assertion.

Success audit, business mutation, outbox, and idempotency outcome share one transaction. Denials that require rollback are written through the accepted separate safe-denial transaction.

## 15. Material acceptance test matrix

### PostgreSQL/service tests

1. New-user invitation acceptance creates one Membership, consumes one seat/invitation, applies permitted Teams, and writes one audit/outbox atomically.
2. Existing User can accept Memberships in two Workspaces; uniqueness prevents duplicates within either Workspace.
3. Existing active Member/Admin/Owner acceptance preserves Role/status/Teams/version and sole Owner.
4. Suspended/removed reactivation enforces capacity, reuses one row, increments once, and fully rolls back at capacity or injected failure.
5. Wrong verified email, unverified User, expired/revoked/old-generation/consumed token, and token replay return generic public results with bounded safe audit behavior.
6. Concurrent final-seat accept/restore yields exactly one activation and no capacity overflow.
7. Admin can invite/manage Member but cannot invite/manage Admin or affect Owner; Member cannot administer; Owner ceilings succeed.
8. Cross-Workspace Membership/Invitation/Role/Team IDs produce tenant-safe denial before writes and no foreign data.
9. Role, suspend, remove, and restore enforce expected versions; same-key replay is stable and changed-input reuse conflicts.
10. Owner cannot be changed through generic endpoint; last Owner cannot be suspended/removed/demoted under concurrency.
11. Transfer verifies persisted actor, recent auth, same-Workspace active successor, both versions, rollback, attribution, session rotation/recovery, and one-Owner invariant.
12. Workspace list returns only current User's active Memberships.
13. Workspace switch rejects inactive/cross-tenant targets, changes only current Session selection, rotates/recoverably replays Session, and audits once.
14. Removing/suspending selected Membership immediately denies that tenant while preserving access to another active Membership after explicit switch.
15. All success/audit/outbox/idempotency writes roll back together under injected late failure; denials have no business side effects.

### Route/browser tests

1. Owner invites Member; invitee signs in with matching verified email, accepts, and reaches that Workspace after explicit selection.
2. Existing User sees two permitted Workspaces, switches A→B→A, and each CRM/settings page displays only the selected tenant's data.
3. Direct URL/API attempt for non-selected or foreign Workspace is denied and cannot switch implicitly.
4. Admin UI exposes only Member actions; server rejects manually forged Admin/Owner operations.
5. Role change appears on target's next request; suspension/removal immediately replaces tenant UI with safe access copy.
6. Restore succeeds below capacity and fails cleanly at capacity.
7. Owner transfer requires recent auth, confirmation, rotates the Session, updates both Users' effective permissions, and survives response-loss replay.
8. Stale browser tabs receive conflict and refresh rather than overwriting newer state.
9. Invitation resend invalidates old link; revoke/expiry/wrong-email views remain generic.
10. Logout after switching revokes the Session and protects every Workspace route.

Normal unit, PostgreSQL, migration, lint, build, and focused Playwright suites must pass. Tests must assert no cross-tenant rows, duplicate Memberships, duplicate success audits/outbox events, secret disclosure, partial mutations, or loss of the last active Owner.

## 16. Definition of done

Feature 2 is complete when:

- all invite, acceptance, Role, status, restore, transfer, and switching journeys above work from server-derived context;
- a User can safely operate in multiple Workspaces through explicit per-Session selection;
- the first/earliest Membership fallback no longer determines tenant authority;
- every material mutation success and denial has the specified safe audit evidence;
- concurrency, idempotency, seat, rollback, and last-Owner tests pass; and
- Feature 3 profile/preferences/security functionality has not been mixed into this delivery.

## 17. Deferred boundaries

Do not block Feature 2 local delivery on real Google, production email/domain, billing plan changes, audit retention/export/tamper evidence, provider webhooks, deployment operations, or generalized pre-UAT hardening. Existing fixture/provider labels must remain honest, and real provider-dependent paths remain disabled.

