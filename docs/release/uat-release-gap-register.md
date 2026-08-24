# UAT release gap register

Last updated: 2026-08-24

This register is append-only by stable gap ID. Closed means the stated acceptance evidence exists; it does not permit reuse or mutation of a rejected release.

## Closed during this release workflow

### UAT-GAP-003 — Transferred checksum sidecar encoded a local path

- Date/environment/release/commit: 2026-08-24; UAT staging; `v0.5.0-uat.2`; `05c4c02`.
- Category: Operations / Test evidence.
- Observed versus expected: host-side `sha256sum -c` could not resolve the local absolute artifact path; expected portable archive verification before staging.
- Severity: P3.
- Affected journeys/tenants/data: deployment staging only; no tenant or data impact.
- Evidence and reproduction: first host checksum command failed before release-directory creation.
- Root cause: standard checksum output retained the build-machine absolute path.
- Containment/rollback: staging stopped automatically; no authority existed to roll back.
- Fall-forward owner/target: Release Engineering; completed within the same pre-switch workflow without changing the immutable artifact.
- Acceptance criteria: compare the transferred file's computed digest to the separately recorded expected digest before extraction.
- Dependencies: trusted transfer and locally recorded SHA-256.
- Status and verification: closed; both image and source archive digests matched before extraction.
- Residual risk: future runbook automation should emit basename-only portable manifests.
- Blocks: none.

### UAT-GAP-004 — Initial migration-ledger evidence probes used invalid SQL

- Date/environment/release/commit: 2026-08-24; live UAT read-only discovery; `v0.5.0-uat.2`; `05c4c02`.
- Category: Test evidence / Operations.
- Observed versus expected: the first probe queried nonexistent `app_migrations`, and a later database-existence probe allowed shell expansion inside a SQL literal; expected bounded read-only ledger evidence.
- Severity: P3.
- Affected journeys/tenants/data: none; PostgreSQL logged two rejected read-only statements.
- Evidence and reproduction: PostgreSQL returned relation-not-found and malformed-literal errors.
- Root cause: probe commands did not use the repository's `drizzle.__drizzle_migrations` contract and safely quoted literal form.
- Containment/rollback: commands failed without mutation; corrected queries were used.
- Fall-forward owner/target: Release Engineering; completed in this workflow and must be reflected in future runbook scripts.
- Acceptance criteria: query `drizzle.__drizzle_migrations`, obtain exactly 12/head `1787501845245`, verify no disposable restore database remains, and preserve healthy service/data state.
- Dependencies: repository readiness contract.
- Status and verification: closed; corrected evidence passed, migration ledger/data remained unchanged, and public readiness passed.
- Residual risk: ad hoc probes remain error-prone until consolidated into a reviewed script.
- Blocks: none.

### UAT-GAP-007 — Protected sender representation differed between shell and Docker env-file parsing

- Date/environment/release/commit: 2026-08-24; UAT Option A pre-switch staging; exact validation source `05c4c02`.
- Category: Operations / Test evidence.
- Observed versus expected: the first isolated staged sender retained shell-style outer quotes that Docker treated as literal data, so schema validation rejected it; a subsequent harness attempt showed the corrected display-name value cannot safely be shell-sourced. Expected one protected representation consumed consistently by Docker without disclosure.
- Severity: P3.
- Affected journeys/tenants/data: pre-switch validation only; no live tenant, email, Session, or database data was affected.
- Evidence and reproduction: exact `nexaflow:05c4c02` schema validation failed closed on the quoted staged value; shell parsing stopped on the display-name syntax before migration.
- Root cause: `.env.example` uses shell-oriented quoting while Docker `--env-file` preserves quote characters, and display-name syntax is not a safe generic shell assignment without quoting.
- Containment/rollback: both failures occurred against an isolated staged file and disposable validation harness. The live protected file fingerprint and release pointer remained unchanged.
- Fall-forward owner/target: Release Engineering; closed during Option A pre-switch validation.
- Acceptance criteria: stage the approved identity in Docker env-file representation; keep Reply-To absent; pass exact schema, migration twice, readiness, worker, provider probe, and cleanup using the same staged file; never source the complete staged file.
- Dependencies: Product Option A authority and Architecture `f67b069`.
- Status and verification: closed; corrected candidate fingerprint `a825b7947bbeda0fd747233457af40ef40cee71d5905686b2c397f531bd1f3d8`, schema/migration/readiness/worker/provider gates passed, and live authority remained unchanged.
- Residual risk: future runbook tooling must distinguish Docker env-file serialization from shell syntax and avoid sourcing provider configuration.
- Blocks: none after the successful evidence rerun.

