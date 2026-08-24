# Nexa Spectrum Phase 4 closing Architecture review

Date: 2026-08-24

Candidate: `0199775781a27fcc183e7f3bfd7eed5cc2850fe8` on `codex/nexa-spectrum-phase4`

Authorities: Phase 4 gate `0da5f0a`; backend prerequisite `9a7aad4` (present in the candidate ancestry); accepted Phase 3 Architecture checkpoint `632272e`

Scope: read-only closing review of mandatory findings P4-01 through P4-11, security and tenancy boundaries, supplied test evidence, and rollback readiness

## Verdict

**REJECT — one material P1 invitation bearer-token disclosure remains.**

P0: none.

P1: invitation acceptance renders the raw bearer token into the initial document/RSC payload before client-side capture and URL cleanup.

P2: none independent of the P1 finding.

P3: none material to this gate.

P4-01 through P4-04 and P4-06 through P4-11 are accepted on the inspected candidate. P4-05 remains open. The candidate must not be integrated or deployed and Phase 5 must not start from it.

## Material finding

### P1 — invitation token crosses the server/client rendering boundary

The invitation entry page reads `searchParams.token` and passes the raw value to the client component `InvitationIntentCapture` (`src/app/workspace/invitations/accept/page.tsx:12-15`). That component removes the visible query string only after hydration and then posts the same token from its client prop (`src/app/workspace/invitations/accept/accept-client.tsx:11-19`). A client-component prop is serialized into the initial Next.js HTML/RSC response, so `history.replaceState` is too late to satisfy the server-capture boundary.

The proxy performs pre-render capture only for `/verify-email` and `/reset-password` (`src/proxy.ts:32-40`). It gives `/workspace/invitations/accept` private/no-store and no-referrer headers but does not intercept its token (`src/proxy.ts:43-45`). Those headers reduce secondary exposure; they do not remove the bearer credential from the response body.

A read-only live probe against immutable candidate `0199775` requested:

`GET /workspace/invitations/accept?token=invitation-architecture-probe-12345678901234567890`

The response was HTTP 200 and included the exact token multiple times in the HTML/RSC payload, including the serialized `InvitationIntentCapture` prop. The candidate handoff's production token-privacy probe covers verification and reset only (`docs/engineering/nexa-spectrum-phase-4-candidate-handoff.md:58`); it does not provide the required invitation response-body negative proof. The claim that invitation acceptance uses the same server-owned capture pattern (`docs/engineering/nexa-spectrum-phase-4-candidate-handoff.md:43`) is therefore not supported by the implementation.

This violates P4-05 and the authority requirements that raw invitation tokens not enter the response body/client boundary and that token capture occur before rendering. An invitation token is a bearer credential capable of authorizing a Membership acceptance, subject to the remaining identity and entitlement checks; rendering it unnecessarily expands exposure to response capture, browser tooling, extensions, and downstream observability.

## Required remediation

Responsible development role: Dev1, with Security/Backend review of the capture contract.

1. Intercept `/workspace/invitations/accept?token=...` before any page or RSC rendering, matching the accepted verification/reset shape.
2. Seal the token into a purpose-bound, short-lived (maximum 15 minutes), HttpOnly, SameSite=Lax, HTTPS-Secure, path-scoped server cookie and return a 303 to the exact clean `/workspace/invitations/accept` path.
3. Preserve `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer` on capture, invalid, denied, and clean token-document responses.
4. Remove the raw-token client prop and client-side token-post capture path. The clean page may consume only the sealed server-owned intent.
5. Clear the intent on terminal success/invalid outcomes and preserve replay-safe Back/refresh behavior. Do not place the raw token in login/registration return URLs, storage, logs, Audit, metadata, or outbound navigation.

## Required acceptance evidence

- A production-build response probe for both generated invitation-email entry links and supported direct/legacy entry proves the raw token and its URL-encoded form are absent from response bodies/RSC, `Location`, `Set-Cookie`, clean-page HTML, browser history, browser storage, logs, Audit, and outbound requests.
- Positive evidence proves one 303 to the exact token-free route, the bounded purpose/path/expiry cookie attributes, private/no-store/no-referrer on every outcome, successful authenticated preview/acceptance, and terminal intent clearing.
- Negative evidence covers empty, malformed, expired, revoked, replaced, consumed, cross-email, seat-exhausted, replay, Back, refresh, unauthenticated login/registration continuation, and CSRF/origin denial without token disclosure.
- Rerun lint, TypeScript, unit/direct boundary tests, the serialized PostgreSQL suite, production build, full serialized Playwright without retry/quarantine, and production CSP/cache/referrer/token probes. The invitation response-body assertion must be an automated release gate, not only a source assertion that `replaceState` exists.

## Accepted boundaries retained by the candidate

Subject to the blocker above, the read-only review found no additional material Architecture defect:

- Phase 4 surfaces use the centralized server-rendered `.experience-website` boundary and retain the accepted semantic token, CSP nonce, server-authoritative Light/Dark/System, first-paint, and configured Session-cookie privacy contracts.
- Disabled provider mode remains fail closed; login uses a server-derived destination; verification/reset token capture is pre-render, purpose-bound, private/no-store/no-referrer, and terminally cleared.
- Registration, verification, reset, Session rotation/revocation, generic denials, CSRF/origin, rate-limit, outbox, Audit, and password/reset lock-order boundaries remain backend-owned.
- Self-service copy and server flow preserve one subscription to exactly one Workspace, one distinct sole initial Owner, Owner counted in included active seats, Admin/Member-only normal invitations, Enterprise-only additional Workspace provisioning, and legitimate global User multi-Membership.
- Workspace creation revalidates persisted plan/catalog authority; ready and chooser consume server-authorized Workspace/Membership truth; the chooser selects only and does not create, entitle, assign Role, or change subscription ownership.
- The candidate is staged by route family and adds no migration. Rollback remains an immutable prior-image application switch and must not rewrite identity, Session, Workspace, Membership, invitation, Audit, or entitlement data.

## Integration and rollback gate

Do not integrate or deploy `0199775`. Produce a new immutable remediation candidate, retain the backend prerequisite and accepted Phase 1-3 boundaries, and request focused Architecture re-review of P4-05 plus the complete clean evidence checkpoint. No database rollback or data repair is indicated because this candidate has not been accepted for deployment and the required correction is at the request/rendering boundary.
