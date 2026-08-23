# Pre-deployment Pipeline Graphics remediation

Date: 2026-08-23  
Base: `origin/main` at `eb17e33`  
Graphics rejection: `docs/design/predeployment-graphics-clearance-eb17e33.md`  
Disposition: **P1 cleared; P3 corrected; ready for Graphics re-review**

## Bounded implementation

- Replaced the CRM Pipeline’s legacy beige/white stage, count, and card presentation with the accepted semantic canvas, surface, border, strong/default/muted text, focus, and control tokens.
- Added explicit semantic hooks for stage counts, empty-stage copy, lead titles, company, owner metadata, visibility labels, and Change stage controls.
- Kept Pipeline cards operational and restrained: default, hover, and focus-within states use surface/border changes without lift or scale.
- Corrected authenticated CRM brand and Workspace-control title/role/supporting text where higher-specificity legacy declarations could override dark-theme inheritance.
- Corrected Leads and Pipeline desktop search proportions: the labelled query field flexes while Search/Clear remain content-sized. At narrow breakpoints the accepted full-width stacked actions remain deliberate.
- No public Stage 3 route, schema, migration, authorization, Workspace boundary, theme persistence, or deployment behavior changed.

## Automated acceptance evidence

- Deterministic Pipeline fixture contains populated **New** and **Qualified** stages and an empty **Proposal** stage.
- Both Light and Dark assert at least 4.5:1 rendered contrast for stage headings/counts, empty-stage copy, lead title, company, owner, visibility, Change stage, brand, and Workspace-control title.
- Unit coverage asserts the approved Pipeline strong/default/muted text against stage, card, and raised hover surfaces in both themes.
- Browser coverage verifies card hover border state, keyboard-generated Change stage focus with 2px/2px focus geometry and at least 3:1 indicator contrast, and default control text contrast.
- 320 px coverage verifies no document overflow, contained cards, and a 44 px Change stage target.
- The accepted 640 CSS-pixel 200% proxy verifies keyboard-focused Change stage remains contained and visible without document overflow.
- No-match Pipeline state is exercised separately and its heading contrast is asserted.

## Paired settled artifacts

- `tests/e2e/local-identity.spec.ts-snapshots/design-system-pipeline-light-darwin.png`
- `tests/e2e/local-identity.spec.ts-snapshots/design-system-pipeline-dark-darwin.png`
- The settled Leads Light/Dark baselines were regenerated solely for the approved flexible search-field/content-sized-action correction.

The Pipeline pair uses identical seeded content, stage order, viewport, keyboard focus state, and settled server data. Development overlays are removed by the existing capture helper.

## Verification

- `git diff --check`: PASS.
- `npm run lint`: PASS.
- `npx tsc --noEmit`: PASS.
- `npx vitest run tests/theme.unit.test.ts tests/design-system-boundary.test.ts`: PASS — 12/12.
- `npm test`: PASS — 64 tests; 119 database-gated integration tests skipped by that command as designed.
- `npm run build`: PASS — Next.js 16.3.1 production build and TypeScript phase.
- Focused Playwright matrix: PASS — 3/3 (existing paired design-system journey, Workspace state/focus journey, and new Pipeline journey).
- Full Playwright project: PASS — 30/30 with one worker.

## Integration

Cherry-pick the remediation commit onto the integration candidate, rerun the focused Pipeline/design-system matrix, and request Graphics re-review of the four changed paired images (Pipeline Light/Dark and Leads Light/Dark). Do not deploy directly from this branch.
