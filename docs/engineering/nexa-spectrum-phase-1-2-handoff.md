# Nexa Spectrum Phase 1–2 engineering handoff

Date: 2026-08-23  
Branch: `codex/nexa-spectrum-phase12`  
Base: `origin/main` `7a146fef9c0abe05561ec699d52a480732cd86ad`  
Graphics authority: `f9ecd346a69d4f4865d869096274acc6cbc11f7f`  
Architecture authority: `e8993f1` (incorporated as `ac37a98`)  
Backend prerequisite: `ae39bae` (incorporated as `b5519ad`)

## Scope completed

- Phase 1: canonical Nexa Spectrum raw ramps and Light/Dark semantic themes; compatibility adapters; typography, spacing, radius, elevation, focus, disabled, forced-colours, reduced-motion, and native colour-scheme foundations.
- Inter is bundled through `next/font` and emitted as a same-origin WOFF2 asset. CSP `font-src 'self'` is unchanged.
- Existing server-authoritative Light/Dark/System resolution, nonce-bound pre-paint bootstrap, preview/save rollback, and System-only media subscription remain the only theme authority.
- Phase 2: CRM and Workspace administration use one presentational Product shell with thin existing adapters. It provides the supported grouped navigation, server-derived Workspace/Role display, account/appearance controls, responsive top bar, and modal drawer.
- The drawer provides a 44px named trigger, `aria-expanded`/`aria-controls`, initial focus, Tab/Shift+Tab containment, Escape/scrim/route close, and trigger focus restoration.
- Unsupported global search, global Create, and future destinations are intentionally absent. CRM administration links are hidden for Member display roles; protected routes and APIs remain authoritative.
- No schema, migration, identity, Session, RBAC, entitlement, audit, Workspace-selection, or business-data contract changed. The only backend change is the accepted private/no-store Workspace API boundary from `ae39bae`.

## Compatibility alias map

| Compatibility name | Canonical Spectrum semantic role |
|---|---|
| `--nf-canvas` | `--nx-canvas` |
| `--nf-surface-1` | `--nx-surface-primary` |
| `--nf-surface-2` | `--nx-surface-secondary` |
| `--nf-surface-raised` | `--nx-surface-raised` |
| `--nf-text-strong` | `--nx-text-strong` |
| `--nf-text` | `--nx-text` |
| `--nf-text-muted` | `--nx-text-muted` |
| `--nf-border-subtle` / `--nf-border-strong` | matching `--nx-border-*` |
| `--nf-brand` / `--nf-brand-hover` / `--nf-brand-pressed` | matching `--nx-action-primary*` |
| `--nf-primary-foreground` | `--nx-action-primary-text` |
| `--nf-brand-soft` | `--nx-selected-surface` |
| `--nf-focus` | `--nx-focus` |
| `--nf-success|warning|danger|info` and `-soft` | matching `--nx-*-text/surface` roles |
| `--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--border`, `--input`, `--ring` | corresponding `--nf-*` compatibility adapter |

The Light muted role uses neutral 600 rather than the proposal's neutral 500 because neutral 500 is below 4.5:1 on the secondary surface used by existing compatibility consumers. Disabled retains the dedicated neutral 400 role and is not used for essential instructions.

## Verification evidence

- `git diff --check`: pass.
- `npm run lint`: pass.
- `npx tsc --noEmit`: pass.
- `npm test`: 69 passed; 123 database-gated tests skipped by the default command.
- `npm run test:integration`: 123 passed, serial database execution.
- `npm run build`: pass on Next.js 16.3.1; Inter emitted as `/_next/static/media/*.woff2`.
- `docker compose -f docker-compose.local.yml config --quiet`: pass.
- Full Playwright: 31 passed, serial.
- Browser evidence covers server-authoritative empty/correct/stale/unavailable cache, Light/Dark/System and OS changes, failed-save rollback/reload, CSP positive/negative nonce behavior, Workspace switch/Back/two-tab reconciliation, logout and protected re-entry, computed navigation and Pipeline contrast, keyboard focus, modal drawer lifecycle, 44px targets, 320px and 640px/200% proxy containment, forced colours, reduced motion, and CSP/hydration console cleanliness.
- Production `next start` inspection with non-default `SESSION_COOKIE_NAME`: anonymous and configured stale-cookie documents returned 200, `data-theme-preference="system"`, matching response/bootstrap nonce, and no `unsafe-inline`/`unsafe-eval`; stale-cookie response was `Cache-Control: private, no-store`.

## Visual artifacts

All captures use seeded settled data, disabled animations, and remove the Next development portal before comparison.

- Desktop CRM: `design-system-crm-light-darwin.png`, `design-system-crm-dark-darwin.png`.
- Desktop Workspace administration: `design-system-workspace-admin-light-darwin.png`, `design-system-workspace-admin-dark-darwin.png`.
- 320px settled CRM shell: `spectrum-crm-shell-light-mobile-darwin.png`, `spectrum-crm-shell-dark-mobile-darwin.png`.
- 320px settled administration shell: `spectrum-admin-shell-light-mobile-darwin.png`, `spectrum-admin-shell-dark-mobile-darwin.png`.
- 320px modal administration drawer: `design-system-mobile-drawer-light-darwin.png`, `design-system-mobile-drawer-dark-darwin.png`.
- Existing paired Personal settings and Pipeline captures were regenerated because Phase 1 compatibility tokens are global; their route composition was not migrated.

## Deferred legacy inventory

Phase 3–6 remain deliberately untouched. Legacy literal/selector cleanup remains in the public/authentication/onboarding and pricing surfaces; CRM home, Leads, Pipeline, lead details/editor and activity content; Workspace administration page content/tables/dialogs; Personal settings content; Workspace creation/ready/switch and plan selection. Existing compatibility selectors, old `data-account-theme` rules, and route-specific literals remain until their gated migration. `tests/design-system-boundary.test.ts` prevents new raw colours or deprecated tokens in the new Phase 2 component files.

## Integration

Cherry-pick the proposal, Architecture authority, backend prerequisite, and implementation commits from this branch in order. Do not deploy directly from this branch. Re-run the full static, integration, build, production header, and Playwright gates after integration; baseline review is required rather than automatic snapshot acceptance.
