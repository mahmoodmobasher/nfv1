# Feature 2 current-state gap analysis

Date: 2026-08-21  
Status: **read-only implementation audit**  
Scope: current local schema, migrations, services, routes, UI, and checked-in tests. No application code was changed and no external system was accessed.

## Scope interpretation

The repository does not contain a specification literally titled “Feature 2.” This audit therefore treats the requested capability list as the Feature 2 scope and maps it to the existing Slice 4 tenant-administration implementation, the accepted delivery reset, and current source/tests.

Feature 1 remains accepted based on `docs/architecture/onboarding-workspace-boundary-answers.md`, `docs/architecture/workspace-provisioning-validation.md`, and `docs/engineering/onboarding-workspace-boundary-validation.md`. Its four non-blocking follow-ons remain:

1. Add an explicit server-validated Workspace selector for Users with multiple active Memberships.
2. Give the post-provision package endpoint a purpose-specific public ineligible/conflict response instead of the current generic `invalid_plan` envelope.
3. Preserve the exact protected destination in the shared CRM unauthenticated return target (`/crm/home`, not normalized `/crm`).
4. Add clear user-facing copy for the stable `workspace_access` denial state used when a provisioned User has no active Membership.

Those follow-ons do not reopen Feature 1 acceptance. Feature 3 is not defined, assessed, or authorized by this report.

## Executive result

Feature 2 has a reusable, tenant-safe local foundation and several complete server-backed journeys. Invitation creation/acceptance, existing-user Membership handling, fixed Role policy, expected-version Member/Role changes, dedicated Owner transfer, last-Owner protection, and immutable audit persistence all exist.

It is not yet a complete Product feature because:

- People UI exposes Role editing but no suspend, remove, or restore controls;
- multiple Workspace Memberships are legal and invitation-backed, but the application has no active-Workspace selector/switcher;
- audit generation is broad but HTTP-boundary denial coverage remains incomplete and there is no audit read API/UI;
- Owner transfer is implemented, including response-loss recovery, but its local fixture-OIDC browser stability was never formally cleared after the independent gate rejection and production identity is outside this local implementation.

## Capability matrix

| Capability | Status | Current implementation | Exact gap |
| --- | --- | --- | --- |
| Invite | **Complete locally** | Hashed seven-day invitation, create/resend/revoke, Team assignment, seat guidance, multi-entry UI, idempotency, rate limits, audit, encrypted Mailpit outbox | Production email/provider delivery and final route-level denial assurance remain pre-UAT concerns; Admin UI still offers an Admin option that the server correctly rejects for Admin actors |
| Accept | **Complete locally** | Authenticated verified-email acceptance, generic invalid-token response, expiry/revoke/replay handling, atomic seat/Membership/Team/audit/outbox transaction | No production email/provider journey; no additional implementation gap found in the local acceptance transaction |
| Existing-user Membership | **Complete locally** | Existing active Membership remains unchanged; suspended/removed row is reactivated atomically under seat capacity; unique row reused | Product needs status controls and Workspace switching to make all resulting Memberships operable in the UI |
| Owner/Admin/Member assignment | **Complete with deliberate boundaries** | Provisioning assigns sole Owner; invitations assign Admin/Member only; generic role change assigns Admin/Member; Owner is granted only by dedicated transfer | UI does not explain all actor ceilings before submission; Owner assignment cannot and must not use invite/generic role APIs |
| Role change | **Complete locally** | Expected-version Member↔Admin mutation, persisted actor/Role re-resolution, Owner/Admin target ceilings, server-backed People selector | No concrete Reload action for People stale-role conflicts; the message only instructs the user to reload |
| Remove/suspend/restore | **Partial** | Service/API support active↔suspended and active/suspended→removed; suspended restore checks seats; removed reactivation is invitation-only; access loss is immediate | People UI has no suspend, remove, or restore controls, confirmation, status-transition feedback, or browser journey for these operations; removed restore is not a general admin operation by design |
| Owner transfer | **Partial for release; implemented locally** | Recent-authenticated dedicated endpoint, promote-before-demote, expected versions, Session rotation, encrypted bounded response-loss recovery, accessible confirmation UI, success/denial audit | Independent Slice 4 review rejected fixture-OIDC browser reproducibility; delivery reset deferred final clean Playwright/re-review to pre-UAT. Password recent auth remains the accepted local path; no production provider path exists |
| Last Owner | **Complete locally** | Generic membership API cannot mutate Owner; dedicated Owner services lock Workspace and persisted actor, reject last-Owner loss, and serialize transfer/removal | No gap in the current local invariant; retain adversarial/concurrency regression coverage |
| Multiple Memberships | **Partial** | Schema permits one User to have one Membership in each of many Workspaces; invitation acceptance creates/reactivates the same Workspace/User row; tenant context is Workspace-scoped | Current page contexts call `workspaceSummary`, which selects the earliest active Membership only. Additional Memberships exist safely but are not explicitly selectable |
| Workspace switcher | **Missing** | None. Workspace name/Role is displayed in CRM/admin shells, but it is not interactive authority | Requires a server-owned active Workspace selection contract, membership-validated switch mutation/read, persistence tied to User/Session, navigation UI, safe fallback, and multi-Workspace tests |
| Audits | **Partial** | Immutable schema; transactional success audits for invitations, Membership/Role changes, Teams, transfer, acceptance; separately committed bounded denial helper; scoped actor/target fields | Some parsing, tenant-context, and rate-limit failures occur outside service denial wrappers; invitation create route returns `failure(e)` rather than `auditedFailure`; no audit list/export UI/API, retention policy, or tamper/archive governance |

