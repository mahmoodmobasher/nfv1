# Resend transactional email UAT deployment result

Date: 2026-08-21

Status: **deployed; provider/configuration validation passed; real-inbox delivery validation pending explicit recipient approval**

Scope: Resend transactional-email provider overlay only. No Feature 3, Google OIDC, billing, schema change, or unrelated infrastructure work.

## Release identity

- Pull request: [#1](https://github.com/mahmoodmobasher/nfv1/pull/1), merged normally without force push.
- Deployed merge commit: `6393f4fb81d83c6d685c30efd6b83a5800232410`.
- Immutable tag: `v0.2.1-uat.1`.
- UAT release directory: `/opt/nexaflow/uat/releases/6393f4f`.
- UAT current pointer: `/opt/nexaflow/uat/current` → `/opt/nexaflow/uat/releases/6393f4f`.
- Image: `nexaflow:6393f4f`.
- Image ID: `sha256:9dbeee6befe5ba39fa5a2978b6fe0ceffbf87872b56d8bf9889f9bf17cb9d3fc`.
- Public application: `https://app.nexaflowsystems.com`.
- Target: AWS Lightsail NexaFlow UAT host `99.79.158.110`.

## Protected provider installation

- The user copied a newly created restricted sending key into the local system clipboard.
- The value was validated by length/prefix/character class without printing it, passed directly to a root-owned installer, and written only to `/opt/nexaflow/uat/secrets/app.env`.
- The protected file remains root-owned with mode `0600`.
- Active provider is `resend` and sender is `NexaFlow <accounts@mail.nexaflowsystems.com>` on the verified `mail.nexaflowsystems.com` domain.
- No reply-to is configured because no monitored reply address has been approved.
- Clipboard contents and all local/remote temporary installer files were cleared immediately after installation.
- No key, token, email body, recipient, link, or provider response body was written to Git, documentation, logs, command arguments, or chat output.
- Local development remains `smtp-local` through loopback Mailpit.

## Deployment and health evidence

| Check | Result |
| --- | --- |
| Candidate review | PR mergeable, no review comments or unexpected files; merged normally |
| Host image build | Passed from exact merge commit on Next.js 16.3.1 |
| Migration application | Passed twice; no new migration in this release |
| Migration ledger | Exactly **11** rows |
| Application | Running and healthy |
| Caddy | Running and healthy |
| PostgreSQL | Running and healthy |
| Email worker | Running on the new image; restart count **0** |
| Mailpit | Still private/healthy for explicit local/operator use; not the active UAT provider |
| Public liveness/readiness | Passed over HTTPS |
| Unauthenticated CRM protection | Passed |
| Fixture OIDC public endpoints | Remain disabled/404 |
| Worker provider environment | Provider, key format, and approved sender validated without exposing values |
| Resend non-delivery API probe | Authenticated HTTPS request returned **200**; no email was created or sent |
| Historical transactional outbox | Unchanged: verification **10 delivered**, invitation **9 delivered**, no pending/retry/dead-letter email topics |

The existing UAT database was retained. There was no schema change and no destructive database action.

## Remaining final validation

No real email was sent because the user has not yet approved a recipient inbox in this chat. The release is ready for the final bounded journeys once an inbox is supplied privately:

1. Registration → verification delivery → single-use verification.
2. Password recovery → reset delivery → single-use reset and Session revocation.
3. Workspace invitation → delivery → intended verified-user acceptance.
4. Verification resend rotation proving the older link is invalid.

Validation must inspect only minimized delivery state and provider message IDs. Credentials, full URLs, tokens, cookies, and message bodies must remain out of evidence.

## Rollback

If real-delivery validation exposes a material failure, restore the UAT current pointer and image to `c1125ba` / `v0.2.0-rc.2`, restore the prior protected provider selection, and restart only NexaFlow UAT services. No migration rollback is required. Any email accepted by Resend cannot be represented as undone.
