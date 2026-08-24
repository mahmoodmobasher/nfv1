# Nexa Spectrum Phase 1–2 Architecture review

Date: 2026-08-23  
Graphics authority: `f9ecd34`, `docs/design/nexaflow-spectrum-complete-redesign.md`  
Deployment baseline: `v0.4.0-uat.1` / `e58c22a11e8239f65936542ce75ff73963fb99c1`  
Scope: complete proposal review with immediate implementation gate for Phase 1 Foundation and Phase 2 Shell  
Verdict: **ACCEPT — no material Architecture blockers for Phase 1 and Phase 2, subject to the mandatory guardrails below**

## Decision and phase boundary

Nexa Spectrum may replace the existing visual language across the supported web product through the approved phased plan. Phase 1 and Phase 2 are authorized for immediate implementation. They are a presentation-foundation and shared-shell migration only.

This acceptance does not authorize Phase 3–6 implementation to bypass their per-phase gates. It does not authorize new product capability, identity/provider behavior, Workspace authority, data-model changes, navigation to unsupported destinations, or deletion of compatibility styles.

No database migration is expected for Phase 1 or Phase 2. The accepted global User theme preference, pre-paint bootstrap, Session/cache boundary, CSP nonce flow, and Workspace Foundation remain authoritative.

## Phase 1 — Foundation contract

### Canonical tokens and compatibility

1. Define one canonical Nexa Spectrum semantic layer for Light and Dark. Components consume semantic purpose, never raw ramp steps or theme-conditional literals.
2. Recommended canonical variables include:
   - `--nf-canvas`;
   - `--nf-surface-primary|secondary|raised|navigation|overlay`;
   - `--nf-text-strong|default|muted|disabled`;
   - `--nf-border-subtle|strong`;
   - `--nf-action-primary|hover|pressed|text`;
   - `--nf-selected-surface|text`, `--nf-link`, `--nf-focus`, and `--nf-blanket`;
   - paired `--nf-success|warning|danger|info-{text|surface}`;
   - optional accent tokens restricted to truthful AI, automation, or categorization uses.
3. Existing consumers currently use names such as `--nf-surface-1`, `--nf-surface-2`, `--nf-text`, `--nf-brand`, `--nf-brand-soft`, `--background`, `--primary`, and `--ring`. Phase 1 must provide explicit compatibility aliases from those legacy names to the new semantic contract. Do not maintain two independent value sets.
4. Compatibility aliases are temporary API adapters, not permission to keep adding legacy references. Add a lint/boundary inventory that prevents new raw colour literals and deprecated token consumption in Phase 1/2 files while later route files remain intentionally unmigrated.
5. Token replacement must be atomic per theme. A missing Dark token, cyclic custom property, fallback to a raw legacy colour, or a component-specific theme branch is a Phase 1 blocker.
6. Keep raw ramps in a foundation-only layer. Product components may not use `blue-600`, `neutral-900`, or equivalent raw steps directly.
7. The Phase 1 commit may expose tokens globally, but route adoption must remain measurable. If alias value replacement visibly recolours a route before its phase, that route joins the Phase 1 regression surface and requires paired Light/Dark evidence. Prefer an explicit server-stamped Spectrum adoption scope where compatibility cannot preserve the prior rendering cleanly.

### Typography and foundational behavior

- Inter Variable must be self-hosted or bundled through the application build. Do not add an external font origin or weaken CSP. A stable fallback metric strategy must avoid material first-paint layout shift.
- Typography, spacing, radius, elevation, disabled, focus, reduced-motion, forced-colors, native `color-scheme`, and scrollbar treatment derive from tokens. Global element rules must not silently override semantic headings, dialogs, native controls, or accepted focus behavior.
- The 44px target contract remains. Compact desktop-only exceptions require an equivalent accessible target and cannot reduce mobile controls.
- Automated contrast checks must cover actual foreground/background pairs and interaction states, not isolated palette values. Text-disabled tokens may not carry essential instructions or state.

## Server-authoritative theme and first paint

The accepted Stage 1–2 theme architecture is retained, with palette values replaced but authority unchanged:

1. Authenticated initial documents resolve the global User `light | dark | system` preference on the server from a valid active Session. Anonymous, missing, invalid, or stale Sessions resolve safely to `system`.
2. SSR stamps `data-theme-preference` and a safe initial `data-theme`. The fixed nonce-bound pre-interactive bootstrap may only resolve System through `prefers-color-scheme`, stamp the final Light/Dark value, and set `color-scheme` before paint.
3. Browser storage is presentation-only. Empty, stale, corrupt, or unavailable storage cannot override server first paint or establish User, Session, Workspace, Membership, Role, visibility, or entitlement truth.
4. A theme preview applies immediately but persists only after the versioned authenticated preference API succeeds. Failure restores the last confirmed preference; reload must never retain an unconfirmed preview as authority.
5. Subscribe to system-theme changes exactly once and only for `system`; unsubscribe on explicit theme and component unmount.
6. The same root theme must cover public/authenticated shells, loading/error boundaries, native controls, portals, drawers, dialogs, menus, toasts, charts, and blankets. Portals attach under the themed document; they do not create a separate theme root.
7. No body-hiding workaround, hydration-only theme render, duplicate bootstrap, route-specific bootstrap, or client-only initial theme is permitted.

