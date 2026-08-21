# Lightsail UAT deployment checkpoint

Date: 2026-08-21  
Status: **deployed and publicly reachable; provider integrations remain UAT-local**  
Host: `nexaFlow-UAT`, static IPv4 `99.79.158.110`, Montreal `ca-central-1a`

## Release identity

- GitHub repository: `mahmoodmobasher/nfv1`
- Initial application/image revision: `16ee671` (`Configure canonical HTTPS alias`)
- Current release/config revision: `fbc2d65` (`Serve authenticated app hostname`)
- Runtime application image: `nexaflow:16ee671`
- Current release path: `/opt/nexaflow/uat/releases/fbc2d65`
- Atomic current pointer: `/opt/nexaflow/uat/current`
- Local release gate before publication: ESLint passed; unit/direct-route tests **32/32** passed with **78** PostgreSQL tests skipped by the normal provider-independent command; Next.js 16.3.1 production build passed.
- Production image dependency audit during build: **0 vulnerabilities**. The known four moderate findings occur only in the development dependency tree.

## Host preparation

- Fresh discovery reconfirmed Ubuntu 22.04.5, 2 vCPU, 3.7 GiB RAM, 75 GiB free, only SSH listening, and no pre-existing Docker/application workload.
- Docker Engine `29.7.2` and Docker Compose `v5.5.0` were installed from Docker's official signed Ubuntu Jammy repository after verifying signing-key fingerprint `9DC8 5822 9FC7 DD38 854A E2D8 8D81 803C 0EBF CD88`.
- Protected application, PostgreSQL, Caddy, release, and backup-key files were generated directly on the host under `/opt/nexaflow/uat/secrets`, owned by root with mode `0600`. Secret values were not stored in GitHub or printed as evidence.

## Database and recovery evidence

- PostgreSQL 16.10 started on the internal Compose network with no published host port.
- All nine checked-in Drizzle migrations applied successfully.
- Migration execution was repeated successfully; migration table count remained **9**.
- An encrypted AES-256-CBC/PBKDF2 logical backup and checksum manifest were created under `/opt/nexaflow/uat/backups`.
- The backup restored successfully into the separately named `nexaflow_restore_16ee671` database with all nine migrations present.
- The disposable verification database was removed after proof; the UAT database was not altered by cleanup.

## Runtime and public verification

- Healthy services: app, Caddy, PostgreSQL, Mailpit, and continuous email worker.
- Public listeners: TCP 80/443 through Caddy only. App port 3000 and PostgreSQL 5432 are not published.
- Mailpit UI is bound only to host loopback `127.0.0.1:8025`; SMTP is private to the Compose network.
- `https://nexaflowsystems.com/` returns HTTP/2 200 with a valid public certificate.
- `https://www.nexaflowsystems.com/` returns HTTP/2 301 to the apex with a valid public certificate.
- `https://app.nexaflowsystems.com/login` returns HTTP/2 200 with a valid public certificate.
- Bounded smoke passed against both the apex and authenticated app origins: liveness, readiness, OIDC-disabled routes, and unauthenticated CRM protection.
- Browser rendering confirmed the AWS-hosted marketing page and its product sign-in target.
- Disk after image pulls/build and service start: 70 GiB free (11% used).

## Intentional limitations and follow-up

- This is a UAT deployment. `OIDC_MODE=disabled`; no Google client or production provider credentials are installed.
- Email is captured by private Mailpit and is not delivered to external recipients. Resend integration remains a separate provider-enabled change.
- The Lightsail firewall still permits SSH from broad IPv4/IPv6 sources. Operations must supply durable operator CIDR(s) before it can be narrowed safely while preserving browser-SSH recovery.
- The encrypted backup currently remains on the instance. Configure an approved encrypted off-instance copy and retention schedule before relying on this environment for durable customer data.
- Automatic Lightsail snapshots were previously enabled, but no completed snapshot was verified during this deployment pass.
- Firebase Hosting DNS routing is no longer used for apex or `www`; the historical Firebase verification TXT record remains because it does not route traffic.
