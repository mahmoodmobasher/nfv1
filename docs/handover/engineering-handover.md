# NexaFlow engineering transition handover

Handover date: 2026-08-21

Workspace: `/Users/moemahmood/builder_code/Nexflow_v1`

Branch observed at update: `main`

Observed HEAD: `d005d52772ad49268b87dce1c01004a8859825f1` (`Document Feature 1 and Feature 2 UAT deployment`)

Final deployed application commit: `c1125ba7c7b5bc075b89003eb0ecc9840665b5e1` (`v0.2.0-rc.2`)

Scope of this update: documentation only; no application code, Git publication, or external system was changed during this handover update.

## 1. Status vocabulary

This handover uses the following terms deliberately:

- **Complete:** implementation and its recorded checks are complete for the bounded work item.
- **Accepted:** the responsible Product, Architecture, or Graphics gate explicitly records acceptance.
- **Deferred:** intentionally outside the current gate and still required only when its later gate is authorized.
- **Unverified:** implemented or documented, but not freshly or comprehensively validated at this transition boundary.

Do not infer overall Feature acceptance from an individual work-item acceptance.

## 2. Executive state

- **Feature 1 is accepted, complete, published, and deployed to UAT.** It includes password identity, local fixture OIDC as a test adapter, onboarding plan persistence, atomic Workspace provisioning, initial Owner assignment, Session-backed authentication, and protected CRM entry. Public UAT keeps fixture OIDC disabled.
- **Feature 2 and the NexaFlow Workspace Foundation milestone are accepted, published, and deployed to UAT.** WI1–WI5 implementation plus the WI6 integrated release validation are complete. Architecture accepted the local release candidate and the Workspace Foundation milestone, and Architecture and Graphics both accepted the final UAT deployment. See the release and post-deployment reviews linked below.
- **The current local CRM includes persistent Leads and a server-backed dashboard.** Leads, pipeline stages/status movement, owner/Team/Workspace visibility, notes/activity, list/search/detail/create/edit, and CRM home aggregates are implemented. Deals, conversion, projects, delivery, and reporting dashboard values remain isolated labelled sample/demo data where shown.
- **Workspace Foundation is the shared platform contract.** All future Workspace-scoped verticals inherit the same tenant, active Membership, server-selected Workspace, RBAC, ownership/Team/visibility, audit, and entitlement chain. See [`docs/architecture/workspace-foundation-direction.md`](../architecture/workspace-foundation-direction.md).
- **Local release verification is green:** unit/direct-route 41/41, live PostgreSQL 111/111, full Playwright 25/25, ESLint clean, TypeScript/Next.js production build clean, fresh migration/rerun clean, and local database health healthy. See [`feature-1-2-release-readiness.md`](../release/feature-1-2-release-readiness.md).
- **The final UAT release is live and accepted:** `https://app.nexaflowsystems.com` serves `v0.2.0-rc.2`; all 11 migrations are applied; PostgreSQL, app, Caddy, Mailpit, and worker were healthy; and the post-deployment password/onboarding/Workspace/CRM/administration/logout smoke passed. See [`feature-1-2-deployment-result.md`](../release/feature-1-2-deployment-result.md).
- **The application release is committed and pushed.** Current uncommitted work is documentation-only from the coordinated post-deployment handover/review pass. Preserve those shared documentation edits and do not reset or clean the worktree.

## 3. Current implemented system

### Identity and Session foundation

- Password registration, email verification, verification resend, login, logout, password reset request/completion, and Session inspection.
- Argon2id password hashing and server-side password policy.
- Opaque PostgreSQL Sessions with idle and absolute expiry, bounded touch, rotation/revocation, security-version checks, current/all-device logout, and reset-driven revocation.
- CSRF plus Origin/Referer mutation protection and explicit trusted-proxy handling.
- PostgreSQL rate limiting, safe audit events, transactional outbox, Mailpit email adapter, and lease/fencing worker behavior.
- Local fixture OIDC implements the provider-adapter contract and recent-auth fixture path. It is forbidden in production mode and is not real Google.

