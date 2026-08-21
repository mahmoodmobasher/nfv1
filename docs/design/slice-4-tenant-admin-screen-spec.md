# NexaFlow Slice 4 tenant administration and invitations

Status: **Authorized local UX handoff**  
Direction: approved light experience from `docs/design/onboarding-screen-spec.md`  
Scope: server-backed Workspace settings, membership, invitations, roles, Owner transfer, optional teams, and tenant-safe administration states.  
Boundary: local PostgreSQL/Mailpit/test fixtures only. Do not imply real Google, production email, deployment, UAT, Lightsail, or Caddy. Mailpit is secondary local delivery guidance, never the identity or authorization model.

## 1. Product and visual rules

Use the existing light tokens, shell, typography, card geometry, focus ring, spacing grid, and responsive rules in the onboarding specification. Slice 4 admin surfaces are authenticated workspace screens, not marketing pages.

- Workspace is the tenant boundary. Account is the individual identity.
- The server is authoritative for workspace, membership, role, team, seat, invitation, entitlement, and permission state. URL parameters, browser storage, hidden fields, and client role strings are hints only.
- Use one visible H1 per route and one primary action per surface.
- Dangerous actions require an explicit confirmation dialog; ordinary navigation and logout do not gain unnecessary friction.
- Never use color alone for Owner/Admin/Member roles, invitation status, errors, or conflicts.
- Invitation/team/role UI may show a local-server banner. Do not call it a “demo” once its state is server-backed.
- If a capability remains fixture-only during implementation, show a route-specific banner: “LOCAL PREVIEW · This screen does not persist or authorize production data.” Do not mix that message with server-backed settings.

## 2. Route map

| Route | Purpose | Primary action | Boundary |
|---|---|---|---|
| `/workspace/settings` | Workspace overview and admin landing | Review people and roles | Server-backed |
| `/workspace/settings/people` | Membership list, role editing, invitation status | Invite your team / Save roles | Server-backed |
| `/workspace/settings/invite` | Create and send invitations | Send invitations | Server-backed local outbox |
| `/workspace/settings/invitations` | Pending, sent, expired, revoked invitations | Resend / Revoke | Server-backed local outbox |
| `/workspace/settings/teams` | Optional teams and memberships | Create team / Save members | Server-backed |
| `/workspace/settings/transfer-ownership` | Transfer Workspace Owner role | Review transfer | Server-backed, recent-auth required |
| `/workspace/invitations/accept` | Accept an invitation from a token | Accept invitation | Server-backed, token-scoped |
| `/crm` | Protected CRM entry and admin navigation | Add a lead / Open settings | Protected workspace |

Unknown, unauthorized, cross-tenant, revoked, expired, and already-consumed resources use tenant-safe not-found behavior unless the user is allowed to distinguish the state. Do not disclose whether another workspace, member, or invitation exists.

## 3. Shared admin shell

### Desktop

- Left workspace navigation: CRM overview, People and roles, Invitations, Teams, Workspace settings, then Sign out.
- Header shows workspace name, current role, and account menu. Workspace switching is separate from Sign out.
- Main content max width 1180px. Settings pages use a 240–280px navigation column and a 680–760px content column.
- Breadcrumbs are optional on desktop but useful for nested routes: “Workspace settings / People and roles”.

### Mobile, 320px minimum

- Replace the sidebar with the existing 44×44px menu trigger and white menu panel/backdrop.
- Menu order: CRM overview, People and roles, Invitations, Teams, Workspace settings, Sign out.
- The trigger has an accessible name that changes between “Open workspace navigation” and “Close workspace navigation”, plus `aria-expanded` and `aria-controls`.
- Escape closes the menu and returns focus to the trigger. Selecting a route closes the menu and returns focus after navigation where practical. Clicking the backdrop closes it.
- Tables become stacked member/invitation cards or an internally scrollable table with a visible “Scroll horizontally to see actions” hint. The page itself must never scroll horizontally.
- Destructive and primary controls remain full-width where needed; secondary actions stay visually quieter.

## 4. `/workspace/settings` overview

### Purpose and layout

H1: **Workspace settings**  
Support: **“Manage your workspace details, people, roles, and teams.”**

Cards/sections:

1. **Workspace details** — Workspace name, workspace URL/slug if supported, plan, cadence, trial/billing status, and **Change plan**.
2. **People and roles** — member count, pending invitation count, and **Manage people**.
3. **Invitations** — pending/sent/expired summary and **View invitations**.
4. **Teams** — team count and **Manage teams**; explain that teams are optional.
5. **Ownership** — current Owner and **Transfer ownership** for an eligible Owner.

Exact copy:

- Local server banner: **“LOCAL SERVER · Workspace settings, membership, roles, and teams are saved and authorized by the local server.”**
- Loading: **“Loading workspace settings…”** while retaining shell and card geometry.
- Empty members: **“No teammates yet.”** / **“Invite people to share this workspace.”** / **Invite your team**.
- Permission denial: **“You don’t have permission to manage this workspace.”** with **Return to CRM**.
- Tenant-safe not-found: **“Workspace settings aren’t available.”** / **“This workspace may have been removed or you may no longer have access.”** / **Return to CRM**.
- Session expiry: **“Your session expired. Sign in to continue.”** Preserve only safe, non-secret draft values.
- Unexpected error: **“We couldn’t load workspace settings. Try again.”** / **Try again**.

## 5. People and roles

### `/workspace/settings/people`

H1: **People and roles**  
Support: **“Control who can access this workspace and what they can manage.”**

Toolbar controls:

- **Invite your team** primary action.
- Search field labelled **Search people** with helper **“Search by name or email.”**
- Status filter: All, Active, Invited, Suspended.
- Role filter: All, Owner, Admin, Member.
- Optional **Refresh** button for conflict recovery.

Member table/card fields:

- Person, Email, Role, Status, Teams, Last active, Actions.
- Role descriptions available through an info disclosure:
  - Owner: **“Full workspace and billing control.”**
  - Admin: **“Can manage people and permitted CRM configuration, but not ownership or billing.”**
  - Member: **“Can use assigned CRM capabilities.”**

Role editing:

- Owner may edit Admin/Member roles if authorized. Admin may edit only permissions explicitly granted by the server. Member sees read-only role information.
- Use a labelled select with Owner, Admin, Member only where allowed. Do not render a disabled fake control for a protected Owner; show text plus explanation.
- Sole Owner helper: **“You can’t remove or downgrade the only Workspace Owner.”**
- Primary save label: **Save roles**. Loading: **Saving roles…**. Success: **Roles updated.**
- Permission error: **“You don’t have permission to change this person’s role.”**
- Deactivate/remove action, where authorized, opens the destructive confirmation below.

### Remove or suspend confirmation

Title: **“Remove {name} from this workspace?”**  
Body: **“They will lose access to this workspace. Their account is not deleted.”**  
Actions: **Cancel** (initial focus), **Remove from workspace** (destructive).

Suspension variant:

Title: **“Suspend {name}?”**  
Body: **“They will lose access immediately. You can restore access later.”**  
Actions: **Cancel**, **Suspend member**.

Success: **“{name} was removed from the workspace.”** / **“{name} was suspended.”**  Failure preserves the list and says **“We couldn’t update this person. Try again.”**

## 6. Invite users

### `/workspace/settings/invite`

H1: **Invite your team**  
Support: **“Invite people to this workspace. Invitations expire after 7 days, and pending invitations don’t use a seat.”**

Controls and order:

1. Multi-entry **Work email** input.
2. **Add** button; Enter, comma, semicolon, space, and paste are supported.
3. Email chips with 44×44px remove buttons.
4. **Default role** select: Member or Admin. Never offer Owner here.
5. Per-invite rows with email, role select, optional team picker, and remove action.
6. Primary **Send invitations**.
7. Secondary **Save as draft** only if draft persistence is approved; otherwise **Cancel**.

Validation/state copy:

- Empty: **“Add at least one work email to send an invitation.”**
- Invalid: **“Enter a valid work email address.”**
- Duplicate/self: **“This person already belongs to this workspace or has a pending invitation.”**
- Seat limit: **“Your {plan} plan has {n} invitation seats remaining.”** Actions **Review plan**, **Remove an invite**.
- Loading: **“Sending invitations…”**; retain entries and prevent duplicate submit.
- Success: **“Invitations sent.”** / **“We sent {n} invitations. They expire after 7 days.”** / **View pending invitations**.
- Network/outbox failure: **“We couldn’t send these invitations. Your entries are still here. Try again.”**
- Mailpit guidance, when relevant: secondary note **“In this local environment, delivery can be inspected in Mailpit.”** Never say that invitations are sent to real email.

## 7. Pending invitations

### `/workspace/settings/invitations`

H1: **Invitations**  
Support: **“Review invitations, resend a message, or revoke access before it is accepted.”**

Tabs/filters: Pending, Sent, Expired, Revoked. Each row/card shows masked or full invited email according to policy, role, teams, inviter, created time, expiry, and status.

Actions:

- Pending: **Resend**, **Revoke**.
- Expired: **Send new invitation**; do not silently resurrect the old token.
- Revoked: **Invite again**.
- Sent: **View details** and **Resend** only if still valid.

State copy:

- No pending: **“No pending invitations.”** / **“Invitations you send will appear here.”**
- Resend loading: **“Resending invitation…”**. Success: **“Invitation resent. It expires after 7 days.”**
- Revoke confirmation title: **“Revoke this invitation?”** Body: **“The invitation link will stop working. The person can’t use it to join this workspace.”** Actions **Keep invitation**, **Revoke invitation**.
- Revoke success: **“Invitation revoked.”**
- Expired: **“This invitation expired on {date}.”**
- Partial delivery: **“Some invitations were sent; others need attention.”** Group **Sent** and **Needs attention**, with per-row **Retry**.
- Seat race: **“There are no available seats for this invitation.”** / **Review plan**.
- Unknown/revoked/wrong workspace token: **“This invitation isn’t available.”** Do not reveal which condition occurred.

## 8. Invitation acceptance

### `/workspace/invitations/accept`

Show the invited workspace name only after server token validation and only if safe.

- H1: **“Join {workspace name}?”**
- Support: **“You were invited as a {role}. This invitation expires after 7 days.”**
- Primary: **Accept invitation**.
- Secondary: **Decline**.
- Wrong signed-in email: **“This invitation was sent to a different email address. Sign in with the invited email to continue.”** Do not show the other address in full.
- Already a member: **“You already have access to this workspace.”** / **Open workspace**.
- Expired/revoked/consumed/invalid: **“This invitation isn’t available.”** / **Request a new invitation** only where the server permits.
- Acceptance loading: **“Joining workspace…”**. Success: **“You joined {workspace name}.”** / **Open workspace**.
- Acceptance is transactional and idempotent; refreshing success must not create another membership.

## 9. Owner/Admin/Member editing and Owner transfer

### Owner transfer route

`/workspace/settings/transfer-ownership` is visible only to the current server-authorized Owner and requires recent authentication.

H1: **Transfer workspace ownership**  
Support: **“Choose an active workspace member to become the new Workspace Owner.”**

Flow:

1. Select successor from same-workspace active members; never accept a client-supplied cross-tenant ID without server validation.
2. Explain: **“The new Owner will control billing, workspace settings, people, roles, and ownership. You will become an Admin.”**
3. **Continue to confirmation**.
4. If recent-auth is missing/expired, show recent-auth form: **Confirm your password** or approved identity re-auth method. Copy: **“For your security, confirm your identity before transferring ownership.”** Primary **Verify and continue**.
5. Final confirmation dialog:

   Title: **“Transfer ownership to {name}?”**  
   Body: **“This person will gain full workspace and billing control. You will become an Admin. This action can’t be undone from this screen.”**  
   Actions: **Cancel**, **Transfer ownership** (destructive/high-impact).

- Loading: **“Transferring ownership…”**; disable navigation and duplicate submit.
- Success: **“Ownership transferred.”** / **“{name} is now the Workspace Owner. You are an Admin.”** / **Return to workspace settings**.
- Self-transfer: **“Choose another member. You are already the Workspace Owner.”**
- No eligible successor: **“No eligible members can receive ownership yet.”** / **Invite or activate a member first**.
- Last-Owner safety is enforced server-side; the UI must never offer removing/downgrading the only Owner.
- Failure: **“We couldn’t transfer ownership. No role changes were saved. Try again.”**

## 10. Optional teams and membership

### `/workspace/settings/teams`

H1: **Teams**  
Support: **“Organize people for routing, visibility, and collaboration. Teams are optional.”**

- Primary **Create team**.
- Empty state: **“No teams yet.”** / **“Create a team such as Sales, Customer Success, or Delivery.”**
- Team card fields: name, description if supported, member count, visibility/routing summary, updated date, actions.
- Team form: **Team name** required, optional description, member picker with search, primary **Create team**, secondary **Cancel**.
- Duplicate: **“A team with this name already exists in this workspace.”** Preserve selected members.
- Create loading: **“Creating team…”**. Success: **“Team created.”** with **Add members**.
- Team detail membership editor: **Save members** / **Saving members…** / **Team members updated.**
- Remove member confirmation: **“Remove {name} from {team}?”** / **“They will remain a member of the workspace.”** Actions **Cancel**, **Remove from team**.
- Delete team confirmation: **“Delete {team}?”** / **“People will remain in the workspace, but team-based routing and visibility rules may change.”** Actions **Cancel**, **Delete team**.
- Permission denial: **“You don’t have permission to manage teams.”**
- Team membership writes use expected versions and show the version-conflict state below.

## 11. Tenant-safe not-found, permissions, and version conflicts

### Permission states

- Missing permission: **“You don’t have permission to perform this action.”**
- Do not reveal whether a target member, team, invitation, or workspace exists across tenants.
- For a route-level denial, use **Workspace settings aren’t available** with **Return to CRM**.

### Version conflict / stale form

When another actor changes the record after it was loaded:

