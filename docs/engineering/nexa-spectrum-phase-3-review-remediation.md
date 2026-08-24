# Nexa Spectrum Phase 3 review remediation

Status: COMPLETE on Dev1 candidate based on stabilized `2d527a0`. Not integrated or deployed.

## Review closure

- Added a labelled 44px Account control to the authenticated desktop top bar and collapsed mobile header. Its accessible menu exposes only supported server-authorized actions: Personal settings and Sign out.
- Verified keyboard open, first-item focus, Arrow navigation, Escape, outside-pointer close, focus return, Personal settings routing, sign-out busy/error truth, forced colours, 320px/640px behavior, and paired Light/Dark desktop/mobile states.
- Preserved the existing secure sign-out POST/CSRF flow and the existing rail/drawer actions. No search, Create, billing, role, Workspace, or theme authority was introduced.
- Added deterministic paired Light/Dark evidence for Leads/Pipeline at 768px and the 640px 200% proxy; lead create filled/required/invalid/busy/server-error/recovery; lead detail metadata/ownership/visibility/save/destructive confirmation; activity populated/empty/loading/error/success; and System effective Light/Dark while the persisted preference remains System.
- Seeded screenshots use the same fixed people, companies, activities, stages, team, timestamps, and response envelopes in both themes. Captures remove the Next development overlay and include visible focus plus computed text/boundary contrast assertions.

## Stabilization causes

- Account-menu Escape/outside close originally reused the opening animation-frame reference, so effect cleanup could cancel trigger-focus restoration. Opening focus and return focus now have independent lifecycles.
- A responsive capture navigated before establishing its intended desktop viewport. The viewport is now set before each desktop journey.
- Mocked loading responses could complete while Playwright was sampling a screenshot. Create/activity failures now remain behind explicit release gates until their loading captures finish.
- CSS `scroll-behavior: smooth` made operational-state viewport positions time-dependent. State captures now disable smooth scrolling and center an explicit semantic anchor before comparison.

## Verification evidence

- `git diff --check`: PASS
- `npm run lint`: PASS
- `npx tsc --noEmit`: PASS
- `npm test`: PASS, 75 passed / 123 integration tests intentionally skipped by the unit command
- `npm run build`: PASS, Next.js 16.3.1 production build
- Focused operational visual matrix: PASS three consecutive comparisons after baseline generation
- Fresh local environment: `npm run local:reset && npm run db:migrate`
- Full Playwright serial run 1: PASS, 37/37 in 2.0 minutes
- Full Playwright serial run 2 immediately afterward: PASS, 37/37 in 2.0 minutes
- Both full runs used one worker, the established 60-second per-test ceiling, no retries, no quarantine, and no snapshot update.

## Artifacts and integration

Paired artifacts are committed under `tests/e2e/local-identity.spec.ts-snapshots/`, including `spectrum-account-menu-*`, `spectrum-lead-create-*`, `spectrum-lead-detail-*`, `spectrum-activity-*`, `spectrum-leads-*-tablet`, `spectrum-leads-*-zoom200`, `spectrum-pipeline-*-tablet`, and `spectrum-pipeline-*-zoom200`.

Integrate the single immutable Dev1 remediation commit after Architecture and Graphics re-review. No migration, deployment action, Phase 4 surface, or backend contract change is included.