## Detailed mapping

### 1. Invitation creation, resend, and revoke — complete locally

Schema:

- `src/server/db/schema.ts`: `workspace_invitations`, `workspace_invitation_teams`, terminal-state checks, unique token hash, one pending invitation per Workspace/email, Workspace-composite Role/actor/accepted-Membership references.
- Migration `src/server/db/migrations/0007_omniscient_famine.sql` supplies the Slice 4 tables and constraints.

Services:

- `src/server/tenant-admin/invitations.ts`: `createInvitation`, `resendInvitation`, and `revokeInvitation`.
- Tokens are random and purpose-prefixed before keyed hashing. Plain tokens appear only in the encrypted delivery envelope.
- Create accepts only fixed `admin|member` Roles and active same-Workspace Teams.
- Resend rotates token/generation/version and can replace an expired invitation row.
- Revoke requires expected version and persisted permission.

Routes:

- `POST /api/workspaces/[workspaceId]/invitations`
- `POST /api/workspaces/[workspaceId]/invitations/[invitationId]/resend`
- `POST /api/workspaces/[workspaceId]/invitations/[invitationId]/revoke`
- `GET /api/workspaces/[workspaceId]/invitations` uses signed Workspace/endpoint-bound pagination.

UI:

- `src/app/workspace/settings/invite/page.tsx`
- `src/app/workspace/settings/invitations/page.tsx`
- `src/app/workspace/settings/admin-client.tsx`: `InviteClient` and `InvitationsClient` provide Add/paste/chips, per-row Role/Team choice, partial retry, status tabs, resend/revoke, expired “Send new invitation,” revoked “Invite again,” stale “Reload latest,” and accessible destructive confirmation.

Tests:

- `tests/slice4.integration.test.ts`: token hashing/atomic acceptance, resend rotation/idempotency, expiry replacement, accept-vs-revoke, accept-vs-resend, limiter dimensions, invalid Role/Team rollback.
- `tests/e2e/local-identity.spec.ts`: Owner→Mailpit→accept journey, multi-entry partial retry, resend invalidation and generic seat denial.

Gap notes:

- This is complete for the local server/Mailpit boundary, not production delivery.
- `InviteClient` receives no actor Role and always offers Admin. An Admin actor can select it, but the service correctly denies `members.invite_admin`. The UI should hide or disable choices the persisted actor cannot perform.
- The create route catches with generic `failure(e)` rather than `auditedFailure`, so parsing, tenant resolution, and route-level limiting are not uniformly covered by the HTTP denial audit boundary.

### 2. Invitation acceptance — complete locally

Service and route:

- `src/server/tenant-admin/invitations.ts`: `acceptInvitation`.
- `POST /api/invitations/accept` in `src/app/api/invitations/accept/route.ts`.
- `src/app/workspace/invitations/accept/page.tsx` and `accept-client.tsx` provide the server-backed acceptance screen.

Implemented behavior:

- active Session/User and verified normalized email are required;
- token lookup is hash-only and does not accept caller Workspace authority;
- Workspace, invitation Role, Teams, entitlement, active seats, and existing Membership are locked/revalidated;
- unknown, wrong-email, expired, revoked, and consumed states use a generic unavailable result;
- accepted replay by the same User returns the existing result;
- one-row invitation terminal update, audit, non-email outbox, Team assignments, and Membership write share one transaction.

