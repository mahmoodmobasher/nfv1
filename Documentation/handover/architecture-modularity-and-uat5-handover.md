# NexaFlow Architecture task handover

Prepared: 2026-08-24

Role boundary: Architecture documentation and read-only review. No application or infrastructure implementation was performed.

## 1. Objective

This task had two related objectives:

1. Decide the smallest safe remediation for rejected UAT `v0.5.0-uat.4`, where RSC-shaped generated verification/reset capture requests exposed the bearer-token query in a framework 307 `Location`.
2. Adopt useful domain-modularization principles as a durable NexaFlow development contract so Dev1, Dev2, Dev3, Security, QA, and reviewers apply them consistently.

Acceptance required:

- an implementation-ready P0–P3 Architecture decision grounded in installed Next.js 16.3.1 documentation/source;
- preservation of identity, Session, token, CSRF/Origin, transaction, Workspace, Membership, Role, entitlement, Audit, CSP, cache, Caddy, and rollback authority;
- exact direct-production and public-edge evidence gates before any new UAT attempt;
- development guidance covering capability ownership, dependency direction, interfaces, transactions, testing, incremental refactoring, and modular-monolith preference;
- repository-level discoverability and an implementation-handoff checklist;
- no application, infrastructure, secret, provider, DNS, database, or live-UAT mutation.

## 2. Current status

### Completed

- Reviewed `main` `106e5104c064e42cddd6bd5e263d21acefbe2ec8`, rejected application `58c5ae4c7075d3637bacb96fb70c343d671273a6`, the `.4` deployment record, `UAT-GAP-011`, exact proxy/capture implementation, generated email links, and installed Next.js 16.3.1 docs/source.
- Recorded **REJECT for `58c5ae4`/`.4`; ACCEPT for bounded implementation** in `docs/architecture/uat-generated-token-capture-rsc-remediation-decision.md`.
- Recorded the Product-authorized modular development contract in `docs/architecture/modular-development-guidelines.md`.
- Added a root `AGENTS.md` instruction requiring developers to read the modular contract, Workspace Foundation, and feature-specific accepted Architecture contract before application changes.
- Required the modular-development checklist in implementation handoffs and documented the exception process.

### Still in progress or pending

- Backend/Dev2 has not implemented the `.5` token-capture remediation.
- No immutable Backend/Security or Architecture acceptance candidate exists for that remediation.
- Commits from this detached Architecture worktree are not recorded as integrated into `main`, pushed, merged, deployed, or released.
- The modular contract becomes team-wide repository authority only after controlled integration into the shared branch.
- UAT gaps and the complete Phase 1–4 UAT matrix remain open after rollback of `.4`.

### Verified versus assumed

Verified from repository evidence and installed source:

- the project matcher skips requests carrying `next-router-prefetch` or `purpose: prefetch`;
- generated identity links target `/verify-email/capture?token=...` and `/reset-password/capture?token=...`;
- Proxy currently captures legacy `/verify-email?token=...`, `/reset-password?token=...`, and invitation entry, while generated identity `/capture` paths depend on filesystem Route Handlers;
- Next Proxy precedes filesystem routing when matched;
- Next detects RSC and strips Flight headers/internal `_rsc` before exposing the normalized request to Proxy, so security coverage cannot depend on inspecting those signals inside Proxy;
- `.4` public/direct-image evidence reproduced 307 token-bearing `Location` for generated verification and reset capture, and identified Caddy as not causal;
- `106e5104` differs from `58c5ae4` only by release documentation/gap records;
- Architecture worktree was clean before this handover was added.

Not yet verified:

- the proposed matcher/capture change in an implementation candidate;
- production-build HTML/RSC/prefetch behavior after remediation;
- database, browser, edge, log, email, rollback, or complete UAT evidence for a `.5` candidate;
- integration of the modular-development contract into shared `main`.

## 3. Implementation summary

### UAT-GAP-011 decision

The accepted bounded design is:

1. Remove Proxy matcher's prefetch `missing` exclusions so all current non-API/non-static application requests receive Proxy coverage regardless of HTML/RSC/prefetch presentation.
2. Extend the exact Proxy identity-capture map to include generated `/verify-email/capture` and `/reset-password/capture` paths while preserving legacy clean-path compatibility.
3. Retain existing Route Handlers as defense-in-depth fallbacks; do not add a client scrubber, rewrite, query-bearing intermediate route, or new API.
4. Return a direct 303 before filesystem routing, with an exact query-free same-origin destination, private/no-store, no-referrer, nonce CSP, and the existing encrypted purpose-bound HttpOnly intent cookie.
5. Drop the entire query, including `token`, duplicates, unknown keys, and `_rsc`. Invalid input replaces stale authority. Unsupported methods must never fall through to a token-bearing framework redirect.
6. Apply the matcher correction symmetrically to invitation capture without changing invitation authority.

