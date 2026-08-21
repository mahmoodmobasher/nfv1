# Feature 1 + Feature 2 release readiness

Date: 2026-08-21  
Source branch: `main`  
Source HEAD before release preparation: `1cdc16f0ab7c77cd4198d1e8d4e4d50fe6d79b5e` (`Record Lightsail UAT deployment`)  
Remote: `origin` → `git@github.com:mahmoodmobasher/nfv1.git`  
Status: **engineering gate green; ready for Architecture and Graphics release-candidate review; not authorized for commit, push, tag, or UAT deployment**

## 1. Decision

The current working tree is a coherent Feature 1 + Feature 2 release candidate. Fresh local evidence passes dependency installation, migration application/rerun, database health, unit/direct-route tests, the supported serial PostgreSQL integration suite, the complete Playwright suite, ESLint, TypeScript, the Next.js production build, UAT Compose rendering, and a production Docker image build.

No Git commit, push, tag, deployment, host change, DNS change, data deletion, reset, or worktree cleanup was performed. The existing local PostgreSQL and Mailpit containers were already running and remain running. The isolated release database `nexaflow_release_20260821` is intentionally preserved as evidence.

This is not yet approval to deploy. Architecture/Product must explicitly disposition the historical pre-UAT controls in the handover, Graphics must review the final release checkpoint, and Operations must repeat host discovery/backup/restore/secrets checks before any UAT change. The existing Lightsail deployment checkpoint describes an older nine-migration image and was not externally revalidated during this local-only turn.

## 2. Repairs made during release preparation

- Ignored generated Playwright output under `test-results/` and `playwright-report/`; existing generated files were not deleted.
- Made the CRM and identity browser fixtures honor `DATABASE_URL`, preventing an isolated release run from accidentally splitting application and test data across databases.
- Updated stale browser expectations to the accepted CRM navigation wording, current CRM landing route, accessible Team confirmation dialog, and server-derived Admin authority ceiling.
- Corrected the shared confirmation dialog so Cancel receives initial focus and focus returns synchronously to the trigger after close, Escape, or confirmation without a React effect race.
- Changed Team membership saving to submit only changed memberships. This avoids unnecessary version/audit/idempotency mutations and preserves unsaved selections on a conflict.
- Kept the stale Team UI path deterministic with a one-request browser 409 fixture; the real PostgreSQL stale-version behavior remains covered by the live integration suite.

Application authority, tenant boundaries, identity-provider boundaries, and production infrastructure were not weakened or expanded.

## 3. Release-gate evidence

