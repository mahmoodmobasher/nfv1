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

---

## Remediation re-review — Dev1 commit `14e33f5`

Re-review date: 2026-08-23

Additional reference: Dev2 commit `bf225465fcf4e30c2a56fdc6742bd95343c04abd`, including the authenticated-theme/CSP reference contract and boundary tests.

Verdict: **REJECT — one material Architecture blocker remains**

### Closed findings

DS-ARCH-01 is closed at the implementation level:

- `src/app/layout.tsx:18-47` resolves the active Session and allowlisted global appearance preference on the server and emits it into the initial `<html>` attributes.
- `src/app/theme.ts:29-39` no longer reads Local Storage; the pre-paint bootstrap performs only allowlisted theme validation and System media-query resolution.
- `src/app/settings/page.tsx:28-29` supplies the confirmed preferences to the Personal settings client.
- `src/app/settings/account-settings-client.tsx:48-61` keeps selection preview ephemeral, persists browser presentation state only after server success, and restores the last confirmed preference after failure.
- Browser evidence covers empty, correct, stale, and unavailable cache; direct navigation; refresh; Workspace switch; Back; failed-save rollback; and hydration/CSP console monitoring.

DS-ARCH-02 is closed at the implementation level:

- `src/proxy.ts:18-25` generates and forwards a per-request nonce and returns the matching CSP.
- `src/app/layout.tsx:42-47` reads the forwarded nonce and attaches it to the fixed `beforeInteractive` bootstrap.
- Production `script-src` contains neither `unsafe-inline` nor `unsafe-eval`; the focused production/browser evidence records a matching response/bootstrap nonce and no CSP console violation.

The listener lifecycle correction is also closed:

- `src/app/theme.ts:43-51` adds the media-query listener only for System, removes it for explicit themes, and prevents duplicate subscription.
- `src/app/account-theme-sync.tsx:21-35` updates subscription on reconciliation and application events and removes it on unmount.

The client theme seam remains presentation-only. No reviewed code uses theme state for identity, Session, Active Workspace, Membership, Role, ownership, Team, visibility, Audit, or Entitlement authority.

### Material finding DS-ARCH-03 — configured Session cookie cache boundary

**Status: BLOCKER**

Evidence:

- `src/proxy.ts:26` in Dev1 commit `14e33f5` marks a document private/no-store only when the request contains the hardcoded cookie name `nexaflow_session`.
- `src/server/env.ts:12` defines `SESSION_COOKIE_NAME` as configurable, and `deploy/uat/uat.env.keys` includes that configuration key.
- The accepted deployment plan explicitly permits a UAT-specific Session cookie name.
- Dev2 reference commit `bf22546`, `src/proxy.ts:3` and `:35-38`, reads `process.env.SESSION_COOKIE_NAME` with a safe default and tests the session-bearing response boundary. That material protection is absent from `14e33f5`.
- `next.config.ts:7-9` and the Caddy path override cover the named authenticated route families, but they do not make the root-layout personalization safe for every session-bearing document or future authenticated route. The root layout resolves the global preference for any valid Session cookie regardless of route.

Impact:

If an environment uses a configured cookie name other than `nexaflow_session`, the application proxy does not recognize the request as session-bearing. A document whose root layout contains the authenticated User's theme may therefore lack the required application-owned `Cache-Control: private, no-store` boundary. This violates the accepted contract and creates avoidable personalized-response cache mixing and disclosure risk.

Required remediation — **Dev1 frontend/integration**, using Dev2's reference boundary:

1. Resolve the Session cookie name from `process.env.SESSION_COOKIE_NAME` with the existing default only as fallback.
2. Mark every document request carrying that configured cookie `private, no-store`, including stale or invalid cookies, without revealing whether Session resolution succeeded.
3. Retain the Caddy authenticated-path override as defense in depth, not as a substitute for application-owned cookie-aware caching.
4. Add a boundary test using a non-default configured cookie name and prove the response CSP/nonce remains intact while cache control is `private, no-store`.
5. Prove an anonymous request without that cookie is not incorrectly personalized and does not disclose Session validity.

### Reference-contract comparison

Dev2's separate `resolveAppearancePreference` module is not materially required because Dev1's root-layout resolver enforces the same active-Session and allowlisted global preference boundary. Dev2's configured-cookie cache handling and corresponding boundary test are materially missing and must be integrated.

The current CSP negative test at `tests/e2e/local-identity.spec.ts:115-118` proves browser nonce enforcement with generic scripts rather than the actual NexaFlow bootstrap. This is not an additional material blocker because the candidate also has positive production-response nonce matching and no-violation evidence, but the closing regression should preferably exercise a mismatched nonce on the real fixed bootstrap so the handoff claim remains exact.

### Re-review integration and rollback guardrails

