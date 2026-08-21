# Lightsail Private Rehearsal Gate

Status: **CONDITIONAL ACCEPT — not executable until listed stop conditions are cleared**  
Date: 2026-08-20  
Target: `nexaFlow-UAT` in `ca-central-1a`  
Scope: Phase 2 private rehearsal host preparation only  
Boundary: documentation review only; no host or AWS state was accessed or modified by this review

## Verdict

The discovered instance is a suitable private-rehearsal target: it has no detected application workload or conflicting listener, no Docker-owned state, an attached static IP, a supported Ubuntu release, and sufficient CPU, memory, disk, and free capacity. The locally created deployment artifacts satisfy the clean-target topology and passed proportionate disposable validation, including migrations, health, private bindings, optional Mailpit/worker behavior, backup/restore, smoke checks, build, and production dependency audit.

Architecture therefore **conditionally accepts a bounded Phase 2 write pass**. It is not authorized to execute immediately because Operations-owned safety inputs are still absent. User authorization to use the cleared instance establishes target authority, but it does not supply an SSH source address, operator identity, maintenance window, firewall/IPv6 policy, recovery snapshot, image-delivery mechanism, or image-scan disposition.

Once all **Phase 2 entry conditions** below are recorded and verified, Develop/Operations may execute the allowed mutations without another architecture review, provided there is no discovery drift. This gate does not authorize Phase 3 database bootstrap, any container start, public exposure, or UAT tester admission.

## Evidence accepted

### Local artifacts

- Multi-stage app image with fixed unprivileged runtime UID/GID `10001:10001`, read-only runtime design, dropped capabilities, bounded processes/logs, and pinned base-image digest.
- Digest-pinned PostgreSQL 16.10, Caddy 2.10.2, and Mailpit 1.27.7 definitions.
- Loopback Caddy ports `8080/8443` and Mailpit UI `8025`; no published app, PostgreSQL, or SMTP port.
- Separate frontend/internal-database/operator networks; Caddy has no database-network membership.
- Bounded liveness/readiness checks, migration-head verification, packaged migration tooling, and supervised continuous worker.
- Explicit encrypted backup and fail-closed restore tooling.
- Disposable validation: migration apply/rerun, health, smoke, optional email, encrypted backup/restore, unit **32/32**, lint, build, and zero production dependency vulnerabilities.

The four moderate complete-tree audit findings are development-only Drizzle Kit/esbuild findings and are not present in the production dependency audit. They do not block this private rehearsal. They remain ordinary dependency-maintenance work.

### Host discovery

- Correct target is `nexaFlow-UAT`; the historical name `nexaflow-uat-ca` must not be used.
- Ubuntu 22.04.5 LTS, 2 vCPU, 3.7 GiB RAM, 80 GB system disk, 75 GB free.
- No Docker/Compose packages or daemon, therefore no Docker containers, networks, or volumes to inherit.
- No app, web, database, or Caddy service found; no relevant occupied port.
- Static IPv4 is attached; no domain, load balancer, or CDN attachment exists.
- The `ubuntu` account is non-root and not currently in the Docker group.

## Phase 2 entry conditions — must be cleared before writes

Record all evidence in the engineering execution checkpoint before the first host package/file mutation.

1. **Named operator and access path**
   - Name the human/operator responsible for the pass.
   - Supply the exact approved SSH IPv4 CIDR and, if used, IPv6 CIDR. Do not infer them from a transient session.
   - Define and test the approved recovery path, such as Lightsail browser SSH, before narrowing access.

2. **SSH exposure corrected first**
   - Replace worldwide TCP 22 IPv4/IPv6 access with the supplied operator CIDR(s), preserving only the approved recovery mechanism.
   - Confirm a new SSH session works before closing the existing session.
   - If restriction cannot be proven, stop; do not install packages or files.

3. **Completed recovery snapshot**
   - A successful automatic or explicitly authorized manual Lightsail snapshot must complete.
   - Record snapshot identifier, completion time, target instance, and restore ownership. “Automatic snapshots enabled” is insufficient while no completed copy exists.

