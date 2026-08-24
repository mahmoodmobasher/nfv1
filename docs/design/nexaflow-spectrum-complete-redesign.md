# NexaFlow Spectrum complete redesign

**Status:** Approved Graphics direction; implementation authority

**Date:** 2026-08-23

**Scope:** Complete product visual migration across public, authentication, onboarding, CRM, administration, settings, overlays, and responsive states

## Direction

NexaFlow will replace the existing evergreen, coral, and beige visual system with **Nexa Spectrum**: a cool neutral SaaS foundation, confident blue brand actions, restrained violet product accents, and distinct semantic status colours.

The system follows the structural strengths of mature token-led SaaS systems such as Atlassian: neutral colours dominate, saturated colours communicate emphasis or meaning, and components consume semantic tokens for every interaction state. It does not copy Atlassian colours or the supplied mock screens.

The supplied reference screens inform organization:

- Product-domain navigation groups.
- Clear page title, supporting description, and primary action.
- Filters separated from data regions.
- Dense tables with predictable alignment.
- Forms divided into meaningful sections.
- Consistent placement of page and form actions.
- Higher information density without decorative card stacking.

Do not copy their near-black canvas, pervasive purple, tiny ultra-wide typography, weak muted contrast, or repeated destructive row actions.

## Raw colour ramps

### Brand blue

| Step | Value |
|---|---|
| 50 | `#F0F5FF` |
| 100 | `#E2EBFF` |
| 200 | `#C7D8FF` |
| 300 | `#9CB9FF` |
| 400 | `#6C94F7` |
| 500 | `#4775E6` |
| 600 | `#315ED4` |
| 700 | `#294BAA` |
| 800 | `#263F86` |
| 900 | `#23386B` |
| 950 | `#162343` |

### Neutral

| Step | Value |
|---|---|
| 0 | `#FFFFFF` |
| 50 | `#F7F8FA` |
| 100 | `#F0F2F5` |
| 200 | `#E3E7EC` |
| 300 | `#CBD2DA` |
| 400 | `#9AA5B1` |
| 500 | `#697684` |
| 600 | `#4B5866` |
| 700 | `#35414D` |
| 800 | `#232E38` |
| 900 | `#17212B` |
| 950 | `#0B1118` |

## Semantic themes

| Token | Light | Dark |
|---|---|---|
| `canvas` | `#F7F8FA` | `#0B1118` |
| `surface-primary` | `#FFFFFF` | `#111A23` |
| `surface-secondary` | `#F0F2F5` | `#17232E` |
| `surface-raised` | `#FFFFFF` | `#1D2A36` |
| `surface-navigation` | `#FFFFFF` | `#0E171F` |
| `surface-overlay` | `#FFFFFF` | `#1D2A36` |
| `text-strong` | `#17212B` | `#F4F7FA` |
| `text-default` | `#35414D` | `#D6DDE4` |
| `text-muted` | `#697684` | `#A7B1BC` |
| `text-disabled` | `#9AA5B1` | `#697684` |
| `border-subtle` | `#E3E7EC` | `#293846` |
| `border-strong` | `#CBD2DA` | `#415262` |
| `action-primary` | `#315ED4` | `#6C94F7` |
| `action-primary-hover` | `#294BAA` | `#89AAFF` |
| `action-primary-pressed` | `#263F86` | `#A7C0FF` |
| `action-primary-text` | `#FFFFFF` | `#0B1118` |
| `selected-surface` | `#E2EBFF` | `#1C315B` |
| `selected-text` | `#294BAA` | `#A7C0FF` |
| `link` | `#294BAA` | `#9CB9FF` |
| `focus` | `#315ED4` | `#89AAFF` |
| `blanket` | `rgb(11 17 24 / 52%)` | `rgb(0 0 0 / 68%)` |

### Semantic feedback

| Role | Light text | Light surface | Dark text | Dark surface |
|---|---|---|---|---|
| Success | `#16745B` | `#E6F5EF` | `#62D0A8` | `#123A30` |
| Warning | `#8A5B00` | `#FFF2CC` | `#F4C45E` | `#3A2C0E` |
| Danger | `#B4232D` | `#FDECEE` | `#FF8B92` | `#431D23` |
| Information | `#245BC4` | `#EAF1FF` | `#91B2FF` | `#182B52` |

### Optional product accent