## Open blocking

### UAT-GAP-002 — Candidate runtime rejects protected UAT sender configuration

- Date/environment/release/commit: 2026-08-24; UAT pre-switch; rejected `v0.5.0-uat.2`; `05c4c02d5e96ce56aee28d80d199d67369fb57ea`.
- Category: Application / Operations / Security.
- Observed versus expected: candidate migration exits with a bounded `EMAIL_FROM` `ZodError`; expected the exact protected UAT environment to pass schema validation so migration, app, and worker can start.
- Severity: P1.
- Affected journeys/tenants/data: all candidate availability if switched; migration execution; registration/verification/recovery/reset/invitation transactional email. No live tenant or data was changed because switching stopped.
- Evidence and reproduction: run the exact `nexaflow:05c4c02` migration command on the UAT database network with the protected app environment; validation rejects the sender because it does not satisfy the accepted verified `mail.nexaflowsystems.com` domain contract. Values and credentials must remain suppressed.
- Root cause/current hypothesis: accepted application validation and installed protected UAT provider configuration are incompatible. Whether configuration or validation is incorrect requires Product/Architecture/provider authority; the deployment task may not guess.
- Containment/rollback: stopped before pointer/release-authority switch and service recreation. Live `e58c22a` remained healthy; encrypted pre-attempt backup and rollback artifacts are retained.
- Fall-forward owner/target: Product + Architecture + Backend/Release Engineering; new commit/config authority and no earlier than `v0.5.0-uat.3`.
- Acceptance criteria: explicit canonical sender decision; protected configuration or bounded code change accepted without exposing secrets; environment-schema positive/negative tests; migration apply and idempotent rerun; candidate app/worker startup; verified transactional-email flow; full affected security/build/browser and deployment gates.
- Dependencies: approved verified sender identity/domain and authorization for any provider/protected-config change, or accepted application contract correction.
- Status and verification: open blocking; `v0.5.0-uat.2` permanently rejected.
- Residual risk: bypassing validation could create delivery failure, sender spoofing/misrepresentation, or candidate outage.
- Blocks: UAT acceptance, Phase 5, and production readiness.

#### Option A pre-switch update — PASS, evidence review pending

- Authorization: Product Owner selected Architecture Option A from `f67b069`, reaffirmed the documented Accounts sender on verified `mail.nexaflowsystems.com`, required Reply-To absent, and authorized the provider/domain-owner plus Release Engineering roles for minimized verification and protected staging.
- Provider evidence: authenticated Resend domains requests returned HTTP 200 at `2026-08-24T07:44:55Z` and `2026-08-24T07:47:16Z`; the canonical domain was present and verified/active, required DNS hostnames resolved, and the second request was a non-delivery probe that created no email.
- Protected evidence: live file unchanged at fingerprint `143eadb6333cd0279884d49a4af27f6e7c030cd58ac49ff89aacf2ec83e0ac36`; root-owned mode-`0600` backup retained; root-owned mode-`0600` staged candidate fingerprint `a825b7947bbeda0fd747233457af40ef40cee71d5905686b2c397f531bd1f3d8`; non-reversible sender fingerprint `588dafe12e8bf43635c3bc604789c8d0864df600a3439f917f0d4b1902bb4172`; Reply-To absent.
- Exact candidate results: environment schema passed; disposable migration apply and idempotent rerun passed at 12/head `1787501845245`; isolated app readiness passed; continuous worker startup passed; bounded worker logs passed; provider non-delivery probe passed; all disposable resources were removed.
- Status: technical pre-switch compatibility **PASS**. Gap remains open blocking until Architecture and backend/security accept `docs/release/uat-option-a-sender-pre-switch-evidence.md`, Product separately authorizes a new immutable attempt, the protected candidate becomes live through the approved atomic workflow, and real-email/public-edge/full UAT evidence passes.
- Residual risk: provider verification and non-delivery authentication do not prove current inbox receipt; no live service consumes the staged correction yet. Never mutate rejected `v0.5.0-uat.2`; fall forward no earlier than `v0.5.0-uat.3` after review.

### UAT-GAP-001 — Edge overwrote application no-referrer policy

