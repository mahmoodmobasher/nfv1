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

#### v0.5.0-uat.4 recurrence

- The generated sidecar again retained the local temporary-directory prefix. Host `sha256sum -c` failed before release-directory creation or image load; separately recorded expected source/image digests were then compared against transferred basenames successfully before staging.
- Status: reopened P3/non-blocking under `UAT-GAP-005` until a reviewed basename-only artifact harness replaces the ad hoc command. No artifact, authority, tenant, or data integrity was weakened.

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

### UAT-GAP-010 — Remote Compose migration evidence consumed the command stream

- Date/environment/release/commit: 2026-08-24; UAT `v0.5.0-uat.3`; `82b8104`.
- Category: Operations / Test evidence.
- Observed versus expected: migration containers exited successfully, but attached `docker compose run` consumed the remaining SSH heredoc and prevented subsequent evidence lines; expected deterministic exit/idempotency output.
- Severity: P3.
- Affected journeys/tenants/data: evidence capture only; ledger and application data were unchanged.
- Evidence and reproduction: direct/named container migration exited 0 while the wrapper ended before its following statements.
- Root cause: Compose run retained stdin from the remote script.
- Containment/rollback: stopped interpretation of missing output as migration failure; inspected immutable container result and reran with `-T` plus `</dev/null`.
- Fall-forward owner/target: Release Engineering; closed during `.3` preflight and included in the `UAT-GAP-005` automation follow-up.
- Acceptance criteria: two explicit zero exits plus exact 12/head ledger after stdin-detached runs.
- Dependencies: reviewed deployment harness.
- Status and verification: closed; apply and idempotent rerun passed with ledger 12/head `1787501845245`.
- Residual risk: ad hoc future wrappers can regress until automated.
- Blocks: none.

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

#### v0.5.0-uat.3 deployment update — runtime parity passed, live acceptance deferred

- The exact `.3` migration, app readiness, and worker startup passed using the protected Option A environment after atomic switch.
- No controlled-recipient email journey ran because the earlier mandatory Caddy matrix failed at `UAT-GAP-008` and forced rollback.
- Live authority returned to the prior environment, so Option A remains technically proven but not current live configuration. The gap remains release-blocking until a later accepted attempt repeats parity and completes the authorized real-email journeys.

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

#### v0.5.0-uat.3 public-edge update

- The integrated Caddy `?Referrer-Policy` behavior preserved application `no-referrer` on ten initial invitation/verification probes, including HTML/RSC and denied invitation completion.
- Closure did not complete because the application omitted `no-referrer` on verification/reset completion denial responses (`UAT-GAP-008`). `.3` was rolled back and rejected; the full matrix must restart on a new fall-forward candidate.

### UAT-GAP-008 — Verification/reset completion denials omit application no-referrer

- Date/environment/release/commit: 2026-08-24; public UAT rejected `v0.5.0-uat.3`; `82b81044443a61d25926608d57c943b9ed89dfe1`.
- Category: Security / Application / Edge/Infrastructure.
- Observed versus expected: CSRF-denied POSTs to `/verify-email/complete` and `/reset-password/complete` returned HTTP 403 with exactly one edge default `strict-origin-when-cross-origin`; `f907e70` requires exactly one application `no-referrer` for verification/reset terminal and denied outcomes.
- Severity: P1.
- Affected journeys/tenants/data: verification and password-reset terminal/denial privacy for every UAT identity flow. No token or tenant data was observed disclosed; the accepted referrer boundary was absent.
- Evidence and reproduction: deploy exact `.3`, POST each completion route without valid CSRF, disable redirects, and inspect the single public Referrer-Policy. Stop before broader testing.
- Root cause/current hypothesis: `src/proxy.ts` sets `no-referrer` for capture/clean token documents but its token-document route set omits verification/reset completion endpoints, leaving Caddy to apply the correct upstream-silent default.
- Containment/rollback: immediately restored `e58c22a` application/config authority and recreated only app, worker, and Caddy; health/readiness, ledger, restarts, and bounded logs passed.
- Fall-forward owner/target: Backend + Security + Architecture; new application commit and no earlier than `v0.5.0-uat.4`.
- Acceptance criteria: server-authored `no-referrer` on every verification/reset completion success, invalid, stale, replay, CSRF/origin denial, and terminal outcome; HTML/RSC/API direct and public-edge positive/negative tests; exactly one non-combined policy; preserved CSP/cache/cookies/Location/Vary/token privacy; complete `f907e70` matrix.
- Dependencies: Backend implementation, focused security peer review, Architecture acceptance, integration, and separate Product deployment authorization.
- Status and verification: open blocking; `.3` permanently rejected.
- Residual risk: route-list drift can recur unless policy coverage is asserted from one canonical protected-route contract.
- Blocks: UAT acceptance, Phase 5, and production readiness.

