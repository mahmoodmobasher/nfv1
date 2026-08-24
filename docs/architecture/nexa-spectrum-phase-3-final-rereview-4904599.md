# Nexa Spectrum Phase 3 final Architecture re-review

Date: 2026-08-23

Candidate: `49045993cd3334754ec12818afd7d54861695449` on `codex/nexa-spectrum-phase4`

Remediates: Architecture `c26cb59be6312795c947081bd60158ced9a5a07b` and Graphics `f4602c8`

Phase 4 authority: `0da5f0a979cd174fab97a43cccad128f97f4a229`

## Verdict

**ACCEPT — no material Architecture blockers.**

P0: none.

P1: none.

P2: none.

P3: none material to the Phase 3 gate.

The aggregate browser determinism blocker from `c26cb59` is closed. The Phase 4 start blocker **P4-12 is explicitly closed**. Phase 4 may start on the accepted immutable Phase 3 checkpoint under every remaining guardrail and mandatory candidate item in `0da5f0a`; this acceptance does not waive P4-01 through P4-11 or authorize Phase 4 integration/deployment in advance.

## 1. Causal remediation and full-suite evidence

- The former ownership-transfer instability was a client/test readiness race: the controlled successor select could be exercised before hydration established its interactive state. `TransferClient` now exposes explicit hydration readiness and keeps successor selection and confirmation disabled until ready (`4904599:src/app/workspace/settings/admin-client.tsx`). Eligible-successor derivation, recent-auth checks, transfer payload/version fields, transaction behavior, Session rotation, and authorization refresh are unchanged.
- The Account-menu focus race came from sharing an animation-frame lifecycle between opening focus and trigger-focus restoration. The implementation now owns separate `accountOpenFrame` and `accountRestoreFrame` references and cancels each in the matching lifecycle (`4904599:src/app/product-shell.tsx:133-154`, `4904599:src/app/product-shell.tsx:198-208`, `4904599:src/app/product-shell.tsx:273-280`).
- Responsive captures establish their viewport before navigation. Mocked create/activity failures remain behind explicit release gates until loading evidence completes, and operational captures disable smooth scrolling before centering a semantic anchor. These are bounded test determinism corrections, not changes to production authority.
- Dev1 recorded two immediate consecutive serialized full Playwright passes, 37/37 plus 37/37, at the established 60-second per-test ceiling with one worker, no retry, no quarantine, and no snapshot update (`4904599:docs/engineering/nexa-spectrum-phase-3-review-remediation.md:20-31`).
- Architecture independently repeated the exact two-run command against clean immutable `4904599`. Run 1 passed 37/37 in 2.1 minutes; run 2 passed 37/37 in 2.0 minutes. Both ownership/recent-auth/Session-rotation journeys passed inside both aggregate runs.

This is sufficient causal and execution evidence that the former 36/37 results were test/focus orchestration failures rather than a concealed identity, ownership, Session, or authorization defect.

## 2. Top-bar Account menu

- The desktop top bar and collapsed mobile shell expose a labelled Account trigger with `aria-haspopup="menu"`, `aria-expanded`, a minimum 44px target, and a labelled menu containing only Personal settings and Sign out (`4904599:src/app/product-shell.tsx:299-355`, `4904599:src/app/product-shell.tsx:418-459`).
- Opening focuses the first item. Arrow Up/Down and Home/End navigate menu items; Escape and outside pointer dismissal close the menu; Escape returns focus to the invoking trigger. Route navigation closes without restoring focus into a replaced page. Opening the drawer closes the Account menu and the drawer isolation target set includes the mobile Account region.
- Personal settings uses the existing supported global User route. Sign out calls the existing `securePost("/api/auth/logout", {scope:"current"})`, preserving CSRF/origin protection, configured Session-cookie behavior, server revocation, full-document replacement, and truthful failure copy that the Session remains active.
- The menu introduces no billing, global search, global Create, Role, Workspace, entitlement, theme, or client authorization action. Static and browser assertions enforce the supported action inventory.
- Busy/disabled, inline error, desktop/mobile, Light/Dark, forced-colours, keyboard, 320px, and 640px behavior are covered. No material accessibility or security blocker remains.

## 3. Operational CRM evidence

- Leads and Pipeline now have paired Light/Dark evidence at 768px tablet and the 640px 200%-zoom proxy, with focus and no-horizontal-overflow assertions.
- Lead creation covers populated fields, required/invalid focus summary, busy duplicate-submit prevention, server failure with preserved entries, and recovery in both themes.
- Lead detail covers server-derived identity, ownership, Team/visibility metadata, saved state, Lost destructive confirmation, Escape/focus restoration, and semantic feedback.
- Activity covers populated, empty, loading, error with retained input, and success states in both themes.
- System preference evidence renders both effective Light and effective Dark while persisted preference remains `system`; no route-local theme authority is introduced.
- Baselines are seeded with fixed users, companies, stages, Teams, activity, timestamps, and response envelopes. Assertions accompany images for text/boundary contrast, focus, containment, target size, state, and recovery; snapshots are not the sole evidence.

## 4. Retained Phase 1–3 Architecture boundaries

- The diff from `b7d3d1e` to `4904599` changes no `src/server`, API, proxy, root layout, theme resolver, product-navigation, schema, or migration file.
- Server-filtered supported navigation remains constructed from trusted persisted Role context. Route/API authorization remains independent and authoritative.
- CRM pages continue to acquire active Workspace, active Membership, persisted Role, Ownership/Team/Visibility, and tenant-filtered data through the accepted server context and read models. No client Workspace or Role value becomes authority.
- The single canonical Spectrum foundation and thin `.experience-product` configuration remain intact. New shell/CRM styling uses semantic tokens; boundary tests reject unsupported actions and parallel route palettes/configurations.
- Server-authoritative Light/Dark/System first paint, nonce-bound CSP, configured-cookie private/no-store behavior, browser-cache presentation-only reconciliation, and System listener lifecycle are unchanged and pass the complete suite.
- Skip-link and modal drawer native/fallback isolation, scroll lock, route/unmount cleanup, focus lifecycle, and responsive overlay behavior remain closed and pass in both full runs.
- No identity, password/reset, OIDC, Session, invitation, Workspace selection/provisioning, RBAC, Audit, entitlement, or business-data contract changed.

## 5. Integration, rollback, and Phase 4 release

`4904599` is accepted as the immutable Phase 3 checkpoint. Integrate it as one reviewed unit with its causal remediation, shell Account menu, tests, and baselines; do not cherry-pick screenshots or test orchestration independently of their implementation.

Rollback remains bounded to the Phase 3/remediation presentation unit and must retain the accepted Phase 1–2 foundation, Workspace privacy prerequisite, migrations, stored User preferences, tenant data, and security contracts.

With P4-12 closed, Product may assign Phase 4 implementation under `0da5f0a`. Phase 4 must still close P4-01 through P4-11, pass its own full security/behavior/visual gate, and receive separate Product, Graphics, and Architecture acceptance before integration or deployment.
