# Nexa Spectrum Phase 1–2 closing Architecture review

Date: 2026-08-23  
Candidate: `ecda7cd39be89bc92bb8088053d0039e48c0fd42` on `codex/nexa-spectrum-phase12`  
Architecture authority: `e8993f136e6a5d06e10f3b985eaaae702e755e8f`  
Backend prerequisite: `ae39bae7e9309d5297458bd65ffb8d48f95bb17e`, integrated equivalently as `b5519ad716f5d55e2b025688e8e908edba1865af`  
Verdict: **REJECT — three P2 Phase 1–2 contract blockers remain**

## Material findings

### P2 — modal drawer does not isolate the background or close on an external route change

Evidence:

- `src/app/product-shell.tsx:135-163` implements initial focus, Escape, and a Tab loop, but does not make the rest of the application inert, hide it from assistive technology, or lock document scrolling while the modal drawer is open.
- `src/app/product-shell.tsx:180-190` closes only when one of its own links is clicked. There is no effect keyed to `pathname`, so browser history or another programmatic route transition can retain stale open-drawer state.
- `src/app/product-shell.tsx:285-302` declares `role="dialog"` and `aria-modal="true"`; the underlying rail/topbar/main remain active DOM siblings. The Playwright evidence proves focus entry and Escape restoration only, not background isolation, scroll locking, or external route-close cleanup.

This misses the explicit Phase 2 overlay contract in `e8993f1`: background inertness, scroll containment, and route close are required parts of the modal drawer lifecycle.

Required remediation, owned by Dev1:

1. While open, make every non-drawer shell region inert using a robust native/fallback pattern, and restore the exact prior state on close and unmount.
2. Lock document/background scrolling while preserving the drawer panel's own bounded scrolling; restore prior styles on every close/unmount path.
3. Close and clean up when `pathname` changes, including history/programmatic navigation, without incorrectly restoring focus into a page being replaced.
4. Add browser assertions that background links and controls cannot receive focus or accessibility interaction, body/background scroll does not move, the panel can scroll, history/programmatic route change closes the drawer, and cleanup restores normal interaction.

### P2 — capability-sensitive navigation is constructed in the client from a Role string

Evidence:

- `src/app/product-shell.tsx:29-87` defines the CRM and administration navigation authority-shaped model inside the client component.
- `src/app/product-shell.tsx:112-123` accepts only `kind`, Workspace display name, and Role string rather than a server-filtered navigation/capability model.
- `src/app/product-shell.tsx:196-199` derives `canAdminister` in the browser from `role === "owner" || role === "admin"`; the administration shell then uses its full static list.

Protected routes and APIs remain authoritative, so this is not a demonstrated authorization bypass. It is nevertheless a material Phase 2 contract failure: `e8993f1` requires the server boundary to resolve persisted Role/capabilities and the route-specific authorized navigation model, with the client island limited to presentation interaction. A client-authored Role-to-capability mapping creates a second permission-ceiling representation and can drift from persisted policy.

Required remediation, owned by Dev1 with the existing Workspace backend contract:

1. Build a serializable navigation model or explicit presentation capabilities at the server adapter after current Session, Active Workspace, Membership, and persisted Role/capability resolution.
2. Pass only the already-filtered supported items/actions into `ProductShell`; keep active-route highlighting and drawer interaction client-side.
3. Do not expose unsupported destinations. Continue treating route/API authorization as independently mandatory.
4. Add Owner/Admin/Member server-rendered model tests and browser evidence proving the shell reconciles after Role/Membership/Workspace change without relying on a client Role map.

### P2 — secondary and destructive disabled controls still use opacity instead of dedicated semantic states

Evidence:

- `src/app/globals.css:257` gives primary disabled controls explicit semantic surface, text, and border values.
- `src/app/globals.css:258` instead implements `.secondary:disabled,.danger:disabled { opacity: .58; ... }`, despite the candidate defining `--nx-disabled-surface`, `--nx-disabled-border`, and `--nx-text-disabled`.
- The focused contrast tests cover primary actions and selected navigation but do not prove disabled secondary/destructive text and essential boundary contrast on their actual Light/Dark surfaces.

This violates both the approved Spectrum component specification and the Phase 1 token contract that disabled states derive from dedicated semantic tokens rather than opacity alone.

Required remediation, owned by Dev1:

1. Apply explicit disabled background, foreground, border, and cursor tokens to every shared button variant; do not reduce the whole control's opacity.
2. Preserve readable labels and a distinguishable control boundary in Light, Dark, forced-colors, and overlay contexts.
3. Add computed-state contrast/boundary assertions for primary, secondary, destructive, icon, and menu disabled variants on their real surfaces.

## Accepted findings retained

The following reviewed areas have no material blocker and must remain unchanged during remediation:

- Canonical `--nx-*` Spectrum semantic tokens and raw ramps are present for Light/Dark, with a single explicit `--nf-*` and generic compatibility-alias layer. The muted Light role was safely strengthened for actual contrast.
- Inter is bundled through `next/font` into same-origin build assets; runtime CSP `font-src 'self'` requires no expansion.
- Authenticated server preference remains first-paint authority; anonymous/stale Session resolves System; the fixed bootstrap remains storage-independent, nonce-bound, and limited to effective theme resolution.
- Production CSP retains matching nonce, `strict-dynamic`, and no `unsafe-inline`/`unsafe-eval`. No new runtime third-party origin is introduced.
- Configured Session-cookie document privacy remains private/no-store, including stale/invalid cookies, while anonymous documents disclose no Session validity.
- Backend prerequisite `b5519ad`/`ae39bae` makes Workspace selectable/switch JSON private/no-store on success, authentication/validation denial, and mutation-guard denial while preserving Session rotation, Audit, and tenant behavior.
- Thin CRM/admin server adapters continue to receive Workspace/Role display facts from accepted server page contexts; no identity, Session, Workspace, RBAC, entitlement, Audit, schema, migration, or business-data mutation was added.
- Unsupported global search, global Create, and future product destinations remain absent.
- Compatibility aliases and existing shell entry points preserve a bounded rollback path; rollback must retain migration `0011`, stored global preferences, and all identity/Workspace data.
- Recorded static, unit, PostgreSQL, build, and full browser suites are broad and credible for the closed areas. They do not substitute for the three missing contract assertions above.

## Acceptance gate

Architecture will accept a new immutable candidate when:

1. all three P2 findings are remediated without weakening the accepted areas;
2. focused regressions prove modal background isolation/scroll/route lifecycle, server-filtered navigation for Owner/Admin/Member, and explicit disabled variants in Light/Dark/forced-colors;
3. the complete unit, serial PostgreSQL, Playwright, lint, TypeScript, production build, production CSP/cache response, and visual-baseline review remain green; and
4. the handoff records the final server navigation model and compatibility/rollback boundary.

## Final disposition

**REJECT — P2 drawer isolation/lifecycle, server/client navigation authority, and semantic disabled-state blockers remain.**
