# NexaFlow design and product UX handover

**Date:** 2026-08-21
**Audience:** Product, Design, Develop, Architecture
**Status:** durable transition handover; Workspace Foundation accepted
**Application code changed:** no

## 1. Product foundation direction

NexaFlow’s CRM Workspace is the platform foundation, not an isolated CRM feature. Every future vertical—Leads, Companies, Contacts, Deals, Projects, Tasks, Communications, Automation, AI, Reporting, Finance, and Client Portal—must inherit the same Workspace security contract.

For every workspace-scoped resource, UX and implementation must express this sequence:

1. The resource belongs to a Workspace.
2. The authenticated user has an active Membership.
3. The Active Workspace is validated and held in trusted server/session context.
4. RBAC determines permitted actions.
5. Ownership, Team, and Visibility determine record access.
6. Significant mutations and security-relevant denials are audited.
7. Package Entitlement determines availability.

Do not create a separate tenant, ownership, access, audit, or entitlement model inside a downstream vertical. Foundation expansion is closed after acceptance and should reopen only when a real vertical exposes a concrete gap.

## 2. Current light visual direction

The accepted product direction is a calm, light, editorial SaaS interface based on the onboarding specification in [`docs/design/onboarding-screen-spec.md`](../design/onboarding-screen-spec.md).

Core visual language:

- Warm off-white page canvas: approximately `#f5f3ee` / `#f7f4ee`.
- Dark evergreen ink for primary text and shell surfaces: approximately `#17201d`.
- Muted sage-gray supporting text: approximately `#53605b` and `#68736f`.
- Warm neutral borders/surfaces: approximately `#ded9d0` and `#eeebe4`.
- Coral-orange primary action: approximately `#ff6b35`; darker text links use approximately `#b8421c` or `#9f3612`.
- White cards with generous radius, soft borders, restrained shadow, and generous spacing.
- Typography is compact, high-contrast, and operational; avoid decorative gradients or dense visual effects.

Interaction tokens:

- Minimum interactive target: 44×44px.
- Visible high-contrast focus ring; never rely on color alone.
- Primary action is filled; secondary action is bordered/quiet; destructive action is explicit and visually distinct.
- Use one visible H1 per route and clear section headings.
- Preserve reduced-motion and forced-colors behavior from the shared stylesheet.

The later dashboard mock explored a more expressive alternative palette. It is a visual proposal only, not an approved application theme. The current product direction remains the accepted light system unless Product explicitly approves a token change.

## 3. UX status by area

Legend: **Implemented** means present in the product; **Accepted** means Graphics/UX gate passed; **Proposed** means design direction only; **Deferred** means intentionally outside the current milestone.

| Area | Status | Notes |
|---|---|---|
| Onboarding/auth | Implemented, accepted | Server-backed identity, verification, recovery, protected resume, truthful local boundary. See [`docs/design/slice-3-production-state-review.md`](../design/slice-3-production-state-review.md). |
| Workspace creation/ready | Implemented, accepted | Server-derived plan/cadence, Workspace, Owner assignment, trial, refresh/direct-route protection. |
| CRM shell/dashboard | Implemented, accepted for bounded local slice | Leads, pipeline, ownership/team visibility, activities, live KPIs, empty/error/filter states, explicit preview cards. See [`docs/design/crm-home-dashboard-review.md`](../design/crm-home-dashboard-review.md). |
| People & Roles | Implemented, accepted | Server-derived role controls, Owner protection, Admin ceiling, lifecycle controls, stale authority recovery. |
| Invitations | Implemented, accepted | Multi-entry, role/team assignment, partial retry, pending/expired/revoked states, accept flow, local Mailpit boundary. |
| Workspace switcher | Implemented, accepted | Explicit multi-Workspace chooser, current marker, server-owned Active Workspace, stale option reconciliation, two-tab context refresh. |
| Audit | Implemented server boundary, accepted | Canonical taxonomy, allowlisted metadata/before-after, hashed correlation, transactional success/replay/denial evidence. No audit-history screen is required. |
| Entitlements | Implemented foundation attachment | Seat/package checks are server-owned and reflected in invitation/lifecycle denial states. |
| Personal settings | Deferred | Feature 3; keep separate from Workspace administration. |
| Work Item 6 | Complete, accepted | Integrated release validation passed unit/routes 41/41, PostgreSQL 111/111, Playwright 25/25, migrations, lint, type/build, packaging, and final UAT smoke. |

## 4. Feature 2 Graphics acceptance ledger

### WI1 — Membership lifecycle

**Accepted.** Suspend, restore, remove, Owner protection, confirmation dialogs, stale recovery, success/error states, and 320px behavior are implemented and covered. Removed memberships remain historical and are restored through invitation flow rather than silent reactivation.

### WI2 — Authority-aware role controls