- Alert heading: **“This changed while you were editing.”**
- Body: **“Someone else updated this {member/team/invitation}. Review the latest values before saving.”**
- Actions: **Reload latest** (primary), **Keep my draft** (secondary where safe).
- Preserve unsaved non-secret values separately from the server record; never overwrite silently.
- After reload, announce **“Latest values loaded.”** and move focus to the changed section heading.

### Loading/empty/error/success rules

- Loading keeps heading, navigation, card geometry, and contextual labels in place; use skeletons only for unknown values.
- Empty states explain what the user can do next and provide one primary action.
- Blocking errors are inline page alerts with recovery actions; toasts are only for non-blocking confirmations.
- Success is visible in the page content and not only a toast. Preserve the current route after save unless the flow has a clear completion destination.

## 12. Accessibility acceptance criteria

- Every route has one visible H1, a unique title, and a meaningful landmark structure.
- Every field has a programmatic label, correct autocomplete where applicable, helper/error association, and `aria-invalid` when invalid.
- Error summary receives focus after failed submit and contains links to every invalid field. Field errors remain present until corrected.
- Invite chips and row actions have explicit names, keyboard removal, and 44×44px targets.
- Tables use proper headers/row semantics or an equivalent accessible card structure; column meaning remains understandable at 200% zoom.
- Role labels include text descriptions; Owner protection is explained inline and never conveyed by disabled appearance alone.
- Dialogs use `role="alertdialog"` only for destructive/high-impact confirmation, trap focus, set initial focus on the safe action, close on Escape where allowed, and restore focus to the trigger.
- Live regions announce meaningful loading, save, resend, conflict, and success changes politely. Do not announce every countdown tick or decorative spinner.
- Focus order follows visual order. Menus, drawers, selects, tables, and dialogs work without pointer input.
- Forced-colors/high-contrast mode preserves borders, selected state, focus, status text, and action affordances without color-only meaning.
- No sensitive invitation token, password, recent-auth value, or full recovery data appears in analytics, client logs, toast text, or rendered URLs beyond the approved opaque acceptance link.

## 13. Responsive acceptance criteria

- At 320px, no page-level horizontal scrolling on settings, people, invite, invitations, teams, transfer, or acceptance routes.
- Mobile cards use 20px padding and full-width primary actions. Long email addresses wrap or truncate with an accessible full value.
- Role and invitation controls remain usable when labels wrap to two lines.
- Tables either convert to cards or use a bounded, keyboard-accessible horizontal scroller with visible context.
- At desktop widths, content does not become an overlong single form line; settings navigation and main content remain visually balanced.
- At 200% zoom, all controls remain reachable, dialogs fit within the viewport, and no essential action is hidden behind hover.
- Respect `prefers-reduced-motion`; no information depends on animation.

## 14. Local-server and preview truthfulness

- Server-backed Slice 4 screens use: **“LOCAL SERVER · Workspace settings, membership, roles, teams, and invitations are saved and authorized by the local server.”**
- Mailpit note: **“In this local environment, delivery can be inspected in Mailpit.”** This is secondary delivery guidance, not a claim that production email is configured.
- Local Google fixture remains labelled **“Local Google fixture · Non-production”** wherever offered.
- Any still-unimplemented CRM business/lead screen keeps a route-specific preview banner and must not consume invitation/team completion as server truth.
- Never describe server-backed passwords, sessions, workspace membership, roles, or invitation records as “dummy”, “not saved”, or “browser-only”.

## 15. Develop acceptance checklist

- [ ] Route map exists with server guards and tenant-safe not-found behavior.
- [ ] Workspace settings and people screens render server-derived workspace/member/role/seat data.
- [ ] Invite creation supports multi-entry, role/team selection, validation, seat enforcement, loading, outbox failure, and partial delivery.
- [ ] Pending invitations support resend, revoke, expiry, already-consumed, wrong-email/workspace, and retry states without leaking token facts.
- [ ] Owner/Admin/Member editing enforces server permissions, sole-Owner protection, audit, and expected-version conflicts.
- [ ] Owner transfer requires recent auth, same-workspace eligible successor, explicit destructive confirmation, atomic success/failure, and safe resume.
- [ ] Teams support create, duplicate, membership edit, remove, delete, permission denial, and version conflict states.
- [ ] Mobile navigation, tables/cards, dialogs, keyboard, focus, live regions, 320px, 200% zoom, forced colors, and reduced motion pass.
- [ ] Logout remains the real server logout path; failed logout preserves the active session and successful logout prevents protected re-entry.
- [ ] Local server and preview banners are truthful; no real Google, production email, domain, deployment, Lightsail, UAT, or Caddy is implied.
- [ ] PostgreSQL and Playwright evidence covers invitation replay/expiry/revocation, wrong tenant/email, seat limits, role races, Owner transfer, team membership, and logout/session revocation.