Primary code: `src/server/identity`, `src/server/security`, `src/server/email`, `src/app/api/auth`.

### Onboarding and Workspace provisioning

- Registration creates identity/onboarding state only; it does not create a Workspace, Role, Membership, entitlement, or trial.
- Plan and cadence are persisted server-side and validated against the active, versioned plan catalog.
- Explicit authenticated Workspace creation atomically creates the Workspace, three Workspace-local Role definitions, exactly one initial active Owner Membership, default pipeline stages, entitlement snapshot/trial, onboarding completion, audit/outbox records, Session active Workspace selection, and idempotency outcome.
- Replay, conflict, concurrent submission, and injected failure rollback are tested.

Primary code: `src/server/workspaces/provision.ts`, `src/app/api/workspaces/route.ts`, `src/app/onboarding`, and Workspace create/ready pages.

Evidence: [`workspace-provisioning-validation.md`](../engineering/workspace-provisioning-validation.md), [`onboarding-workspace-boundary-validation.md`](../engineering/onboarding-workspace-boundary-validation.md), and [`local-login-validation.md`](../engineering/local-login-validation.md).

### Workspace administration and Feature 2 foundation

- Invitation create/resend/revoke/accept with hashed single-use tokens, invited verified-email proof, seat enforcement, Team assignment, outbox, audit, idempotency, replay and race handling.
- Existing active Membership acceptance preserves Role, status, Teams, identity, and version; suspended/removed reactivation enforces seat capacity atomically.
- Fixed Workspace-local Roles: `owner`, `admin`, `member`.
- Server-derived role ceilings and capabilities; generic endpoints cannot assign Owner.
- Membership suspend, restore, remove, Role change, Team assignment, and dedicated recent-authenticated Owner transfer with last-Owner and concurrency protection.
- Expected-version conflict handling and immediate server-authoritative UI reconciliation.
- Server-owned `sessions.active_workspace_id`, selectable Workspace list, explicit Session-rotating switch, exactly-one Membership bootstrap, multi-Membership selection requirement, two-tab reconciliation, and tenant-safe stale-option denial.
- Canonical transactional audit taxonomy and runtime-safe metadata/state allowlists.

Primary code: `src/server/tenant-admin`, `src/server/workspaces/selection.ts`, Workspace-scoped APIs, `src/app/workspace/settings`, and `src/app/workspace/switch`.

### CRM core and dashboard

- Persistent Workspace-scoped Leads with versioned create/edit/stage/status transitions.
- Owner assignment, optional Team visibility, and visibility modes enforced under persisted current actor authority.
- Member visibility union: Workspace-visible, personally owned, or current active-Team-visible records; Owner/Admin can access all current-Workspace Leads.
- Tenant-safe not-found behavior, current visibility revalidation inside update transactions, aggregate rollback, and activity creation.
- Lead list/search, detail, create/edit, pipeline overview, structured activity timeline, and notes with loading/success/failure/retry UI.
- CRM home uses real scoped Lead/pipeline/ownership/Team/activity aggregates. Unimplemented deals/conversion/projects/delivery/reporting sections use isolated labelled sample/demo values only and are not persisted or treated as authority.

Primary code: `src/server/crm`, `src/app/crm`, and Workspace Lead APIs.

Evidence: [`delivery-scope-reset-checkpoint.md`](../engineering/delivery-scope-reset-checkpoint.md), [`crm-core-delivery-review.md`](../architecture/crm-core-delivery-review.md), and [`crm-home-dashboard-checkpoint.md`](../engineering/crm-home-dashboard-checkpoint.md).

## 4. Route inventory

### User-facing routes

| Area | Routes |
| --- | --- |
| Public/identity | `/`, `/select-plan`, `/register`, `/verify-email`, `/login`, `/forgot-password`, `/reset-password`, `/invite` |
| Workspace onboarding | `/workspace/create`, `/workspace/ready`, `/workspace/invitations/accept` |
| Workspace administration | `/workspace/settings`, `/workspace/settings/people`, `/workspace/settings/invitations`, `/workspace/settings/invite`, `/workspace/settings/teams`, `/workspace/settings/transfer-ownership` |
| Workspace selection | `/workspace/switch` |
| CRM | `/crm`, `/crm/home`, `/crm/pipeline`, `/crm/leads/new`, `/crm/leads/[leadId]` |

