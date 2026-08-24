# UAT transactional-email sender contract decision

Date: 2026-08-24

Blocked release reviewed: `b574f287` / rejected `v0.5.0-uat.2`

Related gap: `UAT-GAP-002`

Existing provider authorities: `docs/release/resend-email-architecture-review.md`, `docs/release/resend-email-release-readiness.md`, and `docs/release/resend-email-deployment-result.md`

Scope: sender/configuration compatibility decision only; no code, secret, DNS, provider, infrastructure, live-UAT, or deployment mutation is authorized

## Decision

**REJECT release progression until Product authorizes one of the bounded alternatives below. Recommend Option A.**

P0: none.

P1: the installed protected UAT `EMAIL_FROM` and the accepted application sender-domain contract are incompatible, preventing the migration, app, and worker from forming one deployable release unit.

P2: none once the selected option satisfies the acceptance gates in this decision.

P3: retain `UAT-GAP-005` operational-evidence automation as non-blocking follow-up.

`v0.5.0-uat.1` and `v0.5.0-uat.2` remain permanently retired. Neither tag, image, directory, checksum, nor protected failed-attempt authority may be moved, overwritten, repaired in place, or reused. A new attempt is no earlier than `v0.5.0-uat.3` and requires a new immutable integrated revision, image, release directory, checksums, tag, authorization, and deployment record.

## Canonical current contract

Existing accepted repository and provider evidence establishes the following UAT contract:

- active provider is Resend;
- the sending domain is the already verified `mail.nexaflowsystems.com` subdomain;
- the accepted From identity is the documented NexaFlow Accounts identity at that verified subdomain;
- Reply-To is omitted until Product approves a monitored reply address;
- the restricted provider credential and sender configuration live only in the root-owned mode-`0600` protected application environment;
- browser code, Git, images, Compose output, commands, logs, Audit, screenshots, and review documents receive no secret or recipient-bearing value;
- registration verification/resend, password recovery/reset, and Workspace invitation delivery all use the same transactional Outbox and worker adapter.

`src/server/env.ts:3-7,31-39` implements that accepted domain boundary and fails production closed. `src/server/email/factory.ts:6-12` passes the validated From and optional Reply-To to the selected server-only adapter. `src/server/email/resend.ts:19-50` sends one provider request with the configured From, recipient, subject, text body, optional approved Reply-To, restricted bearer credential, and durable idempotency key; it exposes only a bounded provider message ID or sanitized failure category.

The protected application environment is intentionally shared by the migration, app, and email worker. `createDb()` parses the complete server environment before opening the pool, so migration rejection is consistent with app readiness and worker startup—not an incidental migration defect. All three processes must validate the same immutable configuration contract. Development must not bypass validation in the migration command, defer only the worker failure, or maintain separate interpretations of `EMAIL_FROM`.

## Recommended Option A — correct protected UAT configuration

**Recommendation: choose Option A because the repository contains prior accepted provider evidence that the `mail.nexaflowsystems.com` domain and documented Accounts sender were verified and successfully exercised through all four UAT email journeys. No repository authority establishes the currently installed incompatible sender as canonical.**

### Required authorization and ownership

1. Product Owner must explicitly reaffirm the documented NexaFlow Accounts From identity as the canonical UAT product identity and authorize a protected UAT configuration change for the next attempt.
2. The authorized Resend account/domain owner must confirm, through non-secret provider evidence, that the exact From address or its parent `mail.nexaflowsystems.com` domain is currently verified and enabled for the restricted sending credential. This person must also confirm whether provider/domain state has changed since the previously accepted evidence.
3. Release Engineering/DevOps, operating with host root authority, must install the Product-approved value into the protected UAT application environment. Development must not receive or handle the provider credential, inspect unrelated environment values, or echo the sender/configuration into logs or command history.
4. Security/Backend reviews the minimized provider/config evidence and the pre-switch validation result. Architecture confirms contract preservation. Product separately authorizes the new UAT attempt.

### Non-secret evidence

Evidence may state only:

- verified domain/identity status: pass/fail;
- canonical domain and approved display-purpose label already present in repository authority;
- restricted credential scope permits transactional sending from the approved identity: pass/fail;
- Reply-To absent, or present only after a separately approved monitored-address decision;
- protected file owner/mode, required key presence, and deterministic fingerprint/checksum of the complete protected file if operationally needed—never its contents;
- timestamp, authorized operator role, provider account/project identifier in an approved non-secret form, and evidence reviewer.

Do not record API keys, DNS record values/tokens, recipient addresses, complete headers, message bodies, provider response bodies, full message IDs, verification links, cookies, or environment values. DNS evidence should prove that provider-required DKIM/SPF records for the accepted subdomain resolve and the provider reports verified; redact verification tokens and unrelated records. DMARC posture may be recorded as policy/result without exporting the full zone.

### Option A acceptance gates

- Product and provider/domain-owner authorizations are recorded before the protected configuration change.
- Exact candidate environment-schema validation passes using the protected file without printing values.
- The same immutable image and same protected environment pass migration apply plus idempotent rerun, app startup/readiness, and email-worker startup.
- A non-delivery provider authentication/sender probe succeeds without creating an email, followed only after explicit recipient authorization by the bounded real-inbox journeys.
- Registration verification, verification resend/replacement, recovery/reset with Session revocation, and invitation delivery/acceptance by the intended verified User pass. Evidence distinguishes provider acceptance from observed inbox receipt.
- Outbox transaction, encryption, idempotency, lease/generation fencing, retries/dead-letter, token single-use, Membership/seat/Role constraints, and Audit boundaries remain unchanged.
- Full build/security/browser/deployment gates and pending UAT Caddy public-edge matrix pass before Product UAT acceptance.