**Accepted.** Invitation and People role options are server-derived. Owner is excluded from generic controls; Admin can assign only permitted roles; Member has no management controls. Member→Admin confirmation, Cancel-first focus, Escape, focus restoration, stale-authority alert, Reload latest, and 320px/200% behavior passed.

Review: [`docs/design/feature-2-work-item-2-ux-review.md`](../design/feature-2-work-item-2-ux-review.md).

### WI3 — Stale-data handling

**Accepted.** No optimistic false state. Successful mutations re-read authoritative People/capability data. Two-tab conflicts, retry, stale suspended/removed targets, alerts, Reload latest, focus, keyboard behavior, 320px, and 200% behavior passed.

Review: [`docs/design/feature-2-work-item-3-ux-review.md`](../design/feature-2-work-item-3-ux-review.md).

### WI4 — Workspace selection

**Accepted.** One Workspace remains frictionless. Multiple Workspaces use an explicit accessible chooser showing name, Role, and current marker only. Failed switching preserves the current context; stale memberships are removed; successful A→B switching changes tenant/data; two tabs reconcile on their next request. Desktop, keyboard, 44px controls, 320px, and no-overflow behavior passed.

Review: [`docs/design/feature-2-work-item-4-ux-review.md`](../design/feature-2-work-item-4-ux-review.md).

### WI5 — Audit completion

**Accepted within scope.** The audit-write completeness boundary is complete. There is no audit-history UI because Product explicitly does not require one. Do not add a dead **View audit log** control or imply that a viewer exists.

Review: [`docs/design/feature-2-work-item-5-ux-review.md`](../design/feature-2-work-item-5-ux-review.md).

**Feature 2 Graphics gate:** complete. No bounded WI1–WI6 blocker remains. The integrated release gate completed WI6, and the Workspace Foundation milestone and deployed rc.2 UAT candidate are accepted.

### Final release and UAT status

Graphics accepted the final local Feature 1 + Feature 2 release gate and the deployed UAT candidate. The deployed rc.2 identity is application commit `c1125ba7c7b5bc075b89003eb0ecc9840665b5e`, tag `v0.2.0-rc.2`, with deployment evidence recorded under commit `d005d52772ad49268b87dce1c01004a8859825f1`.

The deployed real-browser smoke passed password onboarding and verification, login/recovery boundaries, Workspace creation/ready and server-selected context, People & Roles, invitations and private Mailpit delivery, switcher, tenant-safe denial, CRM entry/dashboard and persistent Lead behavior, refresh/resume, logout, Back/direct-route protection, and login after logout. The rc.1 production title-hydration loop was fixed in rc.2 and validated.

The UAT boundary remains explicit: the Google/OIDC path is a disabled/local fixture, Mailpit is private local guidance, production billing/providers are not connected, and unsupported downstream modules remain clearly labelled demo/preview content. This is not evidence of production provider or deployment certification.

See [`docs/release/feature-1-2-ux-release-gate.md`](../release/feature-1-2-ux-release-gate.md) and [`docs/release/feature-1-2-ux-deployment-review.md`](../release/feature-1-2-ux-deployment-review.md).

## 5. Accessible and responsive patterns to preserve

- Authenticated shells have clear Workspace context, current Role, route-specific title, navigation landmarks, and a real Sign out action.
- Mobile shells use a 44px menu trigger with changing accessible name, `aria-expanded`, `aria-controls`, Escape close, backdrop close, route close, and focus return.
- At 320px, cards stack, actions become full-width where needed, long emails wrap, and tables use an explicit internal scroll region without page-level horizontal overflow.
- At 200% zoom, controls, labels, role/action context, and focus remain reachable.
- Dialogs use visible title/body, `role="alertdialog"`, `aria-modal`, Cancel-first focus, Escape cancellation, focus containment, and trigger restoration.
- Loading and success use polite status regions. Actionable errors and conflicts use alert semantics and concrete recovery actions.
- Field and server errors remain adjacent or linked with `aria-describedby`/`aria-invalid`; error summaries focus after submit where relevant.
- Never use color alone for Role, status, denial, conflict, or destructive intent.
- Preserve safe non-secret drafts during failures/conflicts; never preserve or display passwords, tokens, session identifiers, or sensitive audit payloads.

## 6. Dashboard and mock-data expectations

The CRM home dashboard establishes the information hierarchy: Workspace-aware welcome/start action, live CRM snapshot, pipeline health, needs attention, ownership/team workload, recent activity, and lower-priority preview modules.

Live regions may use server-authorized Leads, pipeline stages/status, ownership/team visibility, and activities. Unimplemented Deals, Conversion, Projects, Delivery, and Reporting must remain non-interactive preview cards with explicit copy such as:

> **Demo preview** — Sample values only. This feature is not connected to Workspace data.