### API route groups

| Group | Implemented endpoints |
| --- | --- |
| Identity | CSRF, register, verify, resend verification, login, logout, Session, password reset request/completion |
| Local OIDC fixture | start, callback, fixture endpoint, recent-auth start/callback |
| Health | `/api/health/live`, `/api/health/ready` |
| Onboarding | persisted plan/cadence selection |
| Workspace | provisioning, selectable Workspaces, Session-scoped switch |
| Invitations | list/create, resend, revoke, authenticated accept |
| People/Membership | people read, Membership Role/status mutation, Membership Team assignment |
| Ownership/RBAC | dedicated ownership transfer, Role policy mutation |
| Teams/settings | Team list/create/change, Workspace settings mutation |
| CRM | Lead list/create, Lead detail/update, Lead activities |

The exact source inventory is under `src/app/**/page.tsx` and `src/app/api/**/route.ts`. Every Workspace-scoped API must continue to use the centralized selected-Workspace boundary; a route/body Workspace ID cannot establish authority.

## 5. Server module inventory

| Module | Responsibility |
| --- | --- |
| `src/server/env.ts` | Typed server-only environment validation and local defaults |
| `src/server/http.ts` | Database creation, mutation guard, trusted proxy/network context, Session cookie extraction |
| `src/server/security/*` | password, crypto, Session, request protection, rate limit, canonical audit writer |
| `src/server/identity/*` | password identity flows and local OIDC fixture |
| `src/server/email/*` | adapter, Mailpit transport, outbox leasing/fencing, worker |
| `src/server/db/*` | Drizzle schema, migration runner, health/readiness, transaction and repository foundations |
| `src/server/authz/context.ts` | typed Workspace authorization context |
| `src/server/workspaces/*` | provisioning, ownership protections, active Workspace selection |
| `src/server/tenant-admin/*` | permissions, invitations, Membership/Role/Team/settings administration, pagination/cursors, denials/read models |
| `src/server/crm/*` | CRM tenant/page context, Leads, dashboard aggregates and safe links |

## 6. Local runtime setup

### Prerequisites

- Node.js 20.9 or later; recorded local baseline used Node `22.23.2` and npm `10.9.8`.
- Docker Engine with Compose support.
- Ports available on loopback: `3000`, `54329`, `1025`, and `8025`.

The root `README.md` currently describes an older marketing-only port-3001 workflow and says no environment variables are required. **That README is stale for the current full-stack application and must not be used as the authoritative runbook.** Use this handover, `package.json`, `.env.example`, and the engineering checkpoints.

### Install and start

```bash
cd /Users/moemahmood/builder_code/Nexflow_v1
npm ci
cp .env.example .env.local
npm run local:up
npm run db:migrate
npm run db:health
npm run dev -- --hostname 127.0.0.1
```

Local endpoints:

- App: `http://127.0.0.1:3000`
- PostgreSQL: `127.0.0.1:54329`
- Mailpit SMTP: `127.0.0.1:1025`
- Mailpit UI: `http://127.0.0.1:8025`

For email delivery testing, run the worker separately:

```bash
npm run email:worker:continuous
```

One-shot worker execution is `npm run email:worker`.

### Local Compose lifecycle

```bash
npm run local:up
docker compose -f docker-compose.local.yml ps
npm run local:down
```

`npm run local:reset` destroys the disposable local Compose volume before starting clean services. It is destructive to the local Docker database and must be used only when that loss is explicitly intended. Never use the local reset command against UAT or any non-disposable environment.

PostgreSQL, SMTP, and Mailpit UI are explicitly bound to `127.0.0.1` in `docker-compose.local.yml`.

## 7. Verification commands

