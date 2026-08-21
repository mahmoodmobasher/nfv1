# Private Lightsail rehearsal package

Date: 2026-08-20  
Scope: local artifact preparation only; no host deployment authorized by this document

## Release boundary

The package is intentionally private-first. `compose.uat.yml` binds Caddy to `127.0.0.1` on host ports 8080/8443 by default, binds the optional Mailpit UI to `127.0.0.1:8025`, publishes neither application port 3000 nor PostgreSQL 5432, and never publishes Mailpit SMTP. The database network is internal and Caddy is not attached to it. Mailpit alone also joins a non-internal operator network so Docker can realize the loopback UI binding; no other Mailpit port is published.

OIDC must be `disabled`. Fixture and real Google credentials are forbidden. The optional `uat-mail` profile uses only private Mailpit and the explicit continuous email worker. Omitting that profile leaves email-dependent journeys unavailable and outbox records pending.

## Artifact inventory

- `Dockerfile`: multi-stage Node 22 production build with a fixed unprivileged UID/GID and packaged migration/worker entry points.
- `.dockerignore`: excludes environment files, credentials, Git data, tests, reports, logs, backups, local data, and development Compose state.
- `compose.uat.yml`: explicit services, networks, volumes, profiles, health checks, read-only application roots, bounded temporary filesystems, dropped capabilities, process limits, and rotated local logs.
- `deploy/uat/Caddyfile`: canonical configured site, compression, 10 MB request bound, security headers, and authenticated proxy-header replacement.
- Public deployments set `UAT_SITE_ADDRESS` to the marketing hostname, `UAT_SITE_ALIAS` to its `www` alias, and `UAT_APP_ADDRESS` to the authenticated product hostname. Caddy obtains certificates for all three and permanently redirects only `www` to the marketing origin.
- `deploy/uat/uat.env.keys`: required key names only. It contains no values and is not an environment file.
- `deploy/uat/backup.sh` and `restore.sh`: encrypted logical backup and fail-closed disposable restore tooling for the explicit `nexaflow-uat` project and `postgres` service.
- `deploy/uat/smoke.sh`: bounded health, OIDC-disabled, and protected-route checks.

## Local validation without secrets

Use throwaway placeholder files outside the repository. Placeholder values must pass schema shape but must never be reused on a host. Render Compose with an explicit environment file:

```sh
docker compose --env-file /absolute/path/release.placeholders --project-name nexaflow-uat --file compose.uat.yml config --quiet
docker compose --env-file /absolute/path/release.placeholders --project-name nexaflow-uat --file compose.uat.yml config --services
docker compose --env-file /absolute/path/release.placeholders --project-name nexaflow-uat --file compose.uat.yml config --images
```

For disposable local validation only, set both `UAT_COMPOSE_PROJECT_NAME` and `UAT_RESOURCE_PREFIX` to a unique value so existing local Docker objects cannot collide. Set `NEXAFLOW_COMPOSE_PROJECT` to that same value only while exercising backup/restore. Leave all reviewed defaults at `nexaflow-uat` for the eventual clean target.

Build a local validation tag; release execution must instead use an immutable source identifier and record/scan the resulting digest:

```sh
docker build --tag nexaflow:uat-artifact-validation .
docker image inspect nexaflow:uat-artifact-validation --format '{{.Id}}'
```

Run `bash -n` over the three shell tools. Backup/restore must then be exercised against a disposable local project before deployment approval; restore always targets a new explicitly named database and refuses the configured UAT database.

## Private rehearsal sequence after Architecture approval

1. Install protected release/app/PostgreSQL/Caddy environment files outside the repository with mode `0600`.
2. Pull the reviewed application image by digest. Do not build on Lightsail.
3. Start PostgreSQL only and verify health.
4. Take the encrypted empty baseline backup and restore it to a disposable database.
5. Run `migrate` twice and require the second run to be a no-op.
6. Start app and require readiness.
7. Optionally start `uat-mail`; otherwise document email as disabled.
8. Start Caddy on loopback and access it only through an SSH tunnel.
9. Run `deploy/uat/smoke.sh` and the approved product/tenant checks.

Do not run `docker compose down -v`, reuse the local reset command, expose private ports, configure real providers, or invite testers. Public UAT remains blocked on the pre-UAT hardening gate, hostname/DNS/TLS, operator/firewall decisions, backup destination, and Architecture/Operations approval.
