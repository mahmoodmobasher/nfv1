# Nexa Spectrum Phases 1–4 UAT deployment result

Date: 2026-08-24

Status: **BLOCKED — candidate withdrawn and prior healthy release restored**

UAT URL: `https://app.nexaflowsystems.com`

## Release authority and artifact

- Authorized application revision: `9162a90ebf125d04641e6148cfe1d6cd6b2c7c1b`.
- Prior and final healthy UAT application revision: `e58c22a11e8239f65936542ce75ff73963fb99c1` / `v0.4.0-uat.1`.
- Attempted UAT-only release identifier: `v0.5.0-uat.1`. The annotated tag was pushed normally and resolves to `9162a90`; it identifies this rejected deployment attempt and must not be reused.
- Candidate release directory: `/opt/nexaflow/uat/releases/9162a90`.
- Candidate image: `nexaflow:9162a90`, image ID `sha256:f5891d9a045b30b2b7d3d3b26127d6fa588241bd2bb2f7874aaf8ab099ec57ad`, architecture `linux/amd64`.
- The image was built off-host from exact `origin/main` revision `9162a90`, labeled with the full revision and `v0.5.0-uat.1`, archived, checksummed, transferred, and accepted only after archive checksum, image architecture, revision, and version checks passed.

## Prerequisites, backup, and migration

- `origin/main` and the UAT tag were verified against exact authorized revision `9162a90` before packaging. No remote drift occurred.
- Read-only host discovery found the prior `e58c22a` pointer healthy, all five UAT services running, adequate disk/memory, PostgreSQL ledger 12, root-owned mode-`0600` configuration/backup key files, and retained prior images/releases.
- Encrypted pre-release backup: `/opt/nexaflow/uat/backups/nexaflow-uat_9162a90-pre_20260824T070249Z.sql.gz.enc`, mode `0600`, with mode-`0600` checksum manifest.
- The backup decrypted and restored successfully into explicitly named disposable database `nexaflow_restore_9162a90`; the restore contained all 12 migrations. The disposable database was removed after proof.
- Candidate Compose rendering passed. The accepted migration task completed and immediately reran cleanly. The live ledger remained exactly 12; no migration was added by this release.
- The protected release authority and current pointer were switched atomically. App, email worker, and Caddy recreated successfully; PostgreSQL and Mailpit remained healthy.

## Material post-switch failure

The first public privacy probe found that invitation capture returned the correct HTTP 303, exact token-free `Location`, private/no-store controls, secure bounded cookies, and no raw or encoded bearer token, but the live edge returned:

`Referrer-Policy: strict-origin-when-cross-origin`

The accepted Phase 4 contract requires `Referrer-Policy: no-referrer` for invitation capture and clean/terminal invitation documents. The application emits the stricter value, but the deployed Caddy header policy replaces it with the broader global value. This is a material security-boundary failure, so the remaining authenticated, visual, responsive, and transactional UAT acceptance matrix was intentionally not continued on the rejected image.

No secret, cookie, bearer token, recipient, password, environment value, or provider response was printed or persisted in this report. The probe token was synthetic.

## Rollback result

- Candidate release authority was retained as protected `release.env.failed-9162a90`; prior authority remains protected as `release.env.pre-9162a90`. Both are root-owned mode `0600`.
- The protected current pointer was atomically restored to `/opt/nexaflow/uat/releases/e58c22a` and the prior release authority was restored.
- App and email worker run `nexaflow:e58c22a`; Caddy, PostgreSQL, and Mailpit remain on their prior pinned images.
- App, Caddy, PostgreSQL, and Mailpit are healthy; email worker is running. App, worker, and Caddy restart counts are zero after rollback.
- The migration ledger remains 12. No database restore or data rewrite was required because the candidate added no migration and the failure occurred at the response-header boundary.
- Repository bounded HTTPS smoke passed after rollback: live, ready, disabled OIDC endpoints, and unauthenticated CRM protection.
- A bounded 15-minute log inspection found zero error/fatal/panic/exception lines and zero literal `token=` lines; log contents and secrets were not exported.
- Existing UAT tester accounts and provider configuration were not changed.

## Disposition

**NO-GO for Product UAT acceptance of `v0.5.0-uat.1`.** UAT remains healthy on `v0.4.0-uat.1` / `e58c22a`.

Required next action: produce a bounded, reviewed Caddy/application header contract remediation that preserves application `no-referrer` on invitation token documents while retaining the accepted global edge headers elsewhere. The remediation needs focused positive and negative edge tests and a new immutable UAT candidate; use a new release identifier rather than reusing `v0.5.0-uat.1`.

No production deployment, production tag, DNS, infrastructure, secret, provider, billing, or Phase 5 action occurred.
