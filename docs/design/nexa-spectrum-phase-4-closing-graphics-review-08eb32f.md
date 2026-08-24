# Nexa Spectrum Phase 4 closing Graphics review

Candidate: `08eb32f`  
Implementation: `33d649a`  
Prior rejection: `937a379`  
Graphics authority: proposal and P4-01–P4-22 matrix at `c06503a`  
Review mode: immutable candidate; application read-only  
Verdict: **REJECT — one P1 product blocker and one P2 evidence defect**

## Severity summary

- P0: none.
- P1: one.
- P2: one.
- P3: none.

## Closed from `937a379`

- The Dark plan-value defect is closed centrally by `.website-root .plan-price b { color: var(--nx-text-strong); }`. No route-level Dark selector or colour literal was introduced.
- `$24`, `$57`, `$107`, and `Custom` are readable in the remediated explicit-Dark and System-effective-Dark Plan baselines. Computed assertions cover all four values against their actual selected/unselected card surfaces across Light, Dark and both System-effective states.
- The remediation commits an explicit P4-01 through P4-22 map and the corresponding paired Identity, Plan/Workspace, Invitation and component-state artifacts across the approved desktop/tablet/390/320/200%-proxy/System/forced-colours representatives.
- The handoff reports a clean supported Playwright result: 60 passed, one intentional OIDC-disabled configuration skip, one worker, no retries/quarantine; the separately configured disabled-provider cell passes 1/1. Responsive coverage reports no document overflow at the required widths.

## P1 — Required Owner-governance copy remains unreadable in Dark theme

The explicit-Dark and System-effective-Dark Workspace creation baselines show the supporting paragraph inside **You’ll be the sole initial Owner** in very low-contrast legacy dark green/grey on the dark Owner panel:

> Owner is distinct from Admin and controls subscription, ownership and governance. Invited Admins operate only within server-authorized limits.

This is required tenancy/governance truth, not disabled or decorative content. It is materially difficult to read at desktop, 320px and System Dark. The P4-22 Dark component-state sheet reproduces the same failure in **Owner is included in active seats.**

Concrete evidence: the inherited `.owner-panel p { color:#53605b }` remains active because the centralized `.website-root` configuration remaps the panel surface but not its paragraph text. The Workspace matrix asserts contrast for the main subscription introduction, and the component-state sheet asserts the Owner heading, but neither computes contrast for the affected Owner paragraph. Therefore the claim that all required computed assertions pass is incomplete.

Required remediation — Dev1/front-end:

1. Remap `.website-root .owner-panel p` through a canonical semantic text token in the centralized website configuration; do not add a route-level palette or Dark override.
2. Add computed 4.5:1 text-contrast assertions for the complete Owner-governance paragraph on the real Workspace creation route and for its P4-22 representative in Light, Dark and System-effective states.
3. Regenerate the affected Workspace create desktop/tablet/320/200%-proxy/System pairs and both P4-22 sheets.

Acceptance evidence: the full paragraph is visibly readable and passes computed contrast against its actual Owner-panel surface in every required theme/effective-theme state.

## P2 — P4-22 selection evidence is visibly clipped

The desktop and 320px P4-22 component sheets render the text **Selected plan** at the extreme top-left of the page, clipped behind/outside the website header instead of inside the Selection panel. The injected state sheet reuses the absolutely positioned `.selected-label` without a positioned plan-card container, so the artifact does not truthfully demonstrate the intended selected-state composition.

Required remediation — test/evidence owner: build the state-sheet selected example with the same positioned component structure used by the real plan card, or provide a dedicated semantic state-sheet wrapper. Regenerate Light/Dark desktop and 320px sheets with no clipped or displaced text. This correction must remain test-only unless it reflects an actual reusable production primitive.

Acceptance evidence: all P4-22 content is contained within its panel at desktop and 320px, with semantic selection, readable text, visible focus and no page overflow.

## Evidence retained

- Representative Identity, Plan/Workspace and Invitation pairs preserve Spectrum typography, hierarchy, blue/neutral rules, truthful provider/billing/preview/Owner/seat/chooser language, focus visibility and responsive reflow.
- Busy, validation, recovery, error, success and terminal states are now broadly paired and clearly distinguishable without relying on colour alone.
- Forced-colours and System-effective artifacts are committed for the required representative journeys.
- Independent Graphics execution passed design-system, theme, Phase 4 identity-boundary and invitation-boundary suites: 37/37.

## Integration disposition

**DO NOT INTEGRATE `08eb32f` as the Graphics-accepted Phase 4 candidate.** The Owner-governance contrast failure is a user-visible WCAG and tenancy-comprehension blocker. Submit one immutable remediation candidate that fixes the centralized Owner copy token, expands the exact computed assertion, repairs the P4-22 selection artifact, regenerates affected pairs, and retains a clean supported browser run. Architecture acceptance, if granted separately, does not waive this Graphics gate.

No application code was changed by Graphics.