Tests:

- “stores only a token hash and atomically accepts once with audit and non-email outbox”;
- “rejects wrong email, expiry, and revoke with one generic code and no membership”;
- “serializes the last seat so one acceptance succeeds and one remains pending”;
- accept-vs-revoke and accept-vs-resend concurrency cases;
- browser Mailpit acceptance journey.

### 3. Existing-user Membership — complete locally

The mandatory delivery-reset stabilization is present in `acceptInvitation`:

- an already-active Membership returns its persisted Role/status/Teams/version without mutation;
- an active Owner cannot be demoted by a stale Member/Admin invitation;
- a suspended/removed Membership consumes a seat when reactivated;
- below capacity, the same unique `(workspace_id,user_id)` row is reused and version increments once;
- at capacity or on injected downstream failure, Membership, invitation, Team, audit, and outbox changes roll back.

Evidence in `tests/slice4.integration.test.ts`:

- active Owner remains unchanged;
- active Admin and Member remain unchanged;
- suspended reactivation at capacity rolls back;
- removed reactivation under capacity succeeds once with validated Role/Teams;
- injected outbox failure rolls back the full aggregate.

`docs/architecture/delivery-scope-reset.md` defines these five mandatory cases, and `docs/engineering/delivery-scope-reset-checkpoint.md` records them as complete.

### 4. Owner/Admin/Member assignment and Role change — complete with fixed-role boundaries

Schema and policy:

- `roles_workspace_code_uq` and `roles_code_check` enforce one fixed `owner|admin|member` Role code per Workspace.
- `membership_workspace_role_fk` prevents assigning another Workspace's Role.
- `src/server/tenant-admin/permissions.ts` defines the server policy registry and Owner/Admin/Member permission ceilings.
- `src/server/workspaces/provision.ts` creates all three Workspace-local Role definitions and the sole initial Owner Membership.

Mutation paths:

- Invitation: Admin/Member only.
- `PATCH /api/workspaces/[workspaceId]/memberships/[membershipId]`: Member/Admin changes only, expected version required.
- `src/server/tenant-admin/administration.ts`: `changeMembership` re-resolves persisted actor and target Role, rejects self-change, Admin-over-Admin/Owner mutation, and all generic Owner assignment.
- Dedicated ownership transfer is the only post-provision Owner grant path.

UI:

- `PeopleClient` offers Member/Admin selectors according to actor ceiling and renders Owner as protected, non-editable text.
- Search, status/Role filters, result count, and native table semantics are implemented.

Evidence:

- `tests/slice4.integration.test.ts`: “enforces persisted Admin ceiling and optimistic membership versions.”
- `tests/db.integration.test.ts`: cross-Workspace Role rejection and invalid Role/Membership state rejection.
- Browser Team/people journey checks Admin ceilings.

Gap:

- A stale Role write gives explanatory text but no implemented “Reload latest” action on People.
- Admin actors are still shown Admin as an invitation option even though the service correctly rejects it.

### 5. Remove, suspend, and restore — partial

Backend:

- `PATCH /api/workspaces/[workspaceId]/memberships/[membershipId]` accepts `status: active|suspended|removed` with `expectedVersion`.
- `changeMembership` implements active↔suspended and active/suspended→removed, immediately removes inactive authorization, enforces target ceilings, and checks seat capacity on suspended→active.
- removed→active is deliberately rejected by generic administration; invitation acceptance is the current reactivation path.
- Owner/self mutation is blocked from the generic endpoint.

Tests:

- persisted Admin ceiling and stale version test exercises suspend and stale restore;
- browser evidence proves a suspended Member immediately loses CRM access;
- invitation tests prove suspended/removed restoration capacity and rollback.

Missing Product surface:

- `PeopleClient` has only a Role selector. There are no Suspend, Restore, or Remove buttons, confirmation dialogs, stale recovery, focus/status behavior, or browser journeys.
- The status filter can display suspended rows, but cannot act on them.
- “Invited” is offered in the Membership status filter even though `peopleModel` returns Memberships, not pending invitations; removed is not offered as a filter.

### 6. Owner transfer — partial for release assurance

Current implementation:

