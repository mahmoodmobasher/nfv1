# Design system Stage 1–2 implementation handoff

Date: 2026-08-23
Scope: Graphics proposal `23d23f4`, Stage 1 foundation and Stage 2 shared authenticated shell/controls only.

## Implemented

- Added semantic light/dark color tokens plus shared typography, spacing, radius, elevation, focus, reduced-motion, and forced-colors primitives.
- Added a fixed, pre-hydration theme bootstrap for `light`, `dark`, and `system`. The browser cache contains only the non-sensitive appearance choice; authenticated preferences remain server-authoritative and reconcile after load.
- Added immediate theme preview, persistence reconciliation, cross-shell application, and an OS color-scheme listener that is active only for the `system` preference.
- Migrated the authenticated CRM, Workspace administration, and Personal settings shells; desktop/mobile navigation and drawer; buttons, inputs/selects, alerts, dialogs, badges, cards, and tables to semantic tokens.
- Preserved server preference persistence, identity/security flows, Workspace authorization boundaries, role-aware links, focus restoration, Escape behavior, minimum 44px controls, and narrow-screen table containment.

## Verification evidence

- `npm run lint`: pass.
- `npx tsc --noEmit`: pass.
- `npm test`: 56 pass, 119 integration tests skipped unless `RUN_DB_INTEGRATION=1`.
- `npm run build`: pass; Next.js 16.3.1 production build completed for all routes.
- Focused Playwright authenticated journey: pass. Exercised live Light/Dark switching, System response to emulated OS changes, saved preference persistence after reload, global behavior across Personal settings/CRM/Workspace administration, visible keyboard focus, 44px mobile menu control, and no horizontal overflow at 320px.
- WCAG contrast unit assertions: pass for normal and muted body text against both canvases (minimum 4.5:1).
- Visual regression baselines:
  - `tests/e2e/local-identity.spec.ts-snapshots/design-system-light-personal-settings-darwin.png`
  - `tests/e2e/local-identity.spec.ts-snapshots/design-system-dark-admin-mobile-darwin.png`

## Architecture guardrails

No schema, migration, session, authorization, tenant-selection, or Workspace-boundary code changed. Theme cache values are never consumed for identity or authorization. No material Architecture blocker was identified in the accepted direction documents; integration review should confirm this remains a presentation-only client seam.

## Remaining legacy surface inventory

The shared authenticated primitives now override legacy literals without a risky full-file rewrite. The following remain intentionally deferred to later proposal stages:

- Public onboarding/auth/pricing/verification routes retain their route-specific literal palette and large pill controls (Stage 3).
- Detailed CRM dashboard, pipeline, lead/activity, empty-state, and demo-region rules still contain legacy literal declarations underneath the semantic shared overrides; page-level composition migration belongs to Stage 4.
- Workspace switch and a small number of specialized Workspace data rows retain legacy page-level colors.
- Old `data-account-theme` selectors remain inert for compatibility during integration and can be removed when downstream branches no longer reference the old attribute.
- Inter Variable is preferred when supplied by the host, with a system-font fallback; bundling a font asset was not authorized in this stage.

## Integration

Cherry-pick the implementation commit after the proposal/document commits already recorded on this branch. Run lint, unit tests, the focused Playwright journey, and production build. Do not deploy from this branch; Product owns promotion after Architecture and Graphics review.

## Formal-review remediation

Remediation date: 2026-08-23
Review authorities: Architecture `411d88f`; Graphics `53fbab4`.

- Initial HTML now resolves the allowlisted authenticated User preference from the session and database. Browser storage is never consulted by the bootstrap and cannot override the server result.
- Personal settings receives its confirmed preference from its Server Component. Theme selection is an ephemeral preview; only a successful mutation updates browser storage. A failed mutation restores the confirmed server value and reload cannot retain the preview.
- A per-request nonce is produced in `src/proxy.ts`, propagated through the request CSP and Next render, and attached to the fixed bootstrap and framework scripts. Production `script-src` contains no `unsafe-inline` or `unsafe-eval`. Development permits only the Next-documented style/debug exceptions; script inline execution remains nonce-bound.
- The existing UAT Caddy boundary overrides protected document caching to `private, no-store`. The account-preferences endpoint sets `private, no-store` on success and failure responses. Dev2 must retain the Caddy override when integrating because Next owns the upstream document cache header.
- System media-query listeners now attach only for `system`, detach on explicit Light/Dark, avoid duplicates, and clean up on unmount.
- Primary actions now use theme/state-specific accessible foreground/fill pairs. Default, hover, pressed, focus, and disabled combinations have automated 4.5:1 assertions.
- The authenticated eyebrow primitive explicitly supersedes the legacy 900-weight cascade and computes to the approved weight 550.
- Mobile drawers move focus to the first navigation item on open and restore focus to the trigger on Escape.

