# Resend Transactional Email Architecture Review

Review date: 2026-08-21
Verdict: **FINAL ACCEPT — deployed UAT transactional-email and approved-recipient journeys**
Real-inbox delivery gate: **CLOSED for UAT**
Review boundary: read-only; no code/configuration/provider mutation and no email sent

## Decision

The deployed Resend transactional-email overlay and its explicitly approved-recipient journeys are **ACCEPTED for UAT**. Fail-closed provider configuration, official HTTPS API usage, server-side secret handling, transactional Outbox routing, provider idempotency, lease/generation fencing, safe retry/dead-letter behavior, real-inbox delivery, and truthful UAT limitations are supported by current evidence.

Registration verification, verification resend rotation, password recovery/reset, and Workspace invitation delivery/acceptance are now proven through the single user-approved inbox. No recipient, password, token, link, body, cookie, or provider message ID was retained in this review evidence. Asynchronous bounce/complaint reconciliation and broader production email operations remain separate production-readiness work; they do not reopen the completed UAT delivery gate.

## Release identity and evidence

- Application commit: `6393f4fb81d83c6d685c30efd6b83a5800232410`
- Tag `v0.2.1-uat.1` resolves to that commit.
- Documentation/evidence commit: `5dc5371079de437b72209351a85a921ac218fd47`
- Final deployed hotfix merge: `3f7fc1d5a4c6f4206bf3f9c1d13a3115952a157e`
- Final tag `v0.2.1-uat.2` resolves to the hotfix merge.
- Final image ID: `sha256:d81a2a6eb6c35719c475fb63ab2213f54429a26849155c67cd83b846d91b1f39`
- UAT target: `https://app.nexaflowsystems.com`
- Durable evidence reviewed:
  - [`resend-transactional-email-checkpoint.md`](../engineering/resend-transactional-email-checkpoint.md)
  - [`resend-email-release-readiness.md`](./resend-email-release-readiness.md)
  - [`resend-email-deployment-result.md`](./resend-email-deployment-result.md)

Independent checks:

| Check | Result |
| --- | --- |
| Email adapter/configuration/foundation/health tests | **16/16 passed** |
| Local PostgreSQL identity/Outbox integration | **16/16 passed** |
| Public UAT readiness | **200**, `{"status":"ready"}`, no-store |
| Public fixture OIDC start/fixture routes | **404** |

The independent test run used mocked provider requests and local PostgreSQL. It sent no external email.

Final hotfix evidence additionally records unit/routes **50**, identity PostgreSQL **17**, clean lint/type/build, 11 migrations, healthy readiness, and worker restart count zero. The hotfix removes local/Mailpit/non-production wording from public verification guidance and identity email bodies without changing tokens, authorization, Outbox, provider, or tenant behavior.

## Architecture findings

### Provider configuration and sender — ACCEPT

- `EMAIL_PROVIDER` explicitly selects `smtp-local|resend`.
- Local development defaults to loopback Mailpit. Production mode rejects `smtp-local`, missing Resend key/sender, placeholder keys, non-HTTPS origin, and senders outside `mail.nexaflowsystems.com`.
- Readiness catches invalid production configuration and returns generic HTTP 503/no-store rather than configuration detail.
- Deployment evidence records `mail.nexaflowsystems.com` as verified and the sender as `NexaFlow <accounts@mail.nexaflowsystems.com>`. Reply-To remains deliberately unset until a monitored address is approved.
- The authenticated non-delivery API probe returned 200 without creating an email. This proves provider authentication/environment reachability, not delivery.

### Server-only key and secret minimization — ACCEPT

- The restricted sending key is installed only in the root-owned host environment file with mode `0600`; no value appears in Git, documentation, image layers, command arguments, logs, or review output.
- Browser code receives no provider credential or direct provider API capability. The Resend call exists only in the server email adapter/worker package.
- Provider error bodies are discarded. The adapter returns only a non-secret provider message ID or one of the safe classifications `delivery_unavailable|delivery_rejected`.
- Worker top-level error handling logs only a bounded error message. Outbox persistence stores provider message ID and sanitized error category, not credentials, recipient links, tokens, message bodies, or provider response bodies.
- Audit payload allowlists remain unchanged and do not admit email bodies, addresses, tokens, credentials, or provider responses.

Non-blocking least-privilege note: the shared UAT app environment is supplied to both app and worker, so the server app process can read the key even though only the worker adapter uses it. This remains server-only and is not a current disclosure defect. Before production hardening, prefer worker-only key injection with a separate provider-health/readiness signal if operationally feasible.

### Official API adapter and UAT network/package boundary — ACCEPT

