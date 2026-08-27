# Current NexaFlow UX direction

Status date: 2026-08-27

Nexa Spectrum is the visual and interaction authority. Donor screens may provide layout and workflow evidence, but donor palette, client authority, mock data, toast-only errors, and inaccessible controls are not authoritative.

The CRM visual-polish direction is locked in [Nexa Spectrum CRM polish design lock](./NEXA-SPECTRUM-CRM-POLISH-LOCK.md). New and migrated CRM surfaces must use that shared-system direction rather than introduce feature-local styling.

## Current patterns

- Grouped, current-authority left navigation with one active destination. Current group labels, item labels, order, routes, and capability gating remain unchanged.
- Desktop top navigation retains contextual location, authorized Add lead, authorized Lead search, Workspace control, and Appearance. Personal settings remains in left navigation. Sign out is a labelled Workspace-menu action.
- Semantic page header with one H1, helper text, and capability-derived action hierarchy.
- Light/Dark/System semantic tokens, visible forced-colour boundaries, and reduced-motion-safe transitions.
- 44px interactive targets, linked validation summaries, focused recovery, live pending/result states, and no color-only meaning.
- Content-responsive layouts use the width available after application navigation, not viewport width alone. Every surface has a 320px/200% no-horizontal-scroll fallback.
- Record editors use one readable workbench, an overflow-safe horizontal section navigator when useful, numbered section headings, shared field grids, and one predictable action region. A second vertical form rail is not used.
- Bounded dialogs and workflows are centered in the usable viewport with appropriate initial focus, Escape where safe, containment, and invoker focus restoration. Native confirm and toast-only outcomes are not used.
- Authority loss clears protected data, drafts, options, results, and request identity into a focused generic safe state.

## Shared page archetypes

CRM and compatible administration pages use five shared Nexa Spectrum archetypes:

1. Record List.
2. Pipeline/Board.
3. Record Detail.
4. Record Editor/Form.
5. Workflow/Review.

The archetypes own hierarchy, surfaces, typography, spacing, controls, focus, feedback, responsive/container behavior, forced-colour behavior, and reduced motion. Features provide domain composition, labels, fields, current server-authorized data, capability-derived actions, and domain validation copy.

## Current CRM surfaces

- Company, Contact, Lead, and Deal create/edit use the shared Record Editor workbench. Domain sections vary, but fields, section navigation, validation, protected-choice states, and actions remain shared.
- Social media conditionally requires one governed platform.
- Company creation may be completed inline from Lead create when the server grants capability; Company and Lead remain separate commits.
- Companies, Contacts, Leads, and Deals use a shared Record List pattern with truthful search/filter scope, semantic alternating rows, responsive identity-first cards, and capability-controlled actions.
- Contacts compose that list as a relationship directory: identity first, disclosure-safe affiliation context, status, recency, and compact actions.
- Lead and Deal boards use shared StageColumn and neutral RecordCard primitives. Lead stages use the locked New/Contacted/Qualified/Proposal tones while labels, counts, and server order remain authoritative. Stage movement remains explicit and keyboard-accessible; drag-and-drop is not introduced by this design lock.
- Company, Contact, Lead, and Deal details use a single readable Record Detail flow. Facts and workflow summaries auto-fit by available content width; permanent main/aside splits are not retained at constrained shell widths.
- Contact detail presents overview followed by a full-width affiliation section with the affiliation action colocated with the relationship row.
- Lead detail orders overview, Qualification/Conversion summaries, and full-width ACTIVITY-01A. Activity retains truthful record-only Email semantics and stable occurred-versus-recorded chronology.

## Section colour taxonomy

Section colour is restrained, semantic, and supplemental:

- Overview/profile: blue.
- Relationship/affiliation: teal.
- Qualification: green.
- Conversion: violet.
- Activity/history: amber.
- Responsibility/visibility: indigo.

Each role uses a low-chroma surface with an accent edge or marker. Status tokens remain independent from section roles. Forced-colour mode removes decorative tinting, and no meaning depends on colour alone.

## Design-system maturity boundary

- Reusable colours, feedback states, typography, spacing, radii/elevation, control sizing, focus, responsive/container behavior, forced-colour behavior, and reduced motion belong to global semantic tokens.
- App shell, page headers, fields, buttons, statuses, feedback, lists, rows/cards, stage columns, record details, form sections, dialogs, timelines, and action groups belong to reusable components where appropriate.
- Feature-local CSS is limited to genuinely domain-specific composition.
- Raw/local palettes, duplicated status/error/focus styles, parallel controls, and feature-local viewport breakpoints that compensate for shared-layout defects are revision findings.
- Every migrated page still receives page-specific visual QA for long content, capability combinations, semantic states, actual navigation widths, 320px, 200%, Light/Dark/System, forced colours, reduced motion, keyboard/focus, and measured 44px targets.

## Truthful-state rules

- Labels are presentation; selected-option identity is stable ID plus authority token.
- Time alone never creates a conflict.
- Changed or unavailable selections reconcile only the affected field and preserve safe drafts.
- Retry actions receive focus when a blocking check fails.
- Archived-feed errors precede combined-empty claims.
- Unavailable Company/Contact relationships remain generic and disclose no hidden identifiers or labels.