#### Bounded fall-forward implementation update — review pending

- Backend candidate implementation `5fdec7b` on `codex/uat-token-terminal-header-remediation` replaces the five-entry ad hoc proxy classifier with one frozen, exported exact-path contract covering all eleven verification, reset, and invitation website token lifecycle paths required by Architecture `0035fd1`.
- Static boundary evidence passed for exact membership, duplicate prevention, query independence, all-method header assignment through `Headers.set`, direct-compatibility API exclusion, and near-miss exclusion. Exact production-build response probes passed 29/29 across all protected GET/PUT outcomes, missing-CSRF completion/clear denials, and near misses, with one effective `no-referrer`, private/no-store, nonce CSP, and no production unsafe CSP directive.
- Existing direct/unit and serialized PostgreSQL identity/reset/invitation suites remain green, including invalid/expired/replayed tokens, rate limits, all-Session reset revocation, success-Audit singularity, late-failure rollback, tenant/seat/identity denial, and invitation concurrency/replay. Focused browser evidence remains token-free across HTML/RSC, history, storage, redirects, cookies, and outbound requests.
- Status: implementation complete; gap remains open P1/blocking until distinct backend/security and Architecture acceptance, controlled integration, a new immutable deployment authorization, and a fully restarted public-edge matrix close the live boundary. No UAT service, release tag, provider, secret, Caddy, or infrastructure state changed.

#### v0.5.0-uat.4 public-edge update

- Accepted implementation/review ancestry was integrated at `58c5ae4`. The first 52 live protected assertions passed, including all eleven exact routes and verification/reset completion missing/mismatched-CSRF plus absent/cross-Origin denials with one application `no-referrer` and effective private/no-store.
- The release was rolled back for separate P1 `UAT-GAP-011` before the full matrix completed. Implementation closure remains accepted, but live operational closure is incomplete while `e58c22a` is restored.

### UAT-GAP-011 — Generated verification/reset capture RSC redirect retains token query

- Date/environment/release/commit: 2026-08-24; public UAT rejected `v0.5.0-uat.4`; `58c5ae4c7075d3637bacb96fb70c343d671273a6`.
- Category: Security / Application / Test evidence.
- Observed versus expected: an RSC-shaped request to generated `/verify-email/capture?token=...` returned HTTP 307 with the token query retained in `Location` plus `_rsc`; expected the existing token-free HTTP 303 clean destination. Exact-image isolation reproduced the same behavior for verification and reset capture routes without Caddy.
- Severity: P1.
- Affected journeys/tenants/data: verification and password-recovery links when requested with the RSC header shape. Only synthetic tokens were used; no credential, personal recipient, tenant data, or production token was disclosed.
- Evidence and reproduction: request either generated identity capture route with a synthetic valid-shape token, `RSC: 1`, and redirects disabled; inspect only status and redacted Location shape. HTML capture remains clean. The behavior reproduces directly on `nexaflow:58c5ae4`.
- Root cause/current hypothesis: Next.js RSC request normalization redirects the token-bearing Route Handler URL before the handler's 303 cookie-capture response. Existing tests covered clean proxy capture/invitation RSC shapes but omitted generated verification/reset capture Route Handlers under RSC.
- Containment/rollback: edge testing stopped before email or business-flow mutation. Prior `e58c22a` application/config authority was restored; all services, public health, 12/head ledger, restarts, and bounded logs passed.
- Fall-forward owner/target: Backend + Architecture + Security; bounded capture-before-framework remediation, no earlier than a new immutable `v0.5.0-uat.5` after Product authorization.
- Acceptance criteria: generated verification/reset links under HTML and RSC return one clean token-free Location and preserve encrypted purpose/path/expiry cookies; raw/encoded tokens absent from body/headers/cookies in plaintext/history/storage/outbound/logs; Back/refresh/replay/invalid/expired/replaced/consumed and direct legacy compatibility remain correct; complete direct-production and public-edge matrices restart from probe one.
- Dependencies: Next.js 16.3.1 mechanism review, focused implementation, backend/security and Architecture acceptance, integration, artifact/preflight/deployment authorization.
- Status and verification: open blocking; `.4` permanently rejected and unmoved.
- Residual risk: token-bearing redirect Location may expose a bearer token to client history, intermediaries, or downstream requests despite strict Referrer-Policy/cache headers.
- Blocks: UAT acceptance, Phase 5, and production readiness.

