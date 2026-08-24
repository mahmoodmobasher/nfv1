# Nexa Spectrum Phase 1–2 Graphics acceptance — `ecda7cd`

**Verdict: REJECT**

**Reviewed:** Dev1 candidate `ecda7cd39be89bc92bb8088053d0039e48c0fd42` against approved proposal `f9ecd34` and Phase 1–2 matrix `ff10d49`

**Review mode:** Read-only application review; documentation is the only change in the Graphics worktree.

## Material findings

### P1 — The modal navigation drawer does not make the background inert and lacks a visible in-panel close control

The drawer establishes `role="dialog"`, initial focus, a manual Tab loop, Escape dismissal, and trigger restoration. It does not apply `inert` (or an equivalent interaction lock) to the shell content behind the dialog. The original trigger changes to an X, but it is behind the full-screen drawer layer; both supplied drawer baselines show no visible close control inside the panel. The only pointer close affordance is the unlabeled visual scrim area.

This fails the matrix requirements that background content be non-interactive and that an explicit close action dismiss the drawer. It is material for touch, switch-control, voice-control, and assistive-technology users.

Evidence:

- Candidate `src/app/product-shell.tsx:245-312` leaves the rail, top bar, and main content active while the drawer is mounted.
- Candidate `src/app/product-shell.tsx:275-300` renders the X only in the underlying header and renders no close button in `.mobile-menu-panel`.
- `design-system-mobile-drawer-light-darwin.png` and `design-system-mobile-drawer-dark-darwin.png` visibly contain no in-panel close action.
- The browser test covers focus entry and Escape restoration, but does not assert background inertness or an explicit close action.

Required remediation (Dev1/frontend): provide a visible, accessible, minimum 44×44 close button inside the dialog; make content outside the open modal non-interactive and hidden from modal navigation as appropriate; retain Escape, scrim close, focus containment, and trigger restoration. Acceptance evidence must exercise pointer close, keyboard close, background interaction blocking, and accessible-tree/modal behavior in both themes at 320px and tablet width.

### P1 — Required responsive and paired visual evidence is incomplete

The candidate includes paired 1280px baselines for CRM Leads, Workspace settings, Personal settings, and Pipeline, plus paired 320px CRM Leads and Workspace settings captures. It does not supply:

- Paired 320px Personal settings baselines.
- Paired 320px Pipeline baselines, despite executing mobile geometry assertions.
- Any 768px tablet closed-shell and open-drawer Light/Dark baselines.
- The required representative Light/Dark component-state sheet.
- The required paired CRM Home shell baseline.

The implementation uses a single `max-width: 900px` collapse rule, but no supplied evidence verifies 1024/768/600/390/360 behavior, orientation transitions, or tablet drawer composition. This is an evidence blocker rather than a demonstrated visual failure.

Evidence:

- Candidate snapshot inventory contains 16 images; only `spectrum-crm-shell-*-mobile` and `spectrum-admin-shell-*-mobile` are closed 320px route captures.
- Candidate `tests/e2e/local-identity.spec.ts:175-268` creates the supplied settings desktop, CRM desktop/mobile, admin desktop/mobile, and drawer pairs.
- Candidate `tests/e2e/local-identity.spec.ts:349-395` checks Pipeline at 320px but does not capture it.
- No test or snapshot exercises a 768px viewport or a component-state sheet.

Required remediation (Dev1/frontend QA): add deterministic paired Light/Dark baselines for the missing matrix surfaces, with identical seeded content and no development overlay. At minimum close this gate with Personal settings and Pipeline at 320px; CRM Home desktop; tablet closed/open shell at 768px; and the representative component-state sheet. Include System→Light/System→Dark behavior evidence without changing the saved `system` preference.

### P1 — The authenticated shell has no keyboard skip target

The shared shell renders navigation and top-bar controls before `<main>`, but provides neither a skip link nor a stable main-content target. This fails the explicit Phase 1–2 desktop-shell and automated keyboard requirements and forces keyboard users to traverse the full navigation on every route load.

Evidence:

- Candidate `src/app/product-shell.tsx:245-312` contains no skip link and the `<main>` has no target identifier.
- No candidate browser test exercises a skip link.

Required remediation (Dev1/frontend): add a first-focusable “Skip to main content” control using Spectrum focus tokens, target the shared main landmark, and verify activation and visible focus in Light/Dark on desktop and collapsed-shell layouts.

### P2 — Shared disabled secondary and danger buttons still rely on opacity

Candidate `src/app/globals.css:257-258` gives primary disabled actions semantic surface/text values, but secondary and danger disabled actions use only `opacity: .58`. That conflicts with the approved requirement for dedicated disabled tokens and makes contrast/state behavior dependent on the underlying theme and component colour.

Required remediation (Dev1/frontend): map secondary and danger disabled foreground, surface, and border to explicit semantic disabled tokens; keep the disabled affordance non-colour-dependent; assert the resolved Light/Dark pairs in the component-state evidence.

### P2 — A migrated shell primitive uses an unapproved weight

Candidate `src/app/globals.css:342` assigns `font-weight: 700` to the shared shell brand mark. The approved migrated product scale permits only 400, 500, and 600. While visually minor, this is a deterministic foundation inconsistency and is covered by the matrix's typography rejection rule.

Required remediation (Dev1/frontend): use 600 for the shell mark or document a Product/Graphics-approved brand-mark exception, then add a static typography-boundary assertion for migrated shell selectors.

## Accepted evidence retained

- The desktop CRM, Workspace administration, Personal settings, and Pipeline Light/Dark pairs show a coherent cool-neutral foundation with restrained blue use, strong page-title hierarchy, quiet bordered surfaces, and no decorative gradients or card shadows.
- Pipeline titles, counts, cards, metadata, and Change stage controls are visibly restored in Dark; the prior near-white-on-light-card defect is absent.
- Blue is used for primary actions, current navigation, focus, and information disclosure. Violet is correctly absent where no AI, automation, or categorization meaning exists.
- Inter is bundled and applied globally; headings, labels, metadata, and sentence case are substantially aligned with Spectrum.
- The supplied 320px CRM/admin captures show clean one-column reflow, stacked actions, readable banners, 44px menu/action targets, and no visible horizontal clipping.
- Focus is visible in the Pipeline and drawer baselines. Candidate tests also cover representative contrast, System resolution/rollback, 200% proxy containment, forced colours, and reduced motion.
- Focused foundation verification run by Graphics passed: `tests/design-system-boundary.test.ts` and `tests/theme.unit.test.ts` (15 tests).

## Clearance evidence required

Re-review may return **ACCEPT** when:

1. Drawer background inertness and a visible in-panel close control pass in Light/Dark at 320px and 768px.
2. The skip link reaches the shared main landmark and has visible focus in both themes.
3. Missing paired route/tablet/component-state baselines are committed and reviewed.
4. Secondary/danger disabled states use semantic tokens with asserted contrast.
5. The migrated shell weight is brought into the approved scale or an explicit exception is approved.

No P0 findings were identified. No P3-only observation affects this verdict.
