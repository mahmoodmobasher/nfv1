# Lightsail private-rehearsal readiness discovery

Date: 2026-08-20  
Plan: `docs/architecture/lightsail-clean-uat-plan.md`  
Disposition: **STOP for Architecture/Operations review; private rehearsal is not yet authorized**

## Scope and safety boundary

Phase A created and validated deployment artifacts locally with placeholder-only values. Phase B used known-host-verified SSH and the signed-in Lightsail console for read-only discovery. No file or directory was created on Lightsail; no package was installed; no service, firewall rule, instance, listener, container, network, volume, disk, snapshot, DNS record, or AWS setting was created, changed, started, stopped, rebooted, or deleted. No host environment values or secrets were read or printed.

The console inventory identifies the actual instance as `nexaFlow-UAT`. An earlier historical name, `nexaflow-uat-ca`, does not exist in `ca-central-1` and must not be used by a deployment runbook.

## Phase A — local artifact evidence

Created and reviewed:

- multi-stage, digest-pinned-base `Dockerfile` with fixed unprivileged runtime identity `10001:10001`;
- `.dockerignore` excluding environment files, credentials, Git state, reports, tests, local data, logs, and backups;
- `compose.uat.yml` with app, PostgreSQL, migration, Caddy, optional Mailpit, and optional continuous worker services;
- digest-pinned PostgreSQL 16.10, Caddy 2.10.2, and Mailpit 1.27.7 images;
- loopback-first Caddy and Mailpit UI bindings; no published app, PostgreSQL, or SMTP port;
- internal database network, Caddy isolated to frontend, and a Mailpit-only operator network needed to realize its loopback UI binding;
- bounded `/api/health/live` and `/api/health/ready`; readiness checks PostgreSQL plus exact checked-in migration count/head and returns no inventory or database detail;
- packaged `tsx` migration and restartable continuous email-worker entry points in production dependencies;
- encrypted logical backup, fail-closed new-database restore, and bounded smoke tools;
- key-name-only UAT environment template and private-rehearsal documentation.

Validation results:

| Check | Result |
| --- | --- |
| Local image build | Passed; local image ID `sha256:f1f9b3669f92f1be7c6b03b2dcee95d116418790980e52f78aa8c5374a35c034` |
| Runtime identity | Passed; UID/GID `10001:10001`, workdir `/app` |
| Packaged operations | Passed; `tsx 4.23.12` on Node `22.22.0` available in final image |
| Compose render | Passed for all six services and both optional profiles |
| Exposure assertions | Passed; Caddy loopback 8080/8443, Mailpit UI loopback 8025, app/PostgreSQL no published ports, SMTP unpublished |
| Caddy validation | Passed with digest-pinned image; HTTP-only warning is expected for the non-secret private placeholder site |
| Disposable PostgreSQL | Healthy after adding only the official entrypoint capabilities required for initialization |
| Migration | Applied successfully, then reran successfully with no additional work |
| App health | Liveness and readiness healthy against the migrated disposable database |
| Optional email mode | Mailpit healthy; continuous worker remained running and restarted successfully under Compose supervision |
| Bounded smoke | Passed health, OIDC-disabled routes, and unauthenticated protected-route behavior through loopback Caddy |
| Backup/restore | Encrypted backup plus checksum manifest created; restored into `nexaflow_validation_restore`; 9 migration rows verified |
| Unit/direct-route tests | 32/32 passed; 78 PostgreSQL tests skipped by the normal command as designed |
| Lint | Passed with no warnings |
| Production build | Passed; Next.js 16.3.1, including both health routes |
| Production dependency audit | 0 vulnerabilities |
| Complete dependency audit | 4 moderate development-only findings through legacy esbuild under Drizzle Kit; safe automatic fix unavailable without a breaking forced downgrade |
| Image CVE scan | Not run: Docker Scout would transmit private image metadata/layers externally and no explicit export approval was provided |

The collision-free disposable validation containers, databases, networks, and volumes were removed after evidence collection. Unrelated pre-existing local Docker containers carrying a historical `nexaflow-uat` project label were observed and left untouched. Placeholder validation files and encrypted placeholder backup remain only under `/tmp/nexaflow-uat-validation`; they contain no provider or host credentials.

## Phase B — host discovery findings

### Identity, OS, and capacity

