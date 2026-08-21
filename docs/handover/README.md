# NexaFlow project handover — start here

Handover date: 2026-08-21
Project directory: `/Users/moemahmood/builder_code/Nexflow_v1`
Purpose: enable a new project owner or ChatGPT/Codex session to continue without relying on prior chat history.

## Current position

- Feature 1 — Account onboarding and Workspace provisioning: **accepted / complete**.
- Feature 2 — User, Role, Membership, Workspace context, and Audit: **accepted / complete**.
- Work Items 1–5 are complete; Work Item 6 was completed through the integrated release gate.
- **NexaFlow Workspace Foundation Complete** is accepted and deployed to UAT.
- Current UAT application authority: commit `3f7fc1d5a4c6f4206bf3f9c1d13a3115952a157e`, tag `v0.2.1-uat.2`, at `https://app.nexaflowsystems.com`.
- Resend is the active UAT transactional-email provider. Mailpit is the local-development adapter only.
- Accepted Resend deployment/review evidence was published in documentation commit `3c4bfc28fbb333fca83b02ae8393da75e7eafcb2`.
- Persistent CRM Leads and a server-backed CRM home/dashboard already exist. Some later dashboard capability cards are explicitly labelled sample/demo data.

## Read in this order

1. [`PROJECT-STATUS.md`](PROJECT-STATUS.md) — concise status, boundaries, decisions, and next action.
2. [`architecture-handover.md`](architecture-handover.md) — authoritative Workspace security and data contract.
3. [`engineering-handover.md`](engineering-handover.md) — implementation inventory, local setup, migrations, tests, and worktree safety.
4. [`design-product-handover.md`](design-product-handover.md) — accepted UX direction, screen inventory, accessibility, and design debt.
5. [`CONTINUATION-PROMPT.md`](CONTINUATION-PROMPT.md) — reusable prompt for a new ChatGPT/Codex session.

## Immediate next action

Select and authorize the next vertical product feature. The roadmap currently places **Feature 3 — Personal Profile, Preferences & Account Security** next.

Do not reopen or refactor the Workspace Foundation speculatively. Reopen it only when a real downstream vertical proves a concrete gap.

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

The application release and accepted Resend deployment/review documentation are committed and pushed. The worktree was clean at the start of this master-index correction and must be clean again after its documentation-only publication.

Do not run destructive cleanup, reset, checkout, rebase, or bulk overwrite operations. Inspect `git status` first and preserve all existing changes.

## Source-of-truth evidence

- [`feature-2-audit-completion-checkpoint.md`](../engineering/feature-2-audit-completion-checkpoint.md)
- [`feature-2-work-item-5-audit-review.md`](../architecture/feature-2-work-item-5-audit-review.md)
- [`feature-2-work-item-5-ux-review.md`](../design/feature-2-work-item-5-ux-review.md)
- [`workspace-foundation-direction.md`](../architecture/workspace-foundation-direction.md)
- [`feature-2-implementation-checklist.md`](../product/feature-2-implementation-checklist.md)
- [`feature-1-2-deployment-result.md`](../release/feature-1-2-deployment-result.md)
- [`feature-1-2-architecture-deployment-review.md`](../release/feature-1-2-architecture-deployment-review.md)
- [`feature-1-2-ux-deployment-review.md`](../release/feature-1-2-ux-deployment-review.md)
- [`resend-email-release-readiness.md`](../release/resend-email-release-readiness.md)
- [`resend-email-deployment-result.md`](../release/resend-email-deployment-result.md)
- [`resend-email-architecture-review.md`](../release/resend-email-architecture-review.md)
- [`resend-transactional-email-ux-review.md`](../design/resend-transactional-email-ux-review.md)
