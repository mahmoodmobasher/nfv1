# Feature 2 — User, role, and membership journeys

**Status:** implementation-ready UX handoff  
**Direction:** accepted NexaFlow light design  
**Scope:** workspace administration, invitations, memberships, roles, ownership, and workspace switching  
**Boundary:** local server/PostgreSQL and Mailpit guidance only. No real Google, production email, deployment, or external identity provider is implied.

## Product boundary

Workspace administration controls access to a tenant: people, invitations, roles, seats, ownership, teams, and audit-facing confirmations. Personal settings are Feature 3 and must not be mixed into these routes. Personal settings may include an individual’s profile, password, notification preferences, and personal sessions; they do not change workspace membership or role.

The server is authoritative for workspace identity, membership, role, seat, invitation, ownership, and permission state. Browser storage, URL values, hidden fields, and client role labels are never authorization sources.

## Route map

| Route | Purpose | Primary action | Access |
|---|---|---|---|
| `/workspace/settings` | Workspace administration landing | Manage people | Owner/Admin; read-only summary for Member |
| `/workspace/settings/people` | Members, roles, status, search | Invite your team | Owner/Admin; read-only for Member |
| `/workspace/settings/invite` | Create multi-invite | Send invitations | Owner/Admin if permitted |
| `/workspace/settings/invitations` | Pending, sent, expired, revoked | Resend / revoke | Owner/Admin |
| `/workspace/settings/teams` | Optional teams and membership | Create team | Owner/Admin |
| `/workspace/settings/transfer-ownership` | Transfer Owner role | Transfer ownership | Current Owner only |
| `/workspace/invitations/accept` | Token-scoped acceptance | Accept invitation | Invitee |
| `/workspace/switch` | Choose another existing membership | Open workspace | Authenticated users with 2+ memberships |
| `/crm` | Protected product entry | Open CRM | Active workspace member |
| `/settings` | Feature 3 personal settings boundary | Manage my account | Authenticated user; not workspace admin |

Unknown, cross-tenant, expired, revoked, consumed, and unauthorized resources use the safe message **“This workspace resource isn’t available.”** Do not reveal whether another tenant or invitation exists.

## Shared shell and navigation

Desktop uses the accepted light authenticated shell: workspace switcher at the top of the workspace navigation, CRM routes, then **People and roles**, **Invitations**, **Teams**, **Workspace settings**, and **Sign out**. Personal settings is reached from the account menu and is visually separate from workspace administration.

The workspace switcher shows the current workspace name and role, then a list of memberships with workspace name, role, and current marker. It has **Switch workspace** as the accessible label and never changes workspace merely by opening the menu. Selecting a workspace navigates to its protected landing route and refreshes server authorization. If switching fails, show **“We couldn’t switch workspaces. Your current workspace is unchanged.”**

At 320px, replace the sidebar with the existing 44px menu button. The menu includes the workspace switcher, CRM, People and roles, Invitations, Teams, Workspace settings, Personal settings, and Sign out. Escape and backdrop close return focus to the trigger; route selection closes the menu; focus is not left behind an overlay. The page must not horizontally overflow.

## Actor model and permissions

| Actor | Can do | Cannot do |
|---|---|---|
| Owner | Invite, resend/revoke, assign roles, suspend/restore/remove, manage teams, transfer ownership, review workspace settings | Remove/downgrade the only Owner; transfer without recent auth |
| Admin | Invite and manage members/teams only where server permission allows; assign Member and permitted Admin roles | Assign Owner, transfer ownership, manage billing/ownership, exceed server limits |
| Member | Use authorized workspace/CRM features; view own role and permitted workspace summary | Invite, change roles, suspend/remove, manage teams, transfer ownership |
| Invitee | Review a valid token and accept/decline | See unrelated workspace data or accept with a wrong email |

Role descriptions:

- **Owner:** “Full workspace and billing control.”
- **Admin:** “Can manage people and permitted workspace configuration, but not ownership or billing.”
- **Member:** “Can use the workspace features available to them.”

## Journey A — Invite a user

On `/workspace/settings/invite`:

- H1: **Invite your team**
- Support: **“Invite people to this workspace. Invitations expire after 7 days, and pending invitations don’t use an active seat.”**
- Input: **Work email**; helper **“Add one or more email addresses.”**
- **Add** accepts Enter, comma, semicolon, space, and paste. Each chip has an accessible **Remove {email}** button.
- Each invite row contains email, role, optional team, and remove. Default role is Member; Owner is never offered.
- Primary: **Send invitations**. Secondary: **Cancel**.

Critical states:

- Empty submit: **“Add at least one work email to send an invitation.”** Focus the email input or linked error summary.
- Invalid email: **“Enter a valid work email address.”** Link the error with `aria-describedby` and `aria-invalid=true`.
- Existing member/pending duplicate: **“This person already belongs to this workspace or has a pending invitation.”** Keep other valid rows.
- Seat limit: **“Your {plan} plan has no invitation seats available.”** Actions **Review plan** and **Remove an invite**.
- Loading: **“Sending invitations…”** Disable submit and prevent duplicate requests while preserving rows.
- Full success: **“Invitations sent.”** / **“We sent {n} invitations. They expire after 7 days.”** / **View pending invitations**.
- Partial success: **“Some invitations were sent; others need attention.”** Group **Sent** and **Needs attention**, with row-level **Retry**.
- Network/server failure: **“We couldn’t send these invitations. Your entries are still here. Try again.”**
- Mailpit note, secondary only: **“In this local environment, delivery can be inspected in Mailpit.”**

## Journey B — Pending invitation management

On `/workspace/settings/invitations`:

- H1: **Invitations**
- Support: **“Review invitations, resend a message, or revoke access before it is accepted.”**
- Accessible filters/tabs: **Pending**, **Sent**, **Expired**, **Revoked**; announce result count.
- Each row/card shows email, role, team, inviter, created date, expiry, status, and actions.

Actions and confirmations:

- Pending: **Resend**, **Revoke**.
- Expired: **Send new invitation**; the expired token is not resurrected.
- Revoked: **Invite again**.
- Revoke dialog title: **“Revoke this invitation?”** Body: **“The invitation link will stop working. The person can’t use it to join this workspace.”** Actions: **Keep invitation** and **Revoke invitation**.
- Resend loading: **“Resending invitation…”**; success: **“Invitation resent. It expires after 7 days.”**
- Revoke success: **“Invitation revoked.”**
- Empty: **“No {status} invitations.”** / **“Invitations you send will appear here.”**
- Conflict: **“This invitation changed while you were viewing it. Review the latest status before continuing.”** Actions **Reload latest** and **Cancel**.

## Journey C — Accept invitation

After server token validation at `/workspace/invitations/accept`:

- H1: **Join {workspace name}?**
- Support: **“You were invited as a {role}. This invitation expires after 7 days.”**
- Primary: **Accept invitation**. Secondary: **Decline**.
- New user: accept, then continue to the authenticated workspace setup required by the server.
- Existing user: create the new membership, preserve existing memberships, then offer **Open workspace**.
- Already a member: **“You already have access to this workspace.”** / **Open workspace**.
- Wrong signed-in email: **“This invitation was sent to a different email address. Sign in with the invited email to continue.”** Never disclose the full invited address.
- Expired/revoked/invalid/consumed: **“This invitation isn’t available.”** / **Request a new invitation** where permitted.
- Loading: **“Joining workspace…”**. Success: **“You joined {workspace name}.”**
- Acceptance is idempotent; refresh must not create duplicate membership.

## Journey D — Add an existing user membership

An Owner/Admin may use **Add existing member** from People and roles only when the server finds an eligible existing identity in the approved local directory. This is distinct from invitation and must never expose a cross-tenant directory.

