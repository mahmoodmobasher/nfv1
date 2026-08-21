# NexaFlow local baseline verification

**Verification date:** 2026-08-20  
**Scope:** Next.js preview application and Architect Slice 1 persistence foundation  
**Result:** Lint, unit tests, PostgreSQL integration tests, migrations, health check, and production build pass

## Boundaries

- Validation used only `docker-compose.local.yml` and local ports.
- No Lightsail, UAT, Caddy, production service, authentication provider, or email provider was accessed or changed.
- Product UI remains explicitly labelled as a non-production preview; real authentication is intentionally not wired.
- This extracted workspace is not a Git repository, so verification cannot be tied to a commit.
- Pre-Slice rollback snapshot: `/tmp/nexaflow-slice1-snapshot.P4ssF9/source-config.tar.gz` (excludes `node_modules` and `.next`).

## Current baseline

| Item | Verified value |
| --- | --- |
| Workspace | `/Users/moemahmood/builder_code/Nexflow_v1` |
| Node.js | `v22.23.2` |
| npm | `10.9.8` |
| Next.js | `16.3.1` |
| React / React DOM | `19.2.x` / `19.2.x` |
| PostgreSQL | `postgres:16-alpine`, local port `54329` |
| Mailpit | `axllent/mailpit:v1.26`, local SMTP `1025`, UI `8025` |
| Migration tooling | Drizzle ORM `0.45.x`, Drizzle Kit `0.31.x` |

## Verification evidence

### Local services

`docker compose -f docker-compose.local.yml up -d --wait` passed after removing only the disposable local Compose database volume. PostgreSQL and Mailpit both reached Compose `healthy` status. Rendered Compose configuration and `docker compose ps` prove PostgreSQL `54329`, SMTP `1025`, and Mailpit UI `8025` are published only on `127.0.0.1`.

### Empty-database migrations and safe rerun

`npm run db:migrate` passed against the newly created empty database. Running the same command immediately again also passed without attempting duplicate DDL. The Drizzle migration ledger contains exactly three applied migrations, matching the checked-in migration files, and PostgreSQL contains 12 application tables. `npx drizzle-kit check` reports the migration history as valid.

This proves the checked-in migration set is safe to rerun through Drizzle's migration runner. It does not claim that executing the raw SQL files manually without the migration ledger is idempotent.

### Database health

`npm run db:health` passed with `{ ok: true, latencyMs: 18 }`.

### Live PostgreSQL integration tests

`npm run test:integration` passed: 1 file, 16 tests. These tests execute against PostgreSQL and prove:

- duplicate `users.primary_email_normalized` values are rejected with PostgreSQL unique violation `23505`;
- duplicate `(workspace_id, user_id)` memberships are rejected with `23505`;
- assigning a role from another workspace is rejected by the composite membership-to-role foreign key with `23503`;
- duplicate `(principal_key, operation, idempotency_key)` records are rejected with `23505`;
- the workspace-membership repository rejects absent authorization context and returns only rows for the authorized workspace.
- tenant-associated outbox messages retain a valid workspace foreign key;
- invalid identity provider, user/workspace/membership status, role, billing cadence, onboarding step, audit outcome/actor, and outbox state values are rejected;
- versioned plan entries enforce catalog status, allowed cadences, positive seat limits, non-negative trials, and ordered effective dates;
- audit events enforce workspace-scoped actor memberships, source-IP policy, sanitized user agents, safe before/after shapes, positive metadata versions, and allowlisted metadata keys.

The general `npm test` command leaves these database tests skipped unless `RUN_DB_INTEGRATION=1`; this keeps provider-independent unit tests usable when Docker is unavailable. The dedicated integration command is required for persistence validation.

### Lint, unit tests, and build

| Command | Result |
| --- | --- |
| `npm run lint` | Passed, no warnings or errors |
| `npm test` | Passed: 3 files, 10 tests; 16 database tests intentionally skipped |
| `npm run test:integration` | Passed: 1 file, 16 live PostgreSQL tests |
| `npm run build` | Passed with Next.js 16.3.1 and webpack; 14 routes generated as static content |

The route build includes the marketing page, authentication preview pages, onboarding pages, invitation/settings/ready pages, CRM, and Add your first lead.

### Dependency audit

The pre-upgrade online audit snapshot at `/tmp/nexaflow-slice1-audit-before.json` recorded 3 high-severity findings. The post-upgrade snapshot at `/tmp/nexaflow-slice1-audit-after.json` recorded 0 high and 4 moderate findings.

A fresh online `npm audit --json` on this verification date also completed successfully and reports 0 critical, 0 high, and 4 moderate findings. The remaining path is development-only migration tooling:

`drizzle-kit -> @esbuild-kit/esm-loader -> @esbuild-kit/core-utils -> esbuild`

The advisory concerns the esbuild development server. npm proposes `drizzle-kit@0.18.1`, which is a backward major change from the approved `0.31.x` toolchain. No force fix or unsafe downgrade was applied. Network access was available for this audit; there is no audit freshness limitation for this run.

## Remaining gates

- Real authentication and external provider wiring remain blocked pending the approved follow-on architecture/product gates.
- Slice 1 proves local schema, migrations, constraints, health, and one workspace-scoped repository pattern; it is not a complete production data-access layer.
- Production secret management, managed PostgreSQL, transactional email, deployment, backup/restore, observability, and operational runbooks remain future work.
