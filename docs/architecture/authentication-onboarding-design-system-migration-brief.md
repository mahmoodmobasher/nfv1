# Authentication and Onboarding design-system migration Architecture brief

Date: 2026-08-23  
Baseline: `v0.4.0-uat.1` / application `e58c22a11e8239f65936542ce75ff73963fb99c1`  
Scope: bounded visual migration of public Authentication and authenticated Onboarding routes onto the accepted Design System Stage 1–2 foundation  
Status: **AUTHORIZED FOR BOUNDED IMPLEMENTATION — dependencies and gates below apply**

## Decision

No material Architecture blocker prevents implementation if this remains a presentation and route-composition migration. It must not redesign identity protocols, Session authority, token semantics, Workspace provisioning, invitation authorization, Audit taxonomy, rate limiting, entitlements, or the global User/Workspace boundary.

The implementation boundary is:

- public entry and identity routes: `/select-plan`, `/register`, `/verify-email`, `/login`, `/forgot-password`, and `/reset-password`;
- authenticated onboarding routes: `/workspace/create` and `/workspace/ready`;
- the token-facing invitation entry/acceptance journey only where needed for coherent Authentication handoff;
- shared onboarding shell, form, loading, error, and status presentation used by those routes.

Workspace administration, invitation creation/management, Workspace switching, CRM, Personal settings, real Google OIDC, billing, and legacy-style deletion outside migrated consumers remain separate stages.

## 1. Theme, first paint, CSP, and rendering

1. Every migrated document must retain the accepted root theme contract: authenticated global User preference is server authority; anonymous or invalid/stale Session state resolves safely to `system`; System alone consults `prefers-color-scheme`.
2. Authentication transitions must use a full document navigation when establishing, rotating, or revoking the HttpOnly Session. The destination response then resolves the authoritative preference before paint. A legitimate anonymous-System to authenticated-preference change is not a flash and must not be hidden with client-stored authority.
3. Browser theme cache remains presentation-only reconciliation after hydration. It must not establish identity, Session, onboarding, Workspace, Membership, Role, or entitlement state and must not override authenticated first paint.
4. Retain the fixed `beforeInteractive` bootstrap, per-response nonce, matching CSP, `strict-dynamic`, and the production prohibition on `unsafe-inline` and `unsafe-eval`. Migrated components must not add inline handlers, unnonced executable scripts, third-party script/style origins, or style injection that weakens CSP.
5. Server HTML and the bootstrap must agree on `data-theme-preference`; the bootstrap may only resolve the effective Light/Dark value. Hydration must not replace server-authored security, commercial, or onboarding facts with browser defaults.
6. Loading UI, route errors, verification/reset states, dialogs, portals, and any invitation handoff must consume the same semantic tokens in both themes. No route-local literal palette may become a second theme system.
7. Preserve the System media-query listener lifecycle: one listener only while the effective preference is `system`, removed on explicit preference and unmount.

## 2. Cookie and cache privacy

- Preserve the configured `SESSION_COOKIE_NAME`; Session and OIDC verifier/return cookies remain `HttpOnly`, `SameSite=Lax`, path-bounded where applicable, time-bounded, and `Secure` under HTTPS. Client code must never read or mirror them.
- Every document containing or resolving a Session cookie remains `Cache-Control: private, no-store`, including stale/invalid configured cookies. Keep the application cookie-aware rule and Caddy protected-route rule as independent controls.
- `/verify-email`, `/reset-password`, and invitation-token documents must be `private, no-store` even when no Session cookie exists. Token query strings must not enter page metadata, logs, Audit, analytics, browser storage, error text, React keys, or outbound URLs. Capture only for the bounded POST and remove from visible history as soon as the client can do so safely.
- Identity, onboarding, provisioning, Session, and invitation APIs must return `Cache-Control: private, no-store` on success and every error/denial path. Responses influenced by cookies must not be shared-cacheable; retain appropriate `Vary` behavior at the application/edge boundary.
- Anonymous non-token marketing/plan documents may remain cacheable only if they contain no Session-derived content and their per-response CSP/nonce behavior is proven through the actual edge. Authentication form documents should default to no-store for this increment.

## 3. Identity and onboarding semantics

### Registration and verification

