# Stopped v0.5.0-uat.6 workflow and clean-reset handoff

Date: 2026-08-24

Status: **STOPPED safely before live switch. No reset, migration, email journey, or full UAT execution is authorized by this record.**

UAT URL: `https://app.nexaflowsystems.com`

Source authority: `origin/main` `386d10c5cc8eee9ff9f6d622d1a1e1a144c06ef2`

## Exact stopped-at state

- Annotated tag `v0.5.0-uat.6` was created and pushed. Tag object `0d0ecb36c6de50e5867aabdf441a8476a7829fc4` resolves exactly to `386d10c5cc8eee9ff9f6d622d1a1e1a144c06ef2`. Product stopped this workflow; the tag must not be moved, repaired, or reused.
- Exact Linux/amd64 image `nexaflow:386d10c` was built and loaded on the UAT host. Image ID is `sha256:4207edb03a6f9e200f9bacdb9d8d5a52f52699010b4a8e7a8081f93faeb39a75`; the configured runtime user is `10001:10001`.
- Staged, non-live host resources exist at `/opt/nexaflow/uat/releases/386d10c`, `/opt/nexaflow/uat/secrets/app.env.candidate-386d10c`, `/opt/nexaflow/uat/secrets/release.env.candidate-386d10c`, and the transferred source/image archives under `/tmp`. The two candidate environment files are root-owned mode `0600`.
- Source archive SHA-256: `212535a1054bbc651100ae0ae5af612efa6791a72c2e8320ce11f5cc92f9ea8f`. Image archive SHA-256: `d571f5e64ff73948b0617cc00f22e20de702960b7d21e3dd66a5f12601848c58`. Candidate Caddyfile SHA-256: `69321dae608b422575708c19c7acf03c7e018d35f50ee7a4e4b9da1841477f59`. Compose SHA-256: `33500a80918e968482119380dc744eefab3dfa8bbdce3e862a8750baaf5e15c4`.
- The live pointer and protected live configuration were never switched. No `.6` container was started against the live project, no migration ran, no database row or schema changed, and no `.6` encrypted backup was created.
- One read-only Resend domain-list request ran during staged preflight. The host lacked `jq`, so evidence parsing stopped with `/tmp/nexaflow-uat6-preflight.sh: line 21: jq: command not found`. No email was sent and no provider or DNS state changed.
- Two earlier candidate-authority validation attempts stopped on shell rendering/parsing errors before live use. The final staged candidate files passed ownership, mode, Option A fingerprint, required-key, Reply-To-absence, image identity, and source checksum checks. These contained failures did not touch live authority.

## Verified live UAT authority and health

Read-only verification at `2026-08-24T18:52:27Z` found:

- live release pointer `/opt/nexaflow/uat/releases/e58c22a`;
- application and worker image `nexaflow:e58c22a`, retained authority `v0.4.0-uat.1` / `e58c22a11e8239f65936542ce75ff73963fb99c1`;
- app, Caddy, PostgreSQL, and Mailpit running and healthy; email worker running;
- restart count zero for app, email worker, Caddy, PostgreSQL, and Mailpit;
- bounded public smoke passed; and
- migration ledger remained 12/head `1787501845245`.

Live `app.env`, `release.env`, `postgres.env`, `caddy.env`, current pointer, containers, volumes, database, provider, and DNS were not modified by `.6`. Only the separately named staged release/image/candidate files above were added.

## Proposed clean-reset deletion and recreation inventory

The reset is not authorized or executed. A future destructive workflow must resolve and recheck these exact UAT-only targets before deletion.

Delete and recreate:

- Compose project `nexaflow-uat` containers: `app`, `email-worker`, `caddy`, `postgres`, and `mailpit`;
- named volumes `nexaflow-uat-postgres-data`, `nexaflow-uat-caddy-data`, and `nexaflow-uat-caddy-config`;
- named networks `nexaflow-uat-database`, `nexaflow-uat-email-egress`, `nexaflow-uat-frontend`, and `nexaflow-uat-operator`;
- `/opt/nexaflow/uat/current` and the UAT release tree under `/opt/nexaflow/uat/releases/`, including staged `386d10c`;
- staged `/tmp/nexaflow-386d10c-*` archives and staged candidate authority files after their evidence is no longer required; and
- UAT-only `nexaflow:*` application images after exact reference/use checks prove no non-UAT consumer.