Option A ordinarily needs no application commit. The new immutable release commit may contain only approved decision/evidence/runbook integration as required by repository release practice; the protected configuration itself remains out of Git.

## Conditional Option B — revise the application validation contract

Option B is **not currently recommended or authorized**. It becomes eligible only if the Resend account/domain owner supplies current non-secret evidence that the installed sender is intentionally canonical, verified, enabled for the restricted credential, and consistent with Product identity—and Product explicitly supersedes the existing `mail.nexaflowsystems.com` contract.

Absence of a provider rejection, possession of an API key, historical deliverability, or an operator assertion is insufficient. Development must not infer or disclose the installed value in order to propose a regex.

If Product selects Option B, the smallest acceptable application change is:

1. replace the hard-coded domain predicate with a narrow allowlist of Product-approved, provider-verified sender identity/domain contracts; do not accept arbitrary syntactically valid email addresses, parent-domain suffix tricks, Unicode/lookalike domains, subdomains, display-name injection, CR/LF, multiple mailboxes, or browser input;
2. keep `EMAIL_PROVIDER=resend`, required restricted credential, HTTPS production origin, fail-closed readiness, and production prohibition of local SMTP;
3. normalize and parse one RFC-compatible mailbox deterministically, compare the ASCII domain exactly to the approved allowlist, and retain bounded length/control-character protections;
4. keep From server-configured and immutable per process; message/outbox data cannot override envelope or header From;
5. keep Reply-To separately optional and allow only a Product-approved monitored mailbox. Reply-To must never substitute for From-domain verification, change the envelope sender, or be populated from a recipient/request;
6. do not attempt to set or spoof the SMTP envelope/Return-Path. Resend/provider authority owns the bounce envelope; the adapter sends only the supported `from`, `to`, optional `reply_to`, subject, text, and idempotency fields;
7. update `.env.example`, release readiness, schema tests, health tests, adapter tests, and deployment key documentation consistently without embedding protected values.

### Additional Option B evidence

- Product decision naming the new canonical identity/domain and why it replaces the prior accepted contract.
- Provider console/API evidence that the exact identity/domain is verified, belongs to the authorized NexaFlow provider account, is usable by the restricted key, and has appropriate DKIM/SPF alignment; record results only, not tokens or full DNS records.
- Security review of exact-domain parsing, display-name/header injection, case/whitespace, IDN/lookalike, suffix/subdomain, multiple-address, CR/LF, and overlength positive/negative tests.
- Adapter capture proving the provider request uses exactly the validated configured From, no application-controlled envelope sender, and no Reply-To unless approved.
- Environment-schema parity proving migration, app, readiness, and worker accept/reject the same matrices.
- Provider non-delivery probe and the four approved-recipient journeys, followed by the full release gates required for Option A.

Option B requires an immutable Backend implementation, peer security review, Architecture re-review, Product acceptance, and normal integration before any UAT attempt.

## Delivery, privacy, and Audit boundaries for both options

- Verification, replacement verification, recovery/reset, and invitation emails remain Outbox-owned and committed atomically with their business mutations. UI success means queued/accepted under the existing generic contract, not guaranteed inbox delivery.
- Token-bearing links remain encrypted at rest in Outbox envelopes and raw tokens remain excluded from logs, Audit, provider evidence, analytics, and review artifacts.
- Recipient identity, From/Reply-To values beyond already public approved authority, provider credential, provider response body, full provider message ID, DNS verification material, request body, and email body must not enter Audit or operational logs.
- Bounded logs may contain only topic/outcome class, attempt count, sanitized error category, and non-reversible operational correlation already accepted by the Outbox contract.
- Invitation email and acceptance remain intended-verified-email-bound, single-use, seat/entitlement checked, Admin/Member-only, transactional, and audited. Sender remediation grants no Workspace, Membership, Role, Owner, Session, or entitlement authority.

## Rollback and fall-forward

The preferred action is fall-forward from healthy live `v0.4.0-uat.1` to a newly authorized candidate; do not mutate either rejected release.

For Option A, retain a protected backup of the current live environment and its ownership/mode before changing the candidate authority. Stage the new protected configuration separately, validate it with the exact new image, and switch only under release authorization. If pre-switch validation fails, stop without touching live authority. If post-switch email/readiness evidence fails, atomically restore the prior release pointer and prior protected configuration, recreate only affected NexaFlow services, and verify health. Do not claim that already accepted external email was undone.

For Option B, rollback is the prior immutable application image plus its matching protected configuration. Application and configuration must move as one compatible release unit; never roll back only validation while retaining a sender it rejects. No database rollback is expected if the bounded change adds no migration, but the migration ledger and restore proof remain mandatory release checks.

## Product actions required before Development proceeds

Product must explicitly record one of these decisions:

- **Authorize Option A (recommended):** reaffirm the existing documented Accounts sender on the verified `mail.nexaflowsystems.com` domain; authorize the provider/domain owner to confirm verification and Release Engineering to update the protected UAT configuration; authorize non-delivery and named-recipient verification after pre-switch gates; then request Architecture/security review of the evidence.
- **Authorize investigation of Option B:** assert that the installed sender may be the intended canonical identity, identify the provider/domain owner who can prove it without disclosing the value broadly, and authorize a bounded provider/security discovery. Product must make a second explicit decision accepting the new canonical identity/domain before Backend may change validation.

Until one action is recorded, Development must not change validation, defaults, examples, migration behavior, worker behavior, or protected configuration. Release Engineering must not publish `v0.5.0-uat.3`, change live authority, or run recipient-bearing probes. Phase 5 and production readiness remain blocked by UAT-GAP-002, UAT-GAP-001 live-edge closure, and UAT-GAP-006 full UAT evidence.
