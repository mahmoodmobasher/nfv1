# NexaFlow Phase 1–4 UAT fall-forward handover

Date: 2026-08-24

## 1. Objective

Deliver Nexa Spectrum Phases 1–4 to UAT without weakening the accepted presentation, tenancy, authentication, token-privacy, Session, Workspace, RBAC, Audit, email, CSP/cache, accessibility, or rollback contracts. The immediate bounded objective is to close `UAT-GAP-011` under Architecture decision `263281d`: generated verification and reset links must be captured in Next.js Proxy before framework/RSC routing can emit a bearer-token URL.

Acceptance requires exact HTML/RSC/prefetch-independent Proxy matching; purpose-isolated verification/reset capture; token-free 303 destinations; opaque short-lived HttpOnly intent cookies; stale-authority clearing for duplicate/empty/malformed/oversized values; stable HEAD/unsupported-method behavior; invitation symmetry; unchanged APIs, Caddy, CSRF/Origin, database, provider, and tenant authority; real Outbox-link production probes; browser and PostgreSQL evidence; independent Backend/Security and Architecture acceptance; controlled integration; and a separately authorized edge-first `v0.5.0-uat.5` attempt.

**Role boundary:** the new root chat acts as Product Manager/orchestrator and must delegate application or infrastructure changes to Development. Architecture and Graphics remain independent reviewers; neither implementation nor self-generated evidence is self-acceptance.

## 2. Current status

Completed:

- Accepted Phase 1–4 implementation and review history was integrated previously; Product main and `origin/main` were rechecked at `106e5104c064e42cddd6bd5e263d21acefbe2ec8`.
- Caddy default-if-absent remediation, Option A sender evidence, and eleven-path application token-terminal header remediation were accepted/integrated and exercised in later UAT attempts.
- `v0.5.0-uat.1` through `.4` were safely rejected and retained immutably; each material stop condition restored or retained healthy `v0.4.0-uat.1` / `e58c22a`.
- Dev2 implemented Architecture `263281d` at `47efe632f07be09b5d0da552f86727f27ddea346`; immutable review candidate/handoff is `0da5caad1c4c1421a4c6bee74311dd57854447a3`.
- Current candidate lint, TypeScript, direct, PostgreSQL, migration, production-build, real-Outbox production-response, browser-security, responsive, and accessibility-smoke gates passed.

In progress: none. Application implementation is paused at the immutable Dev2 checkpoint.

Pending: distinct Backend/Security review, Architecture review, controlled main integration, new artifact/preflight authority, and separately authorized `.5` deployment/public-edge/email/full-UAT execution.

Verified locally: exact branch/base/ancestry, matcher/capture behavior, application response privacy, generated Outbox paths, database regressions, production build, and browser state. Verified live: the recorded `.1`–`.4` observations and rollbacks. Assumed—not yet accepted—is public-edge behavior of the current Dev2 candidate after future integration/deployment.

## 3. Implementation summary

Central Spectrum design: one server-rendered Nexa Spectrum website and authenticated product shell provide Light/Dark/System continuity, nonce CSP, responsive/keyboard/forced-colour behavior, and truthful route states across authentication, onboarding, Workspace, invitation, CRM, and settings journeys.

Product-authorized tenancy/commercial decisions:

- One self-service subscription provisions exactly one company Workspace.
- The verified registrant becomes the sole initial, distinct persisted Owner; seats include Owner.
- Normal invitations assign Admin or Member only. Admin cannot transfer ownership, control subscription, or remove/demote Owner.
- Workspace chooser selects existing active Memberships and grants no new entitlement.
- Global Users may hold legitimate Memberships in multiple companies; Enterprise multi-Workspace remains Contact Sales/custom provisioning.

Preserved security authority: trusted Session and active Workspace/Membership; server RBAC/Owner/Team/visibility/entitlement enforcement; tenant-safe generic denial; rate limits; CSRF and trusted Origin; purpose/expiry/hash/single-use identity tokens; all-Session reset/password security effects; singular committed success Audit; transaction rollback and lock ordering; intended verified invitation identity; seat ceilings; Admin/Member-only invitations.

Authentication/token capture workflows:

- Registration and recovery generate encrypted Outbox messages containing `/verify-email/capture` and `/reset-password/capture` links.
- Current Dev2 candidate removes only the two prefetch matcher omissions and maps generated plus legacy verification/reset paths exactly in Proxy.
- GET with one valid-shape token seals the existing opaque purpose-bound intent and returns clean 303. HEAD returns bodyless clean 303 without sealing. Other methods return bodyless 405 with `Allow: GET, HEAD`. Rejected input clears stale intent.
- Invitation capture remains in Proxy; generated `/capture` Route Handlers remain defense in depth. Completion APIs remain server-authoritative and unchanged.

Architecture-documented technical authorities, distinct from Product commercial decisions:

- Caddy `?Referrer-Policy` is default-if-absent: upstream `no-referrer` wins; edge supplies `strict-origin-when-cross-origin` only when upstream is silent.
- The application owns private/no-store, no-referrer, nonce CSP, cookies, Location, and Vary on protected token outcomes.
- Option A uses the Product-approved Accounts sender on verified `mail.nexaflowsystems.com`, Reply-To absent, protected root-owned mode-`0600` UAT configuration, and restricted Resend credential. No fallback sender is authorized.

Important APIs/data/dependencies include `/api/auth/*`, identity verification/reset completion, Session resolution/revocation, `/api/workspaces*`, invitation acceptance/admin APIs, account preferences/profile/password APIs, `users`, credentials, identity tokens, Sessions, Workspaces, Memberships, Roles, Teams, invitations, Audit, rate-limit windows, and Outbox. Runtime dependencies include Next.js 16.3.1, PostgreSQL, the email worker, Caddy, Mailpit for local testing, and Resend for authorized UAT delivery.

Trade-offs: all eligible non-static prefetch traffic now traverses Proxy to avoid presentation-dependent security gaps; ordinary requests still pass through after existing CSP handling. Unsupported token-entry methods use an explicit generic 405 rather than framework behavior. `UAT-GAP-009` intentionally retains duplicate identical effective private/no-store defense until separately reviewed.

## 4. Files changed

Current bounded Dev2 delta relative to `origin/main` `106e5104`—complete list:

- `docs/architecture/uat-generated-token-capture-rsc-remediation-decision.md` — Architecture `263281d` authority merged into candidate ancestry.
- `src/proxy.ts` — matcher correction, exact capture mapping, clean response helpers, GET/HEAD/405 behavior, stale-intent clearing, invitation symmetry.
- `package.json` — named `test:framework-capture` upgrade gate.
- `playwright.framework-capture.config.ts` — isolated immutable production-server gate.
- `tests/generated-token-capture-boundary.test.ts` — official matcher and direct mapping/method/query/header/cookie tests.
- `tests/e2e/generated-token-capture-security.spec.ts` — production, Outbox-link, browser-state/history, responsive, and accessibility smoke.
- `tests/e2e/generated-token-capture.setup.ts` — disposable real Outbox/template fixture and cleanup; no delivery.
- `docs/engineering/uat-generated-token-capture-rsc-remediation-handoff.md` — candidate contract, evidence, rollback, reviewer focus.
- `docs/release/uat-release-gap-register.md` — append-only `UAT-GAP-011` implementation update; other gaps preserved.
- `Documentation/handover/nexaflow-phase1-4-uat-fall-forward-handover.md` — this archive handover; documentation-only current change.

Indexed exhaustive source of truth for the large already-integrated Phase 1–4 file history: use the exact inventories in these handoffs rather than reconstructing file lists:

- `docs/engineering/nexa-spectrum-phase-1-2-handoff.md`
- `docs/engineering/nexa-spectrum-phase-3-handoff.md`
- `docs/engineering/nexa-spectrum-phase-3-review-remediation.md`
- `docs/engineering/nexa-spectrum-phase-4-candidate-handoff.md`
- `docs/engineering/nexa-spectrum-phase-4-remediation-handoff.md`
- `docs/engineering/nexa-spectrum-phase-4-final-graphics-remediation-handoff.md`
- `docs/engineering/nexa-spectrum-phase-1-4-integration-candidate-handoff.md`

Continuation authorities/evidence—each remains relevant and is listed exhaustively by category:

- Architecture: `docs/architecture/nexa-spectrum-phase-1-2-architecture-review.md`, `nexa-spectrum-phase-1-2-closing-review.md`, `nexa-spectrum-phase-1-2-closing-rereview-c0c32f4.md`, `nexa-spectrum-phase-3-final-rereview-4904599.md`, `nexa-spectrum-phase-4-architecture-gate.md`, `nexa-spectrum-phase-4-closing-review-0199775.md`, `nexa-spectrum-phase-4-remediation-closing-review-08eb32f.md`, `nexa-spectrum-phase-4-preservation-confirmation-31530ad.md`, `uat-caddy-referrer-policy-remediation-decision.md`, `uat-caddy-referrer-policy-remediation-final-review-9e56096.md`, `uat-transactional-email-sender-contract-decision.md`, `uat-option-a-sender-pre-switch-review-5debb39.md`, `uat-token-terminal-header-remediation-decision.md`, `uat-token-terminal-header-remediation-final-review-2629616.md`, and `uat-generated-token-capture-rsc-remediation-decision.md`.
- Engineering/security: `docs/engineering/nexa-spectrum-phase-1-2-backend-contract.md`, `nexa-spectrum-phase-4-backend-preparation.md`, `nexa-spectrum-phase-4-backend-security-rereview-08eb32f.md`, `uat-caddy-referrer-policy-remediation-handoff.md`, `uat-caddy-referrer-policy-remediation-peer-review.md`, `uat-caddy-referrer-policy-peer-review.md`, `uat-token-terminal-header-remediation-handoff.md`, `uat-token-terminal-header-remediation-peer-review.md`, and `uat-generated-token-capture-rsc-remediation-handoff.md`.
- Release/gaps: `docs/release/uat-caddy-remediation-main-integration-result.md`, `uat-option-a-sender-pre-switch-evidence.md`, `uat-option-a-sender-backend-security-review.md`, `nexa-spectrum-phase-1-4-uat-deployment-result.md`, `nexa-spectrum-phase-1-4-uat2-deployment-result.md`, `nexa-spectrum-phase-1-4-uat3-deployment-result.md`, `nexa-spectrum-phase-1-4-uat4-deployment-result.md`, and `uat-release-gap-register.md`.

## 5. Validation

Accepted Phase 1–4 integration candidate evidence:

- `eslint --quiet` and `tsc --noEmit`: PASS.
- Direct/unit/boundary/security: 98/98 across 18 files.
- Fresh serialized PostgreSQL: 124/124 across 15 files; migration apply/rerun PASS.
- Next.js 16.3.1 production build: PASS.
- Full supported Playwright: 60 PASS, one intentional OIDC-disabled skip, one worker, zero retries; separate disabled-provider cell 1/1 PASS.
- Production token/CSP/cache/cookie probes, generated invitation journey, authenticated shell/CRM/auth/onboarding/Workspace/settings/theme, responsive/accessibility/visual baselines: PASS as recorded in the integration handoff.

Accepted remediation evidence before UAT:

- Caddy candidate: 2/2 focused, pinned `caddy:2.10.2-alpine` adapt/validate, isolated precedence/rollback, 100/100 direct, production build, invitation browser 1/1 PASS.
- Option A: provider/domain read-only HTTP 200, protected staging, migration apply/rerun at 12 migrations, isolated app readiness/worker start, non-delivery probe, cleanup PASS.
- Eleven-path token-terminal application remediation: 124/124 direct, 124/124 serialized PostgreSQL, production build, 29/29 direct production responses, focused browser 4/4 PASS; integration preflight later passed 41/41 focused checks.

Rejected UAT evidence:

- `.1`: first invitation privacy probe returned 303/clean Location but wrong edge Referrer-Policy; stopped and rolled back.
- `.2`: environment validation failed before switch on sender contract; live UAT remained unchanged.
- `.3`: ten initial edge probes passed; missing-CSRF `POST /verify-email/complete` and `/reset-password/complete` returned 403 with edge default instead of application no-referrer; rolled back.
- `.4`: 52 protected assertions passed; next RSC generated verification capture returned token-bearing 307; direct exact-image verification/reset reproduction passed; rolled back.

Current Dev2 candidate evidence:

- `git diff --check`, lint, TypeScript: PASS.
- `npm test`: 144/144 executable across 21 files.
- `npm run db:migrate` twice: PASS.
- `npm run test:integration`: 124/124 serialized across 15 files.
- `npm run test:framework-capture`: 57/57 direct/matcher, production build PASS, 4/4 immutable production/real-Outbox/browser tests, one worker, zero retries.
- Existing focused token/invitation Playwright: 4/4 PASS.