| Gate | Exact result |
|---|---|
| Dependency lock consistency | `npm ci` passed; 455 packages installed from `package-lock.json` |
| Drizzle schema consistency | `npx drizzle-kit check` passed |
| Fresh disposable migration | All checked-in migrations applied to empty `nexaflow_release_20260821` |
| Migration rerun | Immediate rerun passed; final rerun also passed with no new migration rows |
| Migration ledger | 11 rows in `drizzle.__drizzle_migrations`; latest ledger value `1787300661348` |
| Database health | `{ ok: true, latencyMs: 11 }` |
| Unit/direct-route | 11 files, **41/41 passed**; 111 database-gated tests skipped by design |
| PostgreSQL integration | Supported `npm run test:integration`: 13 files, **111/111 passed**, serial/one worker |
| Playwright | 6 files, **25/25 passed** in 55.3 seconds, one browser worker |
| Responsive/accessibility browser evidence | Feature 2 role controls and Workspace chooser passed at 320px; role controls passed at browser 200% zoom; dialog focus/Escape/restore paths passed |
| Type generation | `npx next typegen` passed |
| TypeScript | `npx tsc --noEmit` passed |
| ESLint | `npm run lint` passed with zero warnings/errors |
| Production build | Next.js 16.3.1 webpack build passed; 32 static pages generated and all dynamic routes compiled |
| Diff hygiene | `git diff --check` passed |
| UAT Compose | `docker compose -f compose.uat.yml --profile release --profile uat-mail config --quiet` passed with safe placeholder files |
| Production image | `docker build -t nexaflow:feature-1-2-rc1 .` passed |
| Image runtime | Local image ID `sha256:8c38cfae91e44217aa017fce9a82d9b3c04a354833efac60401955a09e4f4851`; runtime user `10001:10001`; only `3000/tcp` exposed |
| Local services | PostgreSQL and Mailpit healthy; ports remain loopback-only at `127.0.0.1:54329`, `:1025`, and `:8025` |
| Dependency audit | No high/critical findings; four moderate development-only findings through `drizzle-kit` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` → `esbuild <=0.24.2` |

The audit-proposed repair is `npm audit fix --force`, which would install a breaking historical `drizzle-kit@0.18.1`; it was intentionally not used. The vulnerable `esbuild` path is development tooling and is absent from `npm ci --omit=dev` in the production image stage. Architecture should record acceptance or choose a separately tested non-forced dependency upgrade when the upstream path changes.

### Correctly classified failed diagnostic

One command was initially invoked as `RUN_DB_INTEGRATION=1 npm test`, which lets Vitest execute database files concurrently against one shared database. It produced cross-suite deadlocks/timeouts and was stopped with interrupt. This is not the supported integration command and is not a product regression. The repository's supported serial command, `npm run test:integration`, then passed all 111 tests. The handover already warns not to run shared-database suites concurrently.

## 4. Browser journey coverage

The full 25-test run provides the requested local browser smoke, not merely route-level simulation. It covers:

- persistent CRM Lead create/search/detail/edit/stage movement/activity;
- Owner role elevation confirmation, focus restoration, stale-authority reload, Admin invitation ceiling, 320px, and 200% zoom;
- concurrent stale edits, conflict/reload/single retry, suspension, and removal reconciliation;
- post-provision Workspace ready behavior, multiple-membership selection-required behavior, and no-membership safe recovery;
- Workspace A→B switching across two tabs, stale option removal, single-Workspace behavior, mobile chooser, and logout protection;
- local OIDC cancellation/protocol failure and sole-Owner provisioning;
- password registration, interrupted email-worker lease, Mailpit verification, login, refresh, session expiry, reset revocation/replay denial, current/all-device logout, and protected-route redirect/back behavior;
- Owner invitation acceptance, multi-entry partial retry, People lifecycle, Team editing/conflict/Admin ceiling, invitation resend rotation/seat denial, recent fixture re-auth, Owner transfer, and rotated session.

No previously documented four-item “legacy Playwright failure” remains: the final full suite is 25/25 green.

## 5. Migration and schema readiness

- Checked-in Drizzle migrations run through `0010_ambiguous_terrax.sql`; the ledger contains 11 entries including the initial migration.
- `0009_small_azazel.sql` adds trusted active Workspace selection to Sessions.
- `0010_ambiguous_terrax.sql` updates the audit metadata allowlist for Workspace selection version evidence.
- Fresh application and rerun both passed. Safe rerun means the Drizzle ledger prevents re-executing applied files; it does not mean raw migration SQL should be executed manually twice.
- The current documented UAT host is on nine migrations. Any later authorized UAT release must take and verify an encrypted backup, run migrations as the one-shot `migrate` service twice, verify an 11-row ledger, then run readiness and browser smoke before switching acceptance traffic.

## 6. Secret and generated-artifact review

- The only Git-visible environment template is `.env.example`; it contains safe local placeholders.
- `.env.local` is ignored and was not read into this report or staged.
- High-confidence scans found no private-key blocks, AWS access keys, Google API keys, GitHub tokens, Stripe-style secret keys, or Resend-style API keys in the candidate paths.
- Generic secret-name matches are limited to typed environment declarations, explicit non-production local defaults, and test fixtures. Production validation rejects local database addresses, local session secrets, HTTP origins, and fixture OIDC.
- `test-results/`, `playwright-report/`, `.next/`, `node_modules/`, local environment files, logs, and coverage are excluded from Git.
- The local Docker image and disposable PostgreSQL evidence database are runtime evidence, not repository content.

## 7. Exact Git-visible candidate inventory

Every path below is included in the proposed release. No other modified or untracked path is intentionally excluded.

### Root, configuration, and source asset

- `.gitignore`
- `AGENTS.md`
- `CLAUDE.md`
- `CRM Flow-Start Up.jpg`
- `playwright.config.ts`

`AGENTS.md` is the Next.js-generated agent guidance that the project requires keeping. `CLAUDE.md` is preserved user/project guidance. `CRM Flow-Start Up.jpg` is a deliberate dashboard design source referenced by repository contracts, not generated output.

### Architecture documentation

- `docs/architecture/crm-home-dashboard-contract.md`
- `docs/architecture/crm-home-dashboard-review.md`
- `docs/architecture/feature-2-user-role-membership-contract.md`
- `docs/architecture/feature-2-work-item-2-review.md`
- `docs/architecture/feature-2-work-item-3-review.md`
- `docs/architecture/feature-2-work-item-4-review.md`
- `docs/architecture/feature-2-work-item-5-audit-review.md`
- `docs/architecture/onboarding-workspace-boundary-answers.md`
- `docs/architecture/workspace-foundation-direction.md`
- `docs/architecture/workspace-provisioning-validation.md`

### Design documentation

- `docs/design/crm-home-dashboard-review.md`
- `docs/design/feature-2-user-role-membership-journeys.md`
- `docs/design/feature-2-work-item-2-ux-review.md`
- `docs/design/feature-2-work-item-3-ux-review.md`
- `docs/design/feature-2-work-item-4-ux-review.md`
- `docs/design/feature-2-work-item-5-ux-review.md`

### Engineering, Product, handover, and release documentation

- `docs/engineering/crm-home-dashboard-checkpoint.md`
- `docs/engineering/feature-2-audit-completion-checkpoint.md`
- `docs/engineering/feature-2-current-state-gap-analysis.md`
- `docs/engineering/feature-2-membership-lifecycle-checkpoint.md`
- `docs/engineering/feature-2-role-authority-checkpoint.md`
- `docs/engineering/feature-2-stale-data-checkpoint.md`
- `docs/engineering/feature-2-workspace-selection-checkpoint.md`
- `docs/engineering/local-login-validation.md`
- `docs/engineering/onboarding-workspace-boundary-validation.md`
- `docs/engineering/workspace-provisioning-validation.md`
- `docs/handover/CONTINUATION-PROMPT.md`
- `docs/handover/PROJECT-STATUS.md`
- `docs/handover/README.md`
- `docs/handover/architecture-handover.md`
- `docs/handover/design-product-handover.md`
- `docs/handover/engineering-handover.md`
- `docs/product/feature-2-implementation-checklist.md`
- `docs/release/feature-1-2-release-readiness.md`
- `docs/release/feature-1-2-ux-release-gate.md`

### Application routes and UI

- `src/app/api/auth/login/route.ts`
- `src/app/api/invitations/accept/route.ts`
- `src/app/api/workspaces/[workspaceId]/invitations/[invitationId]/resend/route.ts`
- `src/app/api/workspaces/[workspaceId]/invitations/[invitationId]/revoke/route.ts`
- `src/app/api/workspaces/[workspaceId]/invitations/route.ts`
- `src/app/api/workspaces/[workspaceId]/memberships/[membershipId]/route.ts`
- `src/app/api/workspaces/[workspaceId]/ownership/transfer/route.ts`
- `src/app/api/workspaces/route.ts`
- `src/app/api/workspaces/selectable/route.ts`
- `src/app/api/workspaces/switch/route.ts`
- `src/app/crm/crm-shell.tsx`
- `src/app/crm/home/demo.ts`
- `src/app/crm/home/loading.tsx`
- `src/app/crm/home/page.tsx`
- `src/app/crm/layout.tsx`
- `src/app/crm/page.tsx`
- `src/app/globals.css`
- `src/app/onboarding/api.ts`
- `src/app/workspace/ready/page.tsx`
- `src/app/workspace/settings/admin-client.tsx`
- `src/app/workspace/settings/admin-shell.tsx`
- `src/app/workspace/settings/invite/authority-invite-client.tsx`
- `src/app/workspace/settings/invite/page.tsx`
- `src/app/workspace/settings/people/authority-people-client.tsx`
- `src/app/workspace/settings/people/page.tsx`
- `src/app/workspace/settings/transfer-ownership/page.tsx`
- `src/app/workspace/switch/page.tsx`
- `src/app/workspace/switch/switch-client.tsx`
- `src/app/workspace/workspace-control.tsx`

### Server, schema, and migrations

- `src/server/crm/home-links.ts`
- `src/server/crm/home.ts`
- `src/server/crm/leads.ts`
- `src/server/crm/page.ts`
- `src/server/db/migrations/0009_small_azazel.sql`
- `src/server/db/migrations/0010_ambiguous_terrax.sql`
- `src/server/db/migrations/meta/0009_snapshot.json`
- `src/server/db/migrations/meta/0010_snapshot.json`
- `src/server/db/migrations/meta/_journal.json`
- `src/server/db/schema.ts`
- `src/server/security/audit.ts`
- `src/server/security/session.ts`
- `src/server/tenant-admin/administration.ts`
- `src/server/tenant-admin/denial.ts`
- `src/server/tenant-admin/http.ts`
- `src/server/tenant-admin/invitations.ts`
- `src/server/tenant-admin/page.ts`
- `src/server/tenant-admin/pagination.ts`
- `src/server/tenant-admin/permissions.ts`
- `src/server/tenant-admin/read-models.ts`
- `src/server/tenant-admin/role-authority.ts`
- `src/server/workspaces/provision.ts`
- `src/server/workspaces/selection.ts`

### Tests

- `tests/audit.unit.test.ts`
- `tests/crm-home.integration.test.ts`
- `tests/crm-home.test.ts`
- `tests/e2e/crm.spec.ts`
- `tests/e2e/feature2-role-authority.spec.ts`
- `tests/e2e/feature2-stale-data.spec.ts`
- `tests/e2e/feature2-workspace-ready.spec.ts`
- `tests/e2e/feature2-workspace-selection.spec.ts`
- `tests/e2e/local-identity.spec.ts`
- `tests/feature2-audit-completion.integration.test.ts`
- `tests/feature2-role-authority.integration.test.ts`
- `tests/feature2-stale-data.integration.test.ts`
- `tests/feature2-workspace-selection.integration.test.ts`
- `tests/onboarding-boundary.integration.test.ts`
- `tests/routes.test.ts`
- `tests/slice3.integration.test.ts`
- `tests/slice4.integration.test.ts`
- `tests/workspace-selection.routes.test.ts`

After adding this report, the candidate consists of 41 modified tracked paths and 69 untracked paths: 110 Git-visible paths total. Generated and sensitive exclusions are described in section 6.

## 8. Proposed commit series and tag

Do not execute until Architecture/Graphics review and explicit user authorization.

1. `feat(workspace): enforce active workspace context and selection`
   - migrations `0009`/`0010`, Session selection, selectable/switch routes, Workspace control/chooser, ready-page recovery, tenant resolution, and Workspace-selection tests.
2. `feat(members): complete authority stale-state and audit contracts`
   - role authority, membership/invitation/Team/Owner controls, denial/audit normalization, expected-version reconciliation, UI confirmations, and Feature 2 tests.
3. `feat(crm): add scoped CRM home dashboard`
   - tenant-scoped home aggregates/routes/UI, demo-labelled unsupported metrics, CRM shell/navigation, and dashboard tests/assets/contracts.
4. `test(release): isolate and complete feature 1 and 2 browser gate`
   - Playwright database isolation, current selectors/journeys, Team changed-only saves/focus repair, generated-output ignores, and release-test evidence.
5. `docs(handover): record feature 1 and 2 release candidate`
   - Architecture/Design/Engineering/Product checkpoints, handover master files, and this release report.

Suggested annotated prerelease tag after commits: `v0.2.0-rc.1`.

## 9. Proposed Git publication commands

These commands are documentation only and were not run:

```sh
git status --short --untracked-files=all
git switch -c release/feature-1-2-rc1
# Stage each commit group from section 8 with explicit path lists; never use an indiscriminate cleanup/reset.
git diff --cached --check
git commit -m "<approved commit message>"
git push --set-upstream origin release/feature-1-2-rc1
# After review/merge and explicit authorization:
git tag -a v0.2.0-rc.1 -m "NexaFlow Feature 1 + Feature 2 release candidate 1"
git push origin v0.2.0-rc.1
```

Before publication, rerun the secret scan against the exact staged index and inspect every staged binary and environment/config path.

## 10. Proposed immutable image and UAT commands

These commands require a reviewed registry, protected host environment files, verified backup key, renewed host discovery, and explicit deployment authorization. Values in angle brackets are intentionally not secrets and must be resolved by Operations.

```sh
# Build and publish off-host after the Git tag exists.
docker build --pull --tag ghcr.io/mahmoodmobasher/nfv1:v0.2.0-rc.1 .
docker push ghcr.io/mahmoodmobasher/nfv1:v0.2.0-rc.1
docker image inspect ghcr.io/mahmoodmobasher/nfv1:v0.2.0-rc.1 --format '{{json .RepoDigests}}'

