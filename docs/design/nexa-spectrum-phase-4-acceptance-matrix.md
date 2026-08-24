# Nexa Spectrum Phase 4 acceptance matrix

**Authority:** `nexa-spectrum-phase-4-auth-onboarding-proposal.md`

**Gate:** Graphics returns ACCEPT only after every required paired baseline and automated behavior below passes on one immutable candidate.

## Deterministic visual matrix

All captures use identical content per Light/Dark pair, disabled animation, stable clock/data, no development portal, and actual shared primitives.

| ID | Surface/state | Desktop 1280×900 | Tablet 768×1024 | Mobile 390×844 | Mobile 320×640 | 200% proxy 640×720 |
|---|---|---|---|---|---|---|
| P4-01 | Plan selection: selected plan, cadence, seat/Owner and billing-disconnected copy | L/D | L/D | — | L/D | L/D |
| P4-02 | Registration: default/filled plan context | L/D | L/D | — | L/D | L/D |
| P4-03 | Registration: validation summary + field errors | L/D | — | L/D | L/D | L/D focused |
| P4-04 | Registration: busy + network/provider error | L/D | — | — | L/D | — |
| P4-05 | Verification: waiting/checking/verified | L/D each | — | L/D each | L/D representative | — |
| P4-06 | Verification: invalid/resent/delivery failure | L/D each | — | — | L/D representative | — |
| P4-07 | Login: default/invalid credentials/session expired | L/D each | L/D default | — | L/D each | L/D focused |
| P4-08 | OIDC: disabled/cancelled/failure/link conflict/local fixture | L/D each | — | — | L/D representative | — |
| P4-09 | Recovery request: default/invalid/busy/generic success/service failure | L/D representative | — | — | L/D representative | L/D |
| P4-10 | Reset: valid form/validation/invalid link/success | L/D each | — | — | L/D each | L/D focused |
| P4-11 | Workspace create: plan/Owner/seat truth, default + busy | L/D | L/D | — | L/D | L/D |
| P4-12 | Workspace create: entitlement already used + recoverable failure | L/D | — | — | L/D | — |
| P4-13 | Workspace ready: Owner, total seats, next actions | L/D | L/D | — | L/D | L/D |
| P4-14 | Workspace chooser: multiple legitimate Memberships/current marker | L/D | L/D | L/D | L/D | L/D focused |
| P4-15 | Workspace chooser: switching/stale/failure/reload | L/D representative | — | — | L/D representative | — |
| P4-16 | Invitation preview: explicit non-persistence + Admin/Member only | L/D | L/D | — | L/D | L/D |
| P4-17 | Invitation preview: validation/partial/network/success disclaimers | L/D representative | — | — | L/D representative | — |
| P4-18 | Invitation acceptance: pre-accept/busy/success | L/D each | L/D pre-accept | — | L/D each | L/D focused |
| P4-19 | Invitation acceptance: seat exhausted/invalid-expired-revoked | L/D each | — | — | L/D representative | — |
| P4-20 | System resolution | System→Light + System→Dark on plan, login and authenticated create | System pair on login | — | System pair on login | — |
| P4-21 | Forced colours | Plan selection, registration invalid, login focus, invitation acceptance | — | — | Representative | — |
| P4-22 | Website component-state sheet | L/D | — | — | L/D reflow | — |

Stable naming example: `spectrum-p4-login-invalid-desktop-dark.png`, `spectrum-p4-workspace-create-mobile-light.png`.

## Journey assertions

### Plan and subscription truth

- Every self-service plan says one company Workspace.
- Included seats explicitly include Owner; arithmetic examples are correct.
- Enterprise multi-Workspace points to Contact Sales only.
- Billing-disconnected state says no payment is collected and does not expose fake checkout.
- Selected cadence/plan is semantic, keyboard operable and preserved through registration/create.

### Identity and provider truth

- Registration success requires verification before initial Workspace creation.
- Waiting/checking/verified/invalid/resent verification states are distinct and recoverable.
- Password invalid, session expired, OIDC disabled, cancelled, failure and link conflict never collapse into one message.
- Recovery request is account-enumeration safe.
- Successful reset revokes existing sessions and does not imply automatic sign-in.
- Local fixture, UAT provider-neutral and production copy are configuration-driven and mutually exclusive.

