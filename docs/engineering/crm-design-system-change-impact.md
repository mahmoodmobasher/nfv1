# CRM design-system change impact

Status: Dev1 implementation in progress

Binding visual source: `crm-dashboard-light-end-product-mock.html` (`a8bb678ceb70c900681234be92fdb276dbaf58c47892b1148cd22333bdaa0090`)

## Stage 1 — global tokens, themes, and typography

- Owner: frontend shared design system.
- Public contract: semantic CSS custom properties in `src/frontend/design-system/tokens.css` and the root Geist/Geist Mono variables.
- Consumers: all application shells and feature surfaces through compatibility aliases; no domain or server contract changed.
- Measured authority: Light canvas/surface/border/text/accent/status values, type scale, spacing, radii, 232px rail, 1400px content maximum, and 28px content padding.
- Extrapolated authority: Dark/System palette, forced-colour mappings, interaction colours, and contrast adjustments. These remain centralized and are not feature-local.
- Superseded design: the former Spectrum palette and Inter foundation were removed rather than retained as an alternate CRM theme.
- Validation executed:
  - `npx vitest run tests/design-system-boundary.test.ts --no-file-parallelism --maxWorkers=1` — 14 passed.
  - `npx tsc --noEmit` — passed.
  - `npm run lint` — passed with one pre-existing unused-variable warning in `tests/e2e/p1a-frontend-journeys.spec.ts`.
  - `npm run build` — passed after allowing Next.js to download and self-host Geist; 42 static pages generated and all dynamic routes compiled.
- Browser/visual evidence: explicitly deferred to user testing by Product/user direction on 2026-08-25. A disposable local browser environment was stopped without executing a journey.
- Rollback: revert the immutable Stage 1 commit.

## Pending stages

- Stage 2: authenticated shell, navigation, and direct Sign out.
- Stage 3: shared controls, panels, tables, forms, badges, and feedback states.
- Stage 4: Lead surfaces and held Duplicates integration.