- H2: **Add an existing person**
- Search label: **Search verified users**; helper: **“Search by the email or name you’re authorized to add.”**
- Result row: display name, masked email as policy requires, current relationship, proposed role.
- Primary: **Add to workspace**.
- Confirmation: **“Add {name} to this workspace?”** / **“They will receive access as a {role}. Workspace activity may be visible according to their role and team permissions.”** Actions **Cancel**, **Add member**.
- Already a member: **“This person is already a member of this workspace.”**
- No result: **“No eligible people found.”** / **“Invite a new person instead.”**
- Seat limit: **“There are no available seats for this member.”** / **Review plan**.
- Success: **“{name} was added to the workspace.”**

## Journey E — Role assignment and change

People and roles supports search, Status filters (All, Active, Invited, Suspended), and Role filters (All, Owner, Admin, Member). Desktop uses a native table with caption, `thead`, scoped headers, and cells; mobile uses accessible stacked cards with the same field order.

Role edits use a labelled select only when allowed. The sole Owner is displayed as text with **“You can’t remove or downgrade the only Workspace Owner.”**

- Primary: **Save roles**; loading: **Saving roles…**; success: **Roles updated.**
- Permission denial: **“You don’t have permission to change this person’s role.”**
- Role change confirmation for elevation: **“Change {name} to {role}?”** / **“This changes what they can access and manage in the workspace.”** Actions **Cancel**, **Save role**.
- Owner cannot be assigned from ordinary role editing; use transfer ownership.
- Conflict: **“This person’s role changed while you were editing.”** Actions **Reload latest** and **Keep my draft** where safe. After reload announce **“Latest values loaded.”** and focus the member heading.

## Journey F — Suspend, restore, and remove

Suspension is reversible; removal ends the membership but never deletes the personal account.

- Suspend dialog: **“Suspend {name}?”** / **“They will lose access immediately. You can restore access later.”** Actions **Cancel**, **Suspend member**.
- Restore: **“Restore {name}’s access?”** / **“They will be able to use this workspace again with their current role.”** Actions **Cancel**, **Restore access**.
- Remove dialog: **“Remove {name} from this workspace?”** / **“They will lose access to this workspace. Their account is not deleted.”** Actions **Cancel**, **Remove from workspace**.
- Success: **“{name} was suspended.”**, **“{name}’s access was restored.”**, or **“{name} was removed from the workspace.”**
- Last Owner: **“The only Workspace Owner cannot be suspended, removed, or downgraded. Transfer ownership first.”**
- Failure: **“We couldn’t update this person. No changes were saved. Try again.”**

## Journey G — Owner transfer

Only the current server-authorized Owner sees `/workspace/settings/transfer-ownership`.

1. H1: **Transfer workspace ownership**. Support: **“Choose an active workspace member to become the new Workspace Owner.”**
2. Select successor from active same-workspace members.
3. Explain: **“The new Owner will control billing, workspace settings, people, roles, and ownership. You will become an Admin.”**
4. Primary: **Continue to confirmation**.
5. Recent-auth gate: **“For your security, confirm your identity before transferring ownership.”** Use the approved local password or local fixture OIDC confirmation; do not imply real Google. Primary: **Verify and continue**.
6. Alert dialog title: **“Transfer ownership to {name}?”** Body: **“This person will gain full workspace and billing control. You will become an Admin. This action can’t be undone from this screen.”** Initial focus **Cancel**; Escape cancels; focus returns to **Continue to confirmation**.
7. Submit loading: **“Transferring ownership…”**. Success: **“Ownership transferred.”** / **“{name} is now the Workspace Owner. You are an Admin.”** / **Return to workspace settings**.

No eligible successor: **“No eligible members can receive ownership yet.”** / **Invite or activate a member first**. Self-selection: **“Choose another member. You are already the Workspace Owner.”** Failure: **“We couldn’t transfer ownership. No role changes were saved. Try again.”**

## Journey H — Multiple memberships and switching

After accepting or being added to another workspace, the account retains all active memberships. The switcher displays current workspace, role, and available workspaces in server order. A switch is explicit and navigates to the selected workspace’s protected landing route.