Pending: independent review reruns on exact `0da5caa`; controlled integration gates; artifact/config/backup/migration/Caddy/Compose readiness; public edge from probe one; controlled-recipient email journeys; complete Phase 1–4 functional/security/theme/responsive/accessibility/database/worker/log UAT.

## 6. Outstanding issues

- `UAT-GAP-011`, P1/open blocking: RSC-shaped `GET /verify-email/capture?token=<redacted>` on `.4` returned **HTTP 307** and `Location` retained the token-bearing query plus framework `_rsc`; expected **HTTP 303** to exact token-free `/verify-email`. Exact-image reset reproduction behaved symmetrically. Current Dev2 implementation is locally remediated but not reviewed/integrated/live-closed.
- `UAT-GAP-009`, P3/open non-blocking: Workspace invitation capture can emit repeated identical `Cache-Control: private, no-store` fields. Effective privacy is not weakened; normalization is out of scope.
- `UAT-GAP-005`, P3/open non-blocking: release checksum/migration evidence commands remain partly ad hoc; `.4` repeated the non-portable checksum sidecar issue before corrected basename comparison.
- `UAT-GAP-001`, `UAT-GAP-002`, `UAT-GAP-006`, and `UAT-GAP-008` have accepted technical remediation or partial live evidence but still require complete live closure on a successful fall-forward attempt.
- Full controlled-recipient email receipt/acceptance and full Product UAT remain unexecuted on an accepted Spectrum release. Provider acceptance must remain distinct from observed receipt.
- Next 16.3.1 docs name `unstable_doesProxyMatch`; the installed package exports compatibility name `unstable_doesMiddlewareMatch`. The named gate covers this upgrade risk.
- Expected non-blocking warning: `Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.`
- No unresolved current-candidate test failure is known. Public behavior of the unintegrated candidate remains an assumption until authorized deployment evidence.

## 7. Next actions

1. First action: inspect and finish the Dev2 immutable candidate `0da5caad1c4c1421a4c6bee74311dd57854447a3` against Architecture decision `263281d`; do not modify it during review. Confirm the archive handover commit is documentation-only.
2. Delegate a distinct Backend/Security read-only review with P0–P3 ACCEPT/REJECT and rerun matcher, production-response, token privacy, invitation symmetry, CSRF/Origin non-change, PostgreSQL transaction/Audit, and cleanup evidence.
3. Delegate independent Architecture review of the same immutable candidate and security record. Graphics remains independent but no new Graphics review is required unless presentation/visual behavior changes.
4. If accepted, authorize Development integration from freshly fetched `origin/main`; stop on remote drift or semantic conflict. Run full integration gate and push normally only under explicit Product authority.
5. Separately authorize immutable `v0.5.0-uat.5`; never move/reuse `.1`–`.4`. Rebuild exact main, preserve Option A parity, backup/restore proof, migration rerun, pinned Caddy validation, Compose render, health, and rollback inputs.
6. After switch, run the complete public edge from probe one before email: generated verification/reset HTML/RSC/prefetch/HEAD/unsupported methods, all eleven protected paths, CSP/cache/cookies/Location/Vary/referrer/static/stale-Session/disabled-OIDC/token/log privacy. Roll back on any material failure.
7. If edge passes, run authorized controlled-recipient verification/resend, recovery/reset/Session revocation, and invitation delivery/acceptance, distinguishing provider acceptance from receipt.
8. Run the full Phase 1–4 functional, Workspace/tenancy, CRM/settings, Light/Dark/System, first-paint, responsive/overflow/accessibility, database/worker/log UAT matrix; update the append-only gap register and Product GO/NO-GO record.

## 8. Environment and setup

Local/read-only setup commands:

- `git fetch origin --prune`
- `git status --short --branch`
- `docker compose -f docker-compose.local.yml up -d --wait`
- `npm run db:migrate`
- `npm test`
- `npm run test:integration`
- `npm run test:framework-capture`

Services/dependencies: Next.js 16.3.1 app and email worker; PostgreSQL 16 Alpine; pinned `caddy:2.10.2-alpine` with admin API off; Mailpit `v1.26` locally; Resend only through the existing authorized restricted UAT credential. UAT URL: `https://app.nexaflowsystems.com`.

