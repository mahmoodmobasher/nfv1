# Design system Stage 1/2 Graphics re-review

**Verdict:** REJECT

**Reviewed candidate:** `codex/design-system-stage12` at `14e33f5`

**Previous Graphics gate:** `53fbab4`

**Approved direction:** Operational calm proposal at `23d23f4`

**Review date:** 2026-08-23

## Scope

This read-only re-review covers the prior Graphics blockers: primary-action contrast across states and themes, the legacy typography cascade, paired Light/Dark baselines at matching routes and viewports including the 320px shell, keyboard focus and mobile-drawer behavior, 200% reflow evidence, and overall Operational calm quality. No application code was changed.

## Remediations accepted

### Primary actions

The primary component now consumes a semantic `--nf-primary-foreground` instead of hard-coded white. The tested combinations meet WCAG AA for normal text:

- Light default: `#13201C` on `#E75C35` = 4.78:1.
- Dark default: `#13201C` on `#F07955` = 6.05:1.
- Hover, pressed, and disabled foreground/fill pairs have automated assertions at or above 4.5:1.

The new dark foreground remains visually consistent with the evergreen/coral identity. Desktop Personal settings actions are content-sized, while the narrow-screen rule intentionally returns them to full width.

### Typography cascade

The shared authenticated eyebrow rule now explicitly supersedes the legacy `900 !important` declaration and resolves to the approved 13/18, weight-550 treatment. The paired Personal settings and Workspace baselines show a calmer hierarchy with less typographic shouting.

### Personal settings and mobile drawer parity

The matching Light/Dark Personal settings baselines show consistent geometry, spacing, card hierarchy, controls, feedback, and semantic surfaces. The matching Light/Dark 320px drawer baselines show:

- No visible horizontal overflow.
- A readable modal scrim and distinct drawer surface.
- Consistent navigation order and 44px-capable controls.
- A visible 2px focus indicator in the light baseline.
- Focus entry to the first navigation item and focus restoration to the trigger on Escape in the browser test.

The 640 CSS-pixel viewport check is acceptable as a 200% zoom proxy for a 1280-pixel reference display on Personal settings, and it asserts horizontal containment of the focused display-name control.

## Remaining material blockers

### P0 — Dark desktop Workspace navigation is effectively unreadable

In `design-system-workspace-admin-dark-darwin.png`, the sidebar destinations from **CRM overview** through **Personal settings** are rendered as near-black text on a dark evergreen surface. Only **Sign out** remains clearly visible.

The legacy selector `.admin-shell>aside nav a` sets `#17201D` and has greater specificity than the later semantic `.admin-shell nav a` rule. Against the dark sidebar surface `#121D19`, the resulting contrast is approximately **1.04:1**, far below the required **4.5:1** for navigation text. The matching light baseline does not have the defect, and the mobile drawer uses different selectors, so the existing behavioral and mobile checks do not catch it.

**Required remediation:** Ensure desktop navigation default, hover, active, visited, focus, and disabled/unavailable states consume semantic theme tokens with WCAG AA contrast. Resolve the cascade rather than adding another route-specific literal.

**Acceptance evidence:** A refreshed dark Workspace administration baseline with readable navigation, plus computed-style and contrast assertions for representative desktop sidebar states in both themes.

### P1 — The CRM Light/Dark baselines do not capture the CRM interface

Both `design-system-crm-light-darwin.png` and `design-system-crm-dark-darwin.png` contain only the centered **Loading NexaFlow…** state. The dark capture is especially ambiguous because the loading text is not visibly distinguishable in the committed image. These files cannot establish parity for the CRM shell, navigation, dashboard hierarchy, controls, tables/cards, or focus states.

The test takes each screenshot immediately after `page.goto("/crm")` without waiting for a CRM landmark or route-specific settled state. A passing pixel comparison therefore protects the loading fallback rather than the implemented CRM experience.

**Required remediation:** Wait for an authoritative loaded CRM landmark and capture the same stable CRM route, seeded content, and viewport in Light and Dark. Treat loading as a separate truthful-state baseline if it needs regression coverage.

**Acceptance evidence:** Paired settled CRM baselines demonstrating semantic surfaces, readable navigation, evergreen/coral hierarchy, primary and secondary actions, cards/tables, and representative focus treatment.

### P1 — Focus evidence remains narrower than the previous gate

The automated re-review evidence confirms the first tabbable Workspace element has a 2px outline with 2px offset, and it verifies drawer entry/return behavior. It does not yet verify representative inputs, selects, primary/secondary buttons, password visibility controls, or focus visibility in both themes. A global CSS rule reduces implementation risk, but the dark desktop cascade defect demonstrates why selector-level assumptions are insufficient.

**Required remediation:** Add keyboard-generated focus checks for at least one navigation link, primary button, secondary button, input, select, and password visibility control in Light and Dark. Verify the focused element remains visible rather than checking horizontal bounds alone at the 200% proxy viewport.

**Acceptance evidence:** Computed focus width, offset, and color contrast for the representative controls, plus one focused screenshot per theme or equivalent stable visual assertions.

## Operational calm assessment

The Personal settings and mobile drawer pairs now meet the intended direction: restrained surfaces, compact radii, clearer weight hierarchy, minimal elevation, and purposeful coral actions over an evergreen-neutral foundation. The visual system is substantially improved and no longer feels like the earlier pill-heavy onboarding UI.

Workspace administration also has sound structure and density, but the desktop dark navigation regression is a direct accessibility failure. CRM quality cannot be assessed from its current loading-only baselines. Those are gate issues rather than optional polish.

## Next-stage recommendation

Keep Stage 3 migration paused until the two visual blockers and focus-evidence gap above are closed. The next candidate should:

1. Correct the desktop Workspace navigation cascade and add contrast coverage.
2. Replace the loading-only CRM pair with settled Light/Dark CRM baselines.
3. Complete representative keyboard-focus evidence across themes and controls.
4. Re-run the paired baseline suite and request a focused Graphics re-review.

Once accepted, proceed with one high-density CRM workflow as the Stage 3 pilot before broad route migration.