- `POST /api/workspaces/[workspaceId]/ownership/transfer`.
- `src/server/tenant-admin/administration.ts`: `transferOwner`, `recoverOwnerTransfer`, and `ownershipTransferRequestHash`.
- The service requires persisted Owner permission, recent authentication, actor/successor expected versions, active same-Workspace successor, and Workspace locking.
- It promotes successor before demoting the prior Owner to Admin, rotates the current Session, and stores only encrypted/bounded recovery material in the idempotency outcome for response-loss replay.
- `TransferClient` provides password or local fixture re-authentication, successor selection, and shared accessible `alertdialog` confirmation.

Evidence:

- `tests/slice4.integration.test.ts`: recent-auth transfer, exact attribution, response-loss recovery without repeated Role/audit mutation, concurrent transfer/removal, and recent fixture-OIDC Session rotation.
- `tests/ownership-remediation.integration.test.ts`: forged/stale/cross-Workspace actors, mismatched User, cross-tenant/self successor, row-count rollback, success/denial attribution, and transfer/removal serialization.
- `tests/e2e/local-identity.spec.ts` contains the fixture re-auth/transfer/rotated-session journey.

Release caveat:

- `docs/architecture/slice-4-gate-review.md` independently reproduced fixture-OIDC recent-auth failure and rejected final Slice 4 acceptance.
- `docs/architecture/delivery-scope-reset.md` deferred fixture-OIDC stabilization, clean full Playwright rerun, and transfer replay hardening to pre-UAT. Current source includes the recovery design and tests, but no later Architect re-review closes that recorded pre-UAT gate.
- Password recent authentication is the dependable local path. Real provider authentication is outside this report.

### 7. Last-Owner protection — complete locally

Protection is layered:

- generic Member mutation rejects any current or requested Owner Role;
- generic mutation rejects self-change;
- `src/server/workspaces/ownership.ts` locks Workspace and verifies the active persisted Owner actor;
- `changeOwnerMembership` counts active Owners before an Owner loss;
- `transferOwnership` validates active same-Workspace successor, promotes before removal, uses scoped row-count assertions, and rolls back on failure;
- `transferOwner` is the newer recent-authenticated Admin-demotion transfer path used by the API.

Evidence:

- all five `tests/ownership-remediation.integration.test.ts` adversarial/concurrency cases;
- Slice 3 and Slice 4 transfer/concurrent-removal cases;
- People UI renders Owner as non-editable and explains the protection.

### 8. Multiple Memberships — partial Product capability

Data and authorization support:

- `membership_workspace_user_uq` permits the same User in many Workspaces while preventing duplicate Memberships within one Workspace.
- every Membership carries a Workspace ID and same-Workspace Role foreign key.
- invitation acceptance creates/reactivates the relevant Workspace/User row.
- `resolveTenantContext` requires explicit `userId + sessionId + workspaceId` and an active Membership.
- tenant-owned services and routes scope all rows by Workspace.

Evidence:

- `tests/db.integration.test.ts`: one Membership per Workspace/User, cross-Workspace Role rejection, and repository Workspace scoping.
- `tests/onboarding-boundary.integration.test.ts`: matching authorization succeeds and cross-tenant authorization returns null/denied.

Why status is partial:

- `workspaceSummary` in `src/server/workspaces/provision.ts` orders active Memberships by join time and returns only one.
- `adminPageContext` and `crmPageContext` build page authority from that single summary.
- The User cannot see a Workspace list, select the intended active Workspace, or change it explicitly.

### 9. Workspace switcher — missing

No route, service, selected-Workspace Session field/cookie, page, or navigation control exists.

Reusable foundations:

- global User identity and Session;
- many-Workspace Membership schema;
- `resolveTenantContext` with explicit Workspace input;
- Workspace-safe Role and tenant constraints;
- existing CRM/admin shell Workspace display;
- signed endpoint/Workspace-bound cursor utility as a pattern for tamper-resistant state.

Required implementation:

1. Define which active Workspace is selected and where that selection is persisted—prefer server-side Session state or another server-owned record, not query/sessionStorage authority.
2. Add an authenticated list of only active Membership Workspaces with safe names and actor Roles.
3. Add a CSRF-protected switch mutation that re-resolves the active Membership and rejects missing/suspended/cross-tenant targets.
4. Make `crmPageContext`, `adminPageContext`, and protected route redirects consume the selected Workspace, with deterministic fallback when the selected Membership becomes unavailable.
5. Add accessible desktop/mobile switcher UI with current Workspace, loading/error, focus behavior, and no cross-tenant disclosure.
6. Add PostgreSQL and browser tests for two active Memberships, suspended/removed selection, stale Session selection, direct/back/refresh behavior, and tenant-isolated CRM/admin reads.

