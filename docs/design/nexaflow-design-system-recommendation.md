# NexaFlow design-system recommendation

**Status:** Product-review proposal; no application implementation authorized

**Direction:** Operational calm

**Graphics date:** 2026-08-23

## Product direction

NexaFlow should feel capable, precise, and reassuring rather than ornamental. Keep the existing warm, human quality and coral action color, but move from oversized rounded cards and heavy all-caps labels toward stronger typography, clearer grouping, and compact operational surfaces.

The supplied modern dark SaaS references contribute lessons in contrast, density, selected states, and disciplined card structure. They are visual input only and are not a palette, component library, or layout template. NexaFlow should retain its own evergreen-and-coral identity and truthful Workspace-aware product model.

## Review mockup

The representative interactive dashboard mockup demonstrates the proposed application shell, navigation, typography, cards, KPIs, table treatment, statuses, and live Light/Dark/System switching:

- `/Users/moemahmood/.codex/visualizations/2026/08/23/01a02f5f-f509-7273-a26d-99dfc4f77328/nexaflow-design-system-direction.html`
- Editable companion source: `/Users/moemahmood/.codex/visualizations/2026/08/23/01a02f5f-f509-7273-a26d-99dfc4f77328/nexaflow-design-system-spec.md`

These paths are review references, not application dependencies. Production implementation must not import them.

## Current-system audit

- Typography overuses weights 700–900, small uppercase labels, and large jumps between body and headings. Nearly everything asks for attention, so hierarchy flattens.
- Coral, evergreen, indigo/purple, blue, and status colors coexist without a clear semantic model.
- Radii range from 8px to 24px and pill shapes are used for ordinary buttons. The result feels soft and onboarding-oriented rather than operational.
- Shadows, borders, beige fills, dark hero panels, and preview banners compete as simultaneous surface systems.
- The layout is roomy but not consistently structured: some controls are 44px, others 48–50px, while cards can be disproportionately padded.
- Dark theme is currently expressed through route-specific overrides. A mature system requires semantic tokens resolved before paint and consumed across every route and overlay.

## Typography and hierarchy

Recommended family: **Inter Variable**, with `system-ui` as the fallback. It provides strong screen clarity, variable weights, broad language support, and predictable metrics. A display face may be considered later for marketing only, not application chrome.

| Role | Size / line height | Weight | Use |
|---|---:|---:|---|
| Display | 40 / 48 | 600 | Marketing and rare empty-state hero only |
| Page title | 32 / 40 | 650 | One visible H1 per route |
| Section title | 24 / 32 | 600 | Major page sections |
| Card title | 18 / 26 | 600 | Card and panel headings |
| Body | 15 / 23 | 400 | Default product copy |
| Body strong | 15 / 23 | 600 | Key labels and values |
| Label | 13 / 18 | 550 | Form and table labels |
| Small | 12 / 17 | 450 | Metadata; never essential actions |

Use sentence case. Reserve uppercase with letter spacing for rare category labels at 12px or larger. Avoid weights above 700 in product UI.

Hierarchy rules:

1. Each route has one visible H1 and a concise supporting sentence when needed.
2. Major sections use H2; contained panels use H3.
3. Page actions align with the route title; local actions remain inside their section.
4. Values and outcomes are visually stronger than labels, while help text stays clearly readable.
5. Eyebrow labels are optional context, not a required heading above every card.

## Semantic color tokens

Application components must consume semantic names rather than literal colors. Component CSS must not branch into independent light and dark palettes.

### Light

| Token | Value | Purpose |
|---|---|---|
| `canvas` | `#F6F8F7` | Application background |
| `surface-1` | `#FFFFFF` | Primary panels and cards |
| `surface-2` | `#F0F4F2` | Secondary grouping and hover |
| `surface-inverse` | `#13201C` | Evergreen navigation/inverse surface |
| `text-strong` | `#18221F` | Headings and primary values |
| `text-default` | `#34433E` | Body and control text |
| `text-muted` | `#62716B` | Metadata and supporting copy |
| `border-subtle` | `#D8DEDB` | Routine surface separation |
| `border-strong` | `#AAB6B1` | Controls and emphasized boundaries |
| `brand` | `#E75C35` | Primary action and branded emphasis |
| `brand-hover` | `#CB4A27` | Hover/pressed primary action |
| `brand-soft` | `#FCECE7` | Low-emphasis brand tint |
| `focus` | `#315EDE` | Keyboard focus indicator |
| `success` / `success-soft` | `#157A5B` / `#EAF7F1` | Confirmed positive status |
| `warning` / `warning-soft` | `#936014` / `#FFF5DF` | Caution and attention |
| `danger` / `danger-soft` | `#B43B32` / `#FDEDEC` | Destructive/error state |
| `info` / `info-soft` | `#315E9F` / `#EDF4FC` | Neutral information |