#### Bounded capture-before-framework implementation update — review pending

- Backend implementation `47efe632f07be09b5d0da552f86727f27ddea346` on `codex/generated-token-rsc-capture-remediation` removes the two prefetch matcher omissions and captures the exact generated plus legacy verification/reset entries in Proxy before filesystem/framework routing. Invitation capture is preserved and receives the same presentation-independent coverage.
- GET with one valid-shape token returns a clean 303 and opaque purpose-bound intent. HEAD returns a bodyless clean 303 without sealing. Unsupported methods return generic bodyless 405. Duplicate, empty, malformed, oversized, and undecodable inputs clear stale authority. Every handled outcome is private/no-store, no-referrer, nonce-CSP protected, and token-free outside the opaque HttpOnly cookie.
- Official shipped Next matcher evidence passed for HTML, RSC, `_rsc`, router/purpose prefetch, router-state, and combined shapes. Immutable production evidence passed for real encrypted Outbox/template verification/reset links plus synthetic mapping/method/query tables and browser history/storage/outbound/referrer checks. Direct/unit passed 144/144, PostgreSQL passed 124/124 serialized, production capture passed 4/4, and focused token/invitation browser security passed 4/4.
- Status: implementation-remediated, still P1/open blocking pending distinct Backend/Security and Architecture acceptance, controlled integration, separate Product authorization, and a newly started public-edge matrix. No live service, release tag, email/provider, Caddy, secret, database schema, or infrastructure state changed.
- `v0.5.0-uat.1`, `.2`, `.3`, and `.4` remain permanently retired. No `.5` was created or authorized by this implementation.

#### v0.5.0-uat.5 deployment update — implementation signal positive, live closure incomplete

- Accepted candidate `0da5caa`, Architecture `32a38a9`, and Backend/Security `9d22612` were integrated and promoted at `bb5bd5d`; Architecture release-readiness GO was recorded at `bb50cd7`.
- All artifact, Option A, backup/restore, migration, Caddy/Compose, app/worker readiness, health, and rollback prerequisites passed. The first public generated-verification HTML probe returned HTTP 303 with clean relative `Location: /verify-email`.
- The release harness incorrectly required the equivalent absolute same-origin form and failed before completing the response-privacy assertions. Automatic rollback restored `e58c22a`; `.5` is permanently rejected under fall-forward policy.
- Exact-image diagnosis retained HTTP 303, clean token-free Location, no-referrer, private/no-store, nonce CSP, and an opaque bounded cookie. No application regression was reproduced, but `UAT-GAP-011` remains operationally open because RSC/prefetch/combined and the remainder of the public matrix did not run.

### UAT-GAP-012 — Public-edge harness rejects valid relative clean Location

