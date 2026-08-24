# Nexa Spectrum Phase 4 remediation handoff

Date: 2026-08-24

Branch: `codex/nexa-spectrum-phase4`

Remediated candidate base: `0199775781a27fcc183e7f3bfd7eed5cc2850fe8`

Implementation commit: `33d649a`

Review authorities incorporated unchanged: Architecture `7483120` as `8747564`; Graphics `937a379` as `17ca3e2`.

## Result

The mandatory Phase 4 remediation is complete in Dev1 only. It is not integrated or deployed, and Phase 5 has not started.

Architecture P4-05 now captures the exact invitation entry before HTML/RSC rendering, seals a purpose-bound 900-second HttpOnly, SameSite=Lax, Secure-in-HTTPS, path-scoped intent, and returns one 303 to the exact clean route. Capture, clean, invalid, denied, terminal, and acceptance responses remain private/no-store and no-referrer. The browser no longer receives or posts raw invitation tokens. Invalid/malformed authority clears immediately; malformed Cookie encoding fails closed; terminal success/invalid/consumed outcomes clear intent. The website completion alias accepts only the sealed intent. Raw body-token compatibility is retained only on the accepted direct `/api/invitations/accept` backend contract.

Dev2-style backend/security rereview returned **ACCEPT** after the boundary, generated-link, malformed-cookie, terminal-clearing, replay/Back, and authentication-continuation checks. The final Architecture gate still belongs to Architecture.

Graphics P1 is fixed centrally with `.website-root .plan-price b { color: var(--nx-text-strong); }`; there is no route-level Dark selector or colour literal. Computed assertions cover `$24`, `$57`, `$107`, and `Custom` against their actual card backgrounds in Light, Dark, selected/unselected, and both System-effective states. Expanded evidence also found and fixed two central website accessibility defects: low-contrast `.below` text and missing offset on a programmatically focused error summary.

The commercial/tenancy policy remains unchanged: one self-service subscription provisions one company Workspace; the verified registrant is the sole initial Owner; included seats include Owner; normal invitations assign Admin or Member only; the chooser grants no entitlement; global Users may hold legitimate Memberships in other companies; Enterprise multi-Workspace remains Contact Sales only.

## P4-01 through P4-22 evidence map

| Cell | Deterministic evidence |
|---|---|
| P4-01 | Plan selected/cadence/Owner-seat/billing-disconnected pairs at 1280, 768, 320, and 640/200% proxy; value/action/focus/overflow contrast assertions. |
| P4-02 | Registration default/filled pairs at 1280; filled pairs at 768, 320, and 640/200%. |
| P4-03 | Registration required/invalid/focused-summary pairs at 1280, 390, 320, and 640/200%. |
| P4-04 | Registration busy and recoverable provider/network-error pairs at 1280 and 320 with safe values retained. |
| P4-05 | Verification waiting/checking/verified pairs at 1280 and 390; verified representative at 320. Invitation Architecture P4-05 is separately covered by the security boundary tests. |
| P4-06 | Verification invalid/resent/delivery-failure pairs at 1280 and delivery-failure representative at 320. |
| P4-07 | Login default pairs at 1280/768/320; invalid credentials and session-expired pairs at 1280/320; focused 640/200% pair. |
| P4-08 | OIDC disabled/cancelled/failure/link-conflict/local-fixture pairs, plus 320 cancelled representative. Disabled configuration has a separate clean run. |
| P4-09 | Recovery default/invalid/busy/generic-success/service-failure pairs at 1280; invalid 320 and focused 640/200% pairs. |
| P4-10 | Reset valid/validation/invalid-link/success pairs at 1280/320 and focused 640/200% pair. |
| P4-11 | Workspace create default pairs at 1280/768/320/640 and busy pairs at 1280/320. |
| P4-12 | Entitlement-used and recoverable-failure pairs at 1280/320 with name and plan truth retained. |
| P4-13 | Workspace ready pairs at 1280/768/320/640. |
| P4-14 | Legitimate multi-Membership chooser pairs at 1280/768/390/320/640-focused. |
| P4-15 | Switching/failure/reload/stale reconciliation pairs at 1280/320, backed by real Membership invalidation. |
| P4-16 | Invitation preview pairs at 1280/768/320/640 with non-persistence and Admin/Member-only assertions. |
| P4-17 | Preview validation/partial/network/success disclaimer pairs plus 320 recovery representatives. |
| P4-18 | Acceptance pre/busy/success pairs at desktop and 320, pre-accept at 768, focused 640/200%, and forced-colours evidence. |
| P4-19 | Paired genuine seat-exhausted, invalid, expired, and revoked server-backed outcomes. |
| P4-20 | System effective Light/Dark pairs for plan, login at 1280/768/320, and authenticated Workspace create; saved preference remains `system`. |
| P4-21 | Forced-colours plan, login focus, registration invalid, and invitation acceptance; semantic text/boundary/focus contrast assertions. |
| P4-22 | Shared website component-state sheet pairs at desktop and 320 with actual shared controls, feedback, panels, table, focus, contrast, and reflow assertions. |

Committed Darwin baselines: 269 total — 143 identity, 81 plan/Workspace/state-sheet, and 45 invitation.

## Verification

- `git diff --check`: PASS.
- ESLint: PASS.
- TypeScript: PASS.
- Direct/unit tests: 98/98 PASS.
- Serialized PostgreSQL integration: 124/124 PASS.
- Migration apply and idempotent rerun: PASS; no migration was added.
- Next.js 16.3.1 production build: PASS; 42 pages collected and the invitation terminal route is present.
- Full supported Playwright, one worker, zero retries/quarantine: 60 PASS, one intentional OIDC-disabled configuration skip, in one clean 3.5-minute run.
- Separate `OIDC_MODE=disabled` Light/Dark cell: 1/1 PASS.
- Invitation visual stability: two consecutive 3/3 PASS runs after deterministically excluding the Next development indicator.
- Production response probes: PASS for exact 303, CSP nonce/`strict-dynamic`, no `unsafe-inline`/`unsafe-eval`, private/no-store, no-referrer, Secure/HttpOnly/Lax/path/900-second attributes, invalid intent clearing, configured stale-session privacy, and raw plus URL-encoded token absence from HTML/RSC/body/Location/Set-Cookie.
- Generated Mailpit invitation journey: PASS for token-free response/RSC, clean HTML, history, storage, sign-in/registration URLs, authenticated preview/acceptance, and terminal clearing.
- Responsive/overflow: PASS across the required 1280, 1024, 768, 640/200%, 600, 390, 360, and 320 coverage in the full and Phase 4 matrix suites.

The recurring Next development advisory about `scroll-behavior: smooth` remains informational and is not a product or test failure.

## Integration and rollback

Request focused Architecture and Graphics rereview of the immutable report tip. After both accept, integrate the Phase 4 series including `33d649a`, `8747564`, `17ca3e2`, and this report commit. Do not deploy directly from Dev1.

Rollback remains an immutable prior-image application switch. No identity, Session, Workspace, Membership, invitation, Audit, entitlement, or migration data repair is required.
