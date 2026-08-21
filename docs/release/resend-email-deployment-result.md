# Resend transactional email UAT deployment result

Date: 2026-08-21

Status: **deployed and validated through the user-approved recipient journeys**

Scope: Resend transactional-email provider overlay only. No Feature 3, Google OIDC, billing, schema change, or unrelated infrastructure work.

## Release identity

- Provider implementation: [#1](https://github.com/mahmoodmobasher/nfv1/pull/1), merged normally without force push as `6393f4fb81d83c6d685c30efd6b83a5800232410`.
- Provider-neutral copy correction: [#2](https://github.com/mahmoodmobasher/nfv1/pull/2), merged normally without force push.
- Final deployed merge commit: `3f7fc1d5a4c6f4206bf3f9c1d13a3115952a157e`.
- Immutable tag: `v0.2.1-uat.2`.
- UAT release directory: `/opt/nexaflow/uat/releases/3f7fc1d`.
- UAT current pointer: `/opt/nexaflow/uat/current` → `/opt/nexaflow/uat/releases/3f7fc1d`.
- Image: `nexaflow:3f7fc1d`.
- Image ID: `sha256:d81a2a6eb6c35719c475fb63ab2213f54429a26849155c67cd83b846d91b1f39`.
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
| Provider-neutral copy correction | Deployed; public verification guidance contains no Mailpit/local-delivery claim |
| Approved-recipient journeys | Registration/verification, verification rotation, recovery/reset, and invitation delivery/acceptance passed |
| Full serialized PostgreSQL regression | **114/114 passed** across 13 files |

The existing UAT database was retained. There was no schema change and no destructive database action. All 11 migrations applied and reran safely.

## Approved-recipient delivery validation

The user explicitly approved one recipient inbox. A temporary in-memory harness exercised the public UAT application and private worker/provider evidence without recording the recipient, credentials, tokens, links, cookies, message bodies, or provider IDs. It proved:

1. registration queued and delivered verification, and the single-use link activated the User;
2. verification resend delivered a replacement, invalidated the older token, and rejected replay;
3. password recovery delivered, reset was single-use, the prior Session was revoked, and login with the replacement password succeeded;
4. a Workspace invitation delivered and was accepted only by the intended verified User; and
5. validation-created Sessions were revoked after the journey.

Minimized provider evidence was **2 verification + 1 recovery + 1 invitation** messages with provider delivery status observed. Final bounded database evidence was one active verified User, one active Membership, one accepted Invitation, zero active Sessions, and three terminal identity-email Outbox rows. This proves the approved UAT journeys, not generalized deliverability or asynchronous bounce/complaint reconciliation.

## Reviews

- Architecture: [`resend-email-architecture-review.md`](resend-email-architecture-review.md) — **FINAL ACCEPT**.
- Graphics/UX: [`resend-transactional-email-ux-review.md`](../design/resend-transactional-email-ux-review.md) — **ACCEPT**.

## Rollback

If real-delivery validation exposes a material failure, restore the UAT current pointer and image to `c1125ba` / `v0.2.0-rc.2`, restore the prior protected provider selection, and restart only NexaFlow UAT services. No migration rollback is required. Any email accepted by Resend cannot be represented as undone.
