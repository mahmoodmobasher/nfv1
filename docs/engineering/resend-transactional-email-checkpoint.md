# Resend transactional email checkpoint

Date: 2026-08-21

Status: **implemented and deployed to UAT; provider health passed; real-inbox journey validation pending explicit recipient approval**

Branch: `feature/resend-transactional-email`

## Delivered boundary

- `EMAIL_PROVIDER=smtp-local` retains the loopback Mailpit adapter for local development.
- `EMAIL_PROVIDER=resend` uses the official server-side `POST https://api.resend.com/emails` contract.
- Production mode rejects local SMTP and rejects missing Resend key/sender configuration. Readiness returns a generic HTTP 503 when the production contract is incomplete.
- The approved sender boundary is `mail.nexaflowsystems.com`; the deployed sender is `NexaFlow <accounts@mail.nexaflowsystems.com>`. `EMAIL_REPLY_TO` remains unset unless Product approves a monitored address.
- The Resend dashboard was inspected read-only and showed `mail.nexaflowsystems.com` as verified. No API key was created, read, copied, logged, or committed.
- The adapter is server-only and returns only the provider message ID. Provider bodies, credentials, message bodies, recipient links, tokens, and cookies are not logged.
- The existing transactional outbox remains authoritative. It routes only `identity.email_verification`, `identity.password_reset`, and `workspace.invitation_email_requested`; non-email topics remain pending for their own consumers.
- Existing durable outbox idempotency keys are forwarded to Resend, and leasing/generation fencing still controls finalization after delivery, retry, reclaim, and dead-letter transitions.
- No schema migration was required because provider idempotency and message-ID columns already existed.

## Configuration and packaging

- `.env.example` contains local placeholders and empty commented Resend key names only.
- `deploy/uat/uat.env.keys` lists provider keys without values.
- `compose.uat.yml` keeps Mailpit optional and loopback-only. The email worker is provider-independent and has a dedicated outbound network for the Resend HTTPS call; PostgreSQL remains on the internal database network.
- Fixture OIDC remains disabled in production/UAT.

## Evidence

| Check | Result |
| --- | --- |
| Resend adapter/config targeted unit tests | **15/15 passed** in the initial focused run |
| Unit/direct-route suite | **50 passed**, **113 DB-gated skipped** across 12 passed and 13 skipped files |
| Identity PostgreSQL integration | **16/16 passed** |
| Complete PostgreSQL integration | **113/113 passed** across 13 files |
| Relevant identity/invitation Playwright | **12/12 passed** |
| ESLint | Passed, zero warnings |
| TypeScript | `npx tsc --noEmit` passed |
| Next.js 16.3.1 production build | Passed; **32/32** static pages generated and dynamic routes collected |
| Local production image | Built successfully as disposable `nexaflow:resend-validation` |
| UAT Compose rendering | Passed with synthetic placeholder environment files; services: PostgreSQL, migrate, app, Caddy, optional Mailpit, email worker |
| Local services | PostgreSQL and Mailpit healthy on loopback |
| Dependency audit | **4 moderate**, **0 high**, **0 critical**; all four are the existing development-only `drizzle-kit` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` → `esbuild` path. The offered forced fix is breaking and was not used. |

## UAT deployment evidence

The reviewed candidate merged normally as `6393f4fb81d83c6d685c30efd6b83a5800232410`, was tagged `v0.2.1-uat.1`, and was deployed as immutable image `nexaflow:6393f4f`. The restricted key was installed only in the root-owned UAT environment with mode `0600`; clipboard and temporary handling were cleared without displaying or recording the value.

The existing 11 migrations ran twice, public readiness/protection smoke passed, all services were healthy, the worker restart count was zero, and an authenticated non-delivery Resend API probe returned HTTP 200. Existing email outbox aggregates were unchanged and contained no pending/retry/dead-letter transactional messages.

Full evidence is in [`resend-email-deployment-result.md`](../release/resend-email-deployment-result.md).

## Required post-deployment proof

An explicitly approved real inbox is still required. The `example.test` cohort cannot prove public delivery.

- Registration queues and delivers a verification email; the single-use link activates the account.
- Verification resend rotates the token and the older link fails.
- Password recovery reaches the approved inbox and the reset link is single-use.
- Workspace invitation reaches the approved inbox and acceptance succeeds for the intended verified identity.
- A forced provider failure enters retry without leaking provider detail; replay does not create a second accepted Resend message.
- The worker records only non-secret provider message IDs, expected delivery state, and sanitized failure classifications.
