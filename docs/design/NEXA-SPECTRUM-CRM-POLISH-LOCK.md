# Nexa Spectrum CRM polish design lock

Status: **LOCKED — user approved**  
Lock date: 2026-08-27  
Authority: Nexa Spectrum visual and interaction system

This record freezes the approved CRM visual direction for implementation planning and exact-SHA review. It does not change application behavior, authorization, data contracts, UAT state, or deployment authority.

## Reference concept

The approved interactive review concept is stored outside the application checkout at:

`/Users/moemahmood/.codex/visualizations/2026/08/27/01a04430-2548-7172-97b3-7c23df5d0829/nexaflow-crm-polish.html`

The concept is evidence for hierarchy, composition, density, and responsive intent. Literal colours and values in the standalone artifact are not implementation tokens.

## Locked shell and navigation

- Preserve the current capability-gated navigation information architecture, routes, labels, and order:
  - Home: Home.
  - Contact Management: Companies, Contacts.
  - Sales: Leads, Lead pipeline, Deals, Deal pipeline.
  - Review: Identity review.
  - Settings: Personal settings, Workspace settings, People and roles, Invitations, Teams.
- Desktop top navigation retains contextual location, capability-derived Add lead, capability-derived Lead search, Workspace control, and Appearance.
- Personal settings remains in left navigation and is not duplicated in the desktop top bar.
- Sign out is a labelled action inside the Workspace menu and is not a separate desktop top-bar icon.
- Mobile navigation retains equivalent accessible destinations and capability gating.

## Locked visual direction

- Keep NexaFlow recognizable through Nexa Spectrum blue, plain-language state semantics, and server-authority boundaries.
- Use a cleaner canvas, stronger page hierarchy, medium CRM density, restrained layered surfaces, and subtle depth.
- Depth and colour are supplemental. They never replace headings, labels, borders, focus, or state text.
- Do not add decorative dashboards, fabricated metrics, unsupported actions, provider behavior, or client-derived authority.

## Five shared page archetypes

### 1. Record List

Applies to Companies, Contacts, Leads, Deals, and compatible review/administration lists.

- Shared page header, truthful search/filter toolbar, result summary, RecordTable/RecordRow, responsive RecordCard, status, compact actions, pagination, and semantic states.
- Companies, Contacts, and Leads use subtle alternating row surfaces.
- Alternation has shared hover and focus-within behavior and disappears safely in forced colours.
- Contacts use relationship-directory composition: identity, disclosure-safe relationship context, status, recency, and compact actions.
- Action omission remains truthful when capability is absent. Missing actions are not replaced with fabricated or misleading disabled controls.

### 2. Pipeline/Board

Applies to Lead and Deal boards.

- Preserve exact server-defined stage order and counts.
- Keep cards neutral so record content and state remain readable.
- Lead stage roles are New amber, Contacted blue, Qualified green, and Proposal violet.
- Stage identity uses label, order, count, marker, and restrained surface/border tone. Colour is not the sole signal.
- Narrow layouts use a stage list/accordion composition rather than squeezing all columns into the viewport.
- Do not introduce drag-and-drop without a separately accepted authoritative, keyboard, gate, and recovery contract.

### 3. Record Detail

Applies to Company, Contact, Lead, and Deal details.

- Use one readable content flow with shared RecordHeader, IdentitySummary, FactsGrid, RelationshipSection/Row, WorkflowSummaryGrid, and action hierarchy.
- Layout decisions respond to usable content width after application navigation, not browser viewport width alone.
- Facts and workflow summaries auto-fit only when each item retains adequate width; otherwise they stack.
- Contact detail orders overview then full-width Company affiliation. Edit affiliation is colocated with the current relationship row; there is no permanent empty management side panel.
- Lead detail orders overview, Qualification/Conversion summaries, then full-width ACTIVITY-01A.
- ACTIVITY-01A retains record-only Email semantics, occurred-versus-recorded presentation, stable newest-first chronology, cursor Load older, idempotency, and all recovery states.

### 4. Record Editor/Form

Applies to CRM create/edit flows and compatible Settings/administration forms.

- Use one readable-width form workbench; do not add a secondary vertical form rail.
- An overflow-safe horizontal section navigator may be used when it materially helps a long form.
- Use numbered section markers for orientation, not to imply a staged wizard or completion state.
- Share FormSection, FormGrid, Field, FieldMessage, ValidationSummary, ProtectedChoiceState, and FormActions.
- Required and optional state is identified in text.
- Save is the primary routine action; Cancel is neutral. Destructive lifecycle actions remain outside routine editing.
- At narrow widths and 200% zoom, fields become one column and no page-level horizontal scrolling is introduced.
- Sticky actions are allowed only when they do not obscure content or recovery controls at 200% zoom.

