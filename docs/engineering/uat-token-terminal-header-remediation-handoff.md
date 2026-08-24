# UAT token terminal header remediation engineering handoff

Date: 2026-08-24

Status: **GO for distinct backend/security and Architecture review; NO-GO for integration or deployment until those reviews accept the immutable candidate.**

Baseline: `aa64658cf74f1d8be12fa6751e70a1718aa2fe9c`

Architecture authority: `0035fd1` / `docs/architecture/uat-token-terminal-header-remediation-decision.md`

Implementation commit: `5fdec7b8d31cc06aed85c96a2960a1fe6d837716`

Branch: `codex/uat-token-terminal-header-remediation`

## Exact bounded change

- `src/proxy.ts` now exports one frozen `PROTECTED_TOKEN_LIFECYCLE_PATHS` contract containing exactly the eleven verification, reset, and invitation website lifecycle paths enumerated by Architecture.
- `isProtectedTokenLifecyclePath` performs exact normalized pathname equality through an internal `ReadonlySet`; query parameters do not affect membership and suffix, slash, prefix, and direct-compatibility API near misses remain excluded.
- `setProtectedTokenLifecycleHeaders` applies `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer` with `Headers.set`. It is used for capture redirects and the shared downstream proxy response, including route-handler, mutation-guard, framework method-denial, and bounded failure outcomes.
- The proxy matcher, direct compatibility APIs, Caddyfile, CSRF/Origin ordering, statuses/bodies, cookies/tokens, transactions, Session and Workspace authority, migrations, providers, and infrastructure are unchanged.
- `UAT-GAP-009` remains P3/non-blocking. Tests parse raw repeated cache fields, accept only identical effective `private, no-store`, and fail closed on missing, conflicting, positive-age, stale, unknown, or weakened fields. No normalization is attempted.

## Verification evidence

- Diff/ancestry: `git diff --check` passed; Architecture decision is preserved in branch ancestry through merge `f2f01b3`; the implementation diff changes only `src/proxy.ts`, focused tests, this handoff, and append-only gap evidence.
- Lint: `npm run lint` passed.
- TypeScript: `npx tsc --noEmit` passed.
- Direct/unit: `npm test` passed **124/124** executable tests across **20/20** files; **124** database-gated tests were intentionally skipped in that direct run.
- Focused new boundary: **22/22** tests passed for the eleven exact routes, all-method/query coverage, immutable membership, `Headers.set` uniqueness, and near misses. Caddy/cache evidence passed **4/4** after the strict raw-field negative cases were added.
- PostgreSQL: `npm run test:integration` passed **124/124** serialized tests across **15/15** files. This includes **17** identity tests and **24** invitation/tenant-administration tests covering single use/replay, rate limits, Session revocation, reset security effects, transaction rollback, singular committed success effects, seat/identity/tenant denials, and invitation concurrency.
- Production build: `npm run build` passed on Next.js **16.3.1** with all routes and Proxy compiled.
- Direct production response probe without Caddy: **29/29** passed. It covered all eleven protected paths under GET and PUT/framework outcomes, the four completion/clear missing-CSRF denials, and three near misses. Protected responses had one raw Referrer-Policy field with `no-referrer`, one raw Cache-Control field with `private, no-store`, nonce/`strict-dynamic` CSP, and no production `unsafe-inline`/`unsafe-eval`; near misses remained unclassified.
- Focused Playwright: **4/4** passed with one worker and zero retries (`token-lifecycle-header-security` plus `phase4-invitation-security`). Evidence covers HTML/RSC capture, framework outcomes, missing/mismatched CSRF, absent/cross Origin, history/storage/outbound token absence, Back/forward behavior, and near-miss defaults.

Expected `NO_COLOR`/`FORCE_COLOR` warnings appeared during Playwright startup. No test was retried or quarantined. No email was sent and no external provider was called.

## Security and rollback disposition

The change is header classification only. Existing PostgreSQL regressions prove denials do not authorize User, Session, Workspace, Membership, Role, seat, or entitlement mutation and preserve reset/invitation transactional and Audit semantics. Direct browser/production probes found no raw or encoded synthetic token in bodies, headers, cookies, Location, history, storage, or outbound requests.

Rollback is application-only: restore the prior immutable application revision based on `aa64658` with its matching protected Option A environment and accepted Caddyfile. No migration or data rollback is required. `v0.5.0-uat.1`, `.2`, and `.3` remain retired; this work does not create `.4`, alter live UAT, or authorize deployment.

## Reviewer focus

Backend/security should independently verify exact route completeness, `Headers.set` single-value semantics, CSRF/Origin ordering, generic denials, token absence, business rollback/replay behavior, and UAT-GAP-009 fail-closed parsing. Architecture should verify conformance to `0035fd1`, unchanged Caddy/matcher/direct APIs, and that the full public-edge matrix remains a deployment-time gate.
