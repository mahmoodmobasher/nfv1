# Nexa Spectrum Phase 4 Graphics acceptance

Candidate: `0199775`  
Graphics authority: proposal and acceptance matrix at `c06503a`  
Review mode: immutable candidate; application read-only  
Verdict: **REJECT — two P1 Graphics blockers**

## Severity summary

- P0: none.
- P1: two findings.
- P2: none beyond the P1 evidence gap.
- P3: none recorded while the gate is rejected.

## P1 — Plan prices disappear in Dark theme

The paired `phase4-plan-dark-*` baselines show the price/value headlines `$24`, `$57`, `$107`, and `Custom` as near-black text on dark card surfaces. These are essential plan-comparison values, not disabled or decorative content, and are materially unreadable. The Light baseline does not have the defect.

Concrete implementation evidence: the legacy rule `.plan-price b { color:#17201d }` remains effective because the centralized `.website-root` Spectrum configuration does not remap this element to a semantic text token. The visual test asserts contrast for `Start with Growth`, but not for the plan price/value headlines, so its pass does not establish WCAG AA for the affected content.

Required remediation (Dev1/front-end):

1. Fix the shared `.experience-website` configuration using the canonical semantic strong-text token; do not add a route-level Dark selector or colour literal.
2. Assert rendered contrast of every plan price/value headline against its actual card surface in both Light and Dark, including selected and Enterprise cards. Normal text must meet 4.5:1 unless its rendered size and weight validly qualify for the 3:1 large-text threshold.
3. Regenerate and submit the complete paired Plan desktop/tablet/320/200%-proxy baselines and System-effective pair. Graphics acceptance evidence must show all four values clearly readable.

Acceptance evidence: paired captures plus computed contrast assertions covering `$24`, `$57`, `$107`, and `Custom` in Light, Dark, selected, unselected, and System-effective states.

## P1 — Approved deterministic route/state matrix is incomplete

The candidate commits 64 useful baselines, but it does not satisfy the explicit P4-01–P4-22 matrix. Passing behavior tests or one representative state cannot replace the required paired visual authority. Material omissions include:

- registration default/filled, tablet, 200%-proxy, busy and provider/network-error pairs;
- verification checking, verified, resent and delivery-failure pairs plus the required narrow representative states;
- login invalid-credentials and session-expired pairs, tablet/200%-proxy coverage, and the distinct OIDC disabled/cancelled/failure/link-conflict state pairs;
- recovery invalid, busy, generic-success, service-failure and narrow pairs;
- reset validation, invalid-link and success pairs;
- Workspace create tablet/200%-proxy, busy, entitlement-used and recoverable-failure pairs;
- Workspace ready tablet/200%-proxy pairs;
- chooser tablet/390/200%-proxy plus switching, stale, failure and reload pairs;
- invitation preview validation/partial/network/success-disclaimer pairs;
- invitation acceptance busy/success, tablet/200%-proxy, paired seat-exhausted and distinct invalid/expired/revoked states;
- authenticated Workspace-create System-effective evidence and the required narrow/tablet System login evidence;
- the paired website component-state sheet, including 320px reflow.

The present acceptance spec also lacks comprehensive computed contrast assertions across the required typography, form, alert, selection and state matrix; the missed Dark price defect demonstrates why representative action-only assertions are insufficient.

Required remediation (Dev1/front-end and test owner): complete the matrix exactly as approved, with deterministic identical content per Light/Dark pair, visible keyboard focus where specified, 320/390/tablet/200%-proxy containment, System preference versus effective-theme assertions, forced-colours evidence, and computed text/boundary/focus contrast for representative instances of every semantic component/state. Run the full supported browser suite cleanly on the immutable remediation candidate.

Acceptance evidence: committed paired artifacts mapped explicitly to every P4-01–P4-22 cell and journey assertion, plus a clean retry-free full browser run. If Product wishes to reduce the matrix, Product must first revise the acceptance authority; Graphics cannot silently waive it after implementation.

## Evidence that passed

- Representative Identity, Plan/Workspace, and Invitation Light/Dark artifacts otherwise show a coherent Spectrum website shell, Inter hierarchy, responsive single-column behavior, labelled controls, visible focus, truthful local/provider/billing/preview/Owner/seat/chooser copy, and no observed legacy coral/beige/evergreen palette flash.
- Plan and invitation artifacts cover useful desktop/tablet/320/200%-proxy representatives; the production responsive probe reports 77 route/viewport checks with no document-level overflow.
- The candidate reports a clean serialized 48/48 Playwright run and passing lint, TypeScript, unit/integration, migration, build, and security/privacy probes.
- Independent Graphics execution passed the design-system, theme, Phase 4 identity-boundary, and invitation-boundary suites: 34/34.
- Static configuration is centralized through `.experience-website`; the required remediation must preserve that boundary.

## Gate decision

Candidate `0199775` is **REJECTED** for Phase 4 Graphics acceptance. The Dark plan-value contrast defect is user-visible and accessibility-material, and the missing matrix evidence prevents a truthful claim of complete Light/Dark/System, state, and responsive acceptance. No application code was changed by Graphics.