```bash
# Provider-independent unit and direct-route tests
npm test

# All live PostgreSQL suites; requires local PostgreSQL
npm run test:integration

# Browser journeys; starts/reuses the local Next app on 127.0.0.1:3000
npm run test:e2e

# Static validation
npm run lint
npx tsc --noEmit
npm run build

# Persistence validation
npm run db:migrate
npm run db:health
npx drizzle-kit check
```

Important testing behavior:

- `npm test` intentionally skips files gated by `RUN_DB_INTEGRATION=1`.
- `npm run test:integration` is the authoritative live PostgreSQL command and forces one worker/no file parallelism because suites reset shared database tables.
- Do not run live PostgreSQL integration and Playwright suites concurrently against the same database; both create and clear fixtures.
- `npx tsc --noEmit` may report missing `.next/types` files if a stale/partial `.next` directory exists. `npm run build` regenerates Next route types and includes TypeScript validation.
- Playwright uses one worker and `http://127.0.0.1:3000`; see `playwright.config.ts`.

## 8. Database schema and migrations

### Current checked-in migration state

- Drizzle journal version: `7`, PostgreSQL dialect.
- **11 migration entries/files**, `0000_wet_ikaris` through `0010_ambiguous_terrax`.
- Latest migrations:
  - `0007`: tenant administration, invitations, Teams, Team Memberships, policy/version constraints and related audit/outbox changes;
  - `0008`: persistent CRM Leads, visibility Teams, pipeline stages, and Lead activities;
  - `0009`: nullable Session-owned `active_workspace_id` foreign key;
  - `0010`: audit metadata allowlist extension for Workspace-selection events.
- Latest WI4 evidence records migration application and immediate rerun as passed. The Drizzle ledger makes the migration command safe to rerun. This does not claim the raw SQL files are independently idempotent when executed manually.

### Current schema entities

`users`, `identity_credentials`, `workspaces`, `roles`, `workspace_memberships`, `teams`, `team_memberships`, `workspace_invitations`, `workspace_invitation_teams`, `pipeline_stages`, `leads`, `lead_visible_teams`, `lead_activities`, `onboarding_progress`, `plan_catalog_entries`, `workspace_entitlement_snapshots`, `sessions`, `identity_tokens`, `oidc_transactions`, `rate_limit_windows`, `idempotency_records`, `outbox_messages`, and `audit_events`.

The source of truth is `src/server/db/schema.ts`; migration history is `src/server/db/migrations` and `src/server/db/migrations/meta/_journal.json`.

Do not generate or amend migrations casually while coordinated documentation changes are uncommitted. For a future authorized schema change, first return to a reviewed source state, inspect existing migration history, update `schema.ts`, generate one additive migration, review SQL and metadata, apply to an empty/disposable database, rerun through the ledger, and execute the complete integration suite.

## 9. Feature status

### Feature 1 — identity, onboarding, provisioning, CRM tenant entry

**Status: Product-accepted and complete.**

Proven behavior includes real local password registration/verification/login, safe rejection paths, explicit Workspace creation, exactly one initial Owner Membership, entitlement/trial attachment, atomic rollback, concurrency/idempotency, protected CRM access, refresh, logout, and re-login.

Non-blocking follow-ons from the Product contract:

1. Workspace switcher — **complete in Feature 2 WI4**.
2. Post-provision plan changes — **deferred** to billing/entitlements.
3. Real Google OIDC — **deferred** to provider/domain readiness; fixture remains local/non-production.
4. Better suspended-access copy — safe distinct access denial exists; final Product copy polish is **not separately verified as accepted**.

The earlier local observation that browser Back could briefly restore a cached `/workspace/ready` view did not reproduce as Session reuse in the final public UAT smoke. The deployed rc.2 journey proved server logout, Back protection, direct `/crm` protection, and successful login after logout. Keep the historical local observation in [`local-login-validation.md`](../engineering/local-login-validation.md), but use the newer deployment result as the current release evidence.

### Feature 2 — User, Role & Membership Management

Overall status: **accepted, complete, published, and deployed to UAT as part of the NexaFlow Workspace Foundation milestone.**