No identity, Session, database, token-consumption, Workspace, Membership, Role, entitlement, Audit, email/provider, Caddy, or infrastructure API/data model changes are authorized.

### Modular development contract

New work is organized by business capability, with the intended dependency flow:

```text
UI / HTTP / worker → application use case → domain rules and ports ← infrastructure adapters
```

Interfaces are used only at meaningful seams. Transaction ownership remains with the complete use case, not individual tables/repositories. Global User resources remain separate from Workspace-scoped resources. Workspace work inherits active User/Session, trusted active Workspace, active Membership, RBAC, Ownership/Team/Visibility, Audit, and Entitlement.

The default remains a modular monolith. Existing accepted code is not restructured merely for conformity. Refactoring requires a Product increment, defect, security correction, or evidence-backed maintenance need, plus tests and rollback.

Known trade-offs:

- running Proxy for prefetch-shaped application requests adds bounded Proxy execution, but removes a security-sensitive coverage gap and path-list drift;
- keeping capture Route Handlers duplicates a small amount of fallback behavior, but preserves compatibility and defense in depth; parity tests are required;
- the modular contract avoids a mandatory file template, improving proportionality but requiring reviewers to judge cohesion and ownership rather than count files/layers.

## 4. Files changed

- `docs/architecture/uat-generated-token-capture-rsc-remediation-decision.md` — created; implementation-ready `UAT-GAP-011` decision, evidence gates, rollback, and `.5` disposition.
- `docs/architecture/modular-development-guidelines.md` — created; Product-authorized development and review contract for current TypeScript/Next.js and possible future Python work.
- `AGENTS.md` — modified; directs all application-code agents to the modular guidelines, Workspace Foundation, and feature contract, and requires the handoff checklist.
- `Documentation/handover/architecture-modularity-and-uat5-handover.md` — created; this archival continuation record.

No application, test, migration, deployment, Caddy, Compose, environment, or infrastructure file was changed.

## 5. Validation

Completed checks:

- read root `AGENTS.md` and the complete six-file `docs/handover/` set;
- inspected Git ancestry/delta for `58c5ae4..106e5104`;
- inspected `src/proxy.ts`, generated identity email link construction, verification/reset capture Route Handlers, invitation capture, and existing related tests;
- read installed Next.js 16.3.1 Proxy and prefetch documentation;
- inspected installed Next adapter/router/client source for RSC detection, Flight-header stripping, `_rsc` normalization, redirect handling, and matcher test support;
- ran `git diff --check` before committing the Architecture documents; passed;
- verified prior documentation commits and clean worktree state before this handover.

No lint, TypeScript, unit, PostgreSQL, Playwright, production build, container, Caddy, or public-edge check was run because this work changed documentation/instructions only.

Still required after Backend implementation:

- lint, TypeScript, unit/direct-route, serialized PostgreSQL identity/reset/invitation, production build, and focused browser suites;
- `unstable_doesProxyMatch` matrix for HTML/RSC/prefetch/internal-header shapes and exclusions;
- direct immutable production-build probes using actual generated Outbox/email links;
- raw, once-encoded, and twice-encoded token negative assertions across Location/body/RSC/cookies-in-plaintext/history/storage/outbound/logs;
- distinct Backend/Security review, Architecture re-review, controlled integration, artifact/preflight/rollback gates, and complete public-edge/UAT restart.

## 6. Outstanding issues

- **P1 `UAT-GAP-011` remains open.** Observed response: HTTP `307`; `Location` retained the synthetic `token` query and added `_rsc` instead of the required clean HTTP `303`. Secret/token values must remain redacted.
- `v0.5.0-uat.4` is rejected and permanently retired. `.1`, `.2`, and `.3` are also retired.
- P3 `UAT-GAP-009` duplicate identical `Cache-Control: private, no-store` remains accepted as non-blocking defense in depth; effective privacy must not be weakened.
- Live closure of earlier public-edge/email/full-UAT gates is incomplete because `.4` was rolled back before the complete matrix.
- A prefetch may seal the same presented bearer intent but must never consume business authority; exact supported/unsupported method behavior must be documented and security-reviewed.
- The Architecture worktree is detached, so commits require controlled integration rather than an assumed branch push.

## 7. Next actions

