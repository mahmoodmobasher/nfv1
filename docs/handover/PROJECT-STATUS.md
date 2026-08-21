# NexaFlow project status at transition

Status date: 2026-08-21

## Delivery ledger

| Area | State | Meaning |
| --- | --- | --- |
| Imported website baseline | Complete | Original marketing baseline was selectively imported; unrelated legacy projects and generated files were excluded. |
| Feature 1 — onboarding/provisioning | Accepted | Registration, verification, login/recovery, package persistence, atomic Workspace creation, initial Owner, Session protection, and CRM entry are established locally. |
| Feature 2 WI1 — Membership lifecycle | Implemented and regression-covered | Suspend, restore, remove, protections, confirmations, enforcement, and audit are present. Consolidate in WI6. |
| Feature 2 WI2 — Authority-aware roles | Accepted | Server-derived authority, generic Owner exclusion, dedicated transfer, concurrency, and denial controls passed. |
| Feature 2 WI3 — Stale-data handling | Accepted | Expected-version conflicts and server-authoritative reconciliation passed. |
| Feature 2 WI4 — Workspace selection | Accepted | Trusted Session Workspace context, explicit switching, stale denial, tenant enforcement, and ready-page recovery passed. |
| Feature 2 WI5 — Audit completion | Accepted | Canonical, transactional, correlated, non-duplicative success and denial evidence passed Architecture and Graphics gates. |
| Feature 2 WI6 — Final validation | Not started | Next required Product decision gate; obtain explicit authorization before execution. It must produce the final integrated acceptance decision. |
| Workspace Foundation milestone | Pending | Close only after WI6 and formal Product acceptance. |
| CRM Leads/core | Implemented locally | Persistent Leads, stages/status, owner/Team/Workspace visibility, notes/activities, search/list/detail/create/edit, and dashboard aggregates exist. |
| Feature 3 — Personal profile/settings | Deferred | Do not start before Workspace Foundation acceptance. |
| Later verticals | Deferred | Companies/Contacts, Deals, Projects, Communications, and later capabilities must inherit the foundation contract. |

## Latest recorded green evidence

- Audit unit suite: 3/3.
- Focused audit PostgreSQL suite: 5/5.
- Full PostgreSQL integration suite: 111/111.
- Focused Feature 2 browser regressions: 9/9.
- Complete Playwright release gate: 25/25 across 6 files.
- Unit/direct-route suite: 41/41.
- ESLint, TypeScript, and production build: passed.
- Next.js production build recorded 32 static pages plus dynamic routes.
- Fresh migration plus rerun, database health, UAT Compose rendering, and a local non-root production image build passed.

These are durable release-candidate results, not a substitute for Product authorization and consolidated Work Item 6 acceptance.

## What Work Item 6 must decide

Feature 2 is accepted when an authorized Workspace administrator can safely manage users and memberships, a multi-Workspace user can explicitly operate in a validated active Workspace, and every access decision and material administrative outcome consistently uses the shared foundation contract.

The integrated validation must cover:

- invitation and Membership lifecycle;
- Owner/Admin/Member authority and last-Owner protection;
- stale and concurrent mutation handling;
- multi-Workspace selection, two-tab reconciliation, login/resume, and stale options;
- direct route/API tenant isolation and active-Workspace enforcement;
- transactional and non-duplicative audit evidence for success and denial;
- entitlement/seat enforcement;
- accessibility, keyboard use, 320px, and 200% zoom;
- unit, PostgreSQL, browser, lint, TypeScript, and production-build regressions.

Architecture blocks local delivery only for material risks: cross-tenant access or mutation; authentication/Session bypass; Active Workspace override or stale tenant authority; loss of the last Owner; privilege escalation through Role, ownership, Team, visibility, or entitlement bypass; secret or prohibited personal-data disclosure; irreversible/non-atomic core-data corruption; materially false or duplicate Audit evidence; or a broken primary journey.

## Known boundaries and deferred work

- Local Google/OIDC is a fixture adapter, not production Google.
- Local email uses Mailpit; production transactional email is undecided.
- Production domain/HTTPS, provider configuration, billing, retention/export, production deployment hardening, and broader operations remain outside the local milestone. Existing deployment evidence does not close those Architecture readiness gates.
- The historical pre-UAT list still requires explicit Architecture disposition. Fresh release evidence now covers fixture-OIDC recent-auth and a clean 25/25 full Playwright run; Owner-transfer response-loss replay, exhaustive route-level denial auditing, destination rate-limit refinement, and any remaining invitation-administration hardening must not be assumed closed without review.
- No audit-history viewer exists or is required by Work Item 5.
- Workspace switcher modes and foundation refactoring must not expand speculatively.
- Personal settings remain separate from Workspace administration.

## Local start summary

Full instructions are in [`engineering-handover.md`](engineering-handover.md). The normal local sequence is:

```text
npm ci
npm run local:up
npm run db:migrate
npm run db:health
npm run dev -- --hostname 127.0.0.1
```

Do not use `npm run local:reset` unless destruction of the disposable local database is explicitly intended.

## First-session checklist

- Read every document in the handover index.
- Read `AGENTS.md` and relevant bundled Next.js documentation before any application-code change.
- Inspect `git status`; preserve the dirty worktree.
- Confirm local services and database health.
- Review the Feature 2 implementation checklist and WI2–WI5 accepted reviews.
- Define WI6 as evidence consolidation and bounded gap closure, not a new feature.
- Have Develop own all coding; Architecture and Graphics provide independent bounded reviews.
- Record all new evidence under `docs/` so future sessions do not depend on chat history.