| Work item | Implementation | Verification/gate status |
| --- | --- | --- |
| WI1 Membership lifecycle | **Complete** | Unit, PostgreSQL, focused browser, lint/build and integrated release evidence recorded; retained by the full WI6/release regressions. |
| WI2 Authority-aware Role controls | **Complete** | **Architecture ACCEPT; Graphics ACCEPT.** Persisted actor/target authority, Role ceilings, generic Owner prohibition, confirmation and stale-authority UX proven. |
| WI3 Stale-data handling | **Complete** | **Architecture ACCEPT; Graphics ACCEPT.** Expected versions, no optimistic authority, reload/retry, stale actor/target and concurrent edit behavior proven. |
| WI4 Server-controlled Workspace selection | **Complete** | **Architecture ACCEPT; Graphics ACCEPT.** WI4-01 ready/create loop is closed. Session-owned selection, exact-one bootstrap, explicit multi-Workspace chooser, rotation/recovery, tenant scoping, two tabs and mobile UX proven. |
| WI5 Audit completion | **Complete** | **Architecture ACCEPT; Graphics ACCEPT.** Canonical taxonomy, transactional success, one-owner denial boundary, safe attribution/payloads, replay/concurrency and authenticated request-boundary denial evidence proven. No audit-history UI was required. |
| WI6 Final validation | **Complete** | Release gate passed unit/routes **41/41**, PostgreSQL **111/111**, Playwright **25/25**, migrations/rerun/health, lint, TypeScript, build, Compose/image, staged inventory and secret checks; the final UAT browser smoke also passed. |

Source contracts and gates:

- [`feature-2-user-role-membership-contract.md`](../architecture/feature-2-user-role-membership-contract.md)
- [`feature-2-implementation-checklist.md`](../product/feature-2-implementation-checklist.md)
- [`feature-2-work-item-2-review.md`](../architecture/feature-2-work-item-2-review.md)
- [`feature-2-work-item-3-review.md`](../architecture/feature-2-work-item-3-review.md)
- [`feature-2-work-item-4-review.md`](../architecture/feature-2-work-item-4-review.md)
- [`feature-2-work-item-5-audit-review.md`](../architecture/feature-2-work-item-5-audit-review.md)
- Graphics reviews under `docs/design/feature-2-work-item-*-ux-review.md`.
- [`feature-1-2-release-readiness.md`](../release/feature-1-2-release-readiness.md)
- [`feature-1-2-architecture-release-gate.md`](../release/feature-1-2-architecture-release-gate.md)
- [`feature-1-2-ux-release-gate.md`](../release/feature-1-2-ux-release-gate.md)
- [`feature-1-2-deployment-result.md`](../release/feature-1-2-deployment-result.md)
- [`feature-1-2-architecture-deployment-review.md`](../release/feature-1-2-architecture-deployment-review.md)
- [`feature-1-2-ux-deployment-review.md`](../release/feature-1-2-ux-deployment-review.md)

## 10. Latest verified evidence

Latest release and deployment evidence on 2026-08-21:

| Check | Result |
| --- | --- |
| Unit/direct-route | **41/41 passed** across 11 files; 111 DB-gated tests skipped by design |
| Focused audit unit | **3/3 passed** |
| Focused audit PostgreSQL | **5/5 passed** |
| Complete PostgreSQL integration | **111/111 passed** across 13 files |
| Focused Feature 2 Playwright | **9/9 passed** |
| Complete Playwright | **25/25 passed** across 6 files, including the focused Feature 2 journeys |
| Database health | Healthy; release rerun recorded `{ ok: true, latencyMs: 11 }` |
| ESLint | Passed, zero warnings |
| TypeScript / Next build | Passed on Next.js 16.3.1; 32 static pages generated and dynamic routes collected |
| Production image / UAT Compose | Local non-root image build passed; UAT Compose rendering passed with safe placeholders |
| Git publication | `8f82320` published the authoritative Feature 1 + Feature 2 set to `origin/main` and tag `v0.2.0-rc.1`; `c1125ba` published the production hydration hotfix and final tag `v0.2.0-rc.2`; `d005d52` published deployment evidence |
| UAT migration state | Migration service passed twice; exactly **11** rows in `drizzle.__drizzle_migrations` |
| UAT services | PostgreSQL, application, Caddy, and private Mailpit healthy; email worker running from the final application image |
| UAT browser smoke | Password registration/verification, safe login denials, Workspace provisioning/context, refresh, CRM Lead create/read, People & Roles, invitation/private Mailpit delivery, tenant-safe 404, logout, Back/direct protection, and login-after-logout passed |
| Post-deployment reviews | **Architecture ACCEPT** and **Graphics ACCEPT**; no deployment-relevant blockers |