Violet is reserved for AI assistance, automation, or user-selected categorization. It must not replace brand or semantic roles.

| Token | Light | Dark |
|---|---|---|
| `accent-text` | `#6C4BD3` | `#B7A1FF` |
| `accent-surface` | `#F0EBFF` | `#2B214A` |
| `accent-border` | `#CFC1FF` | `#59468F` |

## Colour usage rules

- Neutral colours occupy approximately 85% of each screen.
- Brand blue occupies no more than approximately 10% and identifies primary action, links, selected navigation, and focus.
- Status and optional accent colours together occupy approximately 5% or less.
- Headings and routine labels use neutral text, never brand colour by default.
- Colour never communicates state without text, iconography, position, or another non-colour cue.
- Destructive actions use danger tokens and appear only when context requires them.
- Legacy evergreen, coral, beige, and route-specific literal palettes are prohibited after migration.

## Typography

Use Inter Variable with `system-ui` fallback.

| Role | Size / line height | Weight |
|---|---:|---:|
| Display | 40 / 48 | 600 |
| Page title | 32 / 40 | 600 |
| Section title | 24 / 32 | 600 |
| Card/panel title | 18 / 26 | 600 |
| Body | 15 / 23 | 400 |
| Body strong | 15 / 23 | 600 |
| Label | 13 / 18 | 500 |
| Metadata | 12 / 17 | 400 |

Rules:

- Use one visible H1 per route.
- Use sentence case throughout product UI.
- Remove routine uppercase eyebrow labels.
- Do not use weights 700–900 in application UI.
- Page titles, navigation, card titles, labels, and table headers must share this scale rather than route-specific values.

## Geometry and elevation

- Spacing scale: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.
- Control radius: 8px.
- Card/panel radius: 10px.
- Major shell/overlay radius: 12px.
- Pills are reserved for badges, statuses, and compact filters.
- Controls are at least 44px high.
- Routine surfaces use borders, not shadows.
- Raised overlays may use `0 8px 24px rgb(11 17 24 / 14%)` in Light and `0 12px 32px rgb(0 0 0 / 40%)` in Dark.
- No lift, scale, glow, or decorative gradient on routine hover.

## Application shell

Desktop:

- 224px collapsible navigation rail.
- 64px top bar containing breadcrumb/workspace context, search, global Create, theme/account controls.
- Navigation grouped by Workspace, Customers, Revenue, Delivery, and Administration.
- Current route uses selected surface, selected text, icon, and `aria-current="page"`.
- Page content uses a 1200px maximum reading/data width while allowing tables and boards to use available space.

Mobile:

- Single 56–64px header with brand/workspace context and 44px menu trigger.
- Modal drawer with scrim, focus entry, Escape dismissal, and focus return.
- Page actions stack below title or remain sticky only when obscuring no content.

## Page composition

Every operational route follows:

1. Breadcrumb or compact context when needed.
2. H1 and one supporting sentence.
3. One page-level primary action.
4. Filters/search in a dedicated toolbar.
5. One primary data or workflow region.
6. Pagination, results count, and truthful empty/loading/error states.

Avoid wrapping every section in a card. Cards represent bounded records, decisions, metrics, or overlays—not general spacing containers.

## Component specifications

### Buttons

- Primary: blue fill, theme-specific foreground, content-sized on desktop.
- Secondary: primary surface, strong border, strong text.
- Subtle/ghost: transparent until hover; only for low-emphasis actions.
- Danger: neutral surface with danger text/border by default; bold danger fill only for final destructive confirmation.
- Disabled state uses dedicated surface/text tokens rather than opacity alone.
- Busy state preserves width and includes visible progress text.

### Inputs and forms

- Labels remain visible above controls.
- Required status is communicated in text or a form-level statement, not by asterisk alone.
- Help text precedes errors in `aria-describedby` ordering.
- Invalid fields use danger border plus linked text; focus remains blue unless error focus must be additionally signalled.
- Forms group fields under descriptive section headings.
- Desktop forms use two columns only for fields with equal conceptual weight; mobile always becomes one column.
- Primary form action aligns to the end of the form; Cancel remains secondary.

### Tables and lists

- Use a quiet single surface, header separation, and horizontal row dividers.
- Do not place every action in a high-emphasis button.
- One safe default action may be visible; secondary actions live in a labelled menu.
- Destructive actions require confirmation and must not dominate every row.
- Names and key values are stronger than metadata.
- At narrow widths, convert to structured record cards or a deliberately scrollable table with sticky identifying column—never clip columns silently.