- Registration creates a global pending User, password credential, onboarding record, verification token/outbox, and pre-Workspace Audit only. It creates no Workspace, Membership, Role assignment, trial, or entitlement.
- Preserve generic conflict/rate-limit behavior. UI success must not reveal whether an email already exists.
- Verification tokens remain hashed, purpose-bound, single-use, expiring, and invalid after replacement/consumption. Resend returns the same generic accepted state and invalidates older authority.
- Plan/cadence arriving from the browser is onboarding intent only. The server persists and later revalidates it against the effective catalog; displayed prices or limits are never authority.
- Published Terms/Privacy acceptance is not established by this visual migration. Until Product/Legal supplies policy versions and a persistence contract, copy must not claim durable legal consent beyond the existing UAT boundary.

### Login, recovery, and redirects

- Login keeps generic invalid-credential behavior and rotates/replaces Session authority. The client must follow the server-derived destination: no active Workspace → `/workspace/create`; selected valid Workspace → `/crm/home`; multiple valid Workspaces without a selection → `/workspace/switch`.
- A caller-provided `next` may be honored only through an exact same-origin relative-path allowlist and only after the destination independently re-resolves current Session, onboarding, Active Workspace, and Membership authority. Reject scheme-relative, absolute, encoded-host, backslash, control-character, and recursive authentication targets. Never use an untrusted URL directly in a redirect.
- Password-reset request remains enumeration-safe. Reset completion keeps generic invalid/expired/used behavior, the accepted per-User serialization, transactional password/token/security-version/Session/Audit state, all-Session revocation, and fresh-login requirement.
- Verification/recovery failure, retry, Back, refresh, and duplicate-submit states must not imply success or retain a password/token. Safe non-secret form drafts may survive a retry; secrets may not.

### Invitations

- `/invite` is currently a client-only preview. It must not be restyled or linked from Workspace-ready as though it sends or authorizes invitations. For this migration, route an authorized Owner/Admin to the accepted server-backed `/workspace/settings/invite` journey, or omit the action. Do not blend preview state with persisted Workspace invitation state.
- Invitation acceptance remains an authenticated, verified-email, token-bound Workspace operation. It must preserve generic invalid/expired/revoked/consumed handling, current seat/entitlement enforcement, current inviter/role/team rules, existing-active Membership preservation, safe reactivation, idempotency, transactional Audit/outbox behavior, and trusted Active Workspace selection after acceptance.
- If authentication interrupts invitation acceptance, preserve only an opaque return intent through a bounded server-controlled mechanism. Do not store the raw invitation token in `localStorage`/`sessionStorage`, place it in Audit, or accept a client-selected Workspace as the return authority.

## 4. OIDC disabled and error paths

- UAT keeps `OIDC_MODE=disabled`. The server must derive provider availability. Disabled OIDC controls are absent; a visible control leading to a 404 is not acceptable.
- Fixture OIDC may appear only in explicit non-production fixture mode and must remain labelled as a local fixture, never Google production authentication. Production environment validation continues to forbid fixture mode.
- Start, callback, and fixture endpoints remain 404 while disabled. Direct access must fail closed without creating User, credential, Session, onboarding, Workspace, Audit success, or trial state.
- Enabled fixture cancellation/protocol/link-conflict errors return to a fixed safe login/onboarding destination with bounded public copy. State, nonce, PKCE, exact redirect allowlist, issuer, audience, signature, expiry, provider `sub`, verified-email, one-time consumption, and proof-based linking remain unchanged.
- Provider error details, claims, codes, tokens, verifier cookies, emails, and collision facts must not reach URLs beyond bounded status codes, UI copy, logs, or Audit metadata.

## 5. Server/client and Workspace boundaries

Server components/services own:

- Session and active-User resolution;
- authenticated theme preference and OIDC availability;
- current onboarding step and resumable destination;
- active/effective plan catalog and persisted selection;
- Workspace provisioning eligibility and result;
- Active Workspace, active Membership, Role, invitation/seat authority, and redirect destination.

Client components may own field drafts, accessible validation presentation, pending state, focus, password visibility, and mutation invocation. Query parameters, `sessionStorage`, localStorage, cached theme labels, plan cards, progress indicators, and optimistic UI never establish the server facts above.

Workspace creation retains its accepted single transaction: locked eligibility and catalog validation; Workspace and system Roles; exactly one initial active Owner Membership; default stages; entitlement/trial; activation; onboarding completion; Session Active Workspace; two success Audits; outbox; and idempotency outcome. Same-key replay is stable, different-input reuse conflicts, different keys serialize, and failure commits nothing.

## 6. Rate limiting and Audit

