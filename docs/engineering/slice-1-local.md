# Architect Slice 1 local foundation

This slice is local-only. It does not access or modify Lightsail, UAT, Caddy, or production services.

## Local commands

```bash
npm run local:up
npm run db:migrate
npm run db:health
npm test
npm run lint
npm run build
npm run local:down
```

PostgreSQL is exposed only on `127.0.0.1:54329`; Mailpit SMTP is only on `127.0.0.1:1025` and its UI is only on `127.0.0.1:8025`. These values are local defaults only. Copy `.env.example` for documented local placeholders; it contains no production or vendor credential.

## Persistence foundation

Drizzle schema definitions live in `src/server/db/schema.ts`; the checked-in SQL migration is under `src/server/db/migrations/`. The server helpers provide typed environment validation, PostgreSQL pooling, migration execution, health checks, transactions, and an explicit workspace authorization context.

Membership-to-role assignment is protected by the composite foreign key `(workspace_id, role_id) -> roles(workspace_id, id)`, so a membership cannot reference a role from another workspace. Drizzle records applied migrations in its migration ledger; rerunning `npm run db:migrate` applies only migrations not already recorded. The individual SQL files are intentionally not ad-hoc idempotent scripts and should always be run through the migrator.

The Slice 1 remediation migration adds nullable tenant scope to the outbox, complete contract-safe audit foundations, catalog version/effective dates, and database checks for security-significant provider, lifecycle, role, cadence, onboarding, outcome, and outbox states. Audit metadata is a versioned JSON object restricted to the initial safe key allowlist; before/after values must be object diffs or field-name arrays. Source IP storage must declare `omitted`, `truncated`, or `hashed`, and sanitized user agents reject control characters and values over 512 characters.

## Verification notes

- Reversible pre-change snapshot: `/tmp/nexaflow-slice1-snapshot.P4ssF9/source-config.tar.gz`.
- Next.js, React, and `eslint-config-next` are upgraded to the approved 16.3.1/19.2 line.
- Audit snapshots: `/tmp/nexaflow-slice1-audit-before.json` and `/tmp/nexaflow-slice1-audit-after.json`.
- Post-upgrade online audit: 0 high, 0 critical, 4 moderate findings, all in the development-only Drizzle Kit toolchain (`drizzle-kit` → `@esbuild-kit/*` → vulnerable `esbuild`). No forced audit fix was applied.
- Initial verification was temporarily blocked while the Docker daemon socket was unavailable. The completed remediation verification, recorded in `docs/engineering/baseline-verification.md`, started loopback-only PostgreSQL and Mailpit successfully, applied all three migrations to an empty database, reran them safely through the Drizzle ledger, passed database health, and passed all 16 live PostgreSQL integration tests.
- `docker compose -f docker-compose.local.yml config --quiet` and `drizzle-kit check` also pass. The baseline verification is the authoritative final evidence for Slice 1 execution results.

No route is authenticated by this slice; existing preview labeling and browser-only prototype behavior remain in place.