### Dark

| Token | Value | Purpose |
|---|---|---|
| `canvas` | `#0B1210` | Application background |
| `surface-1` | `#121D19` | Primary panels and cards |
| `surface-2` | `#17241F` | Secondary grouping and hover |
| `surface-raised` | `#1D2B26` | Menus, popovers, raised panels |
| `text-strong` | `#F2F7F5` | Headings and primary values |
| `text-default` | `#D1DDD8` | Body and control text |
| `text-muted` | `#9FB0AA` | Metadata and supporting copy |
| `border-subtle` | `#263630` | Routine surface separation |
| `border-strong` | `#41564E` | Controls and emphasized boundaries |
| `brand` | `#F07955` | Primary action and branded emphasis |
| `brand-hover` | `#FF8E6B` | Hover/pressed primary action |
| `brand-soft` | `#3D221B` | Low-emphasis brand tint |
| `focus` | `#7FA0FF` | Keyboard focus indicator |
| `success` / `success-soft` | `#58C9A3` / `#143326` | Confirmed positive status |
| `warning` / `warning-soft` | `#E5B45C` / `#382A12` | Caution and attention |
| `danger` / `danger-soft` | `#FF8D83` / `#3C1D1B` | Destructive/error state |
| `info` / `info-soft` | `#8CB5F2` / `#172A43` | Neutral information |

Muted text must meet WCAG 2.2 AA contrast against its actual surface whenever it communicates essential content. Status color always ships with text and, where useful, an icon.

## Spacing, radii, elevation, and borders

- Base spacing unit: 4px. Core scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Page gutters: 32px desktop, 24px tablet, 16px mobile.
- Panel padding: 20px default, 16px dense, 24px prominent. Avoid 38–48px padding inside routine operational cards.
- Control height: 44px default. A 36px compact control is allowed only in desktop table toolbars where the mobile equivalent remains at least 44px.
- Radii: 8px compact controls, 10px buttons and inputs, 14px cards, and 18–20px only for major contained experiences.
- Pills are reserved for statuses, segmented controls, and compact filters.
- Borders carry routine surface separation. Cards do not require shadows.
- `raised` elevation: `0 1px 2px rgba(18,29,25,.08)`.
- `overlay` elevation: `0 12px 36px rgba(18,29,25,.18)`.
- `modal` elevation: `0 24px 70px rgba(18,29,25,.24)`.
- Dark mode uses stronger black alpha plus a visible border so elevation never depends on shadow alone.

## Representative component specifications

### Buttons

- Primary: coral fill, white text, one primary action per region.
- Secondary: surface background with a strong border.
- Tertiary: quiet/text treatment for low-emphasis actions.
- Destructive: danger border or fill based on consequence and confirmation context.
- Use sentence case, weight 600, and a 44px minimum target.
- Loading retains action context, such as **Saving profile…**, and prevents duplicate submission.
- Disabled buttons retain readable labels and expose adjacent explanation when the missing capability is consequential.

### Inputs and form fields

- Persistent label, 44px minimum height, 10px radius, and visible default border.
- Help and error copy connect with `aria-describedby`; invalid fields use `aria-invalid`.
- Multi-field submission failures expose a focused summary with links to affected controls.
- Focus uses a 2px focus stroke with a 2px offset rather than shadow alone.
- Secret inputs provide accessible show/hide controls without changing tab order unexpectedly.

### Cards and panels

- Each card has one purpose, a short title, and at most one aligned header action.
- Border-first surface with 14px radius and 16–24px padding.
- KPI cards contain a label, value, and one descriptor. Decorative icon blocks are omitted unless the icon communicates meaning.
- Operational cards do not lift or scale on hover; a border/surface change is sufficient.
- Preview/demo cards remain visibly separate from live authority and cannot masquerade as interactive product features.

### Tables and lists

- Rows are 44–48px tall with left-aligned text and aligned numeric values.
- Use real headers, captions, and scoped columns.
- Hover, focus-within, selected, busy, and stale states remain distinct without color-only meaning.
- At 320px, complex tables use an explicit internal scroll region with a visible cue and no page-level overflow.
- Use a card/list mobile equivalent when row actions cannot remain understandable inside a table.

### Navigation and shell

- A dark evergreen rail remains a NexaFlow signature in both themes.
- Navigation rows are at least 44px, with one clear selected state and restrained section labels.
- Unsupported future destinations are absent rather than shown as disabled navigation.
- Tablet/mobile uses the accepted drawer pattern: changing accessible name, `aria-expanded`, Escape/backdrop/route close, focus containment where needed, and trigger focus return.
- Personal settings remains visually and semantically distinct from Workspace administration.

### Status, alerts, and dialogs