4. **Maintenance and reboot authority**
   - Operations supplies the bounded maintenance window and confirms whether OS updates/reboot are allowed.
   - If patching indicates a reboot, complete it and repeat the read-only OS/capacity/listener/workload discovery before continuing.

5. **Firewall and IPv6 decision for the private pass**
   - Operations chooses either Lightsail-firewall-only enforcement or a reviewed UFW policy; Develop must not improvise overlapping rules.
   - For this private rehearsal, close public TCP 80/443 for both IP families or record an explicit Operations exception. Caddy remains loopback-bound regardless.
   - State whether IPv6 remains enabled. If enabled, every SSH/public-port rule must have an equivalent reviewed IPv6 disposition.
   - Reconfirm effective AWS rules and host listeners after changes.

6. **Immutable application transport and vulnerability disposition**
   - The local image ID `sha256:f1f9b3669f92f1be7c6b03b2dcee95d116418790980e52f78aa8c5374a35c034` is build evidence, not a deployable registry digest.
   - Choose either a scoped read-only private registry reference pinned by `sha256` digest, or a `docker save` archive transferred over the approved channel with a separately recorded SHA-256 checksum verified before `docker load`.
   - Run an approved image/OS-layer vulnerability scan without disclosing the private image unexpectedly, or obtain explicit Operations risk acceptance for this private rehearsal. Critical/high findings require documented triage before import/pull.
   - Record source revision, build timestamp, image digest/archive checksum, scanner/version, and result.

7. **No discovery drift**
   - Immediately before Phase 2, repeat the bounded read-only checks for OS, disk, memory, listeners, services, packages, and AWS networking.
   - Stop on a new workload, listener, attached disk, unexpected user/service, material capacity reduction, or AWS rule/state change.

## Exact mutations authorized after entry conditions pass

The write pass is limited to the following ordered operations:

1. Create or confirm the completed Lightsail recovery snapshot and apply the approved SSH/firewall changes described above.
2. Apply supported Ubuntu security/package updates within the maintenance decision; reboot only if approved.
3. Install Docker Engine and the Compose plugin from Docker's official Ubuntu repository, verifying repository key/fingerprint and package source.
4. Enable/start Docker and verify the daemon/Compose versions. Do not enable Docker's unauthenticated TCP API.
5. Keep `ubuntu` out of the Docker group unless Operations explicitly accepts Docker's root-equivalent privilege. Prefer controlled `sudo docker` for this pass.
6. Create only the explicit hierarchy `/opt/nexaflow/uat/{releases,secrets,backups}` and the selected release subdirectory, with reviewed restrictive ownership/modes.
7. Install only the reviewed `compose.uat.yml`, `deploy/uat/Caddyfile`, backup/restore/smoke scripts, key-name template, and release manifest. Install generated app/PostgreSQL/Caddy environment files as mode `0600`; do not print their contents.
8. Use private-rehearsal settings only:
   - loopback bind `127.0.0.1` with host ports 8080/8443;
   - production runtime with one exact private HTTPS technical origin suitable for the SSH tunnel;
   - `OIDC_MODE=disabled`;
   - unique UAT-only database, session, proxy, and disabled-fixture secrets;
   - no Google or real SMTP credentials.
9. Import or pull only the approved application image by verified digest/checksum. Pulling the already digest-pinned PostgreSQL/Caddy/Mailpit images is allowed, but Mailpit selection does not authorize starting it.
10. Render and inspect Compose configuration with secrets redacted, verify service images, mounts, networks, profiles, and bindings, and repeat `ss`, Docker inventory, disk, and memory checks.

## Explicitly not authorized by this gate