### 5. Workflow/Review

Applies to Identity review, qualification, conversion, stage/lifecycle changes, archive/restore, destructive confirmation, and other bounded workflows.

- Use bounded, named, keyboard-operable dialogs or pages. Do not use native confirm.
- Validation uses a linked summary with focused recovery.
- Pending, success, replay, conflict, stale, error, and authority-loss states remain visible in place; outcomes are not toast-only.
- Authority loss clears protected content, selections, drafts where required, results, and privileged actions into a generic fail-closed state.

## Locked section colour taxonomy

The taxonomy is global and intentionally small:

| Section role | Visual family |
| --- | --- |
| Overview/profile | Blue |
| Relationship/affiliation | Teal |
| Qualification | Green |
| Conversion | Violet |
| Activity/history | Amber |
| Responsibility/visibility | Indigo |

Implement each role through global semantic surface, accent, border, and foreground tokens plus a shared Section/Panel tone API.

- Status colours remain separate. A green Qualification section identifies the domain; a `Qualified` badge identifies current state.
- Do not infer section tone from displayed labels in feature CSS.
- Do not create unique colours for arbitrary one-off cards.
- Dark mode uses independently tuned low-luminance tokens rather than inverted light values.
- Forced-colour mode removes decorative tints and preserves structure through system colours, borders, headings, and labels.

## Global component and token boundary

Global semantic tokens own:

- Canvas, navigation, raised/inset surfaces, borders, text hierarchy, interactive and focus roles.
- Success, warning, danger, information, replay, conflict, stale, and authority-loss feedback roles.
- Typography, spacing, radii, elevation, control sizing, motion, and responsive/container rules.
- Section and pipeline stage roles.

Reusable components own, where appropriate:

- AppShell, navigation, Workspace menu, breadcrumbs, and ProductPageHeader.
- Buttons, links, icon controls, fields, search, checkboxes, segmented controls, menus, and dialogs.
- Status badges, feedback, validation summaries, empty/loading/stale/authority-loss states, and retry actions.
- Record tables/rows/cards, pipeline columns/cards, details, facts, relationships, form workbenches/sections/actions, timelines, and pagination.

Feature code supplies domain composition, labels, fields, authorized values, capability-derived actions, and domain validation copy. Feature-local CSS is limited to genuinely domain-specific composition.

The following are revision findings:

- Raw or local palettes.
- Duplicated status, feedback, validation, or focus styling.
- Parallel buttons, fields, cards, tables, dialogs, or loading/empty/error components.
- Repeated typography, spacing, radius, elevation, or control values outside the shared scale.
- Feature-local viewport breakpoints that compensate for a shared container-layout defect.

## Truth and functionality that remain unchanged

- Server-authorized disclosure and fail-closed behavior.
- Workspace scope, masked/full/unavailable contact truth, and capability-gated actions.
- Stage, lifecycle, identity review, qualification, and conversion remain distinct concerns.
- Server-defined stage order, pagination, chronology, and retained history remain authoritative.
- No new filters, saved views, dashboards, metrics, scores, bulk actions, drag-and-drop, provider actions, or fabricated data are implied by this lock.

## Exact-SHA Graphics acceptance gate

Every implementation candidate must provide:

- Immutable SHA, exact parent/merge-base, clean worktree, and scope manifest.
- Token/component inventory demonstrating reuse across migrated pages.
- Light, Dark, and System evidence for every archetype.
- Actual sidebar/content-width evidence, 320px, and 200% zoom without page-level horizontal scrolling.
- Measured 44-by-44 minimum targets and complete keyboard/focus paths.
- Forced-colour and reduced-motion evidence.
- Loading, empty/not configured, success, validation, pending, replay, conflict, stale, pagination, error/retry, and authority-loss evidence where applicable.
- Long-content and capability permutations.
- Passing focused and broader automated suites.
- Confirmation that no unsupported functionality or client authority was introduced.

Graphics issues exactly one visible disposition: `ACCEPT`, `ACCEPT WITH CONDITIONS`, or `REVISE`, with explicit proceed/hold. Product retains integration, UAT, deployment, and release authority.
