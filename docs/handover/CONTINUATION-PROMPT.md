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

Treat repository documents and Git history as the durable project state. Inspect `git status` before acting and preserve any post-deployment documentation updates.

Current delivery status:

- Feature 1 is accepted and complete.
- Feature 2 Work Items 1–6 are complete and accepted for the UAT milestone.
- “NexaFlow Workspace Foundation Complete” is accepted by Architecture and Graphics.
- Final deployed application commit is `6393f4f`, tag `v0.2.1-uat.1`, at `https://app.nexaflowsystems.com`.
- All 11 migrations and the primary onboarding, Workspace, administration, tenant-denial, CRM, email/outbox, audit, and logout smoke passed.
- Persistent CRM Leads and a server-backed dashboard already exist; later capability previews must remain clearly marked sample data.

Immediate objective:

Review the final handover and deployment evidence, then propose the next vertical feature for explicit Product authorization. The roadmap currently places Feature 3 — Personal Profile, Preferences & Account Security next. Do not reopen the Workspace Foundation speculatively; change it only when a real downstream vertical exposes a concrete gap.

Shared platform rule:

Every Workspace-scoped capability must inherit Workspace ownership, active Membership, trusted server/Session Active Workspace context, RBAC, Ownership/Team/Visibility record access, Audit, and package Entitlement. No downstream feature may invent a separate security or tenancy model.

Working model:

- Product/root coordinates scope and acceptance; it does not write application code.
- Develop owns all coding, database work, migrations, and test repairs.
- Architect reviews security, data integrity, tenancy, and contracts without coding.
- Graphics reviews UX, accessibility, responsive behavior, and truthful states without coding.
- Use the visible project chats for assignments and status communication.
- Resend is active in UAT under protected verified-domain configuration. Provider health passed without sending email. Do not run registration/recovery/invitation delivery proof until the user supplies an explicitly approved real inbox; never expose credentials, tokens, links, or message bodies.

First report back with: repository/worktree status, deployed UAT identity and health, the proposed next vertical and its inherited Workspace contract, and any material blocker. Then proceed only after that vertical is explicitly authorized.

---