- Starting PostgreSQL, app, Caddy, Mailpit, worker, migration, backup, restore, or smoke containers.
- Creating Compose networks or named volumes through service startup.
- Running migrations or creating any application database/data.
- Publishing or binding a service to `0.0.0.0`, `::`, the static IP, port 80, or port 443.
- DNS, domain, certificate, load-balancer, CDN, or public-UAT changes.
- Inviting testers, creating UAT user/customer data, or claiming UAT acceptance.
- Enabling fixture or real Google OIDC, real outbound email, billing, or production integrations.
- Deleting/pruning packages, images, containers, networks, volumes, snapshots, files, or any newly discovered state.
- Closing the four deferred pre-UAT hardening items by waiver; they remain required before external UAT.

Phase 3 database bootstrap and Phase 4 service start require a separate execution checkpoint and authorization after Phase 2 evidence is reviewed.

## Phase 2 stop conditions during execution

Stop immediately and preserve evidence if:

- SSH restriction or recovery access cannot be proven;
- snapshot creation fails or remains pending;
- package source/signature verification fails;
- OS upgrade/reboot changes supportability or network access;
- Docker installation exposes a TCP socket or materially changes firewall behavior;
- a new workload, listener, volume, image, service, user, or unexpected file is discovered;
- the image digest/checksum differs from the approved release manifest;
- the image scan reveals unaccepted critical/high risk;
- Compose rendering publishes app/PostgreSQL/SMTP or binds Caddy/Mailpit beyond loopback;
- generated secrets contain local placeholders, are printed, or have permissions broader than `0600`;
- free disk falls below 40 GB or available memory materially falls below the discovered baseline;
- any command would require deletion, pruning, volume reset, or reuse of unknown state.

## Rollback boundary

This Phase 2 pass creates no application data and starts no application service, so rollback is host-preparation rollback only.

On failure:

1. Stop issuing writes and capture package, service, listener, firewall, filesystem, Docker inventory, and release-manifest evidence with secrets redacted.
2. Restore SSH reachability through the pre-approved recovery path if required; do not reopen SSH globally as an improvised fix.
3. If an incomplete Docker install is the only issue, leave packages/files in place for review rather than purging dependencies or deleting Docker state.
4. Disable Docker only if its enabled service is itself causing the failure and Operations authorizes that bounded action.
5. Do not remove `/opt/nexaflow`, images, firewall rules, or packages during the same failed pass. Removal is a separately reviewed destructive action.
6. If the host becomes unstable or access cannot be recovered safely, Operations may restore the recorded pre-change Lightsail snapshot under a separate explicit recovery decision.

Successful Phase 2 completion means: supported/patched host, restricted/recoverable SSH, approved firewall posture, Docker/Compose available without public Docker API, protected release/secrets layout, verified immutable images present, Compose rendering private, and no services/volumes/networks started or created.

## Decisions that remain with User/Product/Operations

### Required before this Phase 2 pass

- named operator and exact SSH source CIDR(s);
- SSH recovery method;
- completed snapshot/restore owner;
- maintenance window and reboot permission;
- Lightsail-only versus UFW policy and IPv6 treatment;
- private registry versus verified archive transfer;
- private image scanning approval/tool or explicit rehearsal-only risk acceptance.

### Not required for Phase 2, but required before Phase 3/4 or tester admission

- encrypted backup key owner and off-instance backup destination;
- UAT Mailpit versus email-disabled mode;
- private rehearsal data retention/end date;
- named monitoring/alert recipient;
- public UAT approval, canonical hostname, DNS control, ACME contact, and public 80/443 opening;
- UAT tester list and data classification;
- real Google and transactional-email provider decisions, which remain disabled and are not required for this private rehearsal.

Architecture does not infer any of these values from the user's general host authorization.

## Next gate

After Phase 2, Develop/Operations must record exact commands, package sources/versions, snapshot and firewall evidence, release digest/checksum, scan disposition, directory/file modes, redacted Compose rendering, Docker inventory, listeners, and resource usage in a durable engineering checkpoint.

If that evidence matches this boundary, Architecture may authorize Phase 3/4 private database bootstrap, migration, loopback-only service start, backup/restore rehearsal, and bounded SSH-tunnel smoke. Public UAT remains a later gate.
