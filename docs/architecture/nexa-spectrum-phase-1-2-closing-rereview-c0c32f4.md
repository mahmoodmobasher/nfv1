# Nexa Spectrum Phase 1–2 closing Architecture re-review

Date: 2026-08-23

Candidate: `c0c32f4` on `codex/nexa-spectrum-phase12`

Review authority: `b03041c`

## Verdict

**REJECT — one material P2 accessibility blocker remains.**

P0: none.

P1: none.

P2: the modal drawer does not isolate the skip link from the accessibility tree. The skip link is a focusable sibling immediately inside the shell (`c0c32f4:src/app/product-shell.tsx:275-277`), but the open-drawer isolation target list contains only the rail, top bar, mobile context, trigger, and main region (`c0c32f4:src/app/product-shell.tsx:148-156`). Consequently, the link remains outside native `inert` and the `aria-hidden`/tabindex fallback while the `aria-modal="true"` dialog is open. The new browser test proves isolation only on `#product-main` (`c0c32f4:tests/e2e/local-identity.spec.ts:783-788`) and does not cover this background control. Keyboard-loop containment does not remove the link from assistive-technology navigation or prevent scripted focus, so this does not satisfy `b03041c`'s requirement that every non-drawer shell region be unavailable for focus and accessibility interaction.

Required remediation: Dev1/frontend must include the skip link in the same exact-state isolation and restoration lifecycle as the other background shell regions, or place all non-modal siblings under one safely inertable background container. Add deterministic browser evidence that, while the drawer is open at phone and tablet widths, every sibling/background focusable—including the skip link—is inert or covered by the fallback, absent from accessible interaction, and unable to retain programmatic focus; then prove exact restoration after close, Escape, scrim, route transition, and unmount.

P3: none material to this gate.

## Closed findings and retained boundaries

- Navigation is now constructed in protected server adapters from the trusted persisted Workspace Role and passed to the client shell as an already-filtered serializable presentation model. Owner, Member, and Admin reconciliation has expanded browser coverage; route and API authorization remain independently authoritative.
- Primary, secondary, danger, compact-control, and form disabled states use explicit semantic foreground, surface, border, opacity, and cursor values, with Light/Dark contrast and forced-colours coverage.
- The drawer now has initial focus, bounded Tab/Shift+Tab behavior, a named 44px close control, Escape/scrim/link/path closure, trigger restoration for user dismissal, no stale focus on route closure, root/body scroll locking, bounded panel scrolling, and cleanup. These improvements are accepted subject only to complete background isolation above.
- No material regression was found in the previously accepted nonce-bound CSP bootstrap, server-authoritative Light/Dark/System first paint, cache-as-presentation-only reconciliation, configured session-cookie privacy, private/no-store Workspace responses, active Workspace/Membership/RBAC truth, or application authorization boundaries.
- The candidate changes no schema, migration, identity, Session, Audit, entitlement, or business-data contract. The staged rollback remains bounded to the Phase 1 token/font layer and Phase 2 shell/adapters, while the accepted Workspace privacy prerequisite remains in place.

## Evidence and integration gate

The updated handoff records passing lint, TypeScript, build, 72 default tests, 123 PostgreSQL integration tests, 36 Playwright tests, production configured-cookie/CSP inspection, responsive and state baselines, and `git diff --check` for the implementation changes. The inspection above found that the claimed complete modal isolation is broader than both implementation and test coverage.

Do not integrate or deploy `c0c32f4` as the closing Phase 1–2 candidate until the P2 is remediated and the focused modal regression evidence passes. After remediation, rerun static checks, unit/integration suites, production CSP/cache inspection, the full browser suite, and baseline review. Roll back the shell/remediation commits as a unit if the integrated gate regresses; do not roll back the independently accepted Workspace privacy prerequisite.
