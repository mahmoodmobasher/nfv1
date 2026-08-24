# Nexa Spectrum Phase 4 backend/security re-review

Date: 2026-08-24

Candidate: `08eb32ff2be2cd1f32d4a0be26b4ebcae6182964` on `codex/nexa-spectrum-phase4`

Focus: implementation `33d649a`; Architecture blocker authority `7483120` / `8747564`

## Decision

**ACCEPT.** P0: none. P1: none. P2: none. P3: none.

The P4-05 bearer-token rendering blocker is closed. Candidate `08eb32f` is suitable for final Architecture review and, if Architecture accepts the same immutable candidate, the complete integration gate. This review does not authorize integration or deployment.

## Independent boundary review

- **Capture before rendering:** `src/proxy.ts` intercepts only the exact `/workspace/invitations/accept` document when a `token` query key is present, seals the value, and returns one 303 to the exact clean path. The page no longer reads `searchParams`, and no client prop, client capture, storage, or URL mutation carries the raw token. HTML and RSC probes were token-free.
- **Purpose, scope, and lifetime:** the sealed envelope requires purpose `workspace_invitation_accept`, validates token shape, authenticates encryption with the Session secret, and expires after 900 seconds. The intent cookie is HttpOnly, SameSite=Lax, HTTPS-Secure when `APP_ORIGIN` is HTTPS, and scoped to `/workspace/invitations/accept`. The separate token-free authentication-return marker has its own purpose and is scoped to `/api/auth/login`; it cannot authorize invitation acceptance.
- **Invalid and terminal handling:** empty, malformed, undecodable, wrongly sealed, expired, invalid, and consumed authority fails closed. A malformed capture replaces stale authority. The terminal route and successful/invalid/consumed acceptance responses expire both cookies. Seat exhaustion remains deliberately recoverable and does not consume or clear a still-valid invitation.
- **Back, refresh, and replay:** capture redirects before document generation, so browser history, HTML/RSC, storage, and outbound requests do not retain the bearer. Back/forward returns only to token-free routes. Refresh reuses only the bounded HttpOnly intent. PostgreSQL serialization permits one Membership, one committed success Audit, and one activation outbox effect; subsequent consumption is generic and terminally cleared.
- **Authentication continuation:** sign-in and registration URLs contain only the allowlisted clean acceptance path. Login honors it only when the purpose-bound return marker is valid, then clears that marker. Registration carries the same literal continuation through verification without adding the invitation bearer to URLs. A generated Mailpit invitation was captured, previewed anonymously, traversed through both sign-in and registration continuation links, then accepted by the verified intended identity.
- **CSRF/origin:** browser acceptance and intent clearing remain POST mutations through the shared double-submit CSRF and exact-origin guard. Cross-origin and same-origin-without-CSRF probes returned the bounded 403 response with private/no-store and no-referrer headers and did not reflect the submitted token. The pre-render GET capture only converts a bearer already presented in the URL into narrower server-owned authority; it performs no Membership mutation.
- **Generated and compatibility paths:** generated transactional email targets the exact capture route. The browser completion alias accepts only the sealed intent. The retired post-render capture endpoint is a private, token-free 404. The established direct `/api/invitations/accept` contract alone retains body-token support behind authentication, CSRF/origin, rate limiting, identity-email, tenant, entitlement, idempotency, Audit, and transactional service checks; body tokens are rejected on the website alias.
- **Tenant, seat, role, and identity authority:** acceptance resolves the trusted Session identity, requires the verified invitation email match, locks and validates the active Workspace/invitation, counts total active seats including Owner, assigns only persisted Admin/Member invitation roles, preserves an existing active Owner/Admin/Member role and Teams, and does not turn the chooser or a global User's other Memberships into Workspace entitlement.

All capture, clean-document, retired, clear, terminal, denial, and acceptance responses inspected at this boundary are private/no-store and no-referrer. CSP remains nonce-based with `strict-dynamic`; no raw invitation token is written to response bodies, response locations, cookies, browser storage, Audit metadata, or application logs by this implementation.

## Reproduced evidence

- Candidate/authority ancestry: `33d649a` and `8747564` are ancestors of exact HEAD `08eb32f`; worktree was clean before this report.
- Focused direct tests: `tests/phase4-invitation-boundary.test.ts` plus `tests/design-system-boundary.test.ts` — **23/23 passed**.
- ESLint (`--quiet`) — **passed**. TypeScript (`tsc --noEmit`) — **passed**.
- Fresh isolated PostgreSQL database `phase4_security_review_08eb32f`: migrations applied successfully; the full serialized integration suite passed **124/124 tests across 15 files**. This includes hash-only storage, wrong-email/expired/revoked/replaced/consumed denial, capacity and reactivation boundaries, role/Team preservation, accept/revoke/resend concurrency, replay singularity, transactional Audit/outbox behavior, and injected-failure rollback.
- Next.js 16.3.1 production build — **passed**, 42 pages collected; Proxy and invitation capture/complete/clear/terminal routes were present.
- Production-build response probe with an HTTPS application origin — **passed**: exact 303, clean `Location`, private/no-store, no-referrer, nonce CSP, two distinct HttpOnly/SameSite=Lax/Secure cookies, correct separate paths, 900-second lifetime, and zero raw or URL-encoded token occurrences in body, `Location`, or `Set-Cookie`. The clean document was also private/no-store, no-referrer, and token-free.
- Focused Playwright security gate — **1/1 passed** with one worker and zero retries: HTML/RSC, history, storage, outbound-request, Back, and forward checks.
- Generated Mailpit invitation and authenticated acceptance journey — **1/1 passed** with one worker and zero retries: generated-link capture, anonymous preview, token-free sign-in/registration continuations, intended-identity acceptance, one Membership, and authenticated Workspace entry.
- Explicit CSRF/origin negative probes — **2/2 passed**: hostile origin and missing-CSRF same-origin submissions both returned 403 with private/no-store, no-referrer, and no token reflection.

No application code, schema, migration, fixture, or deployment state was changed by this review. The isolated database contains dummy review evidence only.
