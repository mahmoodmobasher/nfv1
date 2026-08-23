# Pre-deployment Graphics defect clearance

**Verdict:** REJECT

**Reviewed revision:** `origin/main` at `eb17e33`

**Review date:** 2026-08-23

## Scope and evidence

Read-only review of all accepted paired Light/Dark baselines, their retained browser assertions, and representative current UI evidence for Personal settings, settled CRM Leads, Workspace administration, the 320px mobile drawer, and CRM Pipeline.

The accepted baseline set remains unchanged from the approved `d322b7c` candidate:

- Personal settings, Light and Dark.
- Settled CRM Leads, Light and Dark.
- Workspace administration, Light and Dark.
- Workspace mobile drawer at 320px, Light and Dark.

No Next.js development portal or similar development-only overlay appears in these durable baselines. The visible **LOCAL SERVER** banners are intentional truthful-state disclosures, not captured developer tooling. They are acceptable for local/UAT use but must not appear in a production-configured experience.

## Defects

### P0

None identified.

### P1 — Dark CRM Pipeline has unreadable titles and metadata

Representative current UI at `/crm/pipeline` shows severe theme-parity failures:

- Stage names such as **New**, **Contacted**, **Qualified**, and **Proposal** render nearly white on pale beige stage surfaces.
- Lead names and **Workspace visibility** render nearly white on white lead cards.
- Workspace-control and brand text also lose contrast in the dark shell.
- Supporting page copy and some metadata are materially weaker than the accepted semantic text hierarchy.

The source retains literal light-theme Pipeline styling, including `.pipeline-stage { background:#eeebe4; border-color:#ded9d0; }` and a white count surface. These light surfaces are combined with inherited dark-theme text. Pipeline is a reachable CRM route, so this is a WCAG and usability defect even though it was outside the narrower Stage 1/2 baseline set.

**Required clearance:** Convert Pipeline stages, counts, lead cards, titles, metadata, visibility labels, workspace control, and brand text to semantic surfaces/text/borders. Verify populated and empty stages, default/hover/focus states, and **Change stage** controls. Add settled paired `/crm/pipeline` Light/Dark baselines and contrast assertions for stage and lead-card content.

### P2 — Visual language remains inconsistent beyond the accepted routes

The accepted routes demonstrate the Operational calm foundation, but representative current UI still mixes it with legacy visual language:

- Very light page-title weight appears beside heavy navigation and labels.
- Repeated uppercase coral labels compete with content hierarchy.
- Pale beige panels and old rounded-card treatments make Pipeline feel disconnected from the settled Leads and settings surfaces.
- Coral is used broadly as text emphasis rather than being reserved for primary actions, active indicators, and purposeful brand moments.

This inconsistency supports the reported “old styling” perception. It is not a token-foundation failure, but it must be addressed during the high-density CRM migration before claiming application-wide Operational calm completion.

### P2 — Pipeline is absent from the visual/accessibility regression gate

The retained assertions cover primary-action contrast, desktop navigation states, representative keyboard focus in both themes, mobile-drawer focus entry/return, 44px targets, 320px reflow, and the 640px 200% proxy. Those gates were not weakened by integration.

However, no paired Pipeline baseline or Pipeline-specific contrast assertion exists. The accepted settled CRM pair covers Leads only, allowing the visible Pipeline regression to pass the suite.

**Required clearance:** Add Pipeline to the paired route matrix and exercise stage headings, card titles, secondary metadata, links/buttons, keyboard focus, 320px reflow, and 200% proxy visibility.

### P3 — Desktop CRM search composition needs refinement

In the settled Leads baselines, the search input is narrow enough to clip its placeholder while the adjacent Search button occupies most of the row. This remains usable and is not an accessibility blocker, but the proportions weaken hierarchy and contemporary SaaS quality.

**Recommended remediation:** Give the query field the flexible width and keep Search/Clear actions content-sized, collapsing deliberately at narrow breakpoints.

## Retained accepted behavior

- Personal settings has coherent Light/Dark surfaces, readable controls, content-sized desktop actions, and responsive stacking.
- Settled Leads has matching Light/Dark content and readable card titles/metadata.
- Workspace navigation default, active, hover, pressed, unavailable, and focus treatments retain semantic contrast.
- Workspace administration has consistent route hierarchy and theme parity.
- The 320px drawer retains readable navigation, modal separation, and focus visibility.
- Primary action states retain WCAG AA text contrast.
- Representative keyboard focus retains 2px width, 2px offset, and at least 3:1 indicator contrast.
- Integration changed no accepted application CSS, component implementation, snapshots, or contrast/focus tests; its test stabilization only added navigation waits/history setup.

## Deployment recommendation

Do not deploy the current build as an application-wide dark-theme release. Clear the P1 Pipeline defect and add its paired regression coverage first. The P2 typography/legacy-style migration may be staged, but Product should not describe Operational calm as complete across the whole CRM until those routes are migrated.

If the target environment is production, independently verify that the truthful **LOCAL SERVER** banner is replaced by the correct production state; its presence in production is a release blocker rather than a visual-polish issue.
