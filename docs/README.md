# NexaFlow documentation

This directory contains only current authority and the small set of accepted historical contracts still needed to operate the application.

## Start here

1. [Continuation prompt](handover/CONTINUATION-PROMPT.md) — read this first in a new session
2. [Current project status](handover/PROJECT-STATUS.md)
3. [Current architecture](architecture/CURRENT-ARCHITECTURE.md)
4. [Capability registry](architecture/capability-registry.md)
5. [Current UX direction](design/CURRENT-UX.md)
6. [Current UAT release](release/CURRENT-UAT.md)

## Retained decision records

- [Concrete stack](architecture/concrete-stack-decision.md)
- [Security and data contracts](architecture/security-data-contracts.md)
- [Fast delivery and disposable UAT](architecture/fast-delivery-and-disposable-uat-runbook.md)
- [Donor-first convergence](handover/DONOR-FIRST-DATABASE-HANDOVER.md)
- [Fast-track feature development](product/fast-track-feature-development-decision.md)
- [DB-08 Deals/Pipeline freeze](product/db-08-deals-pipeline-product-freeze.md)
- [P1A Lead intake and identity](product/p1a-lead-intake-identity-contract.md)
- [P1A presentation wire contract](product/p1a-01-presentation-wire-contract-addendum.md)

## Lead lifecycle

The lead lifecycle (`new → working → qualified → converted`, plus disqualification and
reopen) was delivered on 2026-08-29. Its full specification — the state machine, the
persona permission matrix, the two-axis outcome guardrail, and the reasoning behind the
decisions including options that were rejected — lives in the **NexaFlow claude.ai
project doc `claude/lead-lifecycle-spec.md`**, not in this tree. `handover/PROJECT-STATUS.md`
carries the summary and the traps.

## Retained implementation handoffs

- [DB-01A Activity target timeline](engineering/db-01a-activity-target-timeline-handoff.md)
- [DB-01B Lead source platform](engineering/db-01b-lead-source-platform-handoff.md)
- [DB-08 Deals/Pipeline](engineering/db-08-deals-pipeline-v1-handoff.md)
- [Screen Forms database](engineering/screen-forms-01-database-handoff.md)
- [Screen Forms backend](engineering/screen-forms-01-backend-handoff.md)

## Retained historical handovers

- [Phase 1–4 UAT fall-forward](handover/phase1-4-uat-fall-forward-handover.md) (2026-08-24)
- [Donor-first convergence](handover/DONOR-FIRST-DATABASE-HANDOVER.md)

Superseded reviews, rejected release attempts, dated remediation reports, and old role handovers were removed from the live tree on 2026-08-27. They remain recoverable through Git history; they are not current authority.
