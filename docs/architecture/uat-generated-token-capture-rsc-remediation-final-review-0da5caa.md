# UAT generated-token capture/RSC remediation final Architecture review

Date: 2026-08-24

Candidate: `0da5caad1c4c1421a4c6bee74311dd57854447a3`

Implementation: `47efe632f07be09b5d0da552f86727f27ddea346`

Authority: `263281dc848223b419a2d0fa4c7d5e7cd0be12bf`

Baseline: `106e5104c064e42cddd6bd5e263d21acefbe2ec8`

Scope: independent read-only Architecture acceptance; documentation is the only changed artifact

## Verdict

**ACCEPT — no material Architecture blockers in immutable candidate `0da5caa`.**

- P0: none.
- P1: none in the reviewed implementation. `UAT-GAP-011` is locally implementation-remediated but remains operationally open until controlled integration and successful public-edge evidence.
- P2: none.
- P3: `UAT-GAP-009` remains the accepted non-blocking duplicate-identical effective `Cache-Control: private, no-store` defense. It is unchanged and must not be normalized in this integration.

## Conformance findings

- `263281d` is an ancestor of `0da5caa`; the bounded application change is confined to `src/proxy.ts`, with one package script and focused tests/configuration. Caddy, APIs, route handlers, database schema/migrations, provider configuration, CSRF/Origin services, identity transactions, Session/Workspace authority, and infrastructure are unchanged.
- Proxy's matcher retains the accepted `/api`, `/_next/static`, `/_next/image`, and `favicon.ico` exclusions while removing the presentation-dependent prefetch omissions. HTML, RSC, `_rsc`, router-prefetch, purpose-prefetch, router-state, and combined presentations therefore reach Proxy.
- One frozen exact mapping gives generated and legacy verification/reset entries only their correct purpose and clean destination. Prefix, suffix, slash, and similarly named routes do not gain capture authority.
- GET with exactly one valid-shape token captures before `NextResponse.next()`/filesystem routing, seals the existing purpose-bound intent, and returns exact clean 303. HEAD returns bodyless clean 303 without sealing and clears stale authority. Unsupported methods return bodyless generic 405 with `Allow: GET, HEAD`, no `Location`, and stale-authority clearing.
- Empty, malformed, oversized, undecodable, or duplicate identity tokens cannot preserve prior authority. Invitation capture applies the same presentation, method, duplicate, and stale-clearing rules while retaining its existing intent/return-cookie model.
- Redirects remove the complete query and fragment. Verification invitation continuation remains limited to the existing exact allowlist and is stored only inside the sealed intent. The generated `/capture` Route Handlers remain unchanged compatibility defense in depth.
- Capture responses retain application `private, no-store`, `no-referrer`, nonce-consistent production CSP, purpose/path/expiry-isolated opaque HttpOnly cookies, independent invitation cookies, token-free `Location`/body/RSC, and unchanged `Vary`. No client state becomes identity, Session, Workspace, Membership, Role, seat, entitlement, or transaction authority.

## Independent evidence

Architecture independently executed against the immutable application/test tree of `0da5caa`; the available worktree descendant differed only by one archival handover document:

- ancestry and bounded file inventory: passed;
- `git diff --check` from `106e5104` to `0da5caa`: passed;
- `npm run test:framework-capture`: focused matcher/direct **57/57** across 4 files, Next.js 16.3.1 production build passed, immutable production/real-Outbox/browser **4/4**, one worker, zero retries;
- focused serialized PostgreSQL `identity.integration` plus `slice4.integration`: **41/41** across 2 files, including identity/reset and invitation transaction/concurrency behavior.

The only warning was the known non-blocking `NO_COLOR`/`FORCE_COLOR` startup warning. No email/provider call, live-UAT access, tag, merge, push, configuration, database schema, or infrastructure mutation occurred.

The candidate handoff's exact-candidate evidence may be reused for unaffected gates: lint and TypeScript passed; direct/unit **144/144**; full serialized PostgreSQL **124/124**; migrations apply/rerun passed; production build passed; focused existing token/invitation browser **4/4**. Prior accepted Phase 1–4, Caddy, Option A sender, eleven-path header, and `.4` first-52-edge-assertion evidence also remains valid within its recorded scope.

## Remaining gates and integration disposition

Architecture accepts `0da5caa` for controlled integration **only after** the separately required Backend/Security reviewer issues explicit ACCEPT on this same immutable candidate. No such distinct peer record was present at this review boundary; Product must wait for it and may not yet authorize integration.

After peer acceptance, Product may authorize a fresh-main integration that:

1. preserves current `main` handover/Product records and proves candidate ancestry, exact file inventory, and conflict resolution;
2. introduces no semantic change beyond `0da5caa`;
3. passes `git diff --check`, lint, TypeScript, `npm test`, and `npm run test:framework-capture` on the integrated SHA;
4. reruns full PostgreSQL and full Playwright only if a semantic code/config/test conflict or additional delta exists; and
5. publishes an immutable integration checkpoint before any release authorization.

An authorized `v0.5.0-uat.5` attempt additionally requires exact artifact provenance, protected Option A environment parity, backup/restore, migration apply/rerun, pinned Caddy adapt/validate, Compose render, app/worker readiness, and rollback proof. After switching, public-edge generated verification/reset HTML/RSC/prefetch/HEAD/unsupported-method probes and all eleven protected paths run first. Any 307/308, query-bearing redirect, raw/encoded token exposure, stale-authority failure, weakened CSP/cache/referrer/cookie/Vary behavior, security/transaction regression, or material infrastructure/readiness failure stops and rolls back before email or broader UAT.

Only after the public-edge gate passes may controlled-recipient verification, recovery/reset/Session-revocation, and invitation journeys run, followed by the complete Phase 1–4 UAT matrix and explicit Product acceptance. `v0.5.0-uat.1` through `.4` remain permanently retired; this review authorizes no merge, push, tag, deployment, email, configuration, infrastructure, production, or Phase 5 action.