Environment variable names only: `DATABASE_URL`, `NODE_ENV`, `SESSION_COOKIE_NAME`, `SESSION_SECRET`, `EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `APP_ORIGIN`, `SESSION_IDLE_MINUTES`, `SESSION_ABSOLUTE_HOURS`, `SESSION_TOUCH_INTERVAL_SECONDS`, `TRUSTED_PROXY_ENABLED`, `TRUSTED_PROXY_SECRET`, `OIDC_FIXTURE_SECRET`, `OIDC_MODE`, `OIDC_REDIRECT_URIS`, `INVITATION_TTL_HOURS`, `RECENT_AUTH_MINUTES`.

Do not expose protected values, fingerprints beyond already accepted records, recipients, tokens, or provider message IDs. Live rollback authority is `v0.4.0-uat.1` / `e58c22a11e8239f65936542ce75ff73963fb99c1`, with retained encrypted backup/restore evidence and protected application/release authority. Use the established UAT runbook only; do not improvise infrastructure.

## 9. Git and release state

Read-only verification immediately before this handover:

- Product checkout `/Users/moemahmood/builder_code/Nexflow_v1`: branch `main`, HEAD `106e5104c064e42cddd6bd5e263d21acefbe2ec8`, equal to `origin/main`.
- Preserved Product-checkout untracked files, verified untouched: `docs/product/architecture-product-alignment.md`, `design-journey-product-alignment.md`, `engineering-product-alignment.md`, and `product-reference-alignment-summary.md`.
- Dev2 worktree `/Users/moemahmood/.codex/worktrees/6cf7/Nexflow_v1`: branch `codex/generated-token-rsc-capture-remediation`; base/merge-base `106e5104`; committed candidate HEAD before this documentation-only handover `0da5caad1c4c1421a4c6bee74311dd57854447a3`.
- Dev2 relevant commits: Architecture `263281d`; merge `fde3f5d`; implementation `47efe63`; candidate handoff/gap `0da5caa`.
- Uncommitted state before committing this handover: only `Documentation/handover/nexaflow-phase1-4-uat-fall-forward-handover.md`. No application work is unfinished.

No push, PR, main merge, deployment, tag, email, provider mutation, DNS/secret/topology change, or Phase 5 action is authorized by this handover. Commit this document only on the Dev2 branch. Main integration, push, release, and infrastructure actions remain prohibited pending Product authorization.

Immutable rejected tags: `v0.5.0-uat.1` → `9162a90`, `.2` → `05c4c02`, `.3` → `82b8104`, `.4` → `58c5ae4`; never move, repair, or reuse them. Live UAT remains `v0.4.0-uat.1` / `e58c22a` according to the last verified rollback records; reverify live authority before any future action.

## 10. Continuation instructions

“Before making changes, read this handover document and verify the current repository state.”

Resume in a new root Product Manager/orchestrator chat corresponding to source Product task `01a02f57-8d4c-78b3-9336-6e204a0a9e77`, using the Product checkout only for Product/read-only orchestration. Delegate application work to a Development chat/worktree. Use the existing Dev2 worktree/branch above for the immutable candidate; use a distinct Security/Dev3 worktree for peer review and a distinct Architecture task/worktree for Architecture acceptance. Graphics remains a separate reviewer and should be engaged only if later remediation changes visuals.

Read first, in order:

1. `AGENTS.md`.
2. This handover.
3. `docs/architecture/uat-generated-token-capture-rsc-remediation-decision.md`.
4. `docs/engineering/uat-generated-token-capture-rsc-remediation-handoff.md`.
5. `docs/release/uat-release-gap-register.md`, especially `UAT-GAP-011`, `009`, `005`, `001`, `002`, `006`, and `008`.
6. The four UAT deployment results and Option A/Caddy/token-terminal evidence listed in section 4.
7. `src/proxy.ts`, `tests/generated-token-capture-boundary.test.ts`, `tests/e2e/generated-token-capture-security.spec.ts`, and `tests/e2e/generated-token-capture.setup.ts`.
8. Relevant installed Next.js 16.3.1 Proxy/matcher docs and `node_modules/next/dist/server/web/adapter.js`.

Run status, HEAD, origin/main, ancestry, and link/path checks before review. If main, remote, candidate, live authority, protected configuration, or tag state differs, stop and reconcile exact Product/Architecture authority. Do not resume implementation, integrate, push, deploy, tag, or send email merely because this archive handover exists.