1. **First recommended action:** verify repository/worktree state and controlled-integrate the Architecture documentation commits into the intended shared branch without overwriting newer Product/release records.
2. Assign Backend/Dev2 the exact contract in `docs/architecture/uat-generated-token-capture-rsc-remediation-decision.md`.
3. Have Dev1 and Dev3 read `AGENTS.md` and `docs/architecture/modular-development-guidelines.md`; require its checklist in every new implementation handoff.
4. Backend implements one bounded application commit: matcher coverage plus generated identity capture-before-framework and focused tests; no Caddy/database/infrastructure changes.
5. A distinct Backend/Security reviewer validates token privacy, method behavior, invitation symmetry, stale-intent replacement, CSRF/Origin non-change, transactions, and logs/Audit.
6. Architecture reviews the same immutable candidate and evidence, returning explicit ACCEPT/REJECT.
7. Product authorizes controlled integration only after both reviews accept.
8. Release Engineering produces a new immutable artifact and performs preflight/rollback gates. Product may separately authorize a new attempt no earlier than `v0.5.0-uat.5`.
9. Restart public-edge probes from probe one, then approved-recipient email and the full Phase 1–4 UAT suite. Do not proceed to Phase 5 or production on partial evidence.

## 8. Environment and setup

Architecture worktree:

```text
/Users/moemahmood/.codex/worktrees/5832/Nexflow_v1
```

Shared/main worktree observed during review:

```text
/Users/moemahmood/builder_code/Nexflow_v1
```

Normal local commands, only when implementation verification is authorized:

```bash
npm ci
npm run local:up
npm run db:migrate
npm run db:health
npm test
npm run test:integration
npm run test:e2e
npm run lint
npx tsc --noEmit
npm run build
```

Required local services include PostgreSQL, the Next application, and Mailpit/email worker when delivery behavior is tested. Do not run PostgreSQL integration and Playwright concurrently against the shared local database.

Relevant configuration names include `DATABASE_URL`, `NODE_ENV`, `APP_ORIGIN`, `SESSION_COOKIE_NAME`, `SESSION_SECRET`, Session lifetime settings, `EMAIL_PROVIDER`, provider-specific key/sender variables, trusted-proxy settings, OIDC settings, invitation TTL, and recent-auth window. Use `.env.example` and protected environment authority; never copy secret values into chat, tests, logs, or documentation.

Installed Next.js documentation under `node_modules/next/dist/docs/` is authoritative for this repository's Next 16.3.1 behavior and must be read before related code changes.

## 9. Git and release state

- Architecture worktree branch: detached HEAD; `git branch --show-current` returned empty.
- Architecture baseline at handover preparation: `d1b19423f58afe4890168c56c3135fb12acff977`.
- Uncommitted state before creating this handover: clean.
- This handover file is the only new change after that clean check until committed.
- Relevant commits:
  - `539dd731a7991548aa4d507f453b8b03cb47dde9` — accepted prior token-terminal header remediation;
  - `263281dc848223b419a2d0fa4c7d5e7cd0be12bf` — decided RSC generated-token capture remediation;
  - `d1b19423f58afe4890168c56c3135fb12acff977` — added modular-development contract and `AGENTS.md` alignment;
  - the commit containing this handover is the documentation-only HEAD reported by `git rev-parse HEAD` after commit.
- Reviewed shared `main`: `106e5104c064e42cddd6bd5e263d21acefbe2ec8`; rejected integrated application: `58c5ae4c7075d3637bacb96fb70c343d671273a6`.
- Push, PR, merge, and integration are pending Product/root coordination. No such action was performed here.
- Deployment, live configuration mutation, production action, and reuse of `v0.5.0-uat.1` through `.4` are prohibited by this task. A `.5` attempt requires new immutable acceptance and separate Product authorization.

## 10. Continuation instructions

**Before making changes, read this handover document and verify the current repository state.**

Then read, in order:

1. `AGENTS.md`;
2. `docs/handover/README.md` and the complete handover set it indexes;
3. `docs/architecture/uat-generated-token-capture-rsc-remediation-decision.md`;
4. `docs/architecture/modular-development-guidelines.md`;
5. `docs/architecture/workspace-foundation-direction.md`;
6. `docs/release/nexa-spectrum-phase-1-4-uat4-deployment-result.md` and `docs/release/uat-release-gap-register.md` from current shared `main`;
7. relevant installed Next.js 16.3.1 Proxy/prefetch documentation and source before any routing change.

Run `git status --short`, `git branch --show-current`, `git rev-parse HEAD`, and compare Architecture commits with current `main`. Preserve unrelated/untracked Product records. Do not reset, clean, rebase, or overwrite shared work. Resume with the first action in section 7 and maintain the Architecture read-only/no-application-code boundary unless Product explicitly assigns a different role.