- Change only the cookie-aware cache boundary and its tests; do not reopen the accepted theme, identity, Session, Workspace, or preference contracts.
- Preserve per-request nonce propagation and the production prohibition on `unsafe-inline` and `unsafe-eval`.
- Preserve server-authoritative first paint, ephemeral preview behavior, System-only listener lifecycle, private/no-store preferences API responses, and current compatibility aliases.
- Keep the Caddy private-document override and application proxy protections independently reversible.
- Rollback must not revert the Feature 3 preference schema or mutate stored User preferences.
- Re-run unit/boundary tests, lint, TypeScript, production build, production CSP response inspection, and the focused Light/Dark/System browser suite before Architecture re-review.

### Re-review disposition

**REJECT.** Dev1 owns DS-ARCH-03, with Dev2's `bf22546` proxy boundary as the accepted reference. Architecture will issue ACCEPT after a new immutable candidate proves configured-cookie private/no-store behavior while retaining the closed first-paint, CSP, listener, and Workspace/security boundaries.

---

## Closing re-review — Dev1 commit `d322b7c`

Closing review date: 2026-08-23

Reviewed candidate: `d322b7ca8407f156864be176e2382904e6e6448a` on `codex/design-system-stage12`

Verdict: **ACCEPT — no material Architecture blockers**

### DS-ARCH-03 closure

The configured Session-cookie cache blocker is closed:

- `src/proxy.ts:3-7` resolves `SESSION_COOKIE_NAME`, trims it, and uses `nexaflow_session` only as the established fallback.
- `src/proxy.ts:25-35` preserves the per-request nonce/CSP path and marks any document carrying the configured cookie `Cache-Control: private, no-store` before Session resolution.
- `tests/design-system-boundary.test.ts:6-24` proves a non-default configured cookie with a stale or invalid value remains private/no-store and retains matching request/response CSP nonce state.
- `tests/design-system-boundary.test.ts:26-31` proves an anonymous document is not marked private and exposes no Session/authentication-disclosure header.
- `tests/design-system-boundary.test.ts:33-38` proves the default cookie fallback and production prohibition on `unsafe-inline` and `unsafe-eval` remain intact.
- `deploy/uat/Caddyfile:23-24` retains the authenticated-route private/no-store override as defense in depth; it does not replace the application-owned cookie-aware boundary.

The closing handoff additionally records a production response using `SESSION_COOKIE_NAME=uat_session_cookie` with a stale value: HTTP 200, private/no-store, matching response/bootstrap nonce, no `unsafe-inline` in `script-src`, and anonymous-safe System resolution.

### Previously closed findings retained

- Authenticated server preference remains the initial-document authority. The bootstrap does not read browser storage and performs only allowlisted System media-query resolution.
- Empty, correct, stale, and unavailable client cache cannot override server-rendered preference.
- Theme preview remains ephemeral until server success; a failed save restores the last confirmed preference and cannot survive reload as authority.
- The fixed bootstrap remains nonce-bound under the application-owned CSP. Production script policy contains neither `unsafe-inline` nor `unsafe-eval`.
- System media-query subscription remains active only for System, without duplicates, and is removed on explicit preference or unmount.
- Preferences API success and failure responses remain private/no-store.
- Caddy forwards the application CSP unchanged and retains independent protected-document cache defense.
- Theme state remains global User presentation state only. It does not establish or modify identity, Session, Active Workspace, Membership, RBAC, ownership, Team, visibility, Audit, or Entitlement authority.
- No schema, migration, identity, tenant-selection, or Workspace-authorization change is introduced by the closing remediation.

### Evidence accepted

- Diff check, ESLint, TypeScript, Caddy validation, and Next production build passed.
- Unit/boundary suite passed 63 tests; focused boundary/theme suite passed 11 tests.
- Focused browser gate passed four tests covering server authority, CSP/nonce behavior, paired Light/Dark visual states, System response, failed-save rollback, Workspace switching, browser Back, keyboard focus, mobile drawer behavior, 44px targets, 320px reflow, and the recorded 200% zoom proxy.
- Production-response inspection proved configured-cookie private/no-store, matching response/bootstrap nonce, production CSP restrictions, and anonymous-safe fallback.

### Integration and rollback guardrails

- Integrate the immutable candidate as a whole; do not drop the configured-cookie boundary, nonce propagation, private/no-store API behavior, or Caddy defense-in-depth during conflict resolution.
- Keep the application proxy's cookie-aware cache rule and Caddy's path rule as independent layers.
- Preserve the server-authoritative preference and ephemeral preview contract during later route migration.
- Preserve compatibility aliases until later stages prove all consumers have migrated.
- Stage 3/4 route redesign and legacy-style deletion remain separately authorized and reviewed work.
- Rollback may revert the visual bootstrap/shared-style adoption, but must not revert the Feature 3 preference schema, delete stored preferences, or change identity/Workspace authority.
- Re-run the boundary/theme unit tests, production CSP response inspection, focused browser suite, lint, TypeScript, and build after integration or conflict resolution.

### Final disposition

**ACCEPT — no material Architecture blockers.** DS-ARCH-01, DS-ARCH-02, DS-ARCH-03, the System listener lifecycle correction, and the security/Workspace separation requirements are closed for Design System Stage 1–2 at `d322b7c`. This verdict authorizes Product-controlled integration review; it does not authorize deployment or later design-system stages.
