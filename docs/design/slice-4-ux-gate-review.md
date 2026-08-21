# Slice 4 tenant administration Graphics/UX gate review

Status: **REJECT — bounded UI corrections required**  
Review date: 2026-08-20  
Design basis: `docs/design/slice-4-tenant-admin-screen-spec.md` and the approved light system in `docs/design/onboarding-screen-spec.md`  
Engineering basis: `docs/engineering/slice-4-checkpoint.md`  
Boundary: local PostgreSQL, Mailpit, fixture OIDC, and browser evidence only. No real Google, production email/domain, deployment, Lightsail, UAT, or Caddy access occurred.

## Review summary

The Slice 4 server foundation and primary admin journeys are implemented. The checkpoint reports migration success, 61/61 PostgreSQL integration tests, 11/11 Playwright tests, a passing production build, and local Mailpit invitation delivery. The light visual direction, admin shell, server-backed banner, route map, mobile shell, invitation entry, role editing, teams, acceptance, and transfer surfaces are present.

Graphics/UX acceptance is held on the bounded interaction and accessibility issues below. These do not reopen the accepted architecture or require Slice 5 work.

## Accepted areas

- Workspace settings is server-derived and exposes people, invitations, teams, seat data, and Owner transfer entry.
- Admin navigation includes CRM overview, People and roles, Invitations, Teams, Workspace settings, and Sign out.
- Local-server boundary language is now truthful: settings/invitation/team surfaces state that state is saved and authorized by the local server; Mailpit is secondary guidance.
- Invitation creation supports multi-entry by Enter/comma/semicolon/space/paste, per-row roles and teams, seat remaining copy, server mutation, grouped partial results, and per-row retry.
- Invitation records support server-backed list, resend, revoke, expiry/status data, expected versions, and safe API errors.
- Invitation acceptance is server-validated, idempotent, seat-aware, and uses a safe unavailable state for invalid/revoked/expired/wrong-workspace cases.
- People/role editing uses persisted role state and expected membership versions; Owner protection and Admin ceilings are represented.
- Teams support server-backed creation, duplicate handling, membership assignment/removal, archive/delete intent, and stale-write reporting.
- Owner transfer has server-backed recent password or local fixture-OIDC confirmation, successor selection, session rotation, and refreshed authorization evidence.
- Mobile admin navigation exists with a 44px trigger, light panel/backdrop, route links, Escape close, trigger focus return, and no page-level overflow evidence at 320px.
- Loading and status messages are generally retained in-page with polite status regions; local Google and Mailpit remain explicitly non-production/local.

## Release-blocking findings

### P1 — Destructive confirmations do not meet the specified accessible dialog contract

Invitation revoke and team membership/team deletion use `window.confirm`, and Owner transfer uses a native `<dialog>` without the specified `role="alertdialog"` semantics or an explicit accessible confirmation contract. The design handoff requires a visible title/body, safe initial focus, focus containment, Escape behavior, and focus restoration.

Required corrections:

- Replace browser confirm prompts with the shared destructive confirmation dialog pattern.
- Revoke copy: title **“Revoke this invitation?”**; body **“The invitation link will stop working. The person can’t use it to join this workspace.”**; actions **Keep invitation** and **Revoke invitation**.
- Team removal copy: title **“Remove {name} from {team}?”**; body **“They will remain a member of the workspace.”**; actions **Cancel** and **Remove from team**.
- Team deletion copy: title **“Delete {team}?”**; body **“People will remain in the workspace, but team-based routing and visibility rules may change.”**; actions **Cancel** and **Delete team**.
- Owner transfer copy must include the selected successor name and use `role="alertdialog"`; initial focus must be on **Cancel**, Escape must cancel, and focus must return to **Continue to confirmation**.
- Announce the resulting success/error state and preserve focus on the relevant page heading or status region.

### P1 — Invitation list does not provide the specified state navigation and recovery affordances

The invitation list renders all records in one list but does not expose Pending, Sent, Expired, and Revoked tabs/filters or the specified **Send new invitation** action for expired records. The client currently only renders actions for pending rows. Resend/revoke feedback exists, but stale conflict guidance does not expose a concrete **Reload latest** action.

Required corrections:

- Add accessible status tabs or filters for Pending, Sent, Expired, and Revoked.
- Add **Send new invitation** for expired rows and **Invite again** for revoked rows where permitted.
- Add a visible **Reload latest** action for expected-version conflicts; preserve any safe draft context.
- Keep the empty state and grouped partial-delivery recovery clear at 320px.

### P1 — People screen search and role/table semantics are incomplete

The People screen renders a Search people input but does not filter the displayed server results. It also uses `role="table"`/`role="row"` without explicit column headers/cell semantics and does not expose the specified status/role filters. This makes larger tenant lists difficult to navigate and weakens screen-reader comprehension.

Required corrections:

- Make Search people filter by display name or email, with a labelled result count/status.
- Add All/Active/Invited/Suspended and All/Owner/Admin/Member filters, or explicitly defer them in the product scope before acceptance.
- Use native table semantics with `<caption>`, `<thead>`, `<th scope>`, and `<td>`, or implement an equivalent accessible card model on mobile.
- Preserve Owner protection text and role descriptions in the accessible name/description of each editable control.

### P1 — Team membership conflict does not provide the specified reload path

Team membership save reports **“This changed while you were editing. Review the latest values before saving.”** but provides no **Reload latest** action and does not clearly move focus to the changed team/member context. The design spec requires an actionable conflict recovery path and preserved safe selections.

Required corrections:

- Add **Reload latest** as the primary conflict recovery action and keep the local selection draft available where safe.
- Announce **“Latest values loaded.”** after reload and focus the changed team section heading.
- Ensure the member removal confirmation and resulting state are announced without relying on color.

## Accessibility/navigation follow-up checks

- Re-run desktop and 320px keyboard journeys after the dialog and list changes: menu open/close, route selection, invite Add/send/retry, resend/revoke, team membership removal/save/conflict, transfer recent-auth/confirm, and logout.
- Verify every dialog has a visible heading, labelled destructive action, safe initial focus, Escape behavior, focus trap, and trigger restoration.
- Verify every status/error uses the intended live-region severity and that duplicate action submission is disabled while mutations are pending.
- Verify long email addresses, row actions, and invitation/team controls remain usable at 320px and 200% zoom without page-level horizontal overflow.
- Verify direct routes and tenant-safe not-found/permission states do not disclose cross-workspace existence.

## Non-blocking follow-up

- The invitation page uses a local Mailpit note appropriately; keep it secondary and never imply production email delivery.
- The local Google fixture remains clearly separate from production identity.
- Lead/CRM business persistence remains outside Slice 4 and should retain its explicit preview boundary.

## Gate decision

**REJECT for Graphics/UX acceptance pending the three P1 correction groups above.**

The server and integration evidence is strong and the light visual system is aligned. Acceptance can proceed after the accessible confirmation pattern, invitation state navigation/recovery, and People/team conflict affordances are verified in the rendered desktop and 320px flows.