- The adapter calls `POST https://api.resend.com/emails` with Bearer authorization, JSON `from/to/subject/text`, optional approved Reply-To, the durable idempotency header, and a 10-second timeout.
- UAT runs the worker from the same immutable non-root/read-only application image. The worker has the internal database network plus dedicated email-egress network; PostgreSQL remains internal and Mailpit remains loopback/private.
- The app does not expose a public mail-relay endpoint. No Resend SDK/runtime dependency or secret is shipped to browser bundles.
- Existing 11 migrations passed twice; this overlay adds no schema change.

### Transactional Outbox, replay, and fencing — ACCEPT

- Registration verification, password reset, and Workspace invitation creation enqueue encrypted envelopes in the existing business transaction. Plain token-bearing links are not stored in cleartext Outbox payloads.
- The worker claims only `identity.email_verification`, `identity.password_reset`, and `workspace.invitation_email_requested`. Non-email topics remain untouched for their own consumers.
- Claiming uses transactional `FOR UPDATE SKIP LOCKED`, lease owner, increasing generation, and stable `provider_idempotency_key` derived from the Outbox ID.
- The same durable key is forwarded to Resend, so response-loss retry maps to one provider acceptance under the provider idempotency contract.
- Success/failure finalization requires the exact lease owner and generation; stale workers cannot overwrite a reclaimed winner.
- Retry increments attempts, applies bounded availability delay, and reaches dead letter after five failures. Persisted failure text is sanitized.

### Registration, reset, and invitation flows — ACCEPT FOR UAT DELIVERY

- Registration verification is single-use and activates identity without creating a Workspace.
- Verification resend reached the approved inbox, rotated the token, rejected the older link, and retained single-use behavior.
- Password reset uses the same Outbox adapter, remains enumeration-safe, consumes a single-use token, and revokes existing Sessions.
- Workspace invitations use encrypted token links, intended verified-email proof, single-use acceptance, seat/Membership transaction controls, and the same durable delivery boundary.
- Relevant Development evidence records identity PostgreSQL **16/16**, full PostgreSQL **113/113**, and identity/invitation Playwright **12/12**.
- Final approved-recipient evidence proves registration delivery/activation, recovery/reset with replay denial and prior-Session revocation, and invitation delivery/acceptance by the intended verified User.
- Minimized provider evidence records two verification, one recovery, and one invitation delivery without identifying the recipient or retaining provider IDs.
- Final database aggregates are bounded and consistent with the journeys: one active verified User, one active Membership, one accepted Invitation, zero active Sessions, and three terminal identity-email Outbox rows.

### Provider failure and bounce handling — ACCEPT WITH EXPLICIT LIMIT

- Synchronous transport, timeout, HTTP 429/5xx, HTTP rejection, and malformed-success failures map to bounded retry/rejection categories without leaking provider content.
- Retries/dead-letter are implemented and tested locally; provider idempotency prevents a response-loss retry from creating a second accepted message.
- Inbox receipt and link usability are proven for the single approved UAT recipient and the four bounded journeys. This is not a general deliverability, spam-placement, or multi-domain claim.
- No webhook/reconciliation consumer for asynchronous delivered/bounced/complained events is implemented or claimed. Provider-accepted (`delivered` in the current Outbox state) means the Resend API accepted the request, not that the recipient inbox received it. This terminology must remain explicit in UAT evidence and must be resolved before production delivery/SLA claims.

## Rollback

Rollback is bounded and credible. For copy-only regression, restore the UAT pointer/image to `6393f4f` / `v0.2.1-uat.1`. For provider-overlay failure, restore `c1125ba` / `v0.2.0-rc.2` and the previous protected provider selection. Restart only NexaFlow UAT services. No migration rollback is needed because neither Resend increment adds a migration. Any request already accepted or delivered externally cannot be represented as undone.

## Approved-recipient real-inbox gate — CLOSED

The final gate used one privately supplied and explicitly approved test inbox. Evidence excluded credentials, full URLs, tokens, cookies, recipient addresses, provider IDs, and message bodies, and proved:

1. registration verification reaches the inbox and the single-use link activates the account;
2. verification resend reaches the inbox, rotates the token, and invalidates the older link;
3. password recovery reaches the inbox, reset is single-use, and prior Sessions are revoked;
4. Workspace invitation reaches the inbox and is accepted only by the intended verified identity;
5. local/provider-adapter failure evidence continues to prove bounded retry/dead-letter state with no provider detail leakage and no duplicate provider acceptance; and
6. UAT evidence distinguishes provider acceptance from observed inbox delivery.

UAT may now claim verified transactional delivery for these four approved-recipient journeys. It may not claim generalized deliverability, asynchronous bounce/complaint reconciliation, or production email operational readiness.

## Blockers

**None.** The deployed UAT Resend overlay and approved-recipient journeys are final Architecture ACCEPT. Asynchronous bounce/complaint reconciliation remains a production-operations limitation, not a blocker to this UAT gate.