### Cards and dashboards

- KPI cards use neutral surfaces and one strong value.
- Colour is reserved for status/meaning rather than making every KPI a different decorative colour.
- Dashboard sections answer a decision: performance, pipeline, attention, or recent activity.
- Every chart includes labels, units, accessible summary, and non-colour differentiation.

### Navigation

- Default, hover, active, visited, focus, unavailable, and collapsed states require semantic tokens.
- Navigation groups remain scannable without excessive uppercase tracking.
- Icons support labels; they never replace essential navigation text on desktop.

### Feedback and overlays

- Inline alerts preserve user input and explain recovery.
- Toasts announce completion only; errors requiring action stay inline.
- Dialogs trap focus, label title/description, support Escape where safe, and restore focus.
- Loading states use skeletons only when layout is known; use textual status for mutations.

## Truthful environments and states

- Local/UAT banners remain visible and explicit while their conditions are true.
- Production must never display local fixture or disconnected-provider language.
- OIDC disabled, unavailable, cancelled, protocol failure, and link conflict remain distinct from password failure.
- Billing-disconnected plan selection explicitly says no payment is collected.
- Invitation preview and server-backed invitation acceptance must never share misleading persistence language.
- Loading, empty, error, partial success, stale data, access changed, disabled, and success states require intentional visuals and recovery paths.

## Theme continuity

- Light, Dark, and System are semantic themes, not route-specific CSS overrides.
- Resolve the authoritative preference before first paint.
- Anonymous routes resolve System from media preference; authenticated routes use server preference.
- Browser storage may cache but never override server authority.
- Switching theme previews immediately, persists only after successful save, and rolls back on failure.
- All shells, public pages, authentication, onboarding, overlays, native controls, and browser `color-scheme` update without reload or flash.

## Accessibility gates

- WCAG AA: 4.5:1 for normal text; 3:1 for large text and essential UI boundaries.
- Focus indicator: at least 2px, 2px offset, and 3:1 against adjacent surfaces.
- Complete keyboard navigation with logical order and no traps outside modal patterns.
- Minimum 44 by 44 CSS-pixel targets.
- No horizontal page overflow at 320px.
- Content remains usable at 200% zoom and reflows at 400%/320 CSS pixels where required.
- Reduced motion and forced-colours modes remain supported.
- Status never depends on colour alone.
- Tables, charts, icons, dialogs, drawers, validation summaries, and busy states require accessible names and announcements.

## Migration plan

### Phase 1 — Foundation

- Introduce Nexa Spectrum raw and semantic tokens.
- Apply typography, focus, elevation, radius, and disabled-state foundations.
- Add contrast and token-boundary tests.
- Preserve pre-paint theme resolution.

### Phase 2 — Shell

- Replace CRM and administration navigation/top bars.
- Implement responsive drawer and global page-header pattern.
- Migrate workspace and account controls.

### Phase 3 — Operational CRM

- Dashboard.
- Companies and contacts.
- Leads and Pipeline.
- Tables, filters, boards, forms, dialogs, activity, and truthful data states.

### Phase 4 — Authentication and onboarding

- Plan selection.
- Registration, verification, login, OIDC states, recovery/reset.
- Workspace creation/selection/ready.
- Invitation acceptance.

### Phase 5 — Administration and settings

- Personal settings.
- Workspace administration, people, roles, teams, invitations, and ownership.

### Phase 6 — Legacy removal

- Remove old colour literals, route-specific dark overrides, beige/coral/evergreen surfaces, obsolete shadows/radii, and `!important` typography patches.
- Retain paired Light/Dark visual baselines for every representative route.

## Stage gates

Each phase requires:

- Paired settled Light/Dark desktop baselines.
- Paired 320px mobile baselines for responsive surfaces.
- System-mode behavior and no-flash evidence.
- Keyboard/focus and 200% zoom evidence.
- Automated contrast assertions for representative component states.
- Product, Graphics, Architecture, and implementation-owner acceptance before broadening migration.

## Review mockup

Interactive representative dashboard, table, and form direction:

`/Users/moemahmood/.codex/visualizations/2026/08/23/01a02f5f-f509-7273-a26d-99dfc4f77328/nexaflow-spectrum-redesign.html`

This path is a review reference and must not be imported by production code.
