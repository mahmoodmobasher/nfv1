# UAT generated-token capture/RSC remediation Architecture decision

Date: 2026-08-24

Reviewed authority: `main` `106e5104c064e42cddd6bd5e263d21acefbe2ec8`

Rejected integrated application: `58c5ae4c7075d3637bacb96fb70c343d671273a6` / `v0.5.0-uat.4`

Gap: `UAT-GAP-011`

Scope: application routing and token-capture boundary only. This decision changes no application, Caddy, Compose, database, migration, secret, provider, DNS, infrastructure, or live-UAT state.

## Decision

**REJECT `58c5ae4` and `v0.5.0-uat.4`; ACCEPT the bounded capture-before-framework contract below for implementation.**

- P0: none.
- P1: `UAT-GAP-011` — generated verification and password-reset entry URLs can receive a framework 307 whose `Location` retains the bearer token and adds `_rsc` when requested in an RSC/prefetch shape.
- P2: none.
- P3: `UAT-GAP-009` remains the previously accepted, non-blocking duplicate-identical `private, no-store` defense; this remediation must not alter it.

Responsible implementation role: Backend/Dev2. Required reviewers: distinct Backend/Security peer reviewer and Architecture. Release Engineering owns immutable integration and direct/public production-build evidence. Product alone may authorize a later UAT attempt.

`v0.5.0-uat.1`, `.2`, `.3`, and `.4` are permanently retired. They must not be moved, repaired, overwritten, or reused. No next attempt is earlier than a new immutable `v0.5.0-uat.5`.

## Evidence and root cause

The deployment record proves 52 prior protected-response assertions passed, then an RSC-shaped generated verification capture returned 307 with token plus `_rsc` in `Location`. The exact `58c5ae4` image reproduced the same result for verification and reset without Caddy. Testing stopped before controlled-recipient email or business mutation, and rollback restored `e58c22a` cleanly.

The application generates links to `/verify-email/capture?token=...` and `/reset-password/capture?token=...`. Their Route Handlers perform the intended purpose-bound cookie capture and clean 303, but `src/proxy.ts` only captures identity tokens on the legacy clean paths `/verify-email` and `/reset-password`. More importantly, its one matcher has `missing` predicates for `next-router-prefetch` and `purpose: prefetch`, so those request shapes bypass Proxy entirely.

The installed Next.js 16.3.1 authority confirms:

- Proxy runs before filesystem routes (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`, execution-order section).
- `has`/`missing` are matcher eligibility conditions; the documentation's prefetch example includes separate non-prefetch and prefetch matchers rather than silently omitting the latter.
- matcher changes can silently remove security coverage, and `unstable_doesProxyMatch` is the supported matcher test utility.
- the adapter recognizes RSC before Proxy, removes Flight headers from the `NextRequest` exposed to Proxy, and removes internal query parameters such as `_rsc` during normal URL normalization (`node_modules/next/dist/server/web/adapter.js`). Application logic therefore cannot safely branch on those internal headers after matching.
- the framework carries `_rsc` as an internal RSC cache key and may normalize/replay navigations. A Proxy response returned directly precedes the filesystem Route Handler and can retain an explicit 303; the adapter does not append `_rsc` to an ordinary redirect `Location`.

The failure is therefore a coverage/order defect, not a Caddy header defect and not an identity-token transaction defect.

## Required bounded implementation

### 1. Make Proxy coverage independent of request presentation

Remove the `next-router-prefetch` and `purpose: prefetch` `missing` conditions from the existing non-API/non-static matcher. Retain its present exclusions for `/api`, `/_next/static`, `/_next/image`, and `favicon.ico`.

This is preferred over adding path-specific matcher copies: it is the smallest static configuration change, prevents matcher/path-list drift, preserves the established nonce/CSP and protected-token header boundary for HTML and RSC alike, and covers all current token entry routes. Do not inspect or trust `RSC`, `next-router-prefetch`, `next-router-state-tree`, `purpose`, `_rsc`, or any other Next-internal signal to decide whether token privacy applies.

Proxy may continue to pass ordinary eligible requests through after applying its existing headers. This change grants no authentication or authorization authority; route handlers and server services remain authoritative.

### 2. Capture generated identity entry paths before filesystem routing

Extend the existing exact identity capture classification so both canonical generated and legacy compatibility entries are captured directly in Proxy:

- `/verify-email/capture` and `/verify-email` map only to `email_verification` and clean destination `/verify-email`;
- `/reset-password/capture` and `/reset-password` map only to `password_reset` and clean destination `/reset-password`.

The existing `/workspace/invitations/accept` capture remains in Proxy. It requires the matcher correction because the same bypass exists for prefetch-shaped invitation requests, but it needs no new capture route or authority. The eleven-path protected lifecycle set remains unchanged and exact.

The generated `/capture` Route Handlers remain as bounded compatibility/defense-in-depth fallbacks. They must preserve the same purpose, cookie, clean-destination, privacy, and invalid-input behavior. Do not introduce a rewrite to those handlers, a client-side scrubber, a query-bearing intermediate route, or a new API.

### 3. Canonical capture response

For an exact entry path containing a `token` query key, Proxy must return before `NextResponse.next()` or filesystem routing:

- status exactly 303;
- `Location` exactly the same-origin clean destination, with the entire query removed (including `token`, duplicate keys, `next`, `_rsc`, and unknown keys) and no fragment;
- `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer` using `Headers.set` semantics;
- the existing per-response nonce CSP and production `strict-dynamic` policy;
- one purpose-bound, encrypted/authenticated, short-lived HttpOnly token-intent cookie with existing `Secure`, `SameSite=Lax`, path, expiry, and purpose isolation; never a plaintext token cookie;
- for verification only, the already accepted invitation continuation may be retained inside the sealed envelope only when it equals the server allowlisted `/workspace/invitations/accept`; it must not appear in `Location`.

Exactly one non-empty valid-shape token may establish intent. Empty, malformed, oversized, undecodable, or duplicate token keys must replace/clear stale authority and still return the token-free 303. A rejected value must never preserve a prior valid intent.

Generated-link capture supports safe navigation GET. HEAD must produce an equivalent bodyless, token-free response without consuming business authority. Every other method on a token-bearing exact entry must be handled before framework routing with a generic private/no-store, no-referrer, token-free denial or clean 303, must not seal attacker-controlled authority, and must not emit a token-bearing `Location`. Backend/Security must choose and document one stable method outcome; it may not rely on framework 307/405 behavior for a raw-token URL.

No capture request verifies an email, resets a password, consumes an invitation, creates a User/Session/Workspace/Membership, or writes success Audit. It stores only the existing bounded intent.

### 4. Navigation, replay, and terminal behavior

The redirect cannot loop: capture executes only when the token key is present, while the destination has no query. Refresh and Back may repeat the idempotent seal/replace operation but may never expose the token in the current URL, redirect chain, response body, RSC payload, browser storage, or outbound request. A prefetch may at most seal the same bearer already presented; it cannot consume the database token or complete the action.

Clean-page rendering, invalid/expired/replaced/consumed/replayed outcomes, terminal intent clearing, and retryability remain as accepted. Verification login/invitation continuation remains a server-owned allowlisted marker. Password completion retains recent security semantics and transactional password/token/Session/Audit behavior. Invitation acceptance retains authenticated intended-email, active Membership/seat/entitlement, Admin/Member-only, transactional, idempotent, and Audit boundaries.

## Preserved boundaries

The implementation must not change:

- CSRF token and trusted-Origin enforcement on completion/clear mutations;
- generic identity denials, rate limits, token hashing, expiry, replacement, consumption, Session rotation/revocation, or transaction lock order;
- the one-self-service-subscription/one-Workspace/sole-distinct-Owner policy, included-seat accounting, invitation truth, or multi-Membership chooser behavior;
- Caddy's default-if-absent `Referrer-Policy`, Workspace cache defense, CSP/header precedence, or duplicate-header behavior;
- database schema/migrations, email/outbox/provider content, secrets, protected configuration, logging/Audit payloads, or infrastructure.

No raw or URL-encoded verification, reset, or invitation token may appear in `Location`, response headers other than an opaque sealed cookie, HTML/RSC/JSON body, browser history or storage, outbound requests, application/worker/Caddy logs, Audit, test artifacts, screenshots, or release records. Evidence must use synthetic tokens and redact values.

## Required acceptance evidence

### Static and unit boundary

1. Use Next 16.3.1 `unstable_doesProxyMatch` against the built configuration to prove Proxy matches all five exact entry paths under ordinary HTML, `RSC: 1`, `_rsc`, `next-router-prefetch`, `purpose: prefetch`, router-state-tree, and combined header/query shapes. Prove `/api`, `/_next/static`, `/_next/image`, favicon, and representative near misses retain intended exclusion/behavior.
2. Table-test exact path-to-purpose/destination mapping, no prefix/suffix confusion, query-order independence, duplicate/empty/malformed/oversized/encoded token handling, method behavior, stale-cookie replacement, and loop prevention.
3. Assert 303, exact clean `Location`, one effective no-referrer, effective private/no-store, nonce-consistent CSP, bounded independent `Set-Cookie` fields, existing `Vary`, and raw plus once- and twice-URL-encoded synthetic-token absence from every observable field/body.
4. Retain all eleven protected lifecycle path tests and prove invitation capture now also works with RSC/prefetch-shaped requests.

### Direct production build and browser

Build and run the immutable production artifact—not a development server—and obtain generated verification/reset links from the real Outbox/email-template path with synthetic recipients/tokens. With redirects disabled, probe each generated link as:

- normal HTML navigation;
- RSC GET with router-state-tree and `_rsc`;
- Next router prefetch and `purpose: prefetch`, separately and combined;
- HEAD and the documented unsupported-method case;
- raw and encoded token forms, reordered/extra query keys, duplicate token keys, and near-miss paths.

Each supported capture must be 303 to the exact clean destination; no 307/308 or query-bearing redirect is permitted. Follow the clean redirect and exercise valid, invalid, expired, replaced, consumed, replay, Back, refresh, login continuation, terminal clearing, and stale-cookie replacement. Browser instrumentation must prove token absence from final/history URLs, DOM/RSC, local/session storage, cookies in plaintext, requests after capture, referrers, console, and captured logs. Repeat invitation capture/preview/acceptance at representative HTML/RSC/prefetch shapes.

Rerun lint, TypeScript, unit suites, the full direct/security suite, serialized PostgreSQL verification/reset/invitation regressions including late-failure rollback, production build, and focused browser security/accessibility tests. Add a named framework-upgrade regression gate so changing Next or matcher behavior cannot merge without rerunning matcher plus exact production-response probes.

### Public edge

After separate Product deployment authorization, repeat the same generated-link HTML/RSC/prefetch probes through the public edge before approved-recipient email or broader UAT. Assert exact 303/clean `Location`, token-free body/RSC, opaque purpose cookie, application no-referrer, effective private/no-store, nonce CSP, unchanged `Vary`, and no token in bounded app/worker/Caddy logs. Confirm Caddy still supplies exactly one `strict-origin-when-cross-origin` only where the application is silent and does not alter application no-referrer.

Then restart the entire public-edge matrix from probe one, including all eleven token lifecycle paths/methods/statuses, verification/reset/invitation valid and denied outcomes, configured valid/stale Session privacy, disabled OIDC, public/authenticated routes, Workspace selection, `_next` caching, controlled-recipient email, and the full Phase 1–4 UAT suite. A direct-container pass cannot substitute for public-edge evidence.

## Integration, rollback, and `.5` disposition

Backend/Dev2 must deliver one bounded application commit plus tests and handoff based on current accepted `main`. Security must independently review matcher coverage, capture ordering, token/cookie privacy, method behavior, stale-intent replacement, CSRF/Origin non-change, transactions, logs/Audit, and invitation symmetry. Architecture must review the same immutable candidate and evidence before Product may authorize integration.

Rollback is application-only to the prior immutable image and matching protected authority; no database rollback or rewrite is expected. The implementation must not require a Caddy reload, migration, secret/config edit, provider/DNS operation, or Workspace repair. Any failed candidate gets a new fall-forward identifier.

This decision authorizes implementation and review only. It does not authorize integration, live-UAT mutation, reuse of any retired tag, production deployment, or Phase 5. Product may separately authorize `v0.5.0-uat.5` only after immutable Backend/Security and Architecture acceptance, controlled integration, artifact provenance, environment/schema/app/worker parity, backup/restore, migration rerun, Caddy adapt/validate, Compose render, health/readiness, and rollback gates all pass.