### 10. Audits — partial

Implemented foundation:

- `audit_events` stores Workspace, actor User/Membership/type, Session, action, target, outcome, bounded reason, request/correlation context, safe before/after, sanitized agent/network policy fields, and allowlisted versioned metadata.
- `writeAudit`, `withDenialAudit`, `safeDenialAudit`, and route `auditedFailure` are reusable foundations.
- Invitation create/resend/revoke/accept, Membership change, Team assignment, Workspace/Role administration, and ownership transfer write success audits in their business transactions.
- denial helpers separately persist minimized actor-safe failures after the business transaction rolls back.

Evidence:

- `tests/db.integration.test.ts`: complete safe audit shape, unsafe-value rejection, and cross-Workspace actor-Membership rejection.
- `tests/slice4.integration.test.ts`: invitation success/denial, minimized denial, existing-Membership rollback, Role/Team invalidation reason, ownership attribution, and limiter dimensions.
- `tests/ownership-remediation.integration.test.ts`: safe denial and exact transfer success attribution.

Gaps:

- HTTP-boundary coverage is inconsistent. For example, invitation create uses generic `failure` in its route catch, while acceptance/resend/revoke use `auditedFailure`. Validation, tenant resolution, permission, or rate-limit errors occurring before a service wrapper are therefore not uniformly audited.
- CSRF/anonymous failures appropriately may not have a safe business actor, but the boundary needs an explicit policy and security-log evidence.
- There is no tenant audit-read permission in use, audit list/search/export route, or Workspace audit UI. `audit.read` remains deferred in the contract.
- Retention, immutable export/archive, tamper evidence, support access, monitoring, and privacy governance are unimplemented Product/Operations decisions.

## Reusable foundations for Feature 2 completion

The following should be extended rather than replaced:

- `workspace_memberships`, Workspace-local fixed `roles`, composite foreign keys, status/version constraints;
- `resolveIdentityContext`, `resolveTenantContext`, `policyRegistry`, target ceilings, and recent-auth checks;
- `changeMembership`, `transferOwner`, invitation lifecycle services, and expected-version/idempotency helpers;
- `withDenialAudit`, `safeDenialAudit`, transactional `writeAudit`, and encrypted/fenced outbox;
- signed cursor/pagination utilities;
- `AdminShell`, `PeopleClient`, `InvitationsClient`, `ConfirmDialog`, and current mobile navigation/accessibility patterns;
- Slice 4 and ownership PostgreSQL adversarial/concurrency fixtures.

## Exact implementation package to finish Feature 2

This is gap definition only, not authorization to implement:

1. Add People-page suspend, restore, and remove actions using the existing Membership PATCH endpoint, expected versions, seat errors, accessible destructive confirmation, stale Reload latest, draft/focus/status preservation, and actor ceilings. Keep removed reactivation invitation-only unless Product explicitly changes policy.
2. Make invite Role options actor-aware so Admin cannot select Admin, while retaining server enforcement.
3. Add People stale-role Reload latest and align status filters with actual Membership states; pending invitations belong on Invitations, not as an `invited` Membership filter.
4. Implement the server-owned Workspace selection/switch contract and responsive switcher described above.
5. Close the route-level denial-audit/rate-limit gap consistently for invitation create and all pre-service failures; add route/service PostgreSQL assertions that no raw email/token/network data enters audit metadata.
6. Re-run and stabilize the full local browser administration suite, especially recent fixture-OIDC transfer, and obtain Architect closure of the deferred pre-UAT gate. Preserve password recent auth regardless.
7. If “audits” includes an administrator-facing history, separately define and implement `audit.read`, tenant-safe cursor pagination, allowlisted presentation fields, retention/export policy, and accessible UI. Do not expose raw audit metadata by default.

## Final determination

Feature 2 is **partially implemented overall**. Its core local invitation, Membership, Role, ownership, tenant, transaction, and audit-write foundations are reusable and well tested. The shortest path to a coherent local Product feature is member lifecycle UI plus actor-aware controls and a true Workspace switcher. Route-level audit completion and fixture re-auth/browser assurance remain mandatory before external UAT. No Feature 3 work is included.
