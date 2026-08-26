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

## Stage 2 — authenticated shell and direct Sign out

- Owner: shared authenticated product shell.
- Public contract: `ProductShell` receives server-filtered navigation and preserves the existing secure logout endpoint/CSRF flow.
- Consumers: CRM and Workspace administration shells.
- Change: the desktop reference rail now consumes the measured 232px token; content padding consumes the measured 28px token; the duplicate Account dropdown was removed and replaced by a labelled 44px direct Sign out control with logout icon, busy copy, disabled state, recoverable generic failure, keyboard focus, and responsive parity.
- Security/authority: authentication, session revocation, redirect, and failure behavior are unchanged; no client authorization logic was introduced.
- Superseded design: Account-menu component state and styling were removed rather than preserved.
- Validation executed: `npx tsc --noEmit` passed; `npm run lint` passed with the same pre-existing unused-variable warning.
- Browser/visual evidence: deferred to user testing by explicit direction.
- Rollback: revert the immutable Stage 2 commit, then Stage 1 if the entire visual foundation must be removed.

## Stage 3 — reusable components and complete states

- Owner/public entry point: `src/frontend/design-system/index.ts`.
- Consumers: authenticated feature modules and thin App Router pages.
- Components: primary/secondary/tertiary/danger actions, asymmetric padded panels, semantic badges, status/alert/conflict/success feedback, empty and loading states, field help/errors, compact responsive tables, and accessible view tabs.
- Styling: one shared `components.css` module consumes semantic tokens only. It includes responsive, forced-colour, reduced-motion, disabled, focus-compatible, and no-shadow behavior; no feature-local colour, spacing, radius, or theme tokens were added.
- Authority: components render presentation only and contain no role, tenant, Lead lifecycle, assignment, matching, navigation, or mutation decisions.
- Contract coverage added: `tests/design-system-components.test.tsx` provides deterministic server-rendered semantic fixtures. It was added for downstream automation but not executed because interactive/testing validation was explicitly delegated to the user.
- Validation executed: `npx tsc --noEmit` passed; `npm run lint` passed with the same pre-existing warning; `git diff --check` passed.
- Browser/visual evidence: deferred to user testing by explicit direction.
- Rollback: revert the immutable Stage 3 commit without affecting server contracts or data.

## Stage 4 — current Lead surfaces

- Owner: `src/frontend/features/leads` through its public entry; thin App Router pages compose the feature and shared design system.
- CRM home: shared action hierarchy and replacement typography/tokens; current server-authorized metrics and Activities read boundary are unchanged.
- Leads: the canonical list is now the primary precision view using a compact shared table. It preserves display-name-only, phone-only, email-only, optional-Company, Unassigned, masked-contact, lifecycle, stage, review, capability, pagination, and no-detail states from strict server DTOs.
- Pipeline: remains a secondary board view with shared List/Board navigation, exact server stage ordering, preserved empty stages, no drag/drop, no mutation, and no optimistic state.
- Add lead: migrated to shared panel/form/action/success primitives while retaining the accepted phone guidance, exhaustive server-field mapping, optional Company, source/intake separation, attribution, idempotency, replay, held, validation, and retry behavior.
- Lead detail: remains canonical and read-only, now grouped through shared panels for optional Contact/Company, assignment, lifecycle/stage/review, and immutable attribution. The legacy editor and PATCH controls remain isolated.
- Loading/error/authority-loss: current Lead route loading and safe no-detail states consume shared components without adding protected detail.
- Duplicates dependency: integration is intentionally held. Dev2 candidate `f313785` exists in a separate worktree, but Product has not supplied the frozen immutable P1A-DUP-01 handoff plus Graphics approval. Navigation remains truthfully named Identity review and no related-inquiry data, count, action, or zero-state is fabricated.
- Shared Activities boundary: the CRM home continues to consume its existing server read model; no Lead-owned activity/follow-up behavior was added.
- Validation executed after migration: `npx tsc --noEmit`, `npm run lint`, and `git diff --check` passed; lint retains one pre-existing test warning. Browser, screenshot, interaction, and user-journey validation are explicitly delegated to the user.
- Rollback: revert the immutable Stage 4 commit. Earlier foundation/shell/component commits remain independently reversible in reverse order.