Remediation verification:

- `npm run lint`, `npx tsc --noEmit`, and `git diff --check`: pass.
- `npm test`: 59 pass; 119 database-gated integration tests skipped by default.
- `npm run build`: pass; all routes dynamically render under the nonce-based CSP proxy.
- Production `next start` response: HTTP 200; CSP nonce present; bootstrap nonce matches; `script-src` has neither `unsafe-inline` nor `unsafe-eval`.
- CSP negative browser test: a bootstrap with a corrupt nonce is blocked while the matching nonce executes.
- Focused Playwright: 3 pass. Covers empty/correct/stale/unavailable cache, Light/Dark/System server authority, OS changes, failed-save rollback and reload, Workspace switch and browser Back, CSP/hydration console checks, keyboard focus, drawer entry/return, 44px targets, 320px reflow, and a 640 CSS-pixel viewport proxy for 200% zoom on a 1280-pixel display.

Paired durable baselines, all with development overlays removed:

- Personal settings: `design-system-personal-settings-light-darwin.png`, `design-system-personal-settings-dark-darwin.png`
- CRM: `design-system-crm-light-darwin.png`, `design-system-crm-dark-darwin.png`
- Workspace administration: `design-system-workspace-admin-light-darwin.png`, `design-system-workspace-admin-dark-darwin.png`
- 320px Workspace drawer: `design-system-mobile-drawer-light-darwin.png`, `design-system-mobile-drawer-dark-darwin.png`

The two original unpaired snapshots remain only as historical artifacts and are no longer referenced by the browser suite. No Stage 3/4 route migration was included.

## Second formal-review remediation

Review authorities: Architecture `af9a5d1`; Graphics `bb756d9`; Dev2 reference contract `bf22546`.

- Proxy cache classification now reads the configured `SESSION_COOKIE_NAME`, trims it, and uses `nexaflow_session` only as the existing fallback. Any document carrying that configured cookie is marked `private, no-store` before Session resolution, including stale or invalid values. Anonymous documents remain unclassified and disclose no Session validity. Nonce/CSP propagation and the Caddy protected-route defense remain intact.
- Desktop Workspace navigation now has semantic default/visited, hover, active/current, focus, and unavailable states at selector specificity sufficient to supersede the legacy cascade. Unit and computed-style browser assertions require 4.5:1 text contrast in both themes.
- CRM visual evidence now seeds a deterministic `Jordan Lee` lead in a stable pipeline stage and waits for the loaded Leads heading and record before capture. The paired CRM baselines therefore cover the settled shell, navigation, search controls, primary/secondary actions, status badge, and customer card rather than the Suspense fallback.
- Keyboard-only traversal now reaches representative navigation, primary and secondary buttons, text input, select, and password-visibility control in both Light and Dark. Each asserts 2px/2px focus geometry and focus-to-surface contrast. The 640 CSS-pixel 200% proxy separately verifies a keyboard-focused input remains visible and horizontally contained.
- The settled CRM capture exposed legacy lead-card title/metadata colors in Dark mode; those shared card elements were moved to semantic strong/muted text tokens within the Stage 2 control/card boundary.

Integration guardrail: do not replace the application cookie-aware cache check with the path-only Caddy rule. Both layers are intentional; Dev2's configured-cookie contract is preserved without adopting a competing appearance resolver or changing identity/Workspace authority.

Second-remediation gate evidence:

- Diff check, ESLint, TypeScript, Caddy validation, and Next production build: pass.
- Unit/boundary suite: 63 pass; 119 database-gated tests remain skipped by default. Focused boundary/theme files: 11 pass.
- Focused browser gate: 4 pass, covering the previous authority/CSP/visual journey plus both-theme navigation states and representative keyboard focus.
- Production response with `SESSION_COOKIE_NAME=uat_session_cookie` and a stale value: HTTP 200, `Cache-Control: private, no-store`, matching response/bootstrap CSP nonce, no `unsafe-inline` in `script-src`, and anonymous-safe `system` resolution.
- Anonymous production response: HTTP 200, `system` theme, CSP present, and no Session/authentication disclosure header.