### Tenancy and authorization truth

- Verified registrant becomes sole initial Owner, never “Admin.”
- Workspace create is single-use under self-service entitlement; refresh/back/direct access cannot provision another.
- Ready summary uses Owner and total seat count including Owner.
- Invitation role options are Admin/Member only in preview and server-backed flows.
- Chooser appears only for multiple active Memberships and contains no create/add Workspace control.
- A User with another legitimate company Membership can still choose it.
- Seat exhausted, stale Membership, revoked/expired invitation and access-changed states preserve server authority.

## Forms and state assertions

- Error summary receives focus after invalid submit and links to every invalid field.
- Help then error ordering is reflected in `aria-describedby`.
- Required, invalid, disabled, read-only, autofill, busy and success states render correctly in Light/Dark.
- Password visibility controls expose Show/Hide names, retain focus, and meet 44px.
- Duplicate submission is prevented for registration, login, reset, Workspace create, switch and invitation accept.
- Safe drafts survive network/service failure; password/token values are never rendered into summaries or logs.
- Loading retains the surrounding shell and textual status; no blank page.

## Theme/no-flash assertions

- First HTML paint has correct preference/resolved attributes and `color-scheme`.
- No legacy palette flashes between plan → register → verify → login → create → ready.
- Anonymous System follows OS. Authenticated create/ready uses authoritative saved preference when available.
- Explicit Light/Dark ignores later OS changes. System changes resolved theme without changing saved `system`.
- Error/loading boundaries and native controls match the active theme.

## Keyboard and assistive technology

- Tab order follows header → progress/context → task form → secondary recovery → footer.
- Skip link reaches main task content where repeated header/progress content warrants it.
- Plan and cadence single-choice semantics announce selected state.
- Focus never becomes hidden under the header or off-screen at 200%.
- Alerts do not duplicate announcements; busy progress uses polite status unless an actionable error occurs.
- Password requirement updates do not announce the full list on every keypress.
- Workspace chooser current/Role information and invitation Role/seat consequences are programmatically associated.
- Dialogs, if used, contain focus, support safe Escape, and restore focus.

## Responsive assertions

- Test widths: 1280, 1024, 768, 600, 390, 360 and 320.
- No document horizontal overflow at 320; long emails/company names wrap.
- Two-column shell becomes one column before either panel compresses.
- Actions stack and retain 44px targets; no clipped show/hide or cadence controls.
- At 400%/320 CSS pixels, reading and form order is one-dimensional.
- 200% proxy shows focused error summary, field, plan summary and primary recovery without obstruction.

## Contrast, forced colours and motion

- Normal text ≥4.5:1; large text and essential boundaries ≥3:1.
- Focus ≥3:1 against adjacent surfaces.
- Assert default/hover/pressed/focus/disabled primary and secondary actions, links, fields, cadence/plan selection, all alert roles, progress, badges and invitation states in both themes.
- Forced colours preserves current plan/cadence, invalid fields, focus, provider availability, progress and invitation consequences.
- Reduced motion removes nonessential transition/scroll animation and retains all state changes immediately.

## Static centralization gate

- Every migrated Phase 4 root carries `.experience-website` through the shared shell.
- Phase 4 route/components contain no raw colour, theme attribute selector, token declaration, font family, raw radius or raw elevation.
- Only the canonical foundation defines colour values; `.experience-website` consumes semantics.
- No `!important` cascade patches are added to overcome legacy onboarding CSS.
- Snapshot/state-sheet selectors do not ship as route behavior unless they are actual reusable primitives.

## Graphics rejection criteria

Return **REJECT** for any:

- Copy implying multiple self-service Workspaces, Owner-as-Admin, seats excluding Owner, or Owner invitation.
- Fake billing, production OIDC/email, invitation persistence or Workspace entitlement claim.
- Route-level palette/Dark override or legacy coral/beige/evergreen flash.
- Missing paired required baseline or non-clean full browser run.
- Unreadable Light/Dark/System state, clipped 320/200% content, missing focus, or non-semantic selection.
- Error/busy/success state that loses safe input, permits duplicate mutation, or has no recovery.

Minor spacing refinements may be P3 only when they do not affect truth, hierarchy, central consistency, responsiveness or accessibility.
