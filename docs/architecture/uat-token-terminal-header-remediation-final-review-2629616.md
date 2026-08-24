# UAT token-terminal header remediation final Architecture review

Date: 2026-08-24

Candidate: `2629616bc8104620ff5cfd6ea43fc35f397af1b5` on `codex/uat-token-terminal-header-remediation`

Implementation: `5fdec7b8d31cc06aed85c96a2960a1fe6d837716`

Baseline: `aa64658cf74f1d8be12fa6751e70a1718aa2fe9c`

Authority: `0035fd1dc5650a4789d9f0df6fbdb06f8b5910da`

## Verdict

**ACCEPT — no material Architecture blockers.**

P0: none.

P1: none in the immutable implementation. `UAT-GAP-008` is closed at application implementation/evidence scope; live public-edge closure remains a deployment-time gate.

P2: none.

P3: `UAT-GAP-009` remains open non-blocking under the accepted strict effective-private/no-store evidence contract. `UAT-GAP-005` remains a separate non-blocking Operations follow-up.

Architecture approves candidate `2629616` for controlled integration after the required distinct Backend/Security peer review accepts the same immutable candidate. Product may separately authorize a new UAT attempt no earlier than `v0.5.0-uat.4` only after peer acceptance and integration. This review is not deployment authority.

## Exact application boundary

`src/proxy.ts` now exports one frozen, duplicate-free `PROTECTED_TOKEN_LIFECYCLE_PATHS` array containing exactly the eleven paths required by `0035fd1`:

1. `/verify-email`
2. `/verify-email/capture`
3. `/verify-email/complete`
4. `/reset-password`
5. `/reset-password/capture`
6. `/reset-password/complete`
7. `/workspace/invitations/accept`
8. `/workspace/invitations/accept/complete`
9. `/workspace/invitations/accept/intent`
10. `/workspace/invitations/accept/intent/clear`
11. `/workspace/invitations/accept/terminal`

Membership uses exact normalized-path equality through a private set. Query parameters do not affect membership. Trailing slash, suffix, prefix/lookalike, extra-segment, and direct `/api/...` compatibility paths remain excluded. The exported array is frozen and the set is not exported for mutation.

`setProtectedTokenLifecycleHeaders` uses `Headers.set` for both `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`. Repeated invocation replaces rather than appends, yielding one application value. The helper is used for verification/reset capture redirects, invitation capture redirects, and the shared downstream proxy response. This places the privacy classification ahead of route-handler normal returns, early mutation-guard denials, framework method outcomes, redirects, and bounded failures for every exact website lifecycle path.

The previous configured-Session private/no-store rule remains separate and unchanged. Capture logic, invitation invalid-intent clearing, the proxy matcher, direct compatibility APIs, and all application route handlers are otherwise unchanged.

## Symmetry and security preservation

The frozen set closes the two observed verification/reset completion denials and the symmetric invitation lifecycle gaps. In particular, early CSRF/Origin denial from invitation intent clearing receives proxy-owned privacy before the handler's normal response-specific assignment. Existing invitation completion, retired intent, clear success, and terminal handlers retain their local defense; `Headers.set` prevents an application duplicate.

The Caddyfile is unchanged and retains exactly one `?Referrer-Policy` default-if-absent operation. Caddy therefore preserves application `no-referrer` and supplies `strict-origin-when-cross-origin` only when the application is silent. No Caddy route policy, proxy matcher, API matcher, cache operation, infrastructure, provider, secret, DNS, or protected configuration changed.

The implementation does not alter CSRF or trusted-Origin ordering, input validation, status/body semantics, token capture/sealing/clearing, Session rotation/revocation, rate limits, idempotency, lock order, transaction scope, Audit ownership, or rollback behavior. Verification remains global-User activation only; reset retains credential/reset-token/security-version/Session/Audit atomicity; invitations retain verified-email, seat, entitlement, Admin/Member, Membership, Workspace, idempotency, and Audit controls. The header classifier grants no identity or tenant authority.

## Header and privacy evidence

