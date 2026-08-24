# Nexa Spectrum Phase 1–2 closing Graphics review — `c0c32f4`

**Verdict: REJECT**

**Reviewed:** candidate `c0c32f4369d6c86ea1ac90a0f9fb2de20ac9a532` against proposal `f9ecd34`, acceptance matrix `ff10d49`, and prior Graphics review `ca34f4d`

**Mode:** application and evidence inspected read-only; this review document is the only Graphics-worktree change.

## Remaining material findings

### P1 — The visible drawer close control loses its icon in Dark

The new in-panel close target is correctly positioned, focusable, and at least 44×44. In both Dark drawer baselines, however, it renders as a blank white square: the X is not perceivable. Light renders correctly.

This is an essential control-state contrast failure. It also recreates the reported class of Dark-theme defects where names or control content disappear against a light legacy surface.

Evidence:

- `design-system-mobile-drawer-dark-darwin.png` shows a blank close target.
- `spectrum-admin-drawer-dark-tablet-darwin.png` shows the same blank close target.
- Candidate `src/app/globals.css:63` has the higher-specificity legacy rule `.mobile-menu button { background:white; color:#17201d; font-weight:800; }`; the later `.product-drawer-close` semantic declaration at `src/app/globals.css:408` does not fully contain that legacy cascade in Dark.
- Candidate assertions verify the target geometry and focus lifecycle, but do not verify the icon/foreground contrast against its actual rendered surface.

Required remediation (Dev1/frontend): isolate the drawer close primitive from legacy `.mobile-menu button` styling and resolve its foreground, background, border, hover, pressed, focus, and disabled states exclusively through Spectrum semantic tokens. Assert computed foreground/icon-to-surface contrast and capture settled Light/Dark phone and tablet baselines.

Acceptance evidence: the X remains visually identifiable at 3:1 or better in default, hover, pressed, focus, and forced-colours states in both themes; the accessible name remains “Close workspace navigation” or “Close CRM navigation.”

### P1 — CRM Home Dark contains unreadable and clipped legacy cards

The newly required CRM Home Dark baseline exposes a major route boundary failure in the “Coming next” region. Five cards render as near-white legacy surfaces on the dark canvas while their headings and key values are also near-white. Several descriptions and badges are horizontally clipped into narrow fragments. The equivalent Light baseline is readable.

This fails Light/Dark parity, readable component-state requirements, 320/400% reflow principles at a normal desktop viewport, and the explicit Graphics rejection rule for unreadable Dark components. Although CRM content migration is Phase 3, the candidate chose CRM Home as the representative Phase 2 shell baseline; an accepted shell cannot preserve a baseline containing materially unreadable content.

Evidence:

- `spectrum-crm-home-dark-darwin.png`, “Coming next” section: titles, values, descriptions, and “Coming later” labels lose contrast or clip.
- `spectrum-crm-home-light-darwin.png` demonstrates the intended readable geometry and makes the parity regression unambiguous.
- The route still inherits legacy coral/beige/evergreen selectors that are only partially overridden by the centralized compatibility layer.

Required remediation (Dev1/frontend): contain this representative region with semantic canvas/surface/text/muted/border/status tokens in both themes and remove the width/cascade condition causing card content to collapse. Do not repair it with a route-specific Dark override or additional raw literals.

Acceptance evidence: paired settled CRM Home baselines with identical content; computed assertions for card title, value, metadata, badge, and boundary contrast; no clipped text at 1280px, 768px, 320px, or the 640px/200% proxy.

### P1 — The component-state sheet still does not cover the approved state matrix

The new paired sheet is useful but covers only enabled/disabled primary, secondary, danger, compact controls, one field, success, and error. Matrix S09 requires representative buttons, links, input, select, alerts, badges, panels, tables, invalid, busy, hover, pressed, and focus states in both themes. Missing state evidence is material because the Dark close failure is precisely a state/cascade defect the limited sheet did not detect.

Evidence:

- Candidate `tests/e2e/local-identity.spec.ts:867` injects the complete state sheet markup. It contains no link, select, badge, table, invalid, busy, hover, or pressed representative; focus is not visibly captured.
- `spectrum-component-states-light-darwin.png` and `spectrum-component-states-dark-darwin.png` confirm the limited inventory.

Required remediation (Dev1/frontend QA): extend the deterministic sheet to the complete S09 inventory, including actual shared primitives rather than single-letter substitutes where possible. Capture at least default, hover, pressed, focus, disabled, busy, invalid, and semantic feedback combinations in paired Light/Dark evidence, with computed contrast checks against the real rendered surface.

## Prior findings now cleared

- **Drawer isolation:** native `inert`, `aria-hidden` fallback, tab-stop restoration, pointer blocking, scroll locking, route/unmount cleanup, focus containment, Escape/scrim/route close, and trigger restoration are implemented and tested.
- **Explicit close:** a labelled 44×44 in-panel close button is present; only its Dark visual state remains blocked above.
- **Skip navigation:** the first-focusable Spectrum skip link targets stable `#product-main`, and desktop/collapsed behavior is tested.
- **Disabled states:** primary, secondary, danger, Google, icon, menu, sign-out, input, select, and textarea disabled variants now use explicit semantic surface/text/border values with opacity 1.
- **Typography:** the migrated brand mark is weight 600, and the boundary test rejects 700+ shell weights.
- **Responsive evidence:** paired 320px Personal settings and Pipeline, paired 768px closed/open administration shell, CRM Home desktop, phone drawers, and the broader 1024/768/600/390/360 behavior matrix are supplied.
- **System behavior:** the saved `system` preference follows Light/Dark OS emulation without changing the persisted preference; rollback and route continuity coverage remain present.
- **Forced colours and reduced motion:** focused automated coverage remains present.
- **Central foundation:** `--nx-*` semantics, Inter, geometry, focus, theme resolution, and shared shell navigation remain centralized. The extracted server adapter for navigation does not fragment visual tokens.

## Verification performed

- Inspected every new and updated Light/Dark desktop, phone, tablet, drawer, CRM Home, Pipeline, Personal settings, and component-state baseline.
- Inspected the remediation diff and supporting browser assertions.
- Re-ran `tests/design-system-boundary.test.ts` and `tests/theme.unit.test.ts`: **18 passed**.
- Candidate handoff reports full Playwright: **36 passed**. The visible baseline defects demonstrate that passing assertions are not sufficient for Graphics acceptance.
- No P0 finding was identified.

## Centralization follow-up (P3, non-blocking for Phase 1–2 after the P1 items close)

Keep one canonical Spectrum foundation and add only two thin experience configurations during later migration: `product` and `website`. Route files must consume semantic tokens and shared primitives rather than introduce raw colours or local Dark selectors. Add boundary coverage that permits experience-level configuration but rejects route-level palette, typography, radius, elevation, and theme overrides. This is the required direction for future whole-system changes without page-by-page redesign work.

## Closing criteria

Re-review can return **ACCEPT** when all three P1 items above are remediated and evidenced. No reopening of the approved blue/neutral/violet direction is required.