## CSP, cache, SSR, and hydration

- Preserve the per-request nonce from application proxy through request headers, response CSP, and the fixed bootstrap. Production `script-src` retains `strict-dynamic` and forbids `unsafe-inline`/`unsafe-eval`.
- Do not introduce runtime CSS-in-JS or third-party scripts/styles/fonts that require expanding CSP. If a future chart or overlay library needs a new source, it requires a separate security review.
- Retain configured `SESSION_COOKIE_NAME` handling. Any document carrying that cookie, including stale/invalid values, remains `Cache-Control: private, no-store`; anonymous responses expose no authentication-disclosure header. Caddy remains defense in depth, not the primary application rule.
- Preferences APIs remain private/no-store on success and error. Phase 1/2 must not change identity/onboarding token-page privacy defined in the Authentication and Onboarding migration brief.
- Server components remain responsible for Session, Workspace, Membership, Role, capability, and initial shell models. Client components may manage drawer state, focus, theme interaction, and other presentation state only.
- Server and first client render must use identical structural shell data. Do not branch initial markup on `window`, viewport size, localStorage, media query, or client-cached Workspace/Role. Responsive layout is CSS-first; hydration adds interaction without replacing authority.
- Suspense/loading/error fallbacks use Spectrum tokens and inherit theme without issuing a second authority lookup or exposing prior-Workspace content.

## Phase 2 — Shared Shell contract

### Composition boundary

Phase 2 should replace the duplicated CRM and administration chrome with a shared composition, but keep a server/client split:

- a server boundary resolves the active User/Session, server-selected Active Workspace, active Membership, persisted Role/capabilities, and the route-specific authorized navigation model;
- a presentational shell renders brand, Workspace context, permitted navigation, page header slots, account/theme controls, and children;
- a small client island owns drawer disclosure, focus lifecycle, route-close behavior, and logout/theme mutation invocation.

The shared shell is not an authorization service. Every page/API continues to enforce the accepted server boundary independently. Hiding a link is not authorization, and rendering a link cannot grant authority.

### Workspace and security truth

1. Workspace name, Role label, selectable Workspace options, navigation, and administrative actions come from persisted trusted context. Pathname, query, body, browser storage, theme cache, and stale client props cannot select a Workspace or elevate capability.
2. A route change does not implicitly switch Workspace. Explicit switching retains the accepted validation, Session rotation, replay, Audit, and stale-option behavior; after success, a full server navigation must discard prior-Workspace shell/data.
3. Suspended/removed Membership, inactive Workspace, revoked/expired Session, security-version mismatch, or changed Role is re-evaluated at the next protected request and reconciles to the accepted login/switch/denial path.
4. Personal settings remains global User scope and visibly distinct from Workspace administration. Account/theme controls must not imply Workspace ownership or entitlement.
5. Entitlement may hide or disable a capability only after identity, Active Workspace, Membership, and RBAC checks. It never grants tenant or record access.
6. Shell presentation must not expose foreign Workspace names, counts, links, targets, or cached content during denial, switching, Back navigation, or hydration.

### Truthful navigation and actions

- Only implemented, authorized destinations appear. The proposal's future navigation groups are organizational guidance, not permission to expose Companies, Contacts, Deals, Delivery, AI, Automation, or other unsupported routes.
- “Global Create” may render only real server-authorized actions. In the current product it may be limited to Lead creation and other already-supported operations; it must not be a dead/demo capability.
- Global search may render only when connected to a defined, tenant-scoped, authorized search result contract. A decorative or cross-Workspace search box is prohibited.
- Workspace and account menus show only current server-supported actions. Theme control changes presentation only. Logout retains CSRF/origin protection, server revocation, cookie clearing, safe failure copy, and full-document navigation.
- Environment banners remain truthful to runtime. Production must not display local fixture/disconnected copy; UAT/local limitations remain explicit where their conditions apply.

### Responsive shell and overlays

- Desktop, tablet, and mobile are one semantic navigation model, not separate authority trees. Collapsed/hidden states preserve accessible names and current-route context.
- Mobile drawer requires a 44px trigger, accurate accessible name, `aria-expanded`/`aria-controls`, labelled navigation, focus entry, containment, Escape/backdrop/route close, scroll containment, background inertness, and trigger focus restoration.
- Drawers, account menus, dialogs, tooltips, toasts, and other overlays use semantic overlay/blanket tokens, correct stacking, viewport-safe sizing, and the same theme. No overlay may be clipped by shell overflow or reveal obscured interactive content to keyboard users.
- At 320px and 200% zoom there is no page-level horizontal overflow. Wide data regions own an explicit scroll boundary or a structured mobile representation.

