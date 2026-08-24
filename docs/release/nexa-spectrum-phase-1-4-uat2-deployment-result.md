# Nexa Spectrum Phases 1–4 UAT attempt 2 deployment result

Date: 2026-08-24

Status: **BLOCKED before release switch — immutable candidate rejected; prior healthy UAT unchanged**

UAT URL: `https://app.nexaflowsystems.com`

## Release authority and artifact

- Authorized and attempted revision: `05c4c02d5e96ce56aee28d80d199d67369fb57ea`.
- Published UAT-only identifier: `v0.5.0-uat.2`, resolving exactly to `05c4c02`. It is now rejected and must never be moved, retagged, repaired in place, or reused.
- Previously rejected `v0.5.0-uat.1` remains unmoved at `9162a90ebf125d04641e6148cfe1d6cd6b2c7c1b`.
- Retained healthy UAT authority: `v0.4.0-uat.1` / `e58c22a11e8239f65936542ce75ff73963fb99c1`.
- Candidate image: `nexaflow:05c4c02`, Linux/amd64 image ID `sha256:3077ed2cd323e2b08b03dee5ba3a9445511fd04bf8345bd00a33efff123af48c`, fixed runtime UID/GID `10001:10001`.
- Candidate Caddyfile SHA-256: `69321dae608b422575708c19c7acf03c7e018d35f50ee7a4e4b9da1841477f59`.
- Candidate release directory: `/opt/nexaflow/uat/releases/05c4c02`. The staged image, directory, and protected candidate authority file are retained as immutable failed-attempt evidence and are not live authority.

The image was built off-host from exact fetched `origin/main`, transferred with a SHA-256 verified archive, loaded as the expected amd64 artifact, and staged only after the source archive, image archive, exact Caddyfile, and protected Compose inputs passed validation. No secret value was printed or persisted in this record.

## Preconditions and completed evidence

- `origin/main` remained exactly `05c4c02` before publication and packaging.
- Protected application, PostgreSQL, Caddy, release, and backup-key files were present, root-owned, and mode `0600`; required key names were present without reading values into evidence.
- Current pointer resolved to `/opt/nexaflow/uat/releases/e58c22a`; app, Caddy, PostgreSQL, and Mailpit were healthy, the worker was running, and all five restart counts were zero.
- Rollback releases `e58c22a` and `9162a90`, the known-good image `nexaflow:e58c22a`, prior protected authorities, and encrypted backups were retained.
- Database ledger was exactly 12 migrations with head `1787501845245`.
- A new encrypted pre-attempt backup and mode-`0600` manifest were created: `nexaflow-uat_05c4c02-pre_20260824T073358Z.sql.gz.enc`, SHA-256 `2a9883163072199b11949211c78ffed3099f51687f0f0387f28caea93c795b01`.
- That backup restored successfully into explicitly named disposable database `nexaflow_restore_05c4c02`, where all 12 migrations were verified; the disposable database was then removed.
- Pinned `caddy:2.10.2-alpine` adapt/validate passed against the staged exact Caddyfile; `admin off` and exactly one `?Referrer-Policy` directive were present.
- Protected Compose rendering passed with the expected app, Caddy, PostgreSQL, and worker images and unchanged service topology.

## Material pre-switch failure

The first candidate migration execution did not complete because the exact candidate image validates the protected application environment before opening the database. Independent direct reproduction returned a bounded `ZodError` for `EMAIL_FROM`: the candidate requires the accepted verified `mail.nexaflowsystems.com` sender domain, while the currently installed protected UAT sender configuration does not satisfy that contract.

This is a P1 configuration/application compatibility blocker. The same environment is consumed by migration, app, and email-worker processes, so bypassing the migration gate would also risk failed candidate service startup and an unavailable or dishonest transactional-email path. Current authorization prohibited changing secrets or provider configuration, and no accepted application correction exists. The release owner therefore stopped before pointer/config-authority switching and before recreating any live service.

The public Caddy acceptance matrix and broader authenticated UAT suite were intentionally not run against `v0.5.0-uat.2`, because the candidate never became live authority. Passing direct-container or staged Caddy validation cannot override the failed migration/runtime-environment gate.

## Containment and live-state proof

No rollback mutation was necessary: the protected current pointer remained `/opt/nexaflow/uat/releases/e58c22a`, the protected live release environment was not replaced, and no app, worker, Caddy, PostgreSQL, or Mailpit container was recreated. Active app and worker images remain `nexaflow:e58c22a`; database ledger remains 12/head `1787501845245`.

After the stop, public liveness and readiness passed. App, Caddy, worker, and Mailpit bounded logs had zero error/fatal/panic/exception matches; all inspected service logs had zero literal `token=` entries. PostgreSQL recorded two operator-induced query errors from initial evidence probes (wrong migration table name and malformed literal quoting); corrected read-only queries passed and data/health were unchanged.

## Fall-forward disposition

**NO-GO for Product UAT acceptance of `v0.5.0-uat.2`.** The next possible identifier is `v0.5.0-uat.3`, but it must not be created until a new commit from current accepted main resolves the sender-contract incompatibility through a Product/Architecture-approved choice:

1. install an approved protected UAT sender configuration that satisfies the verified-domain contract under a separately authorized provider/configuration change; or
2. implement and review a bounded application configuration contract correction if the existing sender is in fact an accepted verified identity.

The fall-forward candidate must rerun environment-schema tests, migration apply/rerun, app and worker startup, transactional-email evidence, full security/build/browser gates, staged Caddy validation, encrypted backup/restore, public edge acceptance, and the full bounded UAT matrix. It must use a new immutable commit, image, checksums, release directory, deployment result, and monotonically increasing tag.

No production deployment/tag, DNS, provider, secret, topology, billing, or Phase 5 change occurred.