- Date/environment/release/commit: 2026-08-24; public UAT rejected `v0.5.0-uat.5`; `bb5bd5d6e513cf61ecd17b6aaef668264df1b344`.
- Category: Test evidence / Operations.
- Observed versus expected: the first generated verification capture probe received HTTP 303 with `Location: /verify-email`; the harness expected only `https://app.nexaflowsystems.com/verify-email`. The accepted security contract requires the exact token-free same-origin clean destination and permits the relative network serialization after normal same-origin resolution.
- Severity: P2.
- Affected journeys/tenants/data: release evidence and UAT availability only. One synthetic verification capture request ran. No personal recipient, credential, production token, tenant mutation, or controlled email journey was involved.
- Evidence and reproduction: deploy exact `.5`, issue the first redirect-disabled synthetic verification capture request, and compare the raw Location. Offline exact-image diagnosis returned 303/relative-clean with no-referrer, private/no-store, nonce CSP, opaque bounded cookie, and token absence. The original harness exited at Location equality before recording later assertions.
- Root cause/current hypothesis: the ad hoc shell harness compared raw Location text to one absolute representation rather than resolving the value against the request origin and enforcing the canonical origin/path/query/fragment tuple. Its `ERR` trap also lacked function inheritance, so the safe probe label was not emitted before rollback.
- Containment/rollback: the fail-closed wrapper immediately restored `v0.4.0-uat.1` / `e58c22a`; five services are healthy with zero restarts, ledger 12/head `1787501845245`, public smoke green, and bounded logs clean. `.5` will not be moved or reused.
- Fall-forward owner/target: Release Engineering with Backend/Security and Architecture review; reviewed harness-only correction and a new immutable UAT attempt no earlier than `v0.5.0-uat.6`.
- Acceptance criteria: normalize relative or absolute Location against the request origin; accept only exact expected origin and pathname with empty query/fragment; reject scheme-relative, cross-origin, userinfo, encoded-path ambiguity, 307/308, query-bearing, fragment-bearing, missing, duplicate, comma-joined, or token-bearing values; inherit/report safe probe identifiers on every failure; rerun direct negative fixtures and the complete public matrix from probe one.
- Dependencies: Product authorization for a tooling/evidence increment, independent Backend/Security review, Architecture acceptance, immutable integration/provenance, and separate `.6` deployment authorization.
- Status and verification: open blocking. Application code is unchanged and no application defect is currently indicated; `.5` remains rejected because its live acceptance sequence did not complete.
- Residual risk: another false stop or, if normalization is implemented loosely, acceptance of a cross-origin or token-bearing redirect. Fail-closed rollback contained the current attempt.
- Blocks: UAT acceptance, Phase 5, and production readiness evidence; does not independently block the retained healthy `e58c22a` service.

#### Bounded release-harness remediation update — review pending

- Release Engineering implementation `b5654dd6862f046d3f4889073987d75fd310ff0e` adds one repository-owned, token-blind header-file validator and a named deterministic gate. It changes no application, Proxy, Caddy, provider/configuration, database, or live-UAT behavior.
- The validator resolves relative or absolute Location against one canonical request origin and accepts only status 303, one exact same-origin expected pathname, and empty query/fragment. It rejects 307/308, response chains, missing/empty/duplicate/comma-joined fields, scheme-relative/cross-origin/userinfo, whitespace/control/backslash/percent-encoded ambiguity, ambiguous relative values, wrong paths, and query/fragment/token-bearing values.
- CLI evidence is limited to fixed pass/fail and reason labels plus a validated bounded probe identifier; raw Location, headers, tokens, recipients, file paths, origins, and expected paths are suppressed. Focused fixtures passed 34/34; lint, TypeScript, and the 178-test direct suite passed.
- Status: implementation-remediated, still P2/open blocking pending distinct Backend/Security and Architecture acceptance, controlled integration, separate immutable release authorization no earlier than `.6`, and a fully restarted public-edge matrix. `.1` through `.5` remain permanently rejected and unmoved.

#### Architecture rejection and second tooling remediation — fresh reviews pending

- Architecture review `99ab72db72f9208e8c4be997f5d58d72fb53d5b3` rejected candidate `32d601ec1792309570bcb600545be7cf4fc3bcb9` at P2. It demonstrated fail-open acceptance of raw empty query/fragment delimiters, raw dot segments erased by URL normalization, whitespace before the header colon, malformed response blocks, informational responses after the final response, and controls in other response-header values. Prior Backend/Security acceptance `57d4133d8e213547ddd1c7cda0db178f7778a6be` does not carry forward.
- Remediation implementation `a6290dd31ca103717d80172a2058c37c0bab9836` rejects those representations before or during strict response parsing, requires informational blocks to precede exactly one final 303, and retains the clean relative/canonical absolute same-origin destination, single-Location, encoding/backslash, safe-probe, and output-suppression contract.
- Deterministic evidence passed 78/78 focused fixtures covering verification and reset destinations, lint, direct TypeScript, and 222/222 executable direct tests. No application, Proxy, Caddy, provider/configuration, database, infrastructure, or live-UAT behavior changed or was accessed.
- Status remains P2/open blocking. Fresh distinct Backend/Security and Architecture acceptance of the new immutable candidate are mandatory before controlled integration or any separately authorized immutable attempt no earlier than `.6`. `.1` through `.5` remain permanently rejected and unmoved.

