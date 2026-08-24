# UAT Option A sender pre-switch Architecture review

Date: 2026-08-24

Evidence candidate: `5debb39839bf095d34783643ccbffcaa6ea0a60c` on `main`

Authority: `f67b069c645b5bee32aaa9f2f0bae8c45c438dc2`

Evidence: `docs/release/uat-option-a-sender-pre-switch-evidence.md`

## Verdict

**ACCEPT — no material Architecture blocker in the Option A pre-switch evidence.**

P0: none.

P1: none at the pre-switch sender-compatibility boundary. Live UAT acceptance remains gated by the separately authorized deployment and public evidence listed below.

P2: none.

P3: `UAT-GAP-005` remains a non-blocking evidence-automation follow-up; the Docker-env-file versus shell representation lesson from `UAT-GAP-007` must be incorporated into the reviewed release procedure before the next attempt.

Product may separately authorize preparation and execution of a new immutable UAT attempt no earlier than `v0.5.0-uat.3`. This review is not deployment authority and does not close the live UAT, public-edge, real-delivery, or Product-acceptance gates.

## Option A contract confirmation

The evidence records prior Product authorization of the existing canonical Accounts identity on the provider-verified `mail.nexaflowsystems.com` domain. It does not introduce a new sender, relax application validation, or disclose the protected configured value. The authorized provider/domain-owner confirmed through authenticated read-only evidence that the canonical domain is present and verified/active, required DKIM/SPF hostnames resolve, and the restricted credential can reach the applicable account/domain boundary. No DNS record content, credential, provider response body, recipient, message, token, or full provider identifier was retained.

Reply-To is absent in the staged candidate, preserving the accepted rule that no Reply-To exists until Product approves a monitored address. The adapter's From, Reply-To, provider credential, Outbox, envelope/Return-Path, idempotency, retry, Audit, and log-minimization boundaries are unchanged because `b574f287..5debb39` contains documentation only.

## Environment parity and staged containment

The same root-owned mode-`0600` staged protected file was passed directly to Docker for:

- production environment-schema validation;
- migration initial apply and idempotent rerun against one disposable database;
- isolated application liveness/readiness;
- isolated continuous email-worker startup; and
- authenticated GET-only provider/domain reachability.

Those checks passed with the exact rejected-image source used only as a compatibility probe. The disposable ledger remained exactly 12 migrations at the accepted head, bounded worker logs contained no token or material error evidence, the non-delivery probe created no email, and all disposable resources were removed. This proves migration, app, readiness, and worker interpret one protected sender contract consistently.

The initial quoted representation correctly failed closed. Release Engineering then corrected only the isolated staged serialization to Docker env-file form and reran the complete parity sequence. The successful process did not shell-source the display-name form or split environment interpretation across services.

The live protected file retained its recorded non-reversible fingerprint; a root-owned mode-`0600` backup and separately fingerprinted staged candidate were retained. `/opt/nexaflow/uat/current` remained on the healthy prior release. No live pointer, protected live environment, service, container, restart count, database, ledger, DNS, provider setting, credential, image authority, or tag changed.

## Gap disposition

### UAT-GAP-002

**Pre-switch compatibility component: closed by Architecture. Overall release gap: remains open blocking until the approved staged configuration becomes candidate authority in a separately authorized attempt and real-email/public/full-UAT evidence passes.**

The former migration/app/worker schema incompatibility is reproducibly corrected by Option A without an application validation change. Do not mark the complete gap closed merely from provider verification and startup: current inbox receipt and live service consumption remain unproven.

### UAT-GAP-007

**Closed as a P3 staging defect.** The accepted representation is Docker env-file serialization consumed directly by Docker; the complete protected file must never be shell-sourced. Before the next attempt, the release procedure/test harness must encode this distinction and must not copy shell-style quoted examples into protected Docker env files. Repetition of the representation ambiguity at candidate staging reopens the gap and stops the release.

### Remaining gaps

