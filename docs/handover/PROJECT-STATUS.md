# NexaFlow project status at transition

Status date: 2026-08-21

Current UAT authority: application commit `3f7fc1d5a4c6f4206bf3f9c1d13a3115952a157e`, tag `v0.2.1-uat.2`, at `https://app.nexaflowsystems.com`. Resend is active in UAT; Mailpit is local-development only. The final audit observed public readiness HTTP 200 with `{"status":"ready"}` and `Cache-Control: no-store`.

## Delivery ledger

| Area | State | Meaning |
| --- | --- | --- |
| Imported website baseline | Complete | Original marketing baseline was selectively imported; unrelated legacy projects and generated files were excluded. |
| Feature 1 — onboarding/provisioning | Accepted and deployed | Registration, verification, login/recovery, package persistence, atomic Workspace creation, initial Owner, Session protection, and CRM entry passed local release and final UAT smoke. |
| Feature 2 WI1 — Membership lifecycle | Accepted | Suspend, restore, remove, protections, confirmations, enforcement, audit, and integrated regressions passed. |
| Feature 2 WI2 — Authority-aware roles | Accepted | Server-derived authority, generic Owner exclusion, dedicated transfer, concurrency, and denial controls passed. |
| Feature 2 WI3 — Stale-data handling | Accepted | Expected-version conflicts and server-authoritative reconciliation passed. |
| Feature 2 WI4 — Workspace selection | Accepted | Trusted Session Workspace context, explicit switching, stale denial, tenant enforcement, and ready-page recovery passed. |
| Feature 2 WI5 — Audit completion | Accepted | Canonical, transactional, correlated, non-duplicative success and denial evidence passed Architecture and Graphics gates. |
| Feature 2 WI6 — Final validation | Complete | Integrated release gate passed unit/routes 41/41, PostgreSQL 111/111, Playwright 25/25, migrations, lint, type, build, Compose, image, and UAT smoke. |
| Workspace Foundation milestone | Accepted and deployed | Architecture and Graphics accepted the local and deployed UAT candidate. |
| Transactional email provider | Accepted and deployed | Resend is active in UAT under a restricted verified-domain key; approved-recipient registration, verification rotation, recovery, and invitation journeys passed. Local development remains Mailpit. |
| CRM Leads/core | Implemented and deployed to UAT | Persistent Leads, stages/status, owner/Team/Workspace visibility, notes/activities, search/list/detail/create/edit, and dashboard aggregates exist; persistent Lead create/read passed final UAT smoke. |
| Feature 3 — Personal profile/settings | Deferred pending Product authorization | Workspace Foundation acceptance is complete; begin only after Product approves a bounded Feature 3 contract. |
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
- Resend final regression: identity PostgreSQL **17/17**, full serialized PostgreSQL **114/114**, provider-neutral copy lint/type/build green, and approved-recipient delivery journeys passed.

These include the completed Work Item 6/release gate. Final UAT evidence is recorded in the deployment report.

## Work Item 6 disposition

Feature 2 was accepted after proving that an authorized Workspace administrator can safely manage users and memberships, a multi-Workspace user can explicitly operate in a validated active Workspace, and access decisions and material administrative outcomes use the shared foundation contract.

The completed integrated validation covered:

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
- Local email uses Mailpit. UAT uses deployed Resend under protected configuration; approved-recipient registration/verification, recovery, and invitation proof passed.
- Real Google/provider configuration, billing, retention/export, production launch, and broader production operations remain outside the UAT milestone.
- The Feature 1 + Feature 2 release gate closed the historical pre-UAT Feature 2 list for this candidate.
- No audit-history viewer exists or is required by Work Item 5.
- Workspace switcher modes and foundation refactoring must not expand speculatively.
- Personal settings remain separate from Workspace administration.
- Generalized email deliverability and asynchronous bounce/complaint reconciliation, real Google OIDC, billing/package changes, Audit retention/export, production monitoring/backup policy, and production launch remain separately authorized production work. They do not reopen the closed UAT gates.

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
- Inspect `git status`; preserve any post-deployment documentation updates.
- Confirm local services and database health.
- Review the final Feature 2 release and deployment reviews.
- Treat Feature 1, Feature 2, WI6, Workspace Foundation, and the UAT Resend delivery gate as closed. Current UAT application tag is `v0.2.1-uat.2`.
- Have Develop own all coding; Architecture and Graphics provide independent bounded reviews.
- Record all new evidence under `docs/` so future sessions do not depend on chat history.
