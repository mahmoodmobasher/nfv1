# Continuation prompt for a new ChatGPT/Codex session

Copy the text below into the first message of the new session.

---

You are continuing the NexaFlow CRM project in `/Users/moemahmood/builder_code/Nexflow_v1`.

Before taking action, read these files completely:

1. `docs/handover/README.md`
2. `docs/handover/PROJECT-STATUS.md`
3. `docs/handover/architecture-handover.md`
4. `docs/handover/engineering-handover.md`
5. `docs/handover/design-product-handover.md`
6. `docs/product/feature-2-implementation-checklist.md`
7. `AGENTS.md`

Treat repository documents and the current working tree as the durable project state. The worktree is materially dirty and contains uncommitted tracked and untracked implementation. Do not reset, clean, checkout, rebase, delete, or overwrite existing work.

Current delivery status:

- Feature 1 is accepted and complete.
- Feature 2 Work Items 1–5 are implemented.
- WI2–WI5 have explicit Architecture and Graphics acceptance; WI1 is implemented and regression-covered.
- WI6 final integrated validation has not started.
- The “NexaFlow Workspace Foundation Complete” milestone is pending WI6 and formal Product acceptance.
- Persistent CRM Leads and a server-backed dashboard already exist; later capability previews must remain clearly marked sample data.

Immediate objective:

First obtain explicit Product authorization for Feature 2 Work Item 6. Once authorized, define and execute it as a bounded final validation and acceptance gate. Consolidate evidence across Membership lifecycle, authority-aware Roles, stale-data handling, server-controlled Active Workspace selection, Audit, Entitlements, accessibility, concurrency, tenant isolation, browser journeys, and regression suites. Fix only genuine acceptance blockers. Do not start Feature 3 or expand the foundation speculatively.

Shared platform rule:

Every Workspace-scoped capability must inherit Workspace ownership, active Membership, trusted server/Session Active Workspace context, RBAC, Ownership/Team/Visibility record access, Audit, and package Entitlement. No downstream feature may invent a separate security or tenancy model.

Working model:

- Product/root coordinates scope and acceptance; it does not write application code.
- Develop owns all coding, database work, migrations, and test repairs.
- Architect reviews security, data integrity, tenancy, and contracts without coding.
- Graphics reviews UX, accessibility, responsive behavior, and truthful states without coding.
- Use the visible project chats for assignments and status communication.
- Keep all work local; do not configure real providers, deploy infrastructure, or use production credentials unless separately authorized.

First report back with: repository/worktree status, local service health, whether the recorded evidence is reproducible, the exact proposed WI6 test matrix, and any material blocker. Then proceed only within the authorized WI6 boundary.

---