The candidate evidence proves all eleven exact paths receive the application header pair for GET, POST, PUT, DELETE, and OPTIONS proxy shapes, independent of query parameters. Production-build probes cover all eleven paths under GET and PUT/framework outcomes, completion/clear missing-CSRF denials, and near-miss exclusions. The focused browser suite covers missing/mismatched CSRF, absent/cross Origin, invitation HTML/RSC capture, history/storage/outbound requests, and Back/forward behavior.

Protected responses retain:

- one application `Referrer-Policy: no-referrer`;
- one application `Cache-Control: private, no-store` before the edge defense;
- nonce-consistent CSP with `strict-dynamic` and no production `unsafe-inline`/`unsafe-eval`;
- existing independent `Set-Cookie` fields and purpose/path/expiry/security attributes;
- exact token-free `Location` and unchanged `Vary`; and
- absence of raw and URL-encoded synthetic tokens from bodies, headers, cookies in plaintext, redirects, history, storage, and outbound requests.

Valid, invalid, expired, replaced, consumed, replay, rate-limit, transaction rollback, Session revocation, invitation concurrency, tenant/seat/identity denial, and singular success/Audit semantics remain covered by the unchanged serialized PostgreSQL suites. Because proxy classification is method/path invariant, these route outcomes receive the same header pair without modifying their business handlers.

Architecture independently reran the frozen-path, Caddy/cache, identity-token-intent, and invitation boundary suites: 41/41 passed.

The immutable handoff records:

- lint and TypeScript: pass;
- direct/unit: 124/124 across 20 files;
- focused canonical-path boundary: 22/22;
- Caddy/cache boundary: 4/4;
- serialized PostgreSQL: 124/124 across 15 files;
- production build: pass;
- direct production response probes: 29/29;
- focused Playwright: 4/4, one worker, zero retries/quarantine;
- no external provider call, email send, live-UAT mutation, migration, or infrastructure change.

## Gap disposition

### UAT-GAP-008

**Closed for implementation and pre-integration evidence.** The exact completion aliases and symmetric website lifecycle routes now receive application no-referrer/private-no-store across normal, denied, terminal, and framework outcomes. The gap remains operationally open until the integrated candidate passes the complete public edge matrix in a separately authorized UAT attempt.

### UAT-GAP-009

**Retained P3/non-blocking; normalization remains deferred.** The application produces one private/no-store field. The unchanged Caddy Workspace defense may produce a second identical raw field publicly. Tests accept only one or more semantically identical `private, no-store` fields and reject absence, conflict, public/shared caching, positive age, stale serving, unknown/unparsable, or weakened directives. No cache behavior was changed. A future normalization remains a separate edge-only decision and must not remove privacy defense without complete negative proof.

## Integration, rollback, and v0.5.0-uat.4 disposition

Before integration, a distinct Backend/Security reviewer must confirm the exact path set, `Headers.set` behavior, early-denial/framework coverage, CSRF/Origin ordering, generic responses, token absence, valid/invalid/replay/rollback semantics, Caddy preservation, and P3 cache parsing on this exact candidate. After that acceptance, integrate through the normal immutable workflow and verify ancestry/conflicts plus the focused 41-test boundary set.

Rollback is application-only to the prior immutable image based on `aa64658`, paired with its matching protected Option A environment and accepted Caddyfile. The remediation adds no migration and requires no database rollback, data rewrite, Session revocation, provider/DNS change, or Caddy rollback.

Product may then separately authorize a new immutable UAT attempt no earlier than `v0.5.0-uat.4`. The attempt must repeat artifact provenance, Option A schema/migration/app/worker parity, encrypted backup/restore, Caddy adapt/validate, Compose render, health, and rollback prerequisites. After switching, restart the entire public-edge matrix from probe one before email or broader testing; close live UAT-GAP-008 and UAT-GAP-001, then approved-recipient email and the full Phase 1–4 UAT matrix.

Any material failure restores the prior immutable application/config authority immediately and falls forward under another new identifier. `v0.5.0-uat.1`, `.2`, and `.3` remain permanently retired. No production or Phase 5 deployment is authorized.
