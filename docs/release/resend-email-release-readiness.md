# Resend transactional email release readiness

Date: 2026-08-21

Status: **deployed as `v0.2.1-uat.1`; provider health passed; approved real-inbox journeys pending**

Scope: transactional email provider change only. No Feature 3, Google OIDC, billing, or unrelated infrastructure changes.

## Candidate contents

The candidate adds the Resend adapter/factory, typed fail-closed provider configuration, provider-independent worker packaging, production readiness validation, truthful email UI copy, and unit/PostgreSQL/browser evidence. It does not add a migration or store new secret material.

Primary files:

- `src/server/email/resend.ts`
- `src/server/email/factory.ts`
- `src/server/email/worker.ts`
- `src/server/email/outbox.ts` (unchanged, reused for durable routing/fencing/idempotency)
- `src/server/env.ts`
- `src/app/api/health/ready/route.ts`
- `compose.uat.yml`
- `.env.example`
- `deploy/uat/uat.env.keys`
- `tests/email-adapter.test.ts`
- `tests/identity.integration.test.ts`
- `tests/server.foundation.test.ts`
- `tests/health.test.ts`

Detailed local results are in [`resend-transactional-email-checkpoint.md`](../engineering/resend-transactional-email-checkpoint.md).

## Protected UAT configuration

The host-only application environment must contain:

```text
EMAIL_PROVIDER=resend
RESEND_API_KEY=<protected restricted key>
EMAIL_FROM=NexaFlow <accounts@mail.nexaflowsystems.com>
# EMAIL_REPLY_TO is omitted until a monitored address is approved
```

Do not place these values in Git, image layers, Compose interpolation output, shell history, CI logs, documentation, screenshots, or chat. Existing SMTP values may remain inert for rollback, but production validation will not allow `smtp-local` as the active provider.

## Completed immutable deployment

The feature branch was reviewed and merged normally as `6393f4fb81d83c6d685c30efd6b83a5800232410`, then deployed as `v0.2.1-uat.1` / `nexaflow:6393f4f`. The existing 11 migrations passed twice, services became healthy, and public readiness passed before the current pointer was changed.

1. Build an immutable image from the merge commit and record its digest.
2. Create `/opt/nexaflow/uat/releases/<commit>` from the exact Git release.
3. Install the protected provider settings in `/opt/nexaflow/uat/secrets/app.env` without displaying values.
4. Render the UAT Compose configuration, run the existing 11 migrations twice, and start PostgreSQL, app, email worker, and Caddy. Mailpit is not required for Resend mode and remains private if retained for operator diagnostics.
5. Require `/api/health/ready` to return HTTP 200 before switching the current release pointer.
6. Run the three real-inbox journeys and inspect only minimized outbox state/provider IDs.

Representative host commands, with values supplied through protected files rather than command-line arguments:

```text
docker compose --project-name nexaflow-uat --file compose.uat.yml config --quiet
docker compose --project-name nexaflow-uat --file compose.uat.yml --profile release run --rm migrate
docker compose --project-name nexaflow-uat --file compose.uat.yml --profile release run --rm migrate
docker compose --project-name nexaflow-uat --file compose.uat.yml up --detach --wait postgres app email-worker caddy
docker compose --project-name nexaflow-uat --file compose.uat.yml ps
```

## Rollback

If readiness or delivery proof fails, restore `/opt/nexaflow/uat/current` and `NEXAFLOW_IMAGE` to the recorded `v0.2.0-rc.2` release and restore its prior protected email-provider configuration, then restart only NexaFlow UAT services. No migration rollback is needed because this candidate adds none. Any accepted provider delivery may already exist externally and must not be represented as undone.

## Remaining input

- Approved real test inbox supplied privately.

No email may be sent until that recipient is explicitly approved. See [`resend-email-deployment-result.md`](resend-email-deployment-result.md).