## Rollout and rollback

1. Land Phase 1 independently: canonical tokens, aliases, foundation tests, and no route-structure redesign.
2. Land Phase 2 independently after Phase 1 acceptance: shared shell plus responsive navigation, initially on one representative CRM route and one administration route, then broaden only after parity evidence.
3. Keep the existing shell entry points as thin adapters until all current CRM/admin consumers use the shared shell and the full regression passes. Do not combine shell migration with route content redesign.
4. Phase 1 and Phase 2 require separate immutable checkpoints. A Phase 2 rollback must restore the prior shell while retaining accepted theme preference data and Phase 1 compatibility. A full Spectrum rollback restores prior visuals through code/image authority only.
5. Rollback must not revert migration `0011`, delete `user_preferences`, mutate stored preferences, edit migration history, change Session cookies, or modify Workspace/identity data.
6. Phase 6 legacy deletion waits until Phases 1–5 have accepted representative coverage and an inventory proves no supported consumer uses deprecated tokens/selectors.

## Visual and behavioral regression strategy

### Deterministic fixtures

- Seed fixed global Users with valid Sessions for Owner, Admin, Member, multi-Workspace, and no-access states; use stable Workspace/business fixtures and freeze time/animation where visual comparison requires it.
- Capture settled Light and Dark directly from server-authoritative preferences. Capture System in both emulated OS schemes and prove the System listener transition separately.
- Disable transitions/caret and await fonts, hydration, data, and portal settlement. Do not mask dynamic business regions broadly; stabilize the fixture instead.
- Store baselines by phase, route, theme, and viewport. Baseline updates require reviewed image diffs and may not be automatically accepted by CI.

### Minimum Phase 1 matrix

- token contract/alias tests, missing-token and raw-literal boundary checks;
- actual contrast assertions for text, controls, focus, selected navigation, statuses, disabled states, blanket/overlay, and native controls in both themes;
- production first-paint HTML/CSP/bootstrap inspection for authenticated Light/Dark/System, anonymous, correct/stale configured cookie, and unavailable preference API;
- no-flash direct load/refresh/Back, preview-save/failure rollback, OS-theme change, listener unmount/remount, portal/dialog, loading, and error evidence;
- paired representative public, authentication, CRM, admin, and settings screenshots at desktop and 320px because Phase 1 tokens are global.

### Minimum Phase 2 matrix

- Owner/Admin/Member navigation and action visibility from persisted authority;
- selected Workspace and Role accuracy, multi-Workspace switch A→B→A, stale Membership/Role reconciliation, tenant-safe direct-route denial, and no prior-Workspace data after switch/Back;
- CRM and administration route transitions, supported global Create/search behavior, Personal-vs-Workspace settings separation, logout success/failure, and theme changes;
- keyboard navigation, skip/landmark order, drawer focus containment/return, Escape/backdrop/route close, menus and portals;
- paired Light/Dark desktop, tablet, 320px, and 200% zoom baselines for representative CRM/admin/settings shells, plus System OS-change behavior;
- CSP nonce/cache inspection and hydration-console checks on direct, refreshed, and navigated shell routes.

### Release checks

Each phase must pass focused boundary/component tests, the complete unit/direct-route suite, serial PostgreSQL suite, supported Playwright suite, ESLint, TypeScript, production build, Caddy validation, and production-response CSP/cache inspection. Security and behavioral assertions are release gates; screenshots supplement them and do not replace them.

## Protection of accepted product truth

Nexa Spectrum changes appearance and information organization only. It must preserve:

- global User identity and preference scope;
- active User and opaque server Session validation;
- trusted Session-owned Active Workspace selection;
- active Membership and persisted RBAC;
- Ownership, Team, and Visibility record filtering;
- tenant-safe denials and stale-state handling;
- canonical, transactional, non-duplicative Audit evidence;
- package Entitlement after authorization;
- atomic Workspace provisioning and sole initial Owner;
- password/reset-token/session concurrency and rollback;
- truthful live, preview, disconnected, disabled, loading, empty, conflict, denial, and error states.

No client shell, token, navigation label, visual selection, cached model, query parameter, or theme state may override these boundaries.

## Findings

- P0: none.
- P1: none.
- P2: none, provided unsupported global search/Create/navigation are not exposed and the shared shell remains presentational.
- P3: the approved proposal describes the visual token vocabulary but not exact CSS custom-property compatibility names. This review supplies the required alias contract; implementation must publish the final mapping in its engineering handoff.

## Final disposition

**ACCEPT — no material Architecture blockers for Nexa Spectrum Phase 1 Foundation and Phase 2 Shell.**

Product may assign immediate implementation under this contract. Phase 3 Operational CRM, Phase 4 Authentication/Onboarding, Phase 5 Administration/Settings, and Phase 6 legacy removal retain their explicit stage gates even though the complete visual direction is approved.