The Work Item 5 checkpoint remains its bounded audit acceptance record. The integrated release gate and final UAT reviews supersede older claims that WI6, Feature 2, the Workspace Foundation milestone, Git publication, or UAT deployment are still pending.

## 11. Known failures, deferred work, and unverified claims

### Resolved earlier browser-baseline debt

The four earlier stale expectations—CRM mobile trigger wording, post-join heading, native Team confirmation, and invitation resend timing—are no longer open. The 2026-08-21 release gate updated stale test assumptions, repaired the shared dialog focus race and changed-only Team saving, then passed the complete suite **25/25**. This is test and release evidence, not consolidated Product acceptance of Feature 2.

### Deferred product/provider/operations work

- Real Google OIDC and production provider credentials.
- Real outbound email/Resend integration; local Mailpit remains the development adapter.
- Post-provision package changes, billing, upgrades/downgrades, and payment behavior.
- Audit-history UI/API, retention/export, external log delivery, and broader observability.
- Feature 3 personal profile, preferences, personal security, notification, locale, and avatar work.
- Future UAT/production hardening such as an approved backup/restore and off-instance retention policy, firewall/operator policy, monitoring/alerts, external-provider readiness, and production release operations. The explicit backup waiver applied only to the completed rc.2 UAT replacement.
- Generalized downstream Companies, Contacts, Deals, Projects, Tasks, Communications, Automation, AI, Reporting, Finance, and Client Portal verticals.

### Deployment status versus local worktree

The completed Feature 1 + Feature 2 UAT release is recorded in [`feature-1-2-deployment-result.md`](../release/feature-1-2-deployment-result.md):

- Git release set commit `8f82320f6706bc95393d2a12f46403bd9846df82`, tagged `v0.2.0-rc.1`;
- production hydration hotfix commit `c1125ba7c7b5bc075b89003eb0ecc9840665b5e1`, tagged and deployed as final `v0.2.0-rc.2`;
- deployment-evidence commit `d005d52772ad49268b87dce1c01004a8859825f1`;
- UAT application `https://app.nexaflowsystems.com` on AWS Lightsail `99.79.158.110`;
- release directory `/opt/nexaflow/uat/releases/c1125ba`, with `/opt/nexaflow/uat/current` pointing to it;
- image `nexaflow:c1125ba`, digest `sha256:320715aa55983fa07e50ba71cfed9fe2dbb26080278f4caddc8f24792a96e279`;
- exactly 11 applied migrations with a successful immediate rerun;
- healthy PostgreSQL, application, Caddy, private Mailpit, and running email worker;
- public HTTPS/readiness and full post-deployment browser smoke passed.

The rc.1 process/readiness checks exposed a real-browser production hydration loop: `TitleUpdater` observed `<head>` while rewriting `document.title`, retriggering itself and preventing onboarding hydration. The bounded rc.2 hotfix updates the title once per pathname change without a self-observing `MutationObserver`; lint, unit/routes 41/41, TypeScript/build, image build, and public browser rendering passed afterward.

Public UAT uses password identity. Fixture OIDC is disabled and its public endpoints return 404. Mailpit is the intended UAT-only email mode and its UI remains loopback-only. No real Google or production transactional-email provider is configured.

The user explicitly waived backup, restore proof, and preservation of prior UAT application/database state for this release. No new backup was created. This waiver is release-specific and must not be silently carried into a future production or UAT change.

### Stale historical documents