| Item | Read-only finding |
| --- | --- |
| Instance | `nexaFlow-UAT`, running, general-purpose, dual-stack |
| Region/AZ | Montreal `ca-central-1a` |
| OS | Ubuntu 22.04.5 LTS (Jammy), kernel `6.8.0-1063-aws` |
| CPU | 2 vCPU; discovery load average `0.00, 0.00, 0.00` |
| Memory | 3.7 GiB total, 3.3 GiB available at discovery |
| Swap | None |
| Disk | 80 GB system disk; root filesystem 78 GB, 75 GB available, 4% used |
| Additional disks | None attached/available in the instance Storage view |
| Operator | `ubuntu` UID 1000; passwordless read-only sudo worked; not a Docker-group member |

Capacity meets the plan's recommended minimum of 2 vCPU, approximately 4 GB RAM, and at least 40 GB storage with more than 30% free. The lack of swap is not a blocker but provides no crash cushion.

### Runtime and workload inventory

- Docker Engine, Docker Compose, Docker/Caddy packages, and their CLIs are absent (`docker: command not found`; package query empty).
- Consequently Docker container, network, and volume inventory commands could not run; there is no Docker daemon capable of owning such objects.
- Running system services are standard OS facilities plus SSH, unattended upgrades, and the Amazon SSM agent. No application, web server, database, Caddy, or container service appeared.
- TCP listeners are SSH on `0.0.0.0:22` and `[::]:22`, plus the local system resolver. No listener occupies 80, 443, 3000, 5432, 8025, or 1025.
- Host UFW is installed but inactive.

### Lightsail networking and AWS state

| Item | Read-only finding |
| --- | --- |
| Static IPv4 | `99.79.158.110`, attached as `nexaflow-uat-ip` |
| Private IPv4 | `172.26.13.12` |
| Public IPv6 | `2600:1f11:9c5:b900:d210:1fc4:1558:77c7` |
| Lightsail firewall | TCP 22, 80, and 443 each allow any IPv4 or IPv6 address; SSH also permits Lightsail browser SSH |
| Load balancer | None attached |
| Distribution/CDN | Instance is not an origin |
| Instance domains | No custom domain available or attached |
| Global DNS inventory | Could not be fully listed: console returned `AccessDeniedException` for `ListDomainsCommand` with the account/service eligibility message; no DNS zone may be inferred beyond the instance's explicit no-domain state |
| Snapshots | Automatic snapshots enabled for 4:00 AM EDT with seven-copy retention, but no snapshot has completed yet; no manual snapshot was shown |
| Monitoring | Lightsail CPU/burst metric views are available; no configured instance alarm was shown in the inspected overview |

## Stop conditions and required decisions

The following plan stop conditions are active:

1. **Docker and Compose are absent.** Installation is a Phase 2 host mutation and requires Architecture/Operations approval.
2. **SSH is open to every IPv4 and IPv6 source in the Lightsail firewall.** Restrict TCP 22 to named operator source addresses (while preserving an approved recovery path) before deployment work.
3. **No completed snapshot exists.** Require a successful initial Lightsail snapshot before host preparation and still use the application-level encrypted PostgreSQL backup/restore process; a snapshot alone is not database recovery.
4. **No UAT hostname or DNS attachment exists.** This limits the next pass to a private SSH-tunnel rehearsal. Public browser UAT remains blocked.
5. **Host firewall is inactive.** Operations must decide whether Lightsail firewall-only enforcement is accepted or whether a host firewall will be configured; do not create overlapping rules ad hoc.
6. **Public 80/443 are already allowed for both IP families.** A private rehearsal must keep Caddy loopback-bound and verify effective listeners. Public exposure cannot begin until hostname/TLS and pre-UAT gates are approved.
7. **The four deferred pre-UAT hardening items remain open.** The plan permits a private technical rehearsal before closure, but no testers or UAT acceptance may be claimed.

Before a host-write pass, Architecture/Operations must also name the operator and allowed SSH source addresses, decide UAT Mailpit versus email-disabled mode, approve data retention/end date and off-instance encrypted-backup destination/key owner, and confirm a maintenance window and IPv6 policy.

## Recommended disposition

The instance appears empty of application workloads, has no occupied application ports, has an attached static IP, and meets the minimum resource baseline. It is therefore a plausible **private rehearsal target after the stop conditions above are explicitly cleared**. It is not ready for immediate deployment and is not eligible for public UAT.

Recommended next authorization is a separately reviewed Phase 2 private-rehearsal pass that installs Docker/Compose, restricts SSH, confirms the first snapshot, installs protected files outside the repository, pulls the application by immutable digest, and follows the ordered database backup/migration/app/Caddy smoke sequence. No part of that pass was performed here.