- `UAT-GAP-001` remains open until the remediated Caddy behavior passes the public HTML/RSC edge matrix.
- `UAT-GAP-006` remains open until public, authenticated, visual, responsive/accessibility, Workspace/CRM, email, and Product UAT evidence completes.
- `UAT-GAP-005` remains non-blocking but its reviewed deterministic evidence harness is still recommended.
- Asynchronous bounce/complaint reconciliation remains an explicit production-readiness limitation, not proof of UAT delivery failure.

## Required gates for a new UAT attempt

Before Product authorizes execution, Release Engineering must create a new immutable revision/image/checksum/release directory and a monotonically new identifier no earlier than `v0.5.0-uat.3`; retain both rejected tags unmoved. Repeat source/image provenance, protected-file owner/mode/key-presence checks, encrypted backup plus disposable restore, ledger proof, Caddy adapt/validate, Compose render, environment-schema parity, migration apply/rerun, isolated app readiness, and worker startup using the exact new candidate and staged Option A configuration.

After the separately authorized atomic switch:

1. prove app, worker, Caddy, PostgreSQL, and Mailpit health/restart state and generic bounded logs;
2. run the public Caddy positive/negative matrix first, including unique Referrer-Policy, CSP/cache/cookie/Location/Vary/static preservation and raw/encoded token absence for invitation, verification, and reset HTML/RSC paths;
3. run only the explicitly approved-recipient registration verification, verification replacement, recovery/reset with Session revocation, and invitation delivery/acceptance journeys; distinguish provider acceptance from observed inbox receipt and retain no recipient/token/message content;
4. complete the authenticated Workspace/CRM, Light/Dark/System, responsive, accessibility, security, build, and Product UAT matrix;
5. verify Outbox terminal state, idempotency/replay behavior, sender contract, Reply-To absence, Audit/log privacy, and no secret/provider-response disclosure; and
6. immediately restore the prior immutable release pointer and protected configuration if readiness, sender, delivery, edge privacy, or full-UAT gates fail. Already accepted external email cannot be represented as rolled back.

No production, Phase 5 deployment, DNS/provider mutation, or reuse of `v0.5.0-uat.1` or `v0.5.0-uat.2` is authorized.

## Distinct backend/security acceptance supplement

Architecture reviewed the distinct backend/security acceptance at `fbf430f98d9f00590efddaaf6b747c77458b5cec`. It reviews exact evidence revision `5debb39839bf095d34783643ccbffcaa6ea0a60c`, carries Architecture authority `f67b069` in its ancestry, and records no code, protected-configuration, provider, DNS, database, container, live-authority, or infrastructure mutation.

That review independently confirms:

- P0, P1, and P2: none in the pre-switch evidence;
- P3: `UAT-GAP-005` remains non-blocking and `UAT-GAP-007` is closed;
- the canonical provider domain remains verified/active and reachable through a GET-only, non-delivery check;
- the staged and backup files retain the expected root ownership/mode and non-reversible fingerprints, exactly one sender key, and no Reply-To;
- schema, migration/app/worker parity and disposable cleanup remain sound while live authority remains unchanged;
- Outbox encryption, idempotency, lease/generation fencing, retries/dead-letter, token privacy, Audit minimization, and Workspace/security authority are unchanged; and
- 44/44 focused privacy, Outbox, provider-adapter, environment, readiness, Audit, token-intent, and general security tests passed.

The Backend/Security record and this Architecture record are consistent and may both be integrated through the normal immutable documentation workflow. Together they close the required pre-switch Architecture and backend/security evidence-review gates; they do not close live Caddy, real-email, full UAT, or Product acceptance.

With both records integrated, Product may separately authorize a new immutable UAT attempt no earlier than `v0.5.0-uat.3`, subject to every gate above—especially immediate live Caddy verification, live sender/provider and approved-recipient email journeys, and the complete Product UAT matrix. `v0.5.0-uat.1` and `v0.5.0-uat.2` remain permanently retired.