- `README.md` is stale for the current full-stack runtime.
- Early Slice/baseline documents contain older route, migration, and test counts. Use the newest bounded checkpoint for each capability.
- Some older reviews name pre-canonical audit actions; WI5 canonicalization supersedes those names without changing accepted business semantics.
- Historical documents saying the workspace was not a Git repository, that the authoritative implementation is uncommitted, or that the current Feature 1 + Feature 2 release is not deployed are stale. The application release is committed and pushed on `main`; only coordinated documentation updates are currently uncommitted.

## 12. Environment and secret rules

- `.env.example` contains local placeholder values only. Never commit `.env`, `.env.local`, production credentials, provider secrets, private keys, tokens, database dumps, or backup keys.
- Required server configuration is validated in `src/server/env.ts`: database URL, Node environment, Session cookie/secret, SMTP host/port, application origin, Session idle/absolute/touch values, trusted-proxy mode/secret, OIDC mode/fixture secret/redirect allowlist, invitation TTL, and recent-auth window.
- Production mode rejects a loopback database, local-only Session secret text, non-HTTPS origin, fixture OIDC, and trusted-proxy mode without a sufficiently strong internal proxy secret.
- `OIDC_MODE=fixture` is local-only. UAT/production must use `disabled` until a separately approved real provider adapter/configuration exists.
- Never expose Session tokens/hashes, verification/reset/invitation tokens or hashes, passwords, cookies, authorization headers, provider assertions, raw request bodies, raw IP addresses, private contact data, or foreign-tenant facts in logs/audits/docs.
- Audit metadata and before/after state use explicit runtime and database allowlists. Preserve that boundary.
- UAT key names are documented without values in `deploy/uat/uat.env.keys`; protected host files belong outside the repository with restrictive ownership/mode.

## 13. Current Git/worktree safety

The authoritative Feature 1 + Feature 2 application, migrations, tests, contracts, and release evidence are committed and pushed on `main`. At this documentation update boundary, `HEAD` and `origin/main` were `d005d52772ad49268b87dce1c01004a8859825f1` before the coordinated final handover/review edits began. Current uncommitted changes are documentation-only and belong to multiple project chats; they must be preserved until the root/master handover and all domain reviews are reconciled for one final documentation commit.

Required handling:

1. Do not run `git reset --hard`, `git clean`, broad checkout/restore commands, destructive rebases, or mass deletion.
2. Do not assume untracked files are disposable; the post-deployment Architecture review and other coordinated handover documents may still be untracked until the final documentation commit.
3. Before editing, inspect `git status`, the relevant file, and its diff. Preserve unrelated changes.
4. Coordinate with other agents before touching shared files; all chats use the same working tree.
5. Keep generated runtime outputs such as `.next` and `test-results` out of documentation commits, but do not delete ambiguous material without explicit authorization.
6. Do not commit or push this domain update independently. Wait until root/master documents and the other domain reviews are complete, then inventory, review, and commit the final documentation set together.
7. Documentation changes do not change the deployed image. The UAT application authority remains commit `c1125ba`, tag `v0.2.0-rc.2`, and the recorded immutable image digest.

## 14. Immediate engineering next step

1. Finish the coordinated documentation-only handover reconciliation. Do not commit this domain file until the root/master handover and Architecture, Graphics, and Product domain reviews are complete.
2. Treat Feature 1, Feature 2, WI6, and **NexaFlow Workspace Foundation Complete** as closed for the deployed `v0.2.0-rc.2` UAT release. Do not reopen or refactor the foundation speculatively.
3. Wait for Product authorization and a bounded contract before beginning the next vertical. The directed sequence starts with Profile/Personal Settings, then Companies/Contacts, Leads expansion, Deals/Pipeline, Projects/Delivery, Communications, and later capabilities.
4. Every next vertical must inherit the accepted Workspace tenant, Membership, Active Workspace, RBAC, ownership/Team/visibility, Audit, and Entitlement contract. Reopen foundation code only when a real vertical proves a concrete gap.
5. Real Google OIDC, production email, billing/package changes, Audit retention/export, monitoring/backup policy, production deployment, and Feature 3 remain separately authorized work. Do not infer authorization from this UAT acceptance.

