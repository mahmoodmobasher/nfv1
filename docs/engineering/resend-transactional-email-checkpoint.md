# Resend transactional email checkpoint

Date: 2026-08-21

Status: **implemented, deployed, and accepted after approved-recipient UAT validation**

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
| Identity PostgreSQL integration after provider-neutral copy correction | **17/17 passed** |
| Complete serialized PostgreSQL integration | **114/114 passed** across 13 files |
| Relevant identity/invitation Playwright | **12/12 passed** |
| ESLint | Passed, zero warnings |
| TypeScript | `npx tsc --noEmit` passed |
| Next.js 16.3.1 production build | Passed; **32/32** static pages generated and dynamic routes collected |
| Local production image | Built successfully as disposable `nexaflow:resend-validation` |
| UAT Compose rendering | Passed with synthetic placeholder environment files; services: PostgreSQL, migrate, app, Caddy, optional Mailpit, email worker |
| Local services | PostgreSQL and Mailpit healthy on loopback |
| Dependency audit | **4 moderate**, **0 high**, **0 critical**; all four are the existing development-only `drizzle-kit` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` → `esbuild` path. The offered forced fix is breaking and was not used. |

## UAT deployment evidence

The provider candidate merged normally as `6393f4fb81d83c6d685c30efd6b83a5800232410`. A provider-neutral verification/email-copy correction then merged as `3f7fc1d5a4c6f4206bf3f9c1d13a3115952a157e`, was tagged `v0.2.1-uat.2`, and was deployed as immutable image `nexaflow:3f7fc1d` (`sha256:d81a2a6eb6c35719c475fb63ab2213f54429a26849155c67cd83b846d91b1f39`). The restricted key was installed only in the root-owned UAT environment with mode `0600`; clipboard and temporary handling were cleared without displaying or recording the value.

The existing 11 migrations ran twice, public readiness/protection smoke passed, all services were healthy, the worker restart count was zero, and an authenticated non-delivery Resend API probe returned HTTP 200. Existing email outbox aggregates were unchanged and contained no pending/retry/dead-letter transactional messages.

Full evidence is in [`resend-email-deployment-result.md`](../release/resend-email-deployment-result.md).

## Completed post-deployment proof

One explicitly approved inbox was used without retaining its address or any credential, token, link, cookie, body, or provider ID in evidence.

- Registration and verification delivery/activation passed.
- Verification resend delivery, token rotation, old-token rejection, and replay rejection passed.
- Password recovery/reset delivery, single-use behavior, prior-Session revocation, and replacement-password login passed.
- Workspace invitation delivery and intended verified-identity acceptance passed.
- Provider status reached delivered for **2 verification + 1 recovery + 1 invitation** messages.
- Final bounded state contained one active verified User, one active Membership, one accepted Invitation, zero active Sessions, and three terminal identity-email Outbox rows.

Architecture and Graphics/UX both issued final ACCEPT. Asynchronous bounce/complaint reconciliation and generalized deliverability remain production-operations limitations rather than UAT blockers.
