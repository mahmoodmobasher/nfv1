# Design system Stage 1/2 visual acceptance

**Verdict:** REJECT

**Reviewed implementation:** `codex/design-system-stage12` at `1e2e610`

**Approved direction:** `Operational calm` proposal at `23d23f4`

**Graphics review date:** 2026-08-23

## Review scope

This is a read-only Graphics acceptance review of the Stage 1/2 implementation and its two committed visual baselines:

- `tests/e2e/local-identity.spec.ts-snapshots/design-system-light-personal-settings-darwin.png`
- `tests/e2e/local-identity.spec.ts-snapshots/design-system-dark-admin-mobile-darwin.png`

The review covers typography and hierarchy, evergreen/coral identity, semantic Light/Dark/System parity, shared component consistency, the 320px mobile shell, keyboard focus visibility, WCAG AA contrast, and overall modern SaaS quality. No application code was changed as part of this review.

## What is working

- The evergreen canvas and coral accent retain a recognizable NexaFlow identity without copying the visual reference.
- Semantic surface, text, border, status, focus, radius, spacing, and elevation tokens provide a credible shared foundation.
- Personal settings has clearer page, section, and field hierarchy than the previous UI.
- The dark Workspace administration baseline is coherent, readable, and free of visible horizontal overflow at 320px.
- The mobile navigation trigger is verified at a minimum 44 by 44 CSS pixels.
- The implementation includes pre-paint Light/Dark/System resolution, persisted preference reconciliation, reduced-motion handling, and forced-colors focus treatment.
- Focus tokens have sufficient contrast in their representative contexts: light focus `#315EDE` against white is 5.55:1, and dark focus `#7FA0FF` against evergreen `#17201D` is 6.64:1.

## Material findings

### P0 — Primary-button text fails WCAG AA in both themes

The shared primary-button rule uses white text over the semantic coral fill. Measured contrast is:

- Light: `#FFFFFF` on `#E75C35` = **3.51:1**.
- Dark: `#FFFFFF` on `#F07955` = **2.77:1**.
- Required for the implemented normal-size button text: **4.5:1**.

This is visible in both baselines: the light Personal settings actions and the dark mobile **Manage people** action use the failing combination. The dark token set already defines inverse text as evergreen `#13201C`; that foreground over dark-theme coral is 6.05:1, but the component hard-codes white and bypasses it.

**Required remediation:** Define accessible theme-specific primary foreground/fill pairs using semantic tokens. Verify default, hover, pressed, focus, and disabled presentations. Do not rely on opacity alone for a disabled treatment if it causes essential text to become unreadable.

**Acceptance evidence:** Automated contrast assertions for every primary-button state in Light and Dark, plus paired screenshots showing the corrected component.

### P1 — Legacy typography overrides defeat the approved hierarchy

The Stage 1/2 foundation assigns eyebrow and field-label weight `550`, but the earlier legacy `.eyebrow` declaration retains `font-weight: 900 !important`. The approved value therefore cannot win in the cascade. Both baselines show the result as unusually heavy coral uppercase labels, including **Account**, **Profile**, and **Workspace administration**.

The Operational calm specification reserves uppercase labels for rare category context and avoids product-interface weights above 700. The current result keeps the old attention-heavy hierarchy in a prominent shared primitive.

**Required remediation:** Remove, narrow, or explicitly supersede the legacy `!important` rule. Shared authenticated surfaces should resolve labels to the approved 13/18 weight-550 treatment; optional eyebrow labels should not routinely precede every heading.

**Acceptance evidence:** Computed-style assertions for representative labels and refreshed baselines demonstrating a calmer page/section hierarchy.

### P1 — The baselines cannot demonstrate semantic theme parity

The two baselines show different routes at different viewports: light Personal settings on desktop and dark Workspace administration on mobile. They demonstrate two attractive individual states, but they do not allow a direct comparison of the same component or shell across Light and Dark.

The browser test behaviorally confirms that the resolved theme persists across Personal settings, CRM, and Workspace administration. That is valuable functional evidence, but it does not catch route-specific literal colors, mismatched elevation, status treatment, or component regressions visually.

**Required remediation:** Add paired Light/Dark baselines for the same representative Personal settings, CRM, and Workspace administration surfaces. Include at least one paired 320px mobile shell state.

**Acceptance evidence:** Stable paired baselines with matching content and viewport dimensions, reviewed for surface, text, border, status, brand, and overlay parity.

### P1 — Focus verification is too weak for Graphics acceptance

The current test programmatically focuses one Workspace link and asserts only that `outlineColor` is not transparent. It does not demonstrate keyboard traversal, indicator thickness/offset, visibility on every surface, mobile-menu focus management, or a return of focus when the menu closes.

**Required remediation:** Exercise the interface with keyboard input. Cover navigation, primary and secondary buttons, inputs, selects, password visibility controls, the mobile-menu trigger, menu items, and menu dismissal. Verify no focused control is obscured at 200% zoom.

**Acceptance evidence:** Focused-state screenshots or computed-style assertions for representative controls in both themes, together with keyboard-order and mobile-menu focus tests.

## Baseline-specific observations

### Light Personal settings

- Page, section, and field grouping is clear, with controlled card radii and restrained elevation.
- All card actions remain full-width at desktop size. This makes three unrelated actions equally dominant and leaves the page feeling more like a stacked onboarding form than a compact operational settings surface.
- The oversized action treatment is not an independent rejection blocker, but should be corrected while resolving the shared primary component: desktop actions should normally size to content or use a deliberate action row; full-width actions remain appropriate at narrow mobile widths.
- The captured development indicator is not product UI and should be excluded from durable visual-regression baselines.

### Dark Workspace administration at 320px

- The shell collapses cleanly, content remains within the viewport, and the navigation trigger has an adequate target.
- Surface separation and evergreen depth are coherent without excessive shadow.
- Coral is used sparingly for category context and the primary action, maintaining the intended identity.
- Secondary administrative links are visually understated. During the paired-baseline pass, confirm that links are consistently identifiable without depending on color alone and retain a visible focus treatment.
- The captured development indicator should likewise be removed from the baseline environment.

## Next-stage recommendation

Do not begin broad Stage 3/4 route migration until the shared-foundation blockers above are resolved. The remediation should stay within Stage 1/2 and occur in this order:

1. Correct primary-action contrast and add state-level contrast coverage.
2. Resolve the legacy typography cascade and confirm the intended computed weights.
3. Establish paired Light/Dark baselines for Personal settings, CRM, and Workspace administration, including 320px mobile evidence.
4. Strengthen keyboard/focus and 200% zoom verification, then request Graphics re-review.

After those checks pass, proceed to Stage 3 with one representative high-density CRM workflow first. Validate tables, filters, status chips, dialogs, empty/loading/error states, and responsive transformation before migrating the remaining routes. Stage 4 should then remove superseded literal styles and legacy `!important` rules, with visual-regression coverage guarding the cleanup.

## Re-review gate

Graphics can return **ACCEPT — no material Graphics blockers** when all four material findings have implementation evidence, paired baselines are free of development-only overlays, and focused WCAG AA checks pass in both Light and Dark.
