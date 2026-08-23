# Design system Stage 1–2 Architecture review

Review date: 2026-08-23

Reviewed candidate: Dev1 commit `1e2e610ca35bd1aea8362391c081161c552c1457` on `codex/design-system-stage12`

Proposal authority: Graphics commit `23d23f41a5f953985621137d2da6bbf32dae4890`, `docs/design/nexaflow-design-system-recommendation.md`

Verdict: **REJECT — two material Architecture blockers**

Review boundary: read-only inspection of the committed implementation, handoff, and test evidence. This review changes Architecture documentation only and does not modify application code.

## Executive decision

The semantic token foundation, shared authenticated-shell migration, presentation-only theme vocabulary, Workspace/security separation, and reversible additive rollout are directionally acceptable. The candidate is not Architecture-acceptable because its initial theme is selected from browser storage rather than the authenticated server preference, and its inline pre-paint bootstrap has no CSP nonce or hash integration.

These defects affect the core Stage 1 claims of server-authoritative preference, no wrong-theme flash, and CSP compatibility. They must be closed before Stage 1 or Stage 2 is integrated.

## Material finding DS-ARCH-01 — first-paint authority and reconciliation

**Status: BLOCKER**

Evidence in commit `1e2e610`:

- `src/app/layout.tsx:19-20` hardcodes `data-theme="light"` and `data-theme-preference="system"` in server output.
- `src/app/theme.ts:29-41` resolves the pre-paint preference from `localStorage`.
- `src/app/account-theme-sync.tsx:21-28` fetches and applies the authenticated server preference only after hydration.
- `src/app/settings/account-settings-client.tsx:120` calls `announceThemePreference` on selection, and `src/app/theme.ts:24-26` persists that preview through `applyThemePreference` before the preference mutation succeeds.
- `tests/e2e/local-identity.spec.ts:70-106` verifies eventual theme state after navigation and save, but does not exercise an empty/stale cache, failed save, first-paint capture, or hydration-console failure.

Impact:

- Browser storage becomes effective first-paint authority for an authenticated User.
- A new device, cleared cache, stale value, cross-device preference change, or failed/unsaved preview can paint the wrong theme and later reconcile after hydration.
- The candidate therefore does not prove the required no-flash or authenticated server-authority contract.

Required remediation — **Dev1 frontend**:

1. Resolve the authenticated, allowlisted `light | dark | system` server preference into the initial document before themed content can paint.
2. Treat browser cache only as a presentation hint. It must not override authenticated server state.
3. Do not persist an unsaved preview as durable first-paint state. On save failure, restore the last server-confirmed preference or keep the preview explicitly ephemeral.
4. Initialize hydration from the server/bootstrap result. If hydration suppression is necessary, constrain it to the `<html>` theme attributes; never suppress an application subtree.
5. Keep authenticated theme responses private and no-store, and disclose no identity, Membership, Workspace, Role, or preference-record existence through the theme seam.

Acceptance evidence:

- First-paint tests for Light, Dark, and System with empty, correct, stale, and unavailable browser storage.
- Direct authenticated route, refresh, login, logout, browser Back, and Workspace-switch transitions show no wrong-theme frame.
- A failed preference save cannot survive reload as authoritative theme state.
- Server HTML, pre-paint DOM, and hydrated DOM converge without hydration warnings or recoverable-render errors.
- The authoritative preference remains global User state and does not change Workspace, Membership, RBAC, Audit, or Entitlement authority.

## Material finding DS-ARCH-02 — CSP compatibility

**Status: BLOCKER**

Evidence in commit `1e2e610`:

- `src/app/layout.tsx:20` emits an inline `beforeInteractive` theme script without a nonce.
- No committed Content Security Policy nonce or fixed bootstrap hash integration accompanies the script.
- `tests/theme.unit.test.ts:28-32` checks only that the script string contains expected operations; it does not execute the production document under CSP.

Impact:

- A policy that omits `unsafe-inline` will block the bootstrap.
- Permitting the current script through `unsafe-inline` would weaken the security boundary and is prohibited.
- A blocked bootstrap reintroduces wrong-theme first paint and makes the Stage 1 CSP-safe claim false.

Required remediation — **Dev1 frontend**, coordinated with the deployment/configuration owner where headers are emitted:

1. Use a per-request nonce, an approved immutable script hash, or a same-origin blocking bootstrap asset that works with `script-src` without `unsafe-inline`.
2. Keep the bootstrap fixed and free of raw user interpolation. Only an allowlisted theme enum may reach the document.
3. Ensure the selected mechanism works in the production Next.js render path and with the public Caddy/application header boundary.

Acceptance evidence:

- Production-build response carries the intended CSP and bootstrap authorization mechanism.
- The browser records no CSP violation, and the pre-paint script executes for Light, Dark, and System.
- Removing or corrupting the nonce/hash blocks the script in a negative test.
- No CSP broadening, remote theme dependency, or `unsafe-inline` allowance is introduced.

## Required lifecycle correction

`src/app/account-theme-sync.tsx:19` registers a `prefers-color-scheme` listener for every preference and merely makes the callback a no-op outside System. The accepted lifecycle requires subscription only while the stored selection is `system`, removal when it changes to Light or Dark, cleanup on unmount, and no duplicate listeners across shell navigation or remount.

This is not an independent material security blocker, but it is required for the closing re-review because it is part of the explicit Stage 1 contract. Add focused lifecycle evidence for System-to-explicit, explicit-to-System, OS change, and unmount/remount behavior.

## Accepted boundaries retained

- Semantic tokens and compatibility aliases are additive; legacy literal rules are not deleted prematurely.
- Client theme values are presentation data only and are not consumed for identity, Session, Active Workspace, Membership, Role, ownership, Team, visibility, Audit, or Entitlement decisions.
- No schema, migration, identity, Session, tenant-selection, or Workspace authorization code is changed by the reviewed candidate.
- Shared-shell changes preserve the existing route and API authorization boundaries.
- Stage 1 remains foundation-only; Stage 2 remains shared shell and controls. Later route composition remains separately gated.

## Integration and rollback guardrails

- Do not integrate `1e2e610` until DS-ARCH-01 and DS-ARCH-02 are closed and the listener lifecycle evidence passes.
- Keep theme initialization and shared-component adoption as bounded commits so either can be reverted independently.
- Do not roll back the Feature 3 `user_preferences` schema or discard stored appearance values when reverting visual adoption.
- Preserve compatibility aliases until every consuming route is migrated and independently verified.
- Do not remove legacy styling during blocker remediation; cleanup belongs to the later consolidation gate.
- Rollback must restore the prior rendering path without changing identity, Session, Workspace, Membership, Role, Audit, or Entitlement state.
- Re-run lint, TypeScript, production build, unit tests, focused theme tests, complete supported browser regressions, visual snapshots, contrast, forced-colors, reduced-motion, keyboard, 320px, and 200% zoom checks before re-review.

## Final disposition

**REJECT.** Dev1 owns both material remediations. The deployment/configuration owner must participate if CSP headers or nonce propagation cross the application/Caddy boundary. Architecture will re-review a new immutable integration commit and its first-paint/CSP evidence. Product and Graphics acceptance must not be inferred from this Architecture verdict.
