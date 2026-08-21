# Lightsail Clean-Target UAT Deployment Plan

Status: **implementation-ready plan; deployment not performed**  
Date: 2026-08-20  
Target: user-authorized, cleared AWS Lightsail instance treated as empty and unknown  
Application baseline: accepted local CRM core, Next.js 16.3.1, PostgreSQL 16, Docker Compose, Caddy

## Decision summary

Deploy one immutable application release behind Caddy, with PostgreSQL on a private Compose network and persistent named volumes. Run migrations as a separate one-shot release task before switching Caddy to the new application. Use password authentication for initial UAT. Set OIDC to `disabled`; fixture OIDC is forbidden with `NODE_ENV=production`, and real Google support is not deployable until its production adapter, callback domain, and credentials exist.

A public browser UAT requires a Product/Operations-approved UAT hostname resolving to the instance and inbound TCP 80/443 for Caddy certificate issuance. Without that hostname, Develop may perform only a private technical deployment accessed through an SSH tunnel; it is not a public browser UAT.

Transactional email has two valid UAT modes:

1. **UAT Mailpit:** run Mailpit privately, bind its UI only to `127.0.0.1`, access it through SSH, and label all captured messages UAT-only. This supports registration, verification, password reset, and invitation testing without sending external mail.
2. **Email disabled:** do not run the email worker. Outbox records remain pending and email-dependent journeys are declared unavailable. Do not point the current Mailpit adapter at a real SMTP provider.

## Preconditions and stop conditions

No host write may occur until the read-only discovery report is reviewed. Stop if discovery finds an existing workload, unknown data/volumes, unsupported OS, insufficient capacity, an occupied public port, unexpected firewall exposure, or missing backup/rollback space. “Cleared” is context, not evidence for destructive commands.

Before external UAT begins, close the deferred pre-UAT items retained by `delivery-scope-reset.md`:

- recoverable Owner-transfer idempotent replay after Session rotation;
- complete route-level denial auditing and normalized invitation-destination rate limiting;
- deterministic local fixture-OIDC recent-auth test, even though fixture mode remains disabled in UAT;
- a clean full Playwright run and the deferred invitation-administration verification.

These are a pre-UAT gate, not a reason to reopen the accepted CRM architecture. A private deployment rehearsal may occur before closure, but testers must not be invited and no UAT acceptance may be claimed.

## Target topology

```text
Internet
  -> Lightsail firewall: TCP 80/443 only (+ SSH restricted to operator IPs)
  -> Caddy container: TLS termination, security headers, trusted proxy headers
  -> app container: Next.js, private network only, port 3000
  -> PostgreSQL 16 container: private database network only, port 5432

Optional UAT-only:
  app/email worker -> Mailpit SMTP on private network
  Mailpit UI -> host 127.0.0.1:8025 -> operator SSH tunnel only
```

- Do not publish application port 3000 or PostgreSQL port 5432 on the public interface.
- Put Caddy and app on a `frontend` network. Put app, migration task, optional worker, and PostgreSQL on a separate `database` network. Caddy must not join the database network.
- Bind Mailpit UI as `127.0.0.1:8025:8025`; do not publish SMTP. Mailpit data may be ephemeral unless message retention is needed for a specific UAT cycle.
- Use restart policies for Caddy, app, PostgreSQL, and the optional continuous worker. Migration and backup jobs are one-shot and must not restart automatically.

## Required deployment artifacts Develop creates locally

Create and review these in the repository before touching the host:

- a multi-stage production `Dockerfile`, pinned by image digest where practical;
- a `.dockerignore` excluding `.env*`, `.git`, test artifacts, local database data, and credentials;
- `compose.uat.yml` containing Caddy, app, PostgreSQL, migration task, and optional Mailpit/worker profiles;
- a UAT `Caddyfile` with one canonical hostname, app reverse proxy, compression, request-size bounds, and the authenticated forwarding headers expected by the application. Caddy must overwrite/remove any client-supplied `X-NexaFlow-Proxy-Secret` and inject the configured value only on the private app hop;
- an environment key template containing names only, never real values;
- an HTTP liveness endpoint and readiness endpoint. Liveness must not query dependencies. Readiness must verify PostgreSQL and migration compatibility while returning no secret, version inventory, or database detail;
- a production-runnable migration command and, if email is enabled, a supervised continuous outbox worker. The current TypeScript scripts depend on `tsx` in development dependencies and the current worker is one batch then exit; the production image must explicitly package runnable migration/worker entry points or email must remain disabled;
- backup and restore scripts that operate on explicit Compose project/service/volume names and fail closed.

The application image must be built in CI or a trusted build machine, tagged with an immutable release identifier such as the source commit, scanned, and transferred/pulled by digest. Do not build from an unverified mutable branch on Lightsail.