#### Second Architecture rejection and bounded status-line remediation — fresh reviews pending

- Architecture review `16122427324ccd574ba4fafbe3dcf514aea92617` rejected candidate `0f65d0887e178c379b0bd37e24e6a0e22095e9f0` at P2 after demonstrating acceptance of malformed status lines including alphabetic/arbitrary HTTP versions, lowercase protocol, Unicode whitespace, `HTTP/2.0`, and `HTTP/999`. Prior Backend/Security acceptance `3b62423` does not carry forward.
- Remediation implementation `12e7f76f38e43666ce3dee4b074d2a3acdcef09e` restricts status evidence to uppercase `HTTP/1.0`, `HTTP/1.1`, `HTTP/2`, or `HTTP/3`, literal ASCII separators, status 100–599, and an optional bounded printable-ASCII reason phrase. Malformed punctuation, unsupported versions, Unicode/tab separators, invalid status widths/ranges, invalid trailing syntax, non-ASCII/control reasons, and oversized reasons fail closed.
- The focused evidence retains the prior 78 cases and passes 100/100 total fixtures. Lint, direct TypeScript, and 244/244 executable direct tests passed; 124 PostgreSQL-gated cases remained skipped as designed. The correction changes no application, Proxy, Caddy, configuration, database, provider, infrastructure, UAT, tag, or main state.
- Status remains P2/open blocking pending entirely fresh Backend/Security and Architecture review, controlled integration authority, and a separately authorized immutable attempt no earlier than `.6`. `.1` through `.5` remain permanently rejected and unmoved.

#### v0.5.0-uat.7 operational update — validator available, acceptance interrupted

- The accepted validator is present in exact source `386d10c` and `.7` provenance passed. The disposable rebuild did not reach a generated redirect probe because bounded tenant/API admission found separate P1 `UAT-GAP-013` before approved-recipient identity authority existed.
- Status remains operationally open. No validator bypass or ad hoc redirect equality was used, and no `.7` evidence is claimed for generated verification/reset redirects.

### UAT-GAP-013 — Unauthenticated Workspace-settings denial returns HTTP 500

- Date/environment/release/commit: 2026-08-24; public UAT `v0.5.0-uat.7`; `386d10c5cc8eee9ff9f6d622d1a1e1a144c06ef2`.
- Category: Application / Security / Database / Test evidence.
- Observed versus expected: three unauthenticated GET requests to the exact Workspace-settings API route returned HTTP 500 with an empty body; the accepted contract requires bounded HTTP 401 `authentication_required` and safe denial handling.
- Severity: P1 provisional.
- Affected journeys/tenants/data: Workspace settings and confidence in tenant-admin denial paths. The fresh database contained no tenants or application data; no cross-tenant read occurred, no public body disclosure was observed, and no mutation committed.
- Evidence and reproduction: request `GET /api/workspaces/<synthetic-unknown-workspace>/settings` without a Session. Each request returned 500; bounded application logs recorded `Cannot use a pool after calling end on the pool`. Comparable unauthenticated account and leads routes returned bounded 401/403 outcomes. Public evidence suppresses the synthetic identifier and all headers/bodies except safe status/cache summaries.
- Root cause/current hypothesis: `src/app/api/workspaces/[workspaceId]/settings/route.ts` returns asynchronous `auditedFailure(...)` without awaiting it, while `finally` closes the PostgreSQL pool. The pending denial Audit then calls `pool.connect()` after shutdown. Source search finds the same lifecycle form in additional tenant-admin routes, so final scope requires Architecture authority.
- Containment/rollback: stopped before tester admission, email, cohort creation, CRM mutation, or full UAT. `.7` remains operationally healthy with an empty fresh database for bounded diagnosis only; retained `.4` files/image and rebuild inputs remain available. No live patch was made.
- Fall-forward owner/target: Backend + Security + Architecture + Release Engineering; a new reviewed application increment and immutable UAT attempt later than `.7`.
- Acceptance criteria: deterministic route reproduction on freshly migrated PostgreSQL; intended bounded 401 response with no identifier/body/header disclosure; exactly one required system denial Audit completed before pool close; no successful Audit/Outbox or business mutation; no pool-shutdown error; focused route and serialized PostgreSQL regression; Architecture-defined coverage of every materially identical lifecycle pattern; independent Backend/Security and Architecture acceptance; controlled integration and a new immutable UAT attempt.
- Dependencies: Product scope authorization, Architecture lifecycle/audit decision, Backend implementation, independent reviews, integration, and separate release authorization. Approved controlled-recipient mailbox authority remains independently required for email gates.
- Status and verification: open blocking; `v0.5.0-uat.7` is permanently rejected and must not be moved or reused.
- Residual risk: unbounded 500 denial behavior and missing denial Audit can recur on other tenant-admin routes with the same asynchronous pool-close pattern until the bounded family is reviewed and corrected.
- Blocks: UAT acceptance, Phase 5, and production readiness.

