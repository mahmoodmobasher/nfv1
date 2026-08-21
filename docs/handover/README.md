# NexaFlow project handover — start here

Handover date: 2026-08-21  
Project directory: `/Users/moemahmood/builder_code/Nexflow_v1`  
Purpose: enable a new project owner or ChatGPT/Codex session to continue without relying on prior chat history.

## Current position

- Feature 1 — Account onboarding and Workspace provisioning: **accepted / complete**.
- Feature 2 — User, Role, Membership, Workspace context, and Audit: **Work Items 1–5 implemented**.
- Work Items 2–5 have explicit Architecture and Graphics acceptance. Work Item 1 is implemented and regression-covered; its final consolidated acceptance belongs in Work Item 6.
- Work Item 6 — Final Feature 2 validation and milestone acceptance: **not started**.
- The milestone is not yet formally closed: **NexaFlow Workspace Foundation Complete** remains the next decision gate.
- Persistent CRM Leads and a server-backed CRM home/dashboard already exist. Some later dashboard capability cards are explicitly labelled sample/demo data.

## Read in this order

1. [`PROJECT-STATUS.md`](PROJECT-STATUS.md) — concise status, boundaries, decisions, and next action.
2. [`architecture-handover.md`](architecture-handover.md) — authoritative Workspace security and data contract.
3. [`engineering-handover.md`](engineering-handover.md) — implementation inventory, local setup, migrations, tests, and worktree safety.
4. [`design-product-handover.md`](design-product-handover.md) — accepted UX direction, screen inventory, accessibility, and design debt.
5. [`CONTINUATION-PROMPT.md`](CONTINUATION-PROMPT.md) — reusable prompt for a new ChatGPT/Codex session.

## Immediate next action

Obtain Product authorization, then execute **Feature 2 Work Item 6 — Final validation / acceptance**. It should consolidate evidence and close only real gaps across membership lifecycle, role authority, stale-state handling, server-controlled Workspace selection, audit, accessibility, concurrency, tenant isolation, browser journeys, and regressions.

Do not begin Feature 3 until Feature 2 and the **NexaFlow Workspace Foundation Complete** milestone are formally accepted.

## Non-negotiable platform rule

Every future Workspace-scoped capability inherits the same sequence:

1. Resource belongs to a Workspace.
2. User has an active Membership.
3. Active Workspace is validated in trusted server/Session context.
4. RBAC determines action permission.
5. Ownership, Team, and Visibility determine record access.
6. Significant mutations and security-relevant denials are audited.
7. Package Entitlement determines capability availability.

No downstream feature may create a separate tenant, ownership, access, audit, or entitlement model.

## Critical worktree warning

The working tree contains substantial tracked modifications and untracked implementation, migrations, tests, and documentation. The working tree—not the current Git `HEAD`—is the authoritative project state at handover.

Do not run destructive cleanup, reset, checkout, rebase, or bulk overwrite operations. Inspect `git status` first and preserve all existing changes.

## Source-of-truth evidence

- [`feature-2-audit-completion-checkpoint.md`](../engineering/feature-2-audit-completion-checkpoint.md)
- [`feature-2-work-item-5-audit-review.md`](../architecture/feature-2-work-item-5-audit-review.md)
- [`feature-2-work-item-5-ux-review.md`](../design/feature-2-work-item-5-ux-review.md)
- [`workspace-foundation-direction.md`](../architecture/workspace-foundation-direction.md)
- [`feature-2-implementation-checklist.md`](../product/feature-2-implementation-checklist.md)
