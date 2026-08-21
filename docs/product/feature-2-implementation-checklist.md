# Feature 2 — Implementation Checklist and Acceptance Criteria

Status: **implementation-ready; not accepted**  
Scope: **User, Role & Membership Management**  
Out of scope: Feature 3 personal profile, preferences, and account security

## Delivery lifecycle

`Defined → Implementation-ready → In implementation → Validation complete → Accepted`

Current stage: **In implementation**

Stage movement is evidence-based:

- **In implementation:** Engineering begins an approved checklist item.
- **Validation complete:** all mandatory implementation items are complete and the required automated, journey, accessibility, concurrency, and tenant-isolation evidence has been recorded.
- **Accepted:** Product approves the end-to-end journeys and Architecture confirms that no material security or data-integrity blocker remains.

## Product acceptance statement

> **Feature 2 is accepted when an authorized workspace administrator can safely manage users and memberships, and any multi-workspace user can explicitly switch among active workspaces with all access decisions enforced against the selected workspace context.**

Feature 2 remains unaccepted until every mandatory item below is complete and the final validation evidence passes. Existing service foundations count as implementation progress, but do not replace the end-to-end acceptance journeys.

## Non-negotiable boundaries

- A User is global; Workspace access exists only through an active Workspace Membership.
- A User may have active Memberships in multiple Workspaces.
- The active Workspace is an explicit, server-trusted, Session-scoped selection.
- “First Membership found” must not determine Workspace authority after Feature 2 ships.
- Generic Membership administration never assigns, demotes, suspends, restores, or removes an Owner.
- Ownership changes only through the dedicated Owner-transfer transaction.
- Every active Workspace retains at least one active Owner.
- Suspended and removed Memberships grant no Workspace access and cannot be selected.
- Feature 3 personal settings must not be mixed into Workspace administration.

## Foundational active-Workspace rule

> **Active Workspace is never client-selected authority.**

The UI may request a Workspace switch, but the server must independently confirm that:

- the authenticated User is active;
- the target Workspace exists and is active;
- the User has exactly one active Membership for that Workspace;
- the Membership belongs to the requested Workspace;
- the selected Workspace is stored in trusted Session context; and
- every subsequent tenant-scoped request resolves authorization and data scope from that validated Session context.

This contract is reusable and mandatory for CRM, Projects, Communications, Reporting, AI, Finance, and every future Workspace-scoped feature.

## Work item 1 — Membership lifecycle UI

### Delivery checklist

- [x] Add **Suspend** for eligible active Members and Admins.
- [x] Add **Restore** for eligible suspended Memberships.
- [x] Add **Remove from workspace** for eligible active or suspended Memberships.
- [x] Preserve historical Membership records; removal must not delete the User account.
- [x] Use confirmation dialogs that clearly explain the access effect.
- [x] Disable or hide actions the actor cannot perform, while retaining server enforcement.
- [x] Show clear loading, success, permission-denied, seat-limit, stale-version, and failure states.
- [x] Refresh server-derived Membership state after every successful mutation.
- [x] Ensure suspension/removal invalidates Workspace access on the next request.

### Acceptance criteria

- Owner can suspend, restore, or remove an eligible Admin or Member.
- Admin can manage eligible Members only and cannot affect Admins or Owners.
- Member cannot administer Memberships.
- No actor can use the generic Membership endpoint to affect an Owner or their own Membership.
- Restore checks active-seat capacity atomically and makes no partial change when capacity is exhausted.
- Suspend, restore, and remove confirmations are keyboard accessible and restore focus when dismissed.
- Successful and failed operations display the latest server state; stale local state is not presented as authoritative.

## Work item 2 — Authority-aware role assignment

### Delivery checklist

- [x] Derive available role options from the authenticated actor's persisted Membership and Role.
- [x] Permit Owner to change eligible Member ↔ Admin roles.
- [x] Permit Admin to retain or assign Member only where policy allows.
- [x] Exclude Owner from invitation and generic role-change controls.
- [x] Direct ownership changes to the separate Owner-transfer journey.
- [x] Re-resolve actor and target authority on the server for every mutation.