Mock values must never enter PostgreSQL, aggregates, audits, outbox, exports, authorization, or entitlement calculations. Do not present mock revenue, conversion, delivery, project, or reporting values as real product facts.

The dashboard mock at [`/Users/moemahmood/.codex/visualizations/2026/08/20/01a020c5-1171-74b0-90dc-0912730992aa/nexaflow-redesign-mock.html`](</Users/moemahmood/.codex/visualizations/2026/08/20/01a020c5-1171-74b0-90dc-0912730992aa/nexaflow-redesign-mock.html>) is exploratory and not application code.

## 7. Route and screen inventory

### Public/onboarding

- `/` — product landing
- `/select-plan` — plan/cadence selection
- `/register` — account registration
- `/verify-email` — email verification
- `/login` — sign in and local identity boundary
- `/forgot-password` — recovery request
- `/reset-password` — password reset

### Workspace foundation

- `/workspace/create` — authenticated Workspace creation
- `/workspace/ready` — server-derived Workspace ready summary
- `/workspace/switch` — explicit multi-Workspace chooser
- `/workspace/settings` — Workspace administration summary
- `/workspace/settings/people` — People, Roles, lifecycle
- `/workspace/settings/invite` — invite creation
- `/workspace/settings/invitations` — invitation states/actions
- `/workspace/settings/teams` — optional Teams and membership
- `/workspace/settings/transfer-ownership` — recent-auth Owner transfer
- `/workspace/invitations/accept` — token-scoped invitation acceptance
- `/settings` — reserved Feature 3 personal settings boundary

### CRM vertical

- `/crm` — Leads list/search
- `/crm/home` — authenticated CRM home/dashboard
- `/crm/pipeline` — pipeline view
- `/crm/leads/new` — create lead
- `/crm/leads/[leadId]` — lead detail/edit/activity

## 8. Known UX debt and boundaries

- No audit-history viewer exists or is required. Future audit UI must be separately scoped.
- Workspace switcher is foundation-complete for current requirements; do not add speculative switching modes.
- Personal settings, profile, notification preferences, password/session management UI, Companies & Contacts, Deals, Projects, Communications, Automation, AI, Reporting, Finance, and Client Portal remain future vertical work.
- Local Google/OIDC fixture, Mailpit, and local server language must remain explicit; never imply production providers.
- The earlier four stale Playwright expectations were reconciled during release preparation. The complete browser suite now passes **25/25**, including the accessible Team confirmation/conflict journey, 320px checks, and 200% zoom. This removes test-baseline debt but does not replace consolidated Graphics/Product acceptance.
- The current visual direction has more than one exploratory palette in mock work. Product implementation should continue using the accepted light tokens until a formal visual refresh is approved.

## 9. Next design deliverables

### Immediate

1. Preserve the accepted WI1–WI5 foundation contract in all review templates and vertical specs.
2. Do not reopen or expand the accepted Foundation specification speculatively; reopen it only when a real downstream vertical exposes a concrete gap.
3. When reviewing any new vertical, verify Workspace context, Membership/RBAC, Active Workspace, Ownership, Team/Visibility, Audit, and Entitlement inheritance before visual polish.

### Subsequent verticals

Prepare separate implementation-ready specs in this order unless Product changes priority:

1. Profile / Personal Settings — explicitly outside Workspace administration.
2. Companies & Contacts — Workspace-scoped, visibility-aware records with inherited ownership/team/RBAC/audit/entitlement.
3. Leads — continue the accepted CRM core contract and extend only through concrete vertical needs.
4. Deals / Pipeline — Workspace-scoped, owner-required, optional Team, visibility-enforced, RBAC-enforced, audited, entitled.
5. Projects / Delivery — same inherited contract; preserve customer context without creating a second tenant model.
6. Communications — Workspace-owned/shared resources, Team access, RBAC, visibility, audit, entitlement.
7. Later Automation, AI, Reporting, Finance, and Client Portal — each must state how invocation/user permissions, Workspace ownership, Teams, visibility, audit, and entitlement apply.

## 10. Review checklist for every future vertical

- [ ] Workspace context is visible and server-authoritative.
- [ ] Active Membership and RBAC determine available actions.
- [ ] Ownership, Team, and Visibility are explicit in information hierarchy and copy.
- [ ] Active Workspace cannot be overridden by URL, body, browser storage, or client role strings.
- [ ] Entitlement states have truthful available/blocked/loading/error copy.
- [ ] Significant success and security-relevant denial behavior is audited server-side without leaking sensitive data.
- [ ] Conflict/stale states preserve confirmed state and expose Reload latest with focus recovery.
- [ ] Loading, empty, no-match, permission, not-found, denial, and failure states have real recovery paths.
- [ ] Desktop, keyboard, 320px, 200% zoom, focus, live regions, reduced motion, and no-overflow behavior are reviewed.
- [ ] Preview/mock data is visibly separated and cannot become business authority.
