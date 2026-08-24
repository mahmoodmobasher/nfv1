<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:nexaflow-development-contract -->

# NexaFlow development contract

Before changing application code, read and follow:

- `docs/architecture/modular-development-guidelines.md`
- `docs/architecture/workspace-foundation-direction.md`
- the accepted Architecture contract for the feature being changed

Develop vertically by business capability, preserve one-way dependency and transaction boundaries, and do not introduce speculative layers, repositories, interfaces, packages, or services. Every Workspace-scoped change must preserve trusted active Workspace context, active Membership, RBAC, Ownership/Team/Visibility access, Audit, and Entitlements.

Implementation handoffs and reviews must include the modular-development checklist. An exception requires an explicit explanation in the handoff and Architecture approval when it changes an accepted boundary.

<!-- END:nexaflow-development-contract -->