### Acceptance criteria

- The UI never offers a role the actor is not permitted to assign.
- Forged requests remain rejected even when client-side controls are bypassed.
- Owner assignment is impossible through invitation or generic role APIs.
- Role changes require the expected Membership version and are scoped to the selected Workspace.
- Cross-Workspace target IDs return tenant-safe denial without revealing foreign Workspace facts.

## Work item 3 — Stale-data and concurrent-change handling

### Delivery checklist

- [x] Send the current expected version with role and Membership mutations.
- [x] On success, replace local values with the authoritative server response or fresh server read.
- [x] On conflict, show **Reload latest** and preserve non-secret draft values where safe.
- [x] Prevent duplicate submissions while a mutation is pending.
- [x] Do not leave optimistic role or access changes displayed before server confirmation.
- [x] Return focus to the affected person or changed section after reload.

### Acceptance criteria

- Two concurrent edits produce one valid success and one stable conflict/reload outcome.
- A stale browser tab cannot overwrite a newer Role or Membership state.
- A failed request leaves the last confirmed server state visible.
- Reloading after a conflict announces that current values were loaded and displays the effective permissions.

## Work item 4 — Workspace selection contract and switcher

This work item is foundational for CRM, Projects, Communications, Reporting, AI, and every future tenant-scoped module.

### Delivery checklist

- [x] Store `active_workspace_id` in a server-trusted, Session-scoped context.
- [x] List only Workspaces reached through the current User's active Memberships.
- [x] Show the current Workspace name and effective Role.
- [x] For one active Membership, display the Workspace without a misleading switch action.
- [x] For two or more active Memberships, provide an explicit accessible switcher.
- [x] Validate every switch against the authenticated User, Session, active Workspace, and active Membership.
- [x] Rotate/recover the Session according to the accepted Session contract when switching.
- [ ] Reject suspended, removed, inactive, unknown, and cross-tenant Workspace targets.
- [ ] Resolve every protected route against the selected Workspace context.
- [ ] Remove earliest/first-Membership fallback as tenant authority.
- [ ] Redirect multiple-Membership Sessions without a valid selection to Workspace selection.
- [ ] If the selected Membership becomes unavailable, preserve access to other eligible Workspaces through safe reselection.
- [ ] Provide the switcher in desktop and mobile authenticated navigation.

### Acceptance criteria

- A User with Memberships in Workspaces A and B can explicitly switch A → B → A.
- Each page and API returns data only for the server-selected Workspace.
- Opening the switcher does not change Workspace context.
- Failed switching leaves the previous valid Workspace unchanged.
- Suspended or removed Workspaces never appear as selectable destinations.
- Direct URL or API access to a non-selected or foreign Workspace is denied and never switches implicitly.
- A User with no active Membership receives safe no-access guidance and no CRM data.
- Logout revokes the Session regardless of which Workspace is selected.

## Work item 5 — Audit completion

### Delivery checklist

- [x] Record invitation created, resent, revoked, accepted, and safely bounded denied events.
- [x] Record role change success and denial.
- [x] Record Membership suspend, restore, and remove success and denial.
- [x] Record Workspace selection success and denial.
- [x] Record Owner-transfer attempt, success, and denial.
- [x] Attribute events to the server-resolved actor, Session, Workspace, and safe target identifiers.
- [x] Keep business mutation, success audit, outbox, and idempotency outcome atomic.
- [x] Cover route-level validation, tenant-context, authorization, and rate-limit denials consistently.
- [x] Exclude raw emails, tokens, secrets, passwords, cookies, provider assertions, foreign-object facts, and request bodies.

### Acceptance criteria

- Every material mutation produces exactly one appropriate success or denial event.
- Same-key replay does not duplicate the mutation, audit, outbox event, or seat consumption.
- Failed transactions leave neither partial business changes nor false success audits.
- Audit metadata contains only allowlisted, tenant-safe fields.
- Cross-tenant denial records do not disclose the existence or attributes of foreign resources.

An administrator-facing audit-history screen is not required unless separately approved. Audit-write completeness is required.

