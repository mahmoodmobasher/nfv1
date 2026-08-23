# Feature 3 Phase 1 UAT deployment result

Date: 2026-08-23

Status: **Deployed successfully to UAT and ready for product acceptance testing**

Release authority: `v0.3.0-uat.1`

Application commit: `0e596cfc98e878c0228733a01539c11a46088011`

UAT URL: `https://app.nexaflowsystems.com`

## Deployment evidence

- The immutable tag resolved to the expected application commit before deployment.
- The host release directory is `/opt/nexaflow/uat/releases/0e596cf`.
- The protected `current` pointer resolves to that release directory.
- The deployed application image is `nexaflow:0e596cf`, image ID `sha256:091d7846de6481f28aaebec92dfa61f83be239d571c8b7ba77c7e14170f08f9f`.
- An encrypted pre-migration database backup was created at `/opt/nexaflow/uat/backups/nexaflow-uat_0e596cf-pre_20260823T170202Z.sql.gz.enc`.
- The migration command completed successfully and an immediate rerun was clean.
- The migration ledger contains 12 entries after deployment.
- The application and email worker run the new immutable image. Caddy, PostgreSQL, and the private Mailpit service retain their pinned images.
- Compose reports the application, Caddy, PostgreSQL, and Mailpit healthy; the email worker is running.
- The protected release environment and its pre-deployment rollback copy are owned by `root:root` with mode `0600`.

## External smoke evidence

- `GET /api/health/ready` returned HTTP 200 with `{"status":"ready"}` and `Cache-Control: no-store`.
- `GET /api/health/live` returned HTTP 200.
- `GET /login` returned HTTP 200.
- The bounded UAT smoke script passed both before and after the release pointer was finalized.
- An anonymous request to `/settings` returned the protected login experience with private, no-cache response controls.
- An anonymous request to `/api/account/profile` was rejected with the bounded JSON validation response; no account data was disclosed.
- The disabled OIDC route returned HTTP 404.

The email provider configuration was unchanged. Broad transactional-email journeys were not repeated during this deployment; the bounded smoke check verified the existing provider boundary without sending test messages to external recipients.

## Rollback boundary

The prior application release is `/opt/nexaflow/uat/releases/3f7fc1d`, using image `nexaflow:3f7fc1d`. Application rollback consists of restoring the protected release image authority and atomically repointing `current` to that release, then recreating the application and email-worker services and rerunning the bounded smoke check.

Migration `0011_white_masque.sql` is additive. Routine application rollback must leave its preferences table and indexes in place. Restoring the encrypted pre-migration backup or deleting preference data requires separate authorization and database review.

## Acceptance handoff

UAT deployment is complete. Product acceptance testing can now cover display-name editing, persisted appearance/locale/time-zone preferences, global theme behavior, password change with recent authentication, reset-token supersession, session revocation, and the responsive/accessibility journey documented in the release-readiness record.