## 15. How future verticals inherit the Workspace Foundation

Every future Workspace-scoped resource must enforce this order:

1. Resource belongs to a Workspace.
2. Authenticated User has an active Membership.
3. Active Workspace is validated and stored in trusted server/Session context.
4. Persisted RBAC determines permitted actions.
5. Ownership, active Team membership, and visibility determine record access.
6. Significant mutation and security-relevant denial produce bounded Audit evidence.
7. Package Entitlement determines whether the capability is available.

Client route parameters, body IDs, query strings, cached labels, Session storage, or optimistic UI state never establish tenant, Role, ownership, Team, visibility, audit, or entitlement authority.

Apply the contract vertically:

- Deal: Workspace-scoped, owner assigned, optional Team, visibility constrained, RBAC enforced, audited, entitled.
- Project: Workspace-scoped, owner assigned, optional Team, visibility constrained, RBAC enforced, audited.
- Shared Inbox: Workspace-owned, Team-access controlled, RBAC enforced, audited.
- AI Agent: Workspace-owned, package-entitled, Role/Team constrained, unable to exceed the invoking User's effective permissions, audited.

After the Workspace Foundation milestone is accepted, do not expand or refactor it speculatively. Reopen it only when a real downstream vertical demonstrates a concrete unmet requirement. The Product-directed vertical sequence is Profile/Personal Settings, Companies/Contacts, Leads, Deals/Pipeline, Projects/Delivery, Communications, then later Automation, AI, Reporting, Finance, and Client Portal.

## 16. Primary handover references

- Platform direction: [`workspace-foundation-direction.md`](../architecture/workspace-foundation-direction.md)
- Security/data contracts: [`security-data-contracts.md`](../architecture/security-data-contracts.md)
- Feature 2 Product contract: [`feature-2-user-role-membership-contract.md`](../architecture/feature-2-user-role-membership-contract.md)
- Feature 2 checklist: [`feature-2-implementation-checklist.md`](../product/feature-2-implementation-checklist.md)
- Feature 2 journeys: [`feature-2-user-role-membership-journeys.md`](../design/feature-2-user-role-membership-journeys.md)
- Latest audit checkpoint: [`feature-2-audit-completion-checkpoint.md`](../engineering/feature-2-audit-completion-checkpoint.md)
- Workspace-selection checkpoint: [`feature-2-workspace-selection-checkpoint.md`](../engineering/feature-2-workspace-selection-checkpoint.md)
- Local login evidence: [`local-login-validation.md`](../engineering/local-login-validation.md)
- Provisioning evidence: [`workspace-provisioning-validation.md`](../engineering/workspace-provisioning-validation.md)
- CRM core review: [`crm-core-delivery-review.md`](../architecture/crm-core-delivery-review.md)
- CRM dashboard contract/checkpoint: [`crm-home-dashboard-contract.md`](../architecture/crm-home-dashboard-contract.md), [`crm-home-dashboard-checkpoint.md`](../engineering/crm-home-dashboard-checkpoint.md)
- Local/UAT packaging: [`lightsail-private-rehearsal.md`](../engineering/lightsail-private-rehearsal.md), [`lightsail-deployment-checkpoint.md`](../engineering/lightsail-deployment-checkpoint.md)
- Final release readiness: [`feature-1-2-release-readiness.md`](../release/feature-1-2-release-readiness.md)
- Architecture/Graphics release gates: [`feature-1-2-architecture-release-gate.md`](../release/feature-1-2-architecture-release-gate.md), [`feature-1-2-ux-release-gate.md`](../release/feature-1-2-ux-release-gate.md)
- Final UAT deployment evidence: [`feature-1-2-deployment-result.md`](../release/feature-1-2-deployment-result.md)
- Post-deployment acceptance: [`feature-1-2-architecture-deployment-review.md`](../release/feature-1-2-architecture-deployment-review.md), [`feature-1-2-ux-deployment-review.md`](../release/feature-1-2-ux-deployment-review.md)