#### v0.5.0-uat.8 closure evidence

- Exact accepted source `cf30f9fe08f7536d9cc1debf3ad442ca1f35a8b7` was deployed app/worker-only as immutable `v0.5.0-uat.8`; the fresh `.7` PostgreSQL/Caddy environment, schema, protected configuration, provider, DNS, TLS, networks, and volumes were unchanged.
- Live unauthenticated Workspace-settings GET, invitation-list GET, and trusted-Origin/valid-CSRF invitation POST each returned bounded HTTP 401 `authentication_required`.
- The three safe request identifiers selected exactly three minimized denial Audits: one settings action and two invitation actions, each with null Workspace/actor/Membership/Session/target authority and only `operation=tenant_admin_denial` metadata. Immediately after the probes, business, Outbox, idempotency, rate-limit, and CRM mutation counts remained zero.
- App and worker remained healthy/running, non-root, and at zero restarts. App/worker/Caddy logs contained zero `Cannot use a pool after calling end on the pool`, unhandled rejection, SQL/stack disclosure, fatal/panic, generic error, or protected-marker occurrences after switch.
- Status: **closed for the accepted UAT-GAP-013 scope**. The `.8` deployment gate passes; controlled-mailbox email and supported-workflow cohort acceptance remain pending operational validation and are not part of this defect closure.
- Residual risk: future route additions must retain the source invariant and PostgreSQL lifecycle suites so route-owned pools cannot close before required denial Audits settle.
- Blocks: no longer blocks bounded `.8` deployment completion; full Product UAT acceptance remains pending the separately recorded operational journeys.

## Open non-blocking

### UAT-GAP-009 — Workspace token routes emit duplicate identical private cache fields

- Date/environment/release/commit: 2026-08-24; public UAT `v0.5.0-uat.3`; `82b8104`.
- Category: Edge/Infrastructure / Test evidence.
- Observed versus expected: invitation capture emitted two identical `Cache-Control: private, no-store` fields from upstream application policy plus existing Caddy Workspace defense; expected preserved effective private/no-store behavior with an Architecture-reviewed canonical header shape.
- Severity: P3.
- Affected journeys/tenants/data: Workspace token/private responses; no weakening or data disclosure observed.
- Evidence and reproduction: GET invitation capture with a synthetic token and count public cache fields without retaining cookie/token values.
- Root cause/current hypothesis: overlapping application header and unchanged `@privateDocuments` Caddy setter.
- Containment/rollback: effective policy remained private/no-store; `.3` rollback occurred for unrelated P1 `UAT-GAP-008`.
- Fall-forward owner/target: Architecture + Edge/Backend, next bounded header-contract review.
- Acceptance criteria: decide whether identical repeated fields are accepted defense-in-depth or must be canonicalized; if changed, prove no route loses private/no-store and static caching remains public immutable.
- Dependencies: Architecture decision; must not broaden the accepted Caddy remediation without review.
- Status and verification: open non-blocking warning.
- Residual risk: intermediary variance or evidence ambiguity despite equivalent effective policy.
- Blocks: none unless Architecture reclassifies.

#### Fall-forward evidence update — retained P3/non-blocking

