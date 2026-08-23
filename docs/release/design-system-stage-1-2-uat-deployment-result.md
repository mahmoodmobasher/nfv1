# Design System Stage 1/2 UAT deployment result

Status: **DEPLOYED — engineering verification complete**  
Completed: 2026-08-23 19:43 UTC  
Environment: `https://app.nexaflowsystems.com`

## Release authority and artifact

- Application source: `e58c22a11e8239f65936542ce75ff73963fb99c1`, verified equal to the authorized `origin/main` head before packaging.
- Immutable release tag: `v0.4.0-uat.1`, pushed and verified to resolve to the same application commit.
- Host release: `/opt/nexaflow/uat/releases/e58c22a`; the protected `current` pointer resolves to this directory.
- Application image: `nexaflow:e58c22a`, image ID `sha256:7e15912684e7227e0f5744902a3f98b67cd198d5f07d4a9ac8c307715ffe1b88`, architecture `linux/amd64`.
- The image was built off-host from the authorized tree, labeled with the full revision and release tag, transferred as a compressed archive, and accepted only after the transferred archive SHA-256 and embedded revision/platform checks passed.
- An initial ARM64 artifact was rejected at the first migration-container process boundary with `exec format error`. No migration executed, no service or pointer changed, and protected release authority was immediately restored to `0e596cf`. The candidate was rebuilt explicitly for AMD64 and independently revalidated before deployment resumed.

## Backup, migration, and rollback evidence

- Encrypted pre-migration backup: `/opt/nexaflow/uat/backups/nexaflow-uat_e58c22a-pre_20260823T193137Z.sql.gz.enc`, with its mode-`0600` manifest.
- The backup decrypted and restored successfully into the explicitly named disposable database `nexaflow_restore_e58c22a`; its Drizzle ledger contained 12 entries.
- The candidate migration service completed and two explicit non-interactive reruns completed cleanly. The live ledger remains exactly 12 entries.
- Additive migration `0011_white_masque.sql` remains installed. Routine application rollback must not remove its preferences table or indexes.
- Protected current and rollback release-authority files are `root:root` mode `0600`.
- Rollback application release `/opt/nexaflow/uat/releases/0e596cf`, image `nexaflow:0e596cf`, and `/opt/nexaflow/uat/secrets/release.env.pre-e58c22a` remain present. Rollback is an atomic image-authority/current-pointer restore followed by recreation of app, worker, and Caddy; database rollback is not part of routine rollback.

## Runtime and smoke evidence

- PostgreSQL: healthy; migration ledger 12.
- Application: healthy on `nexaflow:e58c22a`, restart count 0.
- Email worker: running, restart count 0.
- Caddy: healthy, restart count 0.
- Repository bounded HTTPS smoke passed after the pointer switch: live, ready, disabled OIDC routes, and unauthenticated CRM protection.
- `/login` returned HTTP 200 with a nonce-bearing CSP. The pre-paint bootstrap nonce matched the CSP; neither `unsafe-inline` nor `unsafe-eval` was authorized.
- A stale configured session cookie produced a private, no-store response. Unauthenticated profile and preferences APIs returned HTTP 401 with `Cache-Control: private, no-store`.

## Focused authenticated evidence

No existing password or session credential was read or printed. A short-lived operator-created Session for an existing active Member was held only in process memory and revoked after each check.

- Authenticated profile and preferences reads returned HTTP 200 with private, no-store responses.
- Versioned preference updates exercised Light, Dark, and System. Authenticated first paint reflected each server-authoritative appearance.
- A stale preference write returned HTTP 409 with private, no-store; a current-version retry succeeded.
- The authenticated Pipeline returned HTTP 200 under Dark first paint and rendered Pipeline content.
- Exact pre-deployment preference values were recovered from the verified backup restore and restored through the versioned API after the checks.
- Password change from a non-recent Session returned the bounded HTTP 401 `recent_auth_required` response. User security version, active reset-token count, and password-change success-Audit count were unchanged.
- Revoking the operator-created Session made the next profile request return HTTP 401 with private, no-store.
- The release-clearance PostgreSQL regressions remain the evidence for successful password-change/reset concurrency in both deterministic lock orders, reset-link supersession, all-Session/security-version revocation, exactly one committed success Audit, retry safety, and late-failure rollback. No live tester password was changed during deployment verification.

## Remaining acceptance

Engineering deployment verification is complete. Product/user manual acceptance remains for the existing Workspace A Member persona: visual review of Light/Dark/System at supported desktop/mobile/zoom settings, Pipeline interaction and copy, and the user-owned password-change/new-password-login journey. No new account or credential handoff is required.
