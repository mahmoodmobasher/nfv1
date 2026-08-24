# UAT Option A sender backend/security evidence review

Date: 2026-08-24

Reviewed immutable evidence revision: `5debb39839bf095d34783643ccbffcaa6ea0a60c`

Architecture authority: `f67b069c645b5bee32aaa9f2f0bae8c45c438dc2`

Primary evidence: `docs/release/uat-option-a-sender-pre-switch-evidence.md`

Review method: distinct read-only repository, provider, and UAT metadata verification after the evidence pass. This review did not change protected configuration, application code, provider/DNS/credential state, database or container state, live authority, or infrastructure. It sent no email and exposed no protected value.

## Decision

**ACCEPT.** The Option A pre-switch evidence satisfies the backend/security portion of `f67b069` and is suitable for Architecture review and a separately authorized fall-forward UAT attempt no earlier than `v0.5.0-uat.3`.

- P0: none.
- P1: none in the pre-switch sender/configuration evidence. `UAT-GAP-001`, `UAT-GAP-002` live closure, and `UAT-GAP-006` remain release-level deployment/acceptance gates rather than defects in this evidence.
- P2: none.
- P3: `UAT-GAP-005` remains open non-blocking because release evidence commands are partly ad hoc. `UAT-GAP-007` is correctly recorded as closed with successful fail-closed containment and rerun evidence.

This verdict is not deployment authorization, does not close real-inbox or public-edge acceptance, and does not authorize creating or moving a tag.

## Authority, scope, and minimization

Exact `main`, local HEAD, and `origin/main` were all `5debb39839bf095d34783643ccbffcaa6ea0a60c`; `f67b069` is an exact ancestor. The committed evidence records Product Owner Option A authorization, authorized Resend account/domain-owner verification, and Release Engineering host-root staging authority before the protected correction.

The evidence is appropriately minimized. It contains only pass/fail status, timestamps, public canonical domain authority, role labels, HTTP status, image identity, protected owner/mode, migration count/head, and non-reversible fingerprints. It does not contain credential material, recipient identity, sender value beyond existing public authority, provider response bodies, DNS record values/tokens, complete headers, message bodies, provider message IDs, token links, cookies, or unrelated environment data.

The two initial representation failures are truthfully retained as P3 operational evidence rather than hidden. Both failed closed against an isolated staged file/harness, did not change live authority, and led to the correct Docker env-file representation and the prohibition on shell-sourcing the complete staged file.

## Independent provider and protected-config verification

At `2026-08-24T07:50:31Z`, this review independently repeated the authorized GET-only provider check using the staged restricted credential without exporting the response body:

- authenticated provider response: HTTP **200**;
- canonical provider domain: present and verified/active;
- required DNS hostnames: present, with record contents suppressed;
- provider mutation or email creation: **none**.

This establishes current restricted-credential authentication, verified-domain visibility, and provider reachability for the accepted parent-domain authority. It is consistent with the previously accepted real-delivery evidence for the same canonical provider/domain contract. It does not overclaim inbox receipt, deliverability, or asynchronous bounce/complaint reconciliation.

Independent protected metadata and fingerprint checks passed:

- backup and staged candidate: root-owned mode `0600`;
- backup and unchanged live complete-file fingerprint: `143eadb6333cd0279884d49a4af27f6e7c030cd58ac49ff89aacf2ec83e0ac36`;
- staged complete-file fingerprint: `a825b7947bbeda0fd747233457af40ef40cee71d5905686b2c397f531bd1f3d8`;
- staged non-reversible sender fingerprint: `588dafe12e8bf43635c3bc604789c8d0864df600a3439f917f0d4b1902bb4172`;
- exactly one sender key and no Reply-To key in the staged file;
- exact Docker env-file schema validation against image `sha256:3077ed2cd323e2b08b03dee5ba3a9445511fd04bf8345bd00a33efff123af48c`, amd64, runtime `10001:10001`: **passed**.

No value was printed to obtain these results.

## Runtime parity and cleanup review

The primary evidence used the same immutable image and same staged protected file for production schema validation, disposable migration apply and idempotent rerun, isolated app liveness/readiness, continuous worker startup, and the non-delivery provider probe. The disposable ledger exactly matched 12 migrations and head `1787501845245`. This meets `f67b069`'s requirement that migration, app/readiness, and worker form one configuration unit rather than bypassing validation in any process.

Independent post-evidence checks confirmed:

- no Option A validation app/worker container remains;
- no Option A disposable database remains;
- live database ledger remains 12;
- live pointer remains `/opt/nexaflow/uat/releases/e58c22a`;
- live protected application environment fingerprint remains unchanged;
- live app, Caddy, PostgreSQL, and Mailpit are healthy with zero restarts;
- live email worker is running with zero restarts.

The exact candidate was never installed as live authority, and no live service was recreated for this evidence.

## Outbox, token, log, and Audit boundaries

Read-only source review confirms Option A changes only protected configuration and does not alter the accepted server boundaries:

- the server-only factory passes only validated From and optional Reply-To to the Resend adapter;
- the adapter uses one restricted bearer request, durable provider idempotency key, configured From, intended recipient, subject/text, and no Reply-To when absent; provider failure bodies are discarded into bounded categories;
- identity and invitation message contents, including token links, remain encrypted in Outbox envelopes at rest;
- worker claims use transaction plus `for update skip locked`, lease owner/generation fencing, stable provider idempotency, bounded retry/dead-letter states, and sanitized `last_error` values;
- Audit metadata allowlists remain unchanged and do not gain sender, recipient, credential, provider response, message body, or token fields;
- sender correction grants no User, Session, Workspace, Membership, Owner, Role, seat, Team, visibility, or entitlement authority.

Focused independent regressions passed **44/44 across eight files**: production server-environment validation, readiness privacy, Resend adapter request/failure/idempotency behavior, Audit allowlists, invitation and verification/reset token-intent privacy, and general security boundaries.

## Residual deployment-time gates

The evidence is **GO for a separately authorized `v0.5.0-uat.3` attempt**, subject to all of the following:

1. Architecture accepts the same immutable evidence and preserves Option A.
2. Product separately authorizes a new release/deployment; a new immutable commit, image, release directory, checksums, and monotonically increasing tag are created. Rejected `v0.5.0-uat.1` and `.2` remain untouched.
3. Release Engineering revalidates the protected staged fingerprint, exact new image, backup/restore, migration apply/rerun, app readiness, worker startup, rollback inputs, and live authority before switching.
4. The public Caddy matrix runs immediately after switching and closes `UAT-GAP-001`, including exactly one effective Referrer-Policy and preservation of CSP/cache/cookies/Location/Vary/static caching/token privacy.
5. Bounded real-email journeys use only the already authorized controlled recipients and distinguish provider acceptance from inbox receipt: registration verification/resend, recovery/reset with Session revocation, and invitation delivery/intended-identity acceptance.
6. Full health, authentication, Workspace/Owner/seat/single-Workspace, CRM/settings, theme/first-paint, responsive/accessibility, email-worker, restart, and bounded-log UAT gates close `UAT-GAP-006`.
7. Any material failure restores prior immutable application/config authority and affected services, then falls forward under a new identifier; no failed release is repaired or reused.

Asynchronous bounce/complaint reconciliation remains explicitly outside this UAT evidence and a production-readiness limitation. `UAT-GAP-005` remains a non-blocking operational follow-up.

No configuration/code/infrastructure mutation, email send, deployment, tag, production action, provider/DNS/credential change, or Phase 5 work occurred during this review.