## Work item 6 — Final validation

### Automated evidence

- [ ] Unit tests pass.
- [ ] PostgreSQL service and transaction tests pass.
- [ ] Migration checks pass.
- [ ] Browser tests pass for all supported local authentication paths.
- [ ] Lint, type validation, and production build pass.
- [ ] Focused concurrency and idempotency tests pass.

### Required product journeys

- [ ] Owner invites a Member; the invitee accepts and joins the correct Workspace.
- [ ] Existing User gains another Workspace Membership without losing existing Memberships.
- [ ] Existing active Membership invitation acceptance does not alter Role, status, Teams, version, or Owner state.
- [ ] Owner and Admin authority ceilings are correctly reflected and server enforced.
- [ ] Suspend, restore, and remove work immediately and safely.
- [ ] Restore/reactivation fails atomically at seat capacity.
- [ ] Owner transfer requires recent authentication and preserves at least one Owner.
- [ ] Multi-Workspace User switches between active Workspaces without tenant-data leakage.
- [ ] Suspended/removed User cannot access or select the affected Workspace.
- [ ] Stale tabs cannot overwrite newer Membership or Role changes.
- [ ] Logout protects every Workspace route.

### Accessibility and responsive evidence

- [ ] All workflows are keyboard operable.
- [ ] Confirmation dialogs have correct focus containment, Escape handling, and focus restoration.
- [ ] Errors are linked to fields or affected records and provide a real recovery action.
- [ ] Loading and success states are announced without noisy live-region updates.
- [ ] People lists/tables have accessible mobile equivalents.
- [ ] All actions remain usable at 320px and 200% zoom without horizontal overflow.
- [ ] Role, status, error, and destructive intent are not communicated by color alone.

### Security and tenant evidence

- [ ] All protected routes use the server-selected Workspace context.
- [ ] Cross-tenant Workspace, Membership, Invitation, Role, and Team IDs are safely denied.
- [ ] Last-owner protection holds under concurrent requests.
- [ ] Seat capacity holds under concurrent accept/restore requests.
- [ ] No duplicate Membership, audit, outbox, or idempotency result is created.
- [ ] No secrets or personal data appear in logs, audit metadata, URLs, or error responses.

### Mandatory failure-case evidence

- [ ] A suspended User attempting to switch into the affected Workspace is denied; the current valid Workspace remains unchanged.
- [ ] A removed Membership retained in stale browser state cannot be selected or used for route/API access.
- [ ] Two administrators changing the same User's Role concurrently produce one valid success and one stable conflict/reload outcome.
- [ ] The current and only Owner cannot remove, suspend, or demote themselves; the response directs them to transfer ownership.
- [ ] A stale Workspace switcher that lists an inaccessible Workspace fails safely when selected and refreshes from server-authoritative Memberships.
- [ ] Direct URL and API attempts against another or non-selected Workspace are denied without implicit switching or foreign-resource disclosure.
- [ ] Every denied administration, switching, and ownership action produces the required bounded audit evidence without a business-state mutation.
- [ ] A successful Workspace switch changes the visible and API data scope immediately, with no cached or server-returned data from the previous tenant.

## Release decision

Feature 2 may be marked **Accepted / Complete** only when:

1. Work items 1–5 meet their acceptance criteria;
2. all mandatory validation in work item 6 has recorded passing evidence;
3. Architecture confirms no material cross-tenant, session-bypass, last-Owner, secret-disclosure, or atomicity risk remains;
4. Product validates the complete Owner, Admin, Member, invitee, suspended-user, and multi-Workspace journeys; and
5. Feature 3 personal settings remain outside this delivery.

Production Google OIDC, production email/domain configuration, billing plan changes, audit retention/export UI, and generalized deployment hardening remain outside this local Feature 2 acceptance unless separately brought into scope.

## Handoff after acceptance

After Feature 2 is accepted, proceed to **Feature 3 — Personal Profile, Preferences & Account Security**, covering personal details, profile image, timezone, password and verified-email changes, theme, language, regional settings, notification preferences, and personal integration entry points.