Deleting `nexaflow-uat-postgres-data` intentionally removes all UAT Users, Workspaces, Memberships, Sessions, identity tokens, Outbox, Audit, CRM, and settings data. No restore is required under Product's stated clean-reset policy. Deleting Caddy data/config intentionally removes retained ACME state and requires controlled certificate reissuance; DNS and certificate-rate-limit readiness are preconditions.

Historical encrypted files under `/opt/nexaflow/uat/backups/`, rejected release directories, and protected `*.pre-*`/`*.failed-*` evidence are not necessary to reconstruct an empty UAT database. Whether to retain them as audit evidence or delete them is an explicit Operations/Product decision before reset. Remote Git tags `v0.5.0-uat.1` through `.6` are immutable evidence and must never be deleted or moved.

## Protected inputs to retain or reinstall

Do not copy values into Git or logs. Preserve or reinstall by name through root-owned mode-`0600` protected files:

- application: `NODE_ENV`, `APP_ORIGIN`, `DATABASE_URL`, `SESSION_COOKIE_NAME`, `SESSION_SECRET`, `SESSION_IDLE_MINUTES`, `SESSION_ABSOLUTE_HOURS`, `SESSION_TOUCH_INTERVAL_SECONDS`, `TRUSTED_PROXY_ENABLED`, `TRUSTED_PROXY_SECRET`, `OIDC_MODE`, `OIDC_FIXTURE_SECRET`, `OIDC_REDIRECT_URIS`, `EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `RESEND_API_KEY`, `EMAIL_FROM`, `INVITATION_TTL_HOURS`, and `RECENT_AUTH_MINUTES`;
- PostgreSQL: `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`;
- Caddy: `UAT_SITE_ADDRESS`, `UAT_SITE_ALIAS`, `UAT_APP_ADDRESS`, `ACME_CONTACT_EMAIL`, and `TRUSTED_PROXY_SECRET`;
- release/Compose: `NEXAFLOW_IMAGE`, `UAT_COMPOSE_PROJECT_NAME`, `UAT_RESOURCE_PREFIX`, protected environment-file paths, bind address, HTTP/HTTPS ports, and Mailpit operator port; and
- `BACKUP_ENCRYPTION_KEY_FILE`/`backup.key` only while historical encrypted backups remain retained.

The canonical Option A transactional contract remains the Product-approved sender on verified `mail.nexaflowsystems.com`, restricted `RESEND_API_KEY`, and absent `EMAIL_REPLY_TO`. Preserve the public `app.nexaflowsystems.com` DNS authority, Caddy site/alias authority, verified provider domain, controlled-recipient identities outside the database, and public OIDC-disabled state. No DNS or provider-setting change is part of a clean rebuild.

## Minimum clean-rebuild gates

1. Obtain separate Product authorization for destructive UAT-only reset and a new immutable identifier. Because `.6` was published and stopped, recommend `v0.5.0-uat.7`; never resume or move `.6`.
2. Fetch and fail closed unless `origin/main` remains the authorized exact revision. Rebuild exact source and Linux/amd64 non-root image; record source/image/config checksums and labels.
3. Recheck every deletion target by exact Compose project, resource name, path, and consumer. Stop if any target is shared or ambiguous.
4. Securely retain/reinstall the protected inputs above, verify root ownership/mode `0600`, Option A sender/domain/credential parity, Reply-To absence, and secret-safe Compose rendering.
5. Remove only the authorized UAT project resources, then recreate pinned PostgreSQL, Caddy, Mailpit, application, and worker resources from the exact accepted tree.
6. Apply all accepted migrations to the fresh database and rerun idempotently. Verify the expected migration count/head without restoring prior UAT data.
7. Run pinned `caddy:2.10.2-alpine` adapt/validate, adapted-JSON default-if-absent uniqueness, admin-off proof, and Compose render before public switch.
8. Require app readiness, worker continuous start, service health, zero unexpected restarts, bounded clean logs, and explicit rollback/rebuild inputs.
9. After atomic public authority establishment, restart the complete public-edge matrix from probe one using `deploy/uat/validate-edge-location.mjs` without bypass. Any malformed evidence, validator ambiguity/failure, non-303/multi-Location response, token/privacy/security mismatch, or health/log failure stops before email.
10. Only after edge acceptance, and under explicit authorization, run controlled-recipient verification/resend, recovery/reset/Session-revocation, invitation journeys, and the complete Phase 1–4 functional/security/Workspace/CRM/settings/theme/responsive/accessibility/database/worker/log matrix.

No production or Phase 5 action is included.