- Preserve trusted mutation origin plus CSRF enforcement on every POST. Visual refactoring must continue using the shared protected request helper.
- Preserve network and normalized subject/destination dimensions for registration, verification/resend, login, reset request/completion, OIDC, invitation acceptance, and provisioning where currently contracted. Rate-limit outcomes must remain enumeration-safe and must not expose raw email, token, IP, proxy header, or foreign-resource data.
- Significant committed identity/provisioning/invitation mutations retain their canonical Audit owner and transaction boundary. Visual events, page views, validation typing, theme resolution, and failed client-only checks do not create success Audit.
- Preserve bounded denial ownership without duplicate route/service events. Audit payloads prohibit passwords, emails unless explicitly minimized by contract, tokens/hashes, cookies, provider assertions, raw IPs, request bodies, and foreign-Workspace facts.

## 7. Rollout and rollback

1. Roll out by route family: shared non-mutating shell primitives; login/recovery; registration/verification; plan/Workspace creation/ready; invitation handoff. Each family must pass its focused security and browser gate before the next.
2. Do not delete legacy selectors or compatibility aliases until all in-scope consumers and error/loading states are migrated and the complete regression gate passes.
3. No schema migration is expected. Any proposed identity, token, Session, onboarding, invitation, plan, Workspace, Audit, or entitlement schema change requires a separate Architecture review.
4. Application rollback must be an immutable prior-image switch. It must not revert migration `0011`, delete global User preferences, change stored theme choices, edit migration history, or mutate identity/Workspace data.
5. Keep changes separable from provider enablement, legal-policy persistence, real billing, and invitation administration redesign so any of those dependencies can remain deferred without blocking visual rollback.

## 8. Acceptance evidence

Required before integration:

- boundary/unit tests for configured Session-cookie privacy, all identity/onboarding API cache headers on success and denial, nonce/CSP positive and negative behavior, OIDC mode visibility, and redirect allowlisting;
- PostgreSQL regressions for registration/verification/resend enumeration safety and replacement, login/session rotation, reset single-use/concurrency/rollback, persisted plan validation, provisioning replay/conflict/concurrency/rollback/sole Owner, and invitation acceptance/replay/seat/cross-tenant behavior;
- browser journeys in Light, Dark, and System for registration → verification → login → Workspace provisioning → ready → protected entry; login resume for zero/one/multiple Workspace states; recovery → all-Session revocation → fresh login; disabled OIDC UI/direct endpoints; invitation authentication handoff and acceptance;
- first-paint inspection on direct entry, refresh, post-login, post-logout, verification/recovery links, browser Back, and Workspace transition, with no wrong-theme flash or hydration warning;
- proof that token-bearing documents and every authenticated or stale-cookie document are private/no-store and that token values are absent from logs, Audit, storage, rendered errors, and outbound navigation;
- keyboard, focus-summary/link, status/alert, password reveal, disabled/busy duplicate-submit, 44px, 320px, 200% zoom, forced-colors, reduced-motion, and WCAG 2.2 AA checks in both themes;
- full unit/direct-route suite, serial PostgreSQL suite, Playwright suite, ESLint, TypeScript, production build, migration apply/rerun, Caddy validation, and production-response nonce/cache inspection.

## 9. Dependencies and blockers

### Must close in the implementation candidate

1. Replace or remove the Workspace-ready link to the browser-only `/invite` preview. It cannot be presented as the accepted invitation system.
2. Make OIDC control visibility server-derived so disabled UAT has no dead provider action while direct endpoints remain 404.
3. Make login consume the server-derived destination, with any `next` intent constrained by the redirect contract above.
4. Add explicit no-store coverage for token-bearing documents and all identity/onboarding API outcomes; the configured-cookie proxy rule alone does not cover anonymous token pages.

### External/deferred dependencies

- Product/Graphics: exact in-scope screen compositions and provider-neutral copy; no semantic journey change through design alone.
- Product/Legal: published Terms/Privacy versions and durable consent policy, if NexaFlow wishes to claim acceptance.
- Vendor/Operations: real Google adapter, project, credentials, consent screen, canonical domains, and exact redirects. Not required while OIDC remains disabled and absent from UI.
- Billing/Product: authoritative pricing and post-provision plan lifecycle. The migration may display the accepted UAT catalog but cannot claim connected billing or upgrades.
- Email Operations: current Resend UAT boundary remains; generalized deliverability and bounce/complaint reconciliation are not part of this visual increment.

These dependencies do not block bounded local implementation except where the candidate makes the corresponding deferred capability visible or claims it as operational.