- The bounded candidate leaves `deploy/uat/Caddyfile` unchanged with exactly one `?Referrer-Policy` default-if-absent operation and the existing Workspace private-document defense intact.
- Focused regression evidence counts raw repeated Cache-Control fields, parses their combined effective directives, accepts only identical `private, no-store` values, and fails closed for missing, conflicting, positive-age, stale-serving, unknown/unparsable, or otherwise weakened values.
- Status remains open P3/non-blocking. No normalization is included in this application remediation; a future edge-only cleanup still requires separate authority and negative cache proof.

#### v0.5.0-uat.4 public evidence

- Initial Workspace lifecycle probes exposed repeated raw cache fields only as identical `private, no-store`; combined parsing found no public/shared-cache, positive-age, stale-serving, unknown, or weakened directive.
- Status remains P3/non-blocking and unnormalized. `.4` failed for unrelated `UAT-GAP-011`.

#### v0.5.0-uat.7 public evidence

- Across 22 no-token cells on the eleven exact protected paths, raw repeated Cache-Control fields occurred only as identical/effectively `private,no-store`; no public/shared cache, positive-age, stale-serving, unknown, or weakened directive was accepted.
- Status remains P3/non-blocking and deliberately unnormalized. `.7` failed for unrelated P1 `UAT-GAP-013`.

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

#### v0.5.0-uat.7 recurrence

- One read-only PostgreSQL count probe supplied a nonexistent database name and produced one bounded `FATAL: database ... does not exist` server-log entry. A corrected command consumed the protected container environment without printing it and proved the exact 12/head ledger plus zero application rows.
- Status remains P3/non-blocking. The error did not change schema/data, health, or live authority, but reinforces the need for one reviewed secret-safe database evidence command.

#### v0.5.0-uat.8 recurrence

- The first read-only post-migration probe queried nonexistent `schema_migrations` instead of repository authority `drizzle.__drizzle_migrations`; two later minimized Audit-shape queries used invalid JSON-function syntax. All failed without mutation. Corrected queries proved 12 migrations/head `1787501845245`, exact Audit cardinality/minimization, and unchanged business/Outbox state.
- Native curl HTTP/2 evidence serialized the clean 303 status line with a trailing empty reason separator, which the fail-closed Location harness rejected as `headers_invalid`. The prescribed deterministic capture was repeated with explicit HTTP/1.1 and the repository validator passed all three generated capture destinations without bypass or ad hoc equality.
- Status remains P3/non-blocking. No application/runtime/security gate was weakened, but the recurrence reinforces the need for a single reviewed release-evidence wrapper that fixes protocol capture and repository ledger/Audit queries.

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

#### v0.5.0-uat.7 disposable-rebuild update

- Exact provenance/config, bounded target destruction, fresh migrations, health/TLS/proxy/OIDC-disabled, protected-path/default/static/cache evidence, and empty-database/log checks passed as recorded in `docs/release/nexa-spectrum-phase-1-4-uat7-deployment-result.md`.
- Approved-recipient email, supported-workflow cohort, authenticated Workspace/CRM/settings, Owner/seat/invitation acceptance, generated token journey, and complete Audit/Outbox delivery evidence did not run. A signed-in approved mailbox or secure handoff was unavailable, and execution then stopped on P1 `UAT-GAP-013`.
- Status remains blocking missing acceptance evidence. No unexecuted cell is represented as passed; a later immutable attempt must restart the affected runtime admission gates after the application defect is accepted and integrated.

#### v0.5.0-uat.8 bounded-deployment update

- Exact provenance, app/worker-only switch, migration no-op, service health, TLS/proxy/OIDC-disabled smoke, the three-route UAT-GAP-013 denial/Audit proof, 25 protected-path/near-miss header cells, and three generated-capture Location-validator cells passed as recorded in `docs/release/nexa-spectrum-phase-1-4-uat8-deployment-result.md`.
- Product explicitly directed that unavailable controlled-mailbox aliases must not block `.8` deployment completion. No email was sent and no tester/cohort was admitted. Verification/resend, recovery/reset/Session revocation, invitation delivery/acceptance, supported-workflow Company A/Company B cohort creation, authenticated Workspace/CRM/settings, Owner/seat truth, themes, responsive/accessibility, and complete Audit/Outbox delivery remain unexecuted and are not represented as passed.
- Status: `.8` deployment completion passes, while full Product UAT acceptance, Phase 5, and production readiness remain blocked by the stated pending operational validation.