- Status badges use semantic text plus an optional icon; do not rely on color alone.
- Polite live regions announce loading, success, and meaningful result updates.
- Actionable errors and conflicts use alert semantics and a concrete recovery action.
- Destructive dialogs retain the accepted alert-dialog pattern: visible consequence, Cancel-first focus, Escape, focus containment, and trigger restoration.
- Empty, loading, no-match, denial, not-found, conflict, and failure states never imply unconfirmed success.

## Interaction states

- Hover changes border or surface by one step; avoid lift/scale animation for operational cards.
- Pressed state darkens the fill and removes one elevation step.
- Focus ring is always visible: 2px focus color plus 2px offset, with a forced-colors fallback.
- Disabled controls retain at least 3:1 non-text contrast and do not use opacity below approximately 45%.
- Validation uses `aria-invalid`, linked error text, focused summaries, and `role="alert"` for actionable failures.
- Motion duration is 120–180ms for color/opacity and 180–240ms for overlays.
- `prefers-reduced-motion` removes non-essential movement; no meaning depends on animation.

## Live Light/Dark/System behavior

Theme switching is an application foundation, not a Personal settings visual effect.

1. Persist the user selection as `light | dark | system` in the global account preference service.
2. Resolve the effective theme in a pre-paint bootstrap before application styles render: an explicit stored value wins; `system` reads `prefers-color-scheme`.
3. Stamp `data-theme="light|dark"` and the matching `color-scheme` on `<html>` before first paint.
4. Server rendering should use the authenticated preference when available; the pre-paint bootstrap safely reconciles a mismatch before content becomes visible.
5. Components consume semantic tokens only. Remove route-specific literal light/dark overrides during migration.
6. After a confirmed preference save, apply the new effective theme immediately in the current document without navigation or reload.
7. Subscribe to OS theme changes only while the stored selection is `system`.
8. Apply the same theme to public and authenticated shells, dialogs, portals, menus, charts, loading routes, error boundaries, and preview surfaces.
9. Test first paint, refresh, direct routes, authentication transitions, Workspace switching, and browser Back for wrong-theme flash.

## Accessibility requirements

- Meet WCAG 2.2 AA contrast for body text, muted essential text, controls, focus indicators, statuses, disabled states, charts, and selected navigation in both themes.
- Preserve the accepted 44px interaction targets and visible high-contrast focus.
- Support keyboard-only operation, 320px width, 200% browser zoom, forced-colors mode, and reduced motion without page-level horizontal overflow.
- Maintain one visible H1 per route and correct semantic heading order.
- Never rely on color alone for roles, status, error, denial, conflict, selection, or destructive intent.
- Loading/success uses appropriately scoped polite status regions; actionable errors use alerts.
- Preserve safe drafts through retryable failures and conflicts; never preserve passwords, tokens, session identifiers, or sensitive audit payloads.
- Keep truthful server-backed, preview, permission, entitlement, stale, and denial boundaries intact during visual migration.

## Phased rollout

### Stage 1 — foundation

Create semantic token layers, typography primitives, spacing/radius/elevation scales, and the no-flash theme bootstrap. Add visual-regression fixtures for Light/Dark/System and automated contrast checks. Do not redesign routes in this stage.

### Stage 2 — shared shell and controls

Migrate authenticated navigation, mobile drawer, buttons, inputs, alerts, dialogs, badges, and tables. Preserve current behavior, copy, authority, focus, 44px, 320px, and 200% contracts.

### Stage 3 — representative routes

Migrate Personal settings, CRM home, Leads, and Workspace settings. Together these cover forms, dashboards, cards, tables, status, live/preview separation, and destructive flows. Run Product and Graphics acceptance before wider rollout.

### Stage 4 — onboarding and remaining verticals

Migrate onboarding, plan selection, invitations, teams, pipeline, and lead detail. Remove legacy literal styling only after behavioral and accessibility parity checks.

### Stage 5 — consolidation

Delete obsolete component styles and duplicate tokens, publish Storybook or equivalent component documentation, and add automated theme, contrast, focus, responsive, and visual-regression checks to release gates.

## Acceptance criteria

- Light/Dark/System changes immediately, persists across refresh and Workspace switching, follows OS changes in System mode, and produces no wrong-theme flash.
- Every supported route consumes the same semantic tokens; no light-only card, menu, portal, dialog, or loading/error surface remains in dark mode.
- The interface presents one clear H1, predictable section hierarchy, and no routine use of weights 800–900.
- Controls meet 44px where required, keyboard/focus behavior remains intact, and 320px/200% zoom has no page-level overflow.
- WCAG AA contrast passes for text, controls, focus, statuses, disabled states, charts, and selected navigation in both themes.
- Truthful live/preview, loading, empty, denial, conflict, success, and error states remain intact.

## Implementation boundary

This document authorizes design-system review and staged planning only. It does not authorize application-code changes, token rollout, route redesign, production deployment, or replacement of accepted security and Workspace behavior. Product must explicitly authorize implementation stages.
