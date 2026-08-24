# Nexa Spectrum Phase 4 remediation closing Architecture review

Date: 2026-08-24

Candidate: `08eb32ff2be2cd1f32d4a0be26b4ebcae6182964` on `codex/nexa-spectrum-phase4`

Implementation: `33d649a`

Authorities: Phase 4 gate `0da5f0a`; backend prerequisite `9a7aad4`; Phase 4 rejection `7483120`; accepted Phase 3 Architecture checkpoint `632272e`

Scope: focused read-only re-review of P4-05 remediation, mandatory P4-01 through P4-11, preserved security/tenancy boundaries, complete evidence checkpoint, integration, rollback, and Phase 5 disposition

## Verdict

**ACCEPT — no material Architecture blockers.**

P0: none.

P1: none. The invitation bearer-token disclosure rejected in `7483120` is closed.

P2: none.

P3: none material to integration or deployment.

Mandatory P4-01 through P4-11 are accepted. Candidate `08eb32f`, including implementation `33d649a`, is approved for controlled integration after the separately required Product and Graphics gates. Phase 5 may start only after Phase 4 is integrated to the controlled baseline and its post-integration checkpoint is clean; this verdict does not authorize direct deployment from the development branch or broaden Phase 5 scope.

## Closed P4-05 finding

The exact `/workspace/invitations/accept?token=...` entry is now intercepted in `src/proxy.ts:51-81` before page or RSC rendering. The proxy removes the complete query, seals the validated token into a purpose-bound server intent, creates the bounded authentication-return marker, and returns one 303 to the exact clean acceptance route. Invalid or malformed query authority clears both cookies rather than retaining stale authority.

The cookie contract is bounded and appropriate:

- `src/server/invitations/intent.ts:4-9` defines distinct invitation-intent and authentication-return cookie names and paths;
- `src/server/invitations/intent.ts:17-31` enforces token shape, purpose, encryption, and a 15-minute expiry;
- `src/server/invitations/intent.ts:42-48` emits the intent as HttpOnly, SameSite=Lax, maximum 900 seconds, HTTPS-Secure when applicable, and path-scoped to `/workspace/invitations/accept`;
- `src/server/invitations/intent.ts:50-72` separately purpose-binds and path-scopes the login return marker;
- malformed cookie encoding fails closed in the request readers.

The clean page no longer reads `searchParams` or passes raw token authority to a client component (`src/app/workspace/invitations/accept/page.tsx:13-20`). `InvitationIntentCapture` and client-side raw-token posting were removed. The retired browser capture endpoint is fail-closed with a private 404 (`src/app/workspace/invitations/accept/intent/route.ts:4-11`). Browser completion accepts the sealed cookie; raw body-token compatibility is restricted to the established direct `/api/invitations/accept` route rather than the website alias.

Private/no-store and no-referrer are retained on capture and clean token documents (`src/proxy.ts:78-95`) and on the invitation acceptance response family. Successful and terminal invalid/consumed outcomes clear server-owned intent and return authority. An invalid preview uses the terminal 303 clearing route (`src/app/workspace/invitations/accept/page.tsx:18-20`; `src/app/workspace/invitations/accept/terminal/route.ts:9-20`). Capacity or authentication denials preserve the bounded intent where retry is legitimate. Back/refresh cannot restore the raw query after the server redirect.

Authentication continuation remains an exact token-free `/workspace/invitations/accept` destination and requires the valid server-owned return marker. The raw invitation token is absent from login and registration URLs, browser storage, client props, and outbound navigation. Final acceptance continues to use authenticated identity, verified-email invitation truth, Admin/Member-only role authority, seat/entitlement enforcement, idempotency, transaction, and Audit boundaries.

## Security, tenancy, and rollback confirmation

No remediation change weakens the accepted CSP nonce/strict-dynamic, server-authoritative Light/Dark/System first paint, configured Session-cookie privacy, CSRF/trusted-Origin guard, generic identity denial, rate-limit, email/outbox, Session rotation/revocation, or Workspace isolation contracts.

The canonical tenancy policy remains intact: one self-service subscription provisions exactly one company Workspace; the verified registrant is the sole distinct initial Owner; Owner consumes one included active seat; normal invitations grant Admin or Member only; the chooser selects existing active Memberships without creating or entitling; a global User may hold legitimate Memberships in multiple Workspaces; additional Workspaces remain Enterprise provisioning only. Browser plan, Workspace, Membership, Role, and entitlement values remain non-authoritative.

The remediation adds no migration and does not alter persisted identity, Session, Workspace, Membership, invitation, Audit, or entitlement schema or ownership. Rollback remains an immutable prior-image application switch. It must not include database rollback or data rewriting.

## Acceptance evidence

Inspection confirmed that automated boundary tests cover exact pre-render capture, raw and encoded token absence from body/Location/Set-Cookie, cookie attributes, malformed/stale authority replacement, non-exact route exclusion, retired client capture, terminal clearing, exact authentication continuation, and removal of token-bearing client code. The browser security test covers both normal document and RSC request shapes, clean history/storage, outbound URL absence, and Back/forward behavior.

Architecture independently ran the focused invitation and identity boundary set: 20/20 passed. Architecture also completed an optimized Next.js 16.3.1 production build; compilation, TypeScript, page collection, and the invitation terminal route passed.

The immutable handoff records the complete clean checkpoint:

- lint and TypeScript: pass;
- direct/unit: 98/98 pass;
- serialized PostgreSQL: 124/124 pass;
- migration apply and idempotent rerun: pass, with no new migration;
- production build: pass, 42 pages;
- serialized Playwright: 60 pass with zero retries/quarantine and one intentional disabled-provider configuration skip; the isolated disabled-provider cell is 1/1 pass;
- invitation visual stability: two consecutive 3/3 passes;
- production response probes: exact 303, CSP, private/no-store, no-referrer, cookie attributes, malformed/stale clearing, and raw plus encoded token absence from HTML/RSC/body/Location/Set-Cookie;
- generated-email journey: clean response, HTML, history, storage, authentication URLs, preview/acceptance, and terminal clearing;
- required responsive and overflow coverage: pass.

The candidate handoff and implementation are consistent on the formerly missing invitation negative probe. No unresolved flaky aggregate gate, test quarantine, security exception, or rollback dependency remains.

## Integration and Phase 5 disposition

Architecture approves controlled integration of the immutable Phase 4 series through `08eb32f`, preserving `33d649a`, the backend prerequisite, accepted prior-phase records, and the Graphics decision. Do not deploy directly from `codex/nexa-spectrum-phase4`.

After integration, run the normal read-only ancestry/conflict check and the release smoke/security checkpoint against the integrated tip. If clean, Phase 4 is closed and Phase 5 may begin under its own bounded Product/Architecture/Graphics authority. Phase 5 must not change token, identity, Session, subscription, Workspace, Membership, Role, invitation, Audit, entitlement, CSP, cache, or theme authority without a new explicit contract.