## Runtime identity and filesystem

- Run the application and worker as a fixed unprivileged UID/GID created in the image; set `USER` in the final image.
- Use a read-only root filesystem for app/worker where compatible, `no-new-privileges:true`, drop all Linux capabilities, and provide a small `tmpfs` for `/tmp` if Next.js requires it.
- Do not mount the Docker socket into any service.
- Caddy may bind host 80/443 through Docker port publishing; it must otherwise run with the minimum capabilities supported by its official image.
- PostgreSQL uses its official container user and owns only its data/backup paths.
- The SSH/deployment operator must be non-root with narrowly scoped Docker access. Treat Docker-group membership as root-equivalent and restrict it accordingly.

## Secrets and environment

Store the runtime environment on the host outside the repository, for example `/opt/nexaflow/uat/secrets/app.env`, mode `0600`, owned by the deployment operator. Compose references it with `env_file`; it must never be baked into an image, copied into logs, committed, or printed by verification commands.

Generate unique values on a trusted operator machine with a cryptographic generator and transfer them over the approved SSH channel. Do not place secret values directly in shell history. Required values:

| Setting | UAT decision |
| --- | --- |
| `NODE_ENV` | `production` |
| `APP_ORIGIN` | exact `https://<uat-hostname>`; no path and no alternate origin |
| `DATABASE_URL` | private Compose hostname, unique DB user and strong password; percent-encode URL components |
| `SESSION_SECRET` | unique random value of at least 32 bytes; never reuse local or production values |
| `SESSION_COOKIE_NAME` | UAT-specific name recommended, such as `nexaflow_uat_session` |
| `TRUSTED_PROXY_ENABLED` | `true` only when Caddy injects the matching authenticated proxy secret |
| `TRUSTED_PROXY_SECRET` | separate unique random value, shared only by Caddy/app configuration |
| `OIDC_MODE` | `disabled` |
| `OIDC_FIXTURE_SECRET` | schema currently requires a value; use a unique non-local placeholder secret even while disabled |
| `OIDC_REDIRECT_URIS` | exact HTTPS callback values for schema/config consistency; routes remain 404 while disabled |
| `SMTP_HOST` / `SMTP_PORT` | Mailpit service/1025 only when the UAT Mailpit profile is enabled; otherwise inert internal values and no worker |
| Session/recent-auth/invitation durations | retain accepted defaults unless Product explicitly changes UAT behavior |

Do not configure real Google client secrets or real SMTP credentials in this release. Before first production deployment, move secrets to an approved managed secret store and define rotation; a root-readable host file is acceptable only as the bounded UAT bootstrap.

## HTTPS and domain decision

### Recommended public UAT

Product/Operations supplies one dedicated hostname, for example `uat.example.com`, and creates an A/AAAA record only after the instance's static IP is confirmed. Caddy obtains and renews the public certificate. Configure only that hostname in Caddy and `APP_ORIGIN`; redirect HTTP to HTTPS and reject unknown Host headers.

Open inbound 80 temporarily/permanently as required for ACME redirect/challenge and 443 for UAT. Restrict SSH to named operator source IPs. Do not open 3000, 5432, 8025, or 1025 in Lightsail or the host firewall.

### No domain available

Keep Caddy/app bound to loopback and use an SSH tunnel for deployment smoke checks. A self-signed/internal Caddy certificate may be used only for named technical testers with an explicitly installed test CA; it is not the default and must not train users to bypass certificate warnings. Do not call this public UAT.

## Persistent data, backup, and restore

- Persistent named volumes: PostgreSQL data, Caddy data, and Caddy configuration. Use explicit project-prefixed names; never rely on an unidentified existing volume.
- Create an encrypted logical PostgreSQL backup before every migration and release switch, and daily during UAT. Retain at least seven daily copies plus the pre-release backup.
- Store one copy outside the instance (encrypted S3 bucket or approved operator-controlled destination). A Lightsail snapshot alone is not a database recovery strategy.
- Record database name, release identifier, migration head, timestamp, checksum, encryption method/key owner, and restore command in a backup manifest without recording credentials.
- Test restoration into a separate disposable database before inviting UAT testers and after any backup-script change.
- Never use `docker compose down -v`, delete named volumes, or reuse the local reset command on UAT.

## Ordered Develop runbook

Commands below are templates. Replace angle-bracket values only after discovery and review. Run from an explicit directory; never use broad deletion commands, unresolved globs, or unreviewed scripts.

### Phase 0 — local release gate

1. Close the four deferred pre-UAT items listed above.
2. Run the normal unit, 78-test PostgreSQL integration, full Playwright, lint, production build, migration apply/rerun, dependency audit, and image scan checks.
3. Build the immutable image and record its source revision and digest:

```sh
docker build --pull --tag <registry>/nexaflow:<release-id> .
docker image inspect <registry>/nexaflow:<release-id> --format '{{index .RepoDigests 0}}'
```

4. Validate the exact UAT Compose rendering with redacted/non-secret values and inspect it for public bindings:

```sh
docker compose --project-name nexaflow-uat --file compose.uat.yml config --quiet
docker compose --project-name nexaflow-uat --file compose.uat.yml config --services
docker compose --project-name nexaflow-uat --file compose.uat.yml config --images
```

### Phase 1 — mandatory read-only host discovery

After explicit host-access authorization, connect without changing state and capture:

```sh
uname -a
cat /etc/os-release
df -h
free -h
nproc
uptime
id
docker version
docker compose version
docker info
docker ps --all
docker network ls
docker volume ls
ss -lntup
systemctl --no-pager --type=service --state=running
sudo ufw status verbose
```

Also review the Lightsail console firewall, static IP attachment, DNS state, disk/snapshot status, and AWS monitoring. `docker inspect` and `docker volume inspect` may be used on discovered objects; do not start, stop, prune, remove, or overwrite anything. Redact environment values from the report.

Architecture/Operations must confirm the target is safe before Phase 2.

### Phase 2 — host preparation

1. Patch the supported OS and install Docker Engine/Compose from the official repository if discovery shows they are absent. Reboot if required, then repeat discovery.
2. Create explicit directories such as `/opt/nexaflow/uat/{releases,secrets,backups}` with restrictive ownership; do not deploy into a home directory.
3. Install the reviewed Compose/Caddy release files under an immutable release directory and a `current` symlink. Install `app.env` separately as mode `0600`.
4. Authenticate to the image registry with a scoped read-only credential and pull the image by digest:

```sh
docker pull <registry>/nexaflow@sha256:<digest>
docker image inspect <registry>/nexaflow@sha256:<digest>
```

5. Configure host and Lightsail firewalls: 80/443 public, SSH source-restricted, everything else denied. Confirm the resulting listeners again with `ss`.

### Phase 3 — database bootstrap and backup baseline

1. Start PostgreSQL only and wait for its health check:

```sh
docker compose --project-name nexaflow-uat --file compose.uat.yml up --detach --wait postgres
docker compose --project-name nexaflow-uat --file compose.uat.yml ps
```

2. Run the database health command from the release image on the private network.
3. Take and verify an empty baseline logical backup, then perform a test restore into a temporary, explicitly named database.
4. Run migrations as a one-shot task and run them a second time to prove a safe no-op:

```sh
docker compose --project-name nexaflow-uat --file compose.uat.yml run --rm migrate
docker compose --project-name nexaflow-uat --file compose.uat.yml run --rm migrate
```

5. Record migration output, release digest, and backup manifest. Stop on any warning about missing history, drift, or partial migration.

### Phase 4 — application and edge start

1. Start app without Caddy; confirm container health and readiness from inside the Compose network.
2. If selected, start Mailpit and the supervised worker profile. Confirm Mailpit is reachable only from the host loopback/SSH tunnel.
3. Start Caddy and inspect status/logs:

```sh
docker compose --project-name nexaflow-uat --file compose.uat.yml up --detach --wait app
docker compose --project-name nexaflow-uat --file compose.uat.yml --profile uat-mail up --detach --wait mailpit email-worker
docker compose --project-name nexaflow-uat --file compose.uat.yml up --detach --wait caddy
docker compose --project-name nexaflow-uat --file compose.uat.yml ps
docker compose --project-name nexaflow-uat --file compose.uat.yml logs --since 10m --no-color caddy app postgres
```

Omit the profile command when email is disabled. Never start fixture OIDC in production mode.

### Phase 5 — smoke and UAT admission

Run smoke tests in this order:

1. HTTP redirects to the exact HTTPS hostname; unknown hosts are rejected.
2. Certificate hostname, chain, and expiry are valid; TLS works without browser warnings.
3. Liveness and readiness return only bounded status and fail when the app or database is intentionally unavailable during a controlled rehearsal.
4. Unauthenticated protected CRM routes redirect/deny correctly.
5. Password registration, verification, login, refresh, current-device logout, all-device logout, recovery/reset, and recent-password proof pass using Mailpit if enabled.
6. Workspace creation produces one Workspace and sole Owner; refresh preserves server-derived context.
7. Invitation stabilization cases preserve active Membership roles and enforce seat capacity.
8. CRM Owner journey: create/search/view/edit/move/note Lead.
9. CRM Member visibility: Workspace/owned/current-Team paths work; hidden known UUID read and update return tenant-safe not-found with no side effects.
10. Cross-tenant reads and writes remain tenant-safe denied.
11. OIDC start, fixture, callback, and recent-OIDC endpoints return 404 while `OIDC_MODE=disabled`; the UI must not advertise Google sign-in.
12. No secret appears in HTML, API errors, application/Caddy logs, Compose output, or browser storage.
13. Backup after seeded UAT data and restore it into a disposable database; compare critical row counts.