# On the reviewed host, from the immutable release directory:
cd /opt/nexaflow/uat/releases/<release-id>
export NEXAFLOW_IMAGE='ghcr.io/mahmoodmobasher/nfv1@sha256:<published-digest>'
export UAT_APP_ENV_FILE='/opt/nexaflow/uat/secrets/app.env'
export UAT_POSTGRES_ENV_FILE='/opt/nexaflow/uat/secrets/postgres.env'
export UAT_CADDY_ENV_FILE='/opt/nexaflow/uat/secrets/caddy.env'
export BACKUP_ENCRYPTION_KEY_FILE='/opt/nexaflow/uat/secrets/backup.key'

docker compose --project-name nexaflow-uat --file compose.uat.yml config --quiet
docker compose --project-name nexaflow-uat --file compose.uat.yml ps
./deploy/uat/backup.sh /opt/nexaflow/uat/backups <release-id>
./deploy/uat/restore.sh <absolute-encrypted-backup> /opt/nexaflow/uat/secrets/backup.key <new-disposable-restore-db>
docker compose --project-name nexaflow-uat --file compose.uat.yml --profile release run --rm migrate
docker compose --project-name nexaflow-uat --file compose.uat.yml --profile release run --rm migrate
docker compose --project-name nexaflow-uat --file compose.uat.yml up --detach --wait app
docker compose --project-name nexaflow-uat --file compose.uat.yml --profile uat-mail up --detach --wait mailpit email-worker
docker compose --project-name nexaflow-uat --file compose.uat.yml up --detach --wait caddy
docker compose --project-name nexaflow-uat --file compose.uat.yml ps
./deploy/uat/smoke.sh https://app.nexaflowsystems.com
```

Do not use `docker compose down -v`, the local reset script, broad deletion commands, plaintext reusable credentials, fixture OIDC in production, or a mutable image tag as deployment authority.

## 11. Rollback plan

1. Before migration, capture an encrypted logical backup and manifest; verify it by restoring into a new explicitly named database.
2. Record the prior immutable image digest, prior release directory/current pointer, migration head, and smoke evidence.
3. If smoke fails and the new release made no incompatible writes, restore the prior release pointer/image and restart app/Caddy while preserving PostgreSQL.
4. If incompatible writes occurred, stop app/worker, preserve a forensic backup, restore the pre-release backup into a new explicit PostgreSQL volume/database, start the prior image against it, validate, then switch traffic.
5. Rollback is complete only after HTTPS, liveness/readiness, password login/logout, active Workspace context, membership administration, CRM read/write, tenant denial, invitation/outbox, and audit smoke pass.

## 12. Remaining blockers and review requests

Engineering has no failing local release test. Release publication/deployment remains blocked on:

1. Architecture disposition of the historical pre-UAT list: Owner-transfer response-loss recovery, exhaustive route-level denial evidence, destination rate-limit refinement, and any remaining invitation-administration hardening. The clean full Playwright item now has fresh 25/25 evidence but is not self-declared Architecture closure.
2. Graphics review of the final current browser evidence, including the corrected Team dialog/conflict path and removal of the four stale legacy expectations.
3. Product authorization for the release candidate/Feature 2 consolidated acceptance; Feature 2 is still “in implementation” until that decision.
4. Operations review of current Lightsail state, firewall/SSH restrictions, off-instance backup retention, secrets installation, immutable registry digest, and the nine-to-eleven migration rollout.
5. Explicit acceptance or safe future remediation of the four moderate development-tool audit findings.

No Feature 3 work is included or authorized.