- One membership: show the workspace name without a misleading switch action.
- Two or more: show **Switch workspace** and a list with current marker **Current workspace**.
- Loading: **“Switching workspace…”**; disable duplicate selection.
- Success: load the target workspace and server-authorized navigation/data.
- Suspended/no longer a member: **“You no longer have access to that workspace.”** Keep the current workspace active.
- Not found or server failure: **“We couldn’t switch workspaces. Your current workspace is unchanged.”** / **Try again**.
- Direct route to another tenant: **“This workspace resource isn’t available.”**
- Sign out remains separate and explicit: **Sign out**; loading **Signing out…**; failure **“We couldn’t securely sign you out. Your session remains active; try again.”**

## Audit-facing confirmation language

Every successful mutation announces what changed and who/what was affected without exposing secrets:

- **“Invitation sent to {masked email} as Member.”**
- **“Invitation revoked.”**
- **“{name} was added to the workspace as Admin.”**
- **“{name}’s role changed from Member to Admin.”**
- **“{name} was suspended.”** / **“{name} was restored.”** / **“{name} was removed from the workspace.”**
- **“Ownership transferred to {name}. You are now an Admin.”**
- **“{name} was added to {team}.”** / **“{name} was removed from {team}.”**

Use `role="status"` for success and `role="alert"` for errors. These messages are UI confirmation language, not a promise of a separate audit-log product. If an audit event viewer is not implemented, do not add a dead **View audit log** control.

## Shared state and accessibility criteria

- Every route has one visible H1, a meaningful document title, a landmark main, and a unique current navigation state.
- Loading preserves shell and page structure; mutation buttons announce busy text and prevent duplicate submission.
- Empty states explain what will appear and provide one real next action.
- Errors identify recovery and preserve safe form drafts; never expose tokens, passwords, or cross-tenant existence.
- Field errors are adjacent, programmatically linked, announced through a focused summary where multiple errors exist, and use `aria-invalid`.
- Destructive dialogs use an accessible visible title/body, `role="alertdialog"`, labelled actions, initial focus on Cancel, Escape cancellation, focus containment, and trigger focus restoration.
- Version conflicts always expose **Reload latest**. Where safe, **Keep my draft** preserves local non-secret values. Reload announces **Latest values loaded.** and focuses the changed section.
- Tables provide captions, headers, scoped columns, and a mobile equivalent. Long emails wrap; actions remain reachable at 320px and 200% zoom.
- Never rely on color alone for role, status, errors, conflicts, or destructive intent. Visible focus uses the accepted high-contrast ring.
- Mobile menu Escape/backdrop/route-close behavior is verified, and the document scroll width never exceeds the viewport.

## Develop acceptance checklist

- [ ] Workspace administration routes are distinct from `/settings` personal settings.
- [ ] Owner/Admin/Member permissions are server-enforced and reflected truthfully in controls and copy.
- [ ] Multi-invite supports validation, duplicate handling, roles, optional teams, seat limits, loading, full success, partial success, retry, and failure.
- [ ] Pending invitation filters expose Pending, Sent, Expired, and Revoked with resend/revoke/new-invite/re-invite actions.
- [ ] New and existing users can accept valid invitations; wrong-email, expired, revoked, consumed, and already-member states are safe and actionable.
- [ ] Existing authorized users can be added as members without cross-tenant directory disclosure.
- [ ] Role changes, suspend/restore/remove, Owner protection, and last-Owner messaging are implemented with accessible confirmations.
- [ ] Owner transfer requires recent auth, explicit successor confirmation, safe loading/error semantics, and post-transfer authorization refresh.
- [ ] Multiple memberships persist; the workspace switcher is explicit, server-authorized, and safe on failure.
- [ ] Team membership remains optional and has empty, duplicate, permission, conflict, loading, success, and destructive states.
- [ ] Permission, seat, conflict, expired, revoked, wrong-email, not-found, and network states preserve safe drafts and provide real recovery actions.
- [ ] Desktop and 320px flows pass keyboard, focus, Escape, live-region, zoom, no-overflow, and route-navigation checks.
- [ ] Local-server and Mailpit language remains truthful; no UI implies real Google, production email, or deployment.
- [ ] No dead controls, speculative audit-log links, or Feature 3 personal-settings controls appear in workspace administration.

