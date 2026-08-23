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
