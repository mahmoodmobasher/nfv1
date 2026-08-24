# UAT generated-token capture/RSC remediation engineering handoff

Date: 2026-08-24

Status: **GO for distinct Backend/Security and Architecture review; NO-GO for integration, UAT, or any release publication until both reviews accept this immutable candidate and Product separately authorizes the next workflow.**

Baseline: `106e5104c064e42cddd6bd5e263d21acefbe2ec8`

Architecture authority: `263281dc848223b419a2d0fa4c7d5e7cd0be12bf` / `docs/architecture/uat-generated-token-capture-rsc-remediation-decision.md`

Implementation: `47efe632f07be09b5d0da552f86727f27ddea346`

Branch: `codex/generated-token-rsc-capture-remediation`

## Bounded implementation

- `src/proxy.ts` removes only the two prefetch `missing` conditions from the existing matcher. The accepted exclusions remain exactly `/api`, `/_next/static`, `/_next/image`, and `favicon.ico`; the matcher itself is otherwise unchanged.
- `IDENTITY_TOKEN_CAPTURE_ENTRIES` is one frozen, exported, exact-path mapping. `/verify-email/capture` and `/verify-email` map only to `email_verification` and `/verify-email`; `/reset-password/capture` and `/reset-password` map only to `password_reset` and `/reset-password`. Prefix, suffix, slash, and similarly named routes do not capture.
- Exact token-bearing identity entries and the existing invitation entry return before `NextResponse.next()` and filesystem routing. GET with exactly one valid-shape token seals the existing purpose-bound opaque intent; empty, malformed, oversized, undecodable, or duplicate keys clear stale intent and return the same clean 303.
- The stable method decision is: GET captures and returns 303; HEAD returns the same bodyless clean 303 but clears and never seals authority; POST, PUT, PATCH, DELETE, OPTIONS, and every other unsupported method return a bodyless generic 405 with `Allow: GET, HEAD`, clear stale authority, and no `Location`. All outcomes use application nonce CSP plus `Headers.set` private/no-store and no-referrer.
- Every redirect removes the entire query and fragment. Verification invitation continuation remains sealed only for the exact server allowlist `/workspace/invitations/accept`; it never enters `Location`.
- Invitation Proxy capture remains symmetric. The generated verification/reset `/capture` Route Handlers remain unchanged as compatibility defense in depth.
- No code inspects RSC, `_rsc`, prefetch, router-state, or other framework-internal headers. The eleven-path protected set, direct APIs, Caddy, CSRF/Origin order, bodies/business statuses, database, migrations, Session/Workspace/Membership/Role/seat/entitlement authority, transactions, Audit, email/provider/config, and infrastructure are unchanged.

## Next 16.3.1 authority and upgrade gate

Before implementation, the installed Next 16.3.1 Proxy guide, matcher/negative-matching/unit-testing sections, getting-started guide, and `dist/server/web/adapter.js` normalization/RSC/redirect path were reviewed per `AGENTS.md`. The installed documentation calls the matcher utility `unstable_doesProxyMatch`; the shipped 16.3.1 package retains the compatibility export name `unstable_doesMiddlewareMatch`. The test imports that official shipped export under the documented Proxy name, so a framework export or matcher behavior change fails visibly.

`npm run test:framework-capture` is the named upgrade gate. It runs matcher/direct tests, builds the production artifact, creates disposable synthetic verification/reset links through the real encrypted Outbox/template service, and probes the immutable production server plus browser boundary. The disposable User, Audit, Outbox, token, and rate-limit fixture rows are removed after the run. No provider is called and no email is sent.

## Verification evidence

- Diff/ancestry: `git diff --check` passed. The branch is based on exact `106e5104`; Architecture authority `263281d` is preserved in ancestry. Application behavior changes only in `src/proxy.ts`; the remaining files are focused tests, the named test configuration, this handoff, and append-only gap evidence.
- Lint and TypeScript: `npm run lint -- --quiet` and `npx tsc --noEmit` passed.
- Direct/unit: `npm test` passed **144/144 executable tests across 21/21 files**; the 124 database-gated tests were intentionally skipped in that direct run.
- Focused matcher/direct gate: **57/57 across 4/4 files**. It covers the official Next matcher utility across all five exact entries under HTML, RSC, `_rsc`, router prefetch, purpose prefetch, router-state, and combined shapes; retained exclusions; exact/near-miss mapping; query order; duplicates; empty/malformed/oversized/encoded input; stale-cookie replacement; GET/HEAD/405; CSP/cache/referrer/cookie/Location/Vary/token absence; loop prevention; invitation symmetry; all eleven protected paths; and unchanged Caddy default-if-absent policy.
- PostgreSQL: migrations applied and reran cleanly; `npm run test:integration` passed **124/124 serialized tests across 15/15 files**. This includes **17** identity tests and **24** tenant/invitation tests covering generated Outbox paths, invalid/expired/replaced/consumed/replayed tokens, reset Session revocation, rate limits, success Audit effects, late-failure rollback, tenant/seat/identity denials, and invitation concurrency/replay.
- Production build: `npm run build` passed on Next.js **16.3.1** with Proxy and all routes compiled.
- Immutable production response/browser: **4/4**, one worker, zero retries. Two real encrypted Outbox/template links were probed in eight HTML/RSC/prefetch/combined presentations; the broader table covered all five entries, HEAD, 405, raw/encoded/twice-encoded absence, reordered/extra/duplicate/invalid queries, near-miss defaults, browser final/history/Back/refresh/DOM/storage/cookie/outbound/referrer/console absence, nonce CSP, responsive 320px overflow, landmark/heading, and keyboard focus.
- Focused existing Playwright: **4/4**, one worker, zero retries. It covers invitation HTML/RSC/history/storage/outbound behavior, all eleven token lifecycle route/framework outcomes, missing/mismatched CSRF, absent/cross Origin, and near-miss defaults.

Expected `NO_COLOR`/`FORCE_COLOR` startup warnings were the only warnings. No retry, quarantine, snapshot update, email delivery, external provider call, live-UAT access, tag, deployment, or infrastructure mutation occurred.

## Gap, rollback, and review disposition

`UAT-GAP-011` is implementation-remediated but remains P1/open blocking until independent Backend/Security and Architecture acceptance, controlled integration, a new immutable release authorization, and the complete public-edge matrix close live evidence. `UAT-GAP-009` remains P3/open non-blocking and unnormalized; Caddy still contains exactly one `?Referrer-Policy` default-if-absent setter.

Rollback is application-only to the accepted `106e5104` tree/previous immutable image and matching protected authority. There is no migration or data rollback. `v0.5.0-uat.1`, `.2`, `.3`, and `.4` remain permanently retired; this candidate does not create `.5`.

Backend/Security review should independently verify matcher coverage/order, exact mapping and near misses, GET/HEAD/405 semantics, duplicate/invalid stale-authority clearing, opaque purpose/cookie boundaries, continuation allowlist, token absence, invitation symmetry, CSRF/Origin non-change, transaction/Audit regression evidence, and cleanup. Architecture should verify exact conformance to `263281d`, the installed Next mechanism, unchanged protected/Caddy/API/database boundaries, and that public-edge evidence remains a deployment-time stop gate.