- Date/environment/release/commit: discovered 2026-08-24 on UAT `v0.5.0-uat.1` / `9162a90`; remediation integrated at `05c4c02`.
- Category: Edge/Infrastructure / Security.
- Observed versus expected: public invitation capture returned edge `strict-origin-when-cross-origin`; expected exactly one application `no-referrer` on invitation/verification/reset token documents and one edge default only when upstream is silent.
- Severity: P1.
- Affected journeys/tenants/data: invitation, verification, and password-reset bearer-token privacy for all UAT users; no observed token disclosure, but the accepted referrer boundary was weakened.
- Evidence and reproduction: `docs/release/nexa-spectrum-phase-1-4-uat-deployment-result.md` and Architecture authority `f907e70`.
- Root cause: unconditional Caddy setter overwrote upstream route-specific policy.
- Containment/rollback: `v0.5.0-uat.1` was rejected and UAT restored to `v0.4.0-uat.1` / `e58c22a`.
- Fall-forward owner/target: completed code/config remediation by Dev2 and accepted reviewers; intended for the next deployable increment after UAT-GAP-002 closes.
- Acceptance criteria: `?Referrer-Policy` exact candidate; pinned adapt/validate; upstream-present/absent and duplicate tests; public HTML/RSC edge matrix with CSP/cache/cookies/Location/Vary/static/token/log preservation.
- Dependencies: a deployable candidate that passes environment/migration gates and separate deployment authorization.
- Status and verification: remediation accepted and integrated; offline evidence passed, but live public-edge closure remains pending because `v0.5.0-uat.2` stopped before switch.
- Residual risk: no risk added to currently retained healthy release; the remediated edge cannot be declared live-closed until public verification succeeds.
- Blocks: UAT acceptance of the Nexa Spectrum release; Phase 5 and production readiness until live closure evidence exists.

## Open non-blocking

### UAT-GAP-005 — Release evidence commands remain partly ad hoc

- Date/environment/release/commit: 2026-08-24; UAT release engineering; `v0.5.0-uat.2`; `05c4c02`.
- Category: Operations / Test evidence.
- Observed versus expected: safe recovery was possible, but portable checksum and migration-ledger commands required manual correction; expected one reviewed, repeatable, fail-closed evidence harness.
- Severity: P3.
- Affected journeys/tenants/data: operator efficiency and evidence quality only.
- Evidence and reproduction: UAT-GAP-003 and UAT-GAP-004.
- Root cause/current hypothesis: runbook examples and implementation scripts do not cover the full repeated deployment evidence workflow.
- Containment/rollback: all flawed probes failed before mutation or were read-only; corrected evidence was recorded.
- Fall-forward owner/target: Release Engineering, next UAT tooling increment.
- Acceptance criteria: reviewed script uses basename-only manifests, repository migration-table authority, explicit paths, secret-safe output, and deterministic exit-code capture.
- Dependencies: Product authorization for a tooling-only increment and Architecture/Operations review.
- Status and verification: open non-blocking.
- Residual risk: repeat operator friction or ambiguous logs; existing stop conditions contain state risk.
- Blocks: none, provided reviewed commands and stop conditions remain enforced.

## Explicitly deferred or out of scope

### UAT-GAP-006 — Public-edge and full Product smoke for Spectrum remain unexecuted

- Date/environment/release/commit: 2026-08-24; `v0.5.0-uat.2`; `05c4c02`.
- Category: Test evidence / Product / UX/accessibility.
- Observed versus expected: staged Caddy and offline tests passed, but public edge, authenticated flows, visual themes, responsive/accessibility, Workspace/CRM, email, and browser acceptance were not run against the candidate; expected only after all pre-switch gates pass and candidate becomes live.
- Severity: P1 as missing release acceptance evidence, not a newly observed product defect.
- Affected journeys/tenants/data: all Nexa Spectrum UAT journeys listed in the deployment authorization.
- Evidence and reproduction: deployment stopped at UAT-GAP-002 before authority switching.
- Root cause/current hypothesis: correct enforcement of the material pre-switch stop condition.
- Containment/rollback: no candidate traffic was admitted; prior healthy UAT remained authoritative.
- Fall-forward owner/target: Release Engineering + Dev1/Product UAT, next accepted immutable attempt after UAT-GAP-002 closes.
- Acceptance criteria: complete the public-edge matrix first, then all authorized bounded UAT smoke with exact counts, warnings, container/log evidence, and Product disposition.
- Dependencies: deployable fall-forward candidate, new authorization, retained backup/rollback inputs, and approved tester credentials.
- Status and verification: explicitly deferred because the prerequisite failed; not represented as passed.
- Residual risk: Spectrum release behavior remains unaccepted in live UAT.
- Blocks: UAT acceptance, Phase 5, and production readiness.