Only after the pre-UAT gate, smoke evidence, backup/restore evidence, and Product acceptance of UAT-only limitations may testers be invited.

## Health checks and observability

- Compose health must cover PostgreSQL readiness, app liveness, app readiness, and Caddy reachability.
- Caddy should proxy only to healthy app instances. Readiness must fail during migration mismatch or database unavailability; liveness must remain independent to avoid restart loops during a database incident.
- Send container logs to Docker's `local` or size-bounded `json-file` driver with rotation (for example 10 MB × 5 files per service). Application logs must be structured, timestamped, and free of tokens, cookies, encrypted envelopes, passwords, proxy secrets, and database URLs.
- Monitor disk, memory, CPU, container restarts, HTTP 5xx, readiness failures, PostgreSQL health/connections, backup age/failure, outbox retry/dead-letter counts, authentication rate limits, and certificate expiry.
- Define one named UAT operator and alert destination before tester admission. UAT logs are operational evidence, not a substitute for the database audit trail.

## Resource baseline

Recommended minimum for app + PostgreSQL + Caddy on one UAT instance: **2 vCPU, 4 GB RAM, and 40 GB SSD** with at least 30% free disk after images, volumes, logs, and backups. A 2 GB instance may be used only after measured build/runtime testing with images built off-host; it has little margin for Next.js, PostgreSQL, migrations, and browser-driven concurrency. Do not build the image on a memory-constrained UAT host.

Set explicit container memory/CPU reservations or limits after discovery. Keep PostgreSQL connections bounded, configure log rotation, and alert at 70% disk and 80% sustained memory. Swap may provide crash protection but is not capacity.

## Release switch and rollback

- Keep the prior Compose release files and immutable image digest available.
- Prefer backward-compatible expand/contract migrations. An application rollback is safe only when the prior image can read the migrated schema.
- Before migration: take and verify the pre-release backup.
- If migration fails: do not start the new app; retain logs and restore only into a new volume/database until the cause is understood.
- If smoke fails without incompatible data writes: point the `current` release to the prior files/image and restart app/Caddy, leaving PostgreSQL untouched.
- If the release wrote data incompatible with the prior version: stop app/worker, preserve forensic backup, restore the pre-release backup into a new explicit PostgreSQL volume, start the prior image against that restored volume, validate, then switch traffic.
- Never “roll back” by editing migration history or deleting a migration row. Never delete the failed database volume until restoration and incident review are complete.

Rollback success requires HTTPS, readiness, password login/logout, workspace context, CRM read/write, tenant denial, and outbox state smoke checks on the prior release.

## Capability matrix

| Capability | Deploy without Google/email/domain? | UAT disposition |
| --- | --- | --- |
| Private infrastructure rehearsal | Yes | SSH tunnel; not public UAT |
| Public browser UAT | Needs HTTPS hostname | Blocked until DNS/TLS decision |
| Password login and existing verified users | Yes | Enabled |
| Registration/reset/invitations | Needs Mailpit or real email | Enable with private Mailpit for UAT, otherwise declare unavailable |
| Real outbound email | No | Disabled until provider, sender domain, credentials, bounce/webhook handling, and production adapter exist |
| Fixture OIDC | No in production mode | Disabled; endpoints must fail closed |
| Real Google OIDC | No | Disabled until adapter, project, consent, exact HTTPS redirects, credentials, and acceptance tests exist |
| CRM/workspace/tenant flows | Yes after pre-UAT gate | Enabled |
| Billing/production operations | No | Out of UAT scope |

## Required decisions and handoff

Product/Operations must supply only:

- whether this is a private rehearsal or public browser UAT;
- the canonical UAT hostname and DNS control for public UAT;
- named deployment/UAT operators and allowed SSH source addresses;
- Mailpit UAT versus email-disabled mode;
- UAT data classification, tester list, retention/end date, and backup destination/key owner;
- instance size/static IP confirmation and acceptable maintenance window.

Develop owns the deployment artifacts, pre-UAT remediation, immutable image, migration/health/backup tooling, smoke automation, and evidence pack. Architecture reviews the read-only discovery report and final Compose/security rendering before host writes. Operations owns firewall, DNS, secrets installation, backups, monitoring, release execution, and rollback authority.

This plan assumes no old container, image, network, volume, secret, certificate, or database state. Nothing discovered on the host may be reused or removed merely because the instance was described as cleared.
