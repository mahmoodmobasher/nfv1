# Nexa Spectrum Phase 1–2 second remediation

Date: 2026-08-23  
Candidate base: `c0c32f4`  
Authorities: Architecture `3356497`, Graphics `fda1733`  
Scope: Phase 1 foundation and Phase 2 shared shell only; no integration or deployment

## Clearance summary

- Drawer isolation now includes the skip link and every other non-modal shell target. Native `inert`, `aria-hidden`, and fallback `tabindex` state are captured and restored exactly. Browser coverage proves pointer, keyboard, Escape, scrim, route-change, history-change, and unmount cleanup at 320px and 768px in Light and Dark.
- The in-panel close control is isolated from legacy `.mobile-menu button` rules. Its default, hover, pressed, focus, and disabled states use semantic Spectrum tokens; the visible X, 44px target, forced-colours boundary, and computed contrast are asserted.
- CRM Home’s “Coming next” preview is semantically contained. The preview and welcome layout reflow without horizontal clipping at 1280px, 768px, 320px, and the 640px/200% proxy. Title, value, metadata, badge, label, and boundary contrast are computed in both themes.
- The representative component state sheet now covers real shared primary, secondary, danger, icon, and menu controls; links; input and select; warning, success, danger, and information feedback; badges; panel; and table. Default, hover, pressed, keyboard-focus, disabled, busy, invalid, Light, Dark, and forced-colours states are represented and asserted.
- The design-system boundary now enforces one canonical Spectrum foundation, semantic-only migrated CSS, and only thin `experience-product` and `experience-website` configurations. It rejects migrated route palette/theme, typography, raw radius, and raw elevation overrides while explicitly leaving the deferred legacy inventory outside the migrated boundary.

## Verification

- `git diff --check`: pass
- `npm run lint`: pass
- `npx tsc --noEmit`: pass
- `npm test -- --run`: 73 passed, 123 integration tests skipped by the default unit command
- `npm run test:integration`: 123 passed
- `npm run build`: pass with Next.js 16.3.1; all document routes remain dynamic
- `npx playwright test --timeout=60000`: 37 passed
- Production-shaped `next start` boundary inspection with `SESSION_COOKIE_NAME=uat_session_cookie`: anonymous login document returned 200 with `system`; configured stale-cookie documents returned private/no-store; response and bootstrap nonces matched; `script-src` contained neither `unsafe-inline` nor `unsafe-eval`. The stale-cookie runtime used an intentionally unreachable inspection database, so authentication validity was not inferred from that response; cookie classification is also covered directly by the passing boundary test.

The first default-timeout full browser run passed 36/37 and timed out in the unrelated existing ownership-transfer fixture while its confirmation button remained disabled. Its isolated retry passed, and the final complete run with a 60-second per-test runner timeout passed 37/37.

## Visual artifacts

Updated baselines are under `tests/e2e/local-identity.spec.ts-snapshots/`:

- paired CRM Home Light/Dark at desktop, 768px tablet, 320px phone, and 640px/200% proxy;
- paired 320px and 768px drawer states with the visible close control;
- paired Light/Dark full S09 component state sheets and a forced-colours sheet;
- affected Personal settings, CRM shell, Workspace administration, and Pipeline baselines where shared semantic control boundaries changed.

No application contract, migration, identity/Workspace authority, integration branch, or deployment was changed.
