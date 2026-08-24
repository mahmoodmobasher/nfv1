# Nexa Spectrum Phase 4 candidate handoff

Date: 2026-08-24

Branch: `codex/nexa-spectrum-phase4`

Base: accepted Phase 3 checkpoint `4904599`

Candidate before this report: `cd2748a`

Authorities incorporated unchanged:

- Graphics proposal and matrix `c06503a`
- Architecture gate `0da5f0a`
- Backend prerequisite `9a7aad4`
- Phase 3 Architecture acceptance `632272e`
- Phase 3 Graphics acceptance `56139b4`

## Result

Phase 4 authentication and onboarding presentation is implemented on the centralized Nexa Spectrum website experience. The candidate is not integrated or deployed and Phase 5 has not started.

The implementation preserves the canonical policy: one self-service subscription provisions one company Workspace; the verified registrant becomes the sole initial Owner; included active seats include Owner; normal invitations assign Admin or Member only; the chooser selects existing Memberships and grants no entitlement; global Users may hold legitimate Memberships in other companies; Enterprise multi-Workspace remains Contact Sales only. No billing/provider/legal-consent capability was invented.

## Route-family checkpoints

- `0d95c77` — server-rendered `.experience-website`, provider configuration, semantic shell, document/API privacy foundation
- `6c94c98` — login, registration, verification, recovery and reset presentation
- `228dbc7` — plan selection and Workspace create/ready/switch
- `e0f0e29` — preview/operational invitation separation and authenticated acceptance handoff
- `fec7e3b` — P4-05 server-only verification/reset token-intent remediation
- `565f9e8` — deterministic paired Phase 4 visual matrix

Follow-up test-only checkpoints are `f490dfe`, `bfb77f6`, and `cd2748a`.

## Security and server-authority evidence

- Login consumes the server response destination. Invitation continuation is the exact allowlisted `/workspace/invitations/accept` path and additionally requires a valid server-owned marker.
- OIDC fixture UI is emitted only by non-production fixture configuration; disabled production routes remain unavailable.
- Identity, onboarding, Workspace and invitation responses are explicitly private/no-store on successful and denied outcomes.
- Verification, reset and invitation token documents are private/no-store and no-referrer.
- Legacy and generated verification/reset links capture before RSC rendering, seal the token into a purpose-bound 15-minute HttpOnly, SameSite=Lax, path-scoped cookie, and 303 to an exact token-free page. Raw/encoded tokens were absent from body, Location, Set-Cookie, clean HTML, browser history and storage. Terminal outcomes clear the intent.
- Invitation acceptance uses the same bounded server-owned pattern and never places the token in login/registration return URLs or browser storage.
- CSP production inspection found a unique matching nonce, `strict-dynamic`, no `unsafe-inline`/`unsafe-eval`, configured stale-cookie private/no-store behavior, and immutable public `_next` caching.

Architecture/security rereview accepted the remediated token-intent boundary after the production probe.

## Verification

- Diff check: application/test commits clean. Whole-base `git diff --check` reports only pre-existing whitespace in immutable imported authority/review documents, which were intentionally not rewritten.
- ESLint: PASS
- TypeScript: PASS
- Unit/direct boundary: 95/95 PASS
- PostgreSQL serial integration: 124/124 PASS
- Migration apply and idempotent rerun: PASS
- Next.js 16.3.1 production build: PASS, 41 dynamic routes/pages collected after remediation
- Full supported serialized Playwright: 48/48 PASS in one run, one worker, no retries/quarantine/timeout increase
- Production response token-privacy probe: PASS for legacy and generated verification/reset entry routes and clean HTML
- Responsive production probe: 77 route/viewport checks across 1280, 1024, 768, 600, 390, 360 and 320; zero document-level overflow

The Next.js development server continues to print its advisory about declaring `data-scroll-behavior="smooth"`; it is not a test failure or Phase 4 behavior regression. Deterministic screenshots remove development portals, animations and caret variance.

## Visual artifacts

The candidate includes 64 Darwin baselines plus three focused visual specs:

- Identity: paired login, invalid registration, verification waiting/invalid, recovery and reset; 320px representatives; 640×720 zoom proxy; System effective Light/Dark; forced colours.
- Plan/Workspace: paired plan desktop/tablet/320/zoom, System and forced colours; authenticated create, ready and chooser desktop/mobile.
- Invitations: paired preview desktop/tablet/320/zoom; acceptance desktop/mobile; forced colours; unavailable and capacity states.

The specs assert shared website containment, semantic selection, focus visibility and contrast, exact Admin/Member boundaries, server preference/effective theme, and no horizontal overflow. Graphics must still review and accept the committed baselines; generation is not self-acceptance.

## Integration instructions

Review the immutable candidate tip produced by the report commit, then merge/cherry-pick the Phase 4 series in the order above after Architecture and Graphics acceptance. Preserve backend prerequisite `1baa5db` and all imported authority commits. Do not deploy directly from this Dev1 branch. No migration was added.
