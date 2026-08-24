# Nexa Spectrum Phase 4 Architecture gate

Date: 2026-08-23

Proposed baseline: Nexa Spectrum combined candidate `b7d3d1e742a90b8ac0475042cb2848e46002608d`

Related authority: `docs/architecture/authentication-onboarding-design-system-migration-brief.md`

Scope: plan selection; registration and verification; login; disabled/fixture OIDC states; recovery and reset; Workspace create, select, and ready; invitation preview and acceptance; centralized website presentation configuration

## Decision

**REJECT PHASE 4 START — one prerequisite gate remains open.**

The Phase 3 candidate is still rejected on a material P2 full-browser determinism finding in `c26cb59`. Phase 4 must not broaden the same branch until Dev1/QA records a bounded causal correction and a clean immutable 37/37 Playwright run. This is a sequencing and release-evidence blocker, not a request to redesign Phase 4.

Once that prerequisite closes, **Phase 4 implementation is authorized under the guardrails below**. The current Phase 4 code gaps listed in this brief are intended implementation requirements; they do not require new identity protocols or schema work unless the implementation departs from the accepted contracts.

P0: none.

P1: none.

P2: unresolved Phase 3 aggregate Playwright gate.

P3: none that prevents bounded implementation after P2 closure.

## 1. Bounded Phase 4 resource and route contract

Phase 4 is a visual composition and truthful-state migration for:

- `/select-plan`, `/register`, `/verify-email`, `/login`, `/forgot-password`, `/reset-password`;
- OIDC disabled, fixture-enabled, cancellation, protocol-failure, and link-conflict presentation at the fixed authentication destinations;
- `/workspace/create`, `/workspace/switch`, and `/workspace/ready`;
- `/invite` only as an unmistakable non-persistent preview if Product retains it;
- `/workspace/invitations/accept` and any bounded authentication handoff needed to resume it;
- their loading, error, empty, busy, invalid, expired, Back/refresh, mobile, forced-colours, and reduced-motion states.

It must not alter password/OIDC protocols, token authority, Session semantics, Workspace/Membership/Role authorization, plan or entitlement authority, invitation administration, Audit taxonomy, email delivery architecture, billing, or production provider enablement.

## 2. Centralized `.experience-website` configuration

- Every migrated public/authentication/onboarding surface must enter the centralized `.experience-website` presentation boundary through one shared server-rendered wrapper or layout. Do not scatter the class among individual client states.
- `.experience-website` remains a thin experience selector over the canonical Spectrum foundation. It may select semantic canvas and text roles; it must not define a second palette, theme, font family, spacing scale, radii, elevations, component states, or raw colour literals.
- Components consume canonical `--nx-*` semantic roles or approved `--nf-*` compatibility aliases. Route files must not branch CSS on Light/Dark, redefine tokens, inject styles, or reintroduce evergreen/coral/beige literals.
- Public/auth/onboarding composition may differ from `.experience-product`, but theme authority, typography source, focus rules, controls, alerts, dialogs, and accessibility states remain shared.
- Boundary tests must enumerate every Phase 4 consumer and reject raw colours, route theme selectors, token declarations, font overrides, raw radii/elevation, and new legacy selectors after the Phase 4 marker.

## 3. Theme, CSP, SSR, and first paint

- Preserve the accepted root contract in `b7d3d1e:src/app/layout.tsx`: authenticated global User preference is server authority; anonymous, missing, stale, or invalid Session resolves safely to `system`; System alone consults `prefers-color-scheme`.
- Retain the fixed `beforeInteractive` bootstrap, per-response nonce, matching `strict-dynamic` CSP, production prohibition on `unsafe-inline`/`unsafe-eval`, self-hosted/bundled Inter, and one System media listener only while System is effective.
- Server HTML and bootstrap must agree on `data-theme-preference`. Browser cache is presentation-only and cannot establish identity, onboarding, plan, Workspace, Membership, Role, invitation, or entitlement state.
- Session establishment, rotation, revocation, verification completion, reset completion, Workspace provisioning, Workspace selection, and invitation acceptance must use a full document transition wherever new HttpOnly or server authority must be observed before paint.
- A legitimate anonymous-System to authenticated-preference transition is not a flash. Do not conceal it by trusting local storage over the server.
- Loading, error, token, OIDC, Workspace, invitation, dialog, and portal states must render under the same nonce/theme contract without hydration replacement of server-authored facts.

## 4. Cookie, cache, referrer, and token privacy

- Preserve configured `SESSION_COOKIE_NAME` handling. Any document carrying that cookie—including stale/invalid values—remains `Cache-Control: private, no-store`. Anonymous documents disclose no Session-validity header.
- `/verify-email`, `/reset-password`, and invitation-token documents must be `private, no-store` even without a Session cookie. Set `Referrer-Policy: no-referrer` on token-bearing responses; CSP `referrer no-referrer` may be retained as defense in depth if adopted consistently.
- Identity, onboarding, Workspace provisioning/selection, Session, and invitation APIs return `Cache-Control: private, no-store` on success and every validation, mutation-guard, authentication, rate-limit, conflict, and unexpected-error path.
- Raw verification, reset, invitation, OIDC state/code, nonce, PKCE verifier, and Session values must not enter metadata, logs, Audit, analytics, browser storage, React keys, error text, or outbound navigation.
- A token page may capture its token for one bounded mutation, then must remove it from visible browser history with `history.replaceState` or an equivalent safe server-controlled transition without persisting it. Back/refresh after completion must not replay authority.
- OIDC verifier/return cookies remain HttpOnly, SameSite=Lax, HTTPS-Secure, short-lived, and path-bounded. Client code must never read or mirror them.

## 5. Identity, OIDC, Session, and redirect guardrails

### Registration and verification

- Registration creates a global pending User, password credential, onboarding record, hashed verification token/outbox, and pre-Workspace Audit only. It creates no Workspace, Membership, Role, subscription, trial, or entitlement.
- Registration, resend, and recovery remain enumeration-safe. Existing email, inactive identity, rate limit, and delivery eligibility must not be distinguishable through status, timing, copy, or metadata beyond the accepted bounded response.
- Verification tokens remain hashed, purpose-bound, single-use, expiring, and invalid after replacement or consumption. Successful verification activates identity only; Workspace provisioning remains explicit and separate.
- Do not claim durable Terms/Privacy acceptance until Product/Legal provides published versions and an accepted persistence contract. A required checkbox cannot assert acceptance of unpublished policies.

### Login and redirect destination

- Login must consume the server-returned destination already produced by the API: no active Workspace routes to creation/recovery, a valid selected Workspace routes to protected CRM, and multiple active Memberships without selection route to the chooser.
- Client code must not hardcode `/workspace/create` after login.
- Any caller `next` intent requires an exact, same-origin relative-path allowlist and destination reauthorization. Reject absolute, scheme-relative, encoded-host, backslash, control-character, recursive-auth, and token-bearing destinations.
- Successful login rotates/replaces Session authority and uses the configured HttpOnly cookie. Failed login remains generic; it must not reveal account status, provider linkage, verification, Workspace count, or Membership state.

### OIDC

- UAT/production remains `OIDC_MODE=disabled`. Provider controls must be absent when disabled; direct start, callback, fixture, and recent-auth fixture routes remain 404 and create no User, credential, Session, onboarding, Workspace, Audit success, or trial.
- Fixture OIDC appears only in explicit local fixture mode and is labelled local/non-production—never as real Google. Production configuration continues to reject fixture mode.
- Cancellation, protocol failure, replay, expiry, and link conflict return to fixed safe destinations with bounded generic copy. Preserve state, nonce, PKCE, exact redirect allowlist, issuer/audience/signature/expiry, verified-email, provider-subject, one-time consumption, and proof-based linking.
- Provider details, collision facts, claims, emails, codes, tokens, and verifier values never reach public errors, unsafe redirects, logs, or Audit metadata.

### Recovery and reset

- Reset request remains enumeration-safe and rate-limited. Reset completion preserves the accepted per-User lock ordering and one transaction for credential, replacement of all active reset tokens, security-version change, Session revocation, success Audit, and rollback.
- Invalid/expired/replaced/used reset states are generic. Completion requires a fresh login and must not leave the new password, confirmation, or token in client state, storage, history, or retry drafts.

## 6. Canonical subscription and tenancy policy

The following Product decision is authoritative for Phase 4 copy, server decisions, and acceptance evidence:

1. One self-service subscription provisions and entitles exactly one Workspace for one company.
2. The verified registrant becomes the sole initial Owner. `owner` is a distinct persisted Role, not an Admin label.
3. Included seats are total active Workspace Memberships and include the Owner. A five-seat plan means one Owner plus at most four other active Admins/Members.
4. Normal invitations may assign `admin` or `member`, never `owner`. The Owner retains subscription and governance control; ownership changes only through the dedicated recent-authenticated transfer transaction.
5. Ordinary Operations, Marketing, Customer Service, Sales, and similar groups use Teams/RBAC/Ownership/Visibility inside the same Workspace.
6. Additional company Workspaces require separately authorized premium Enterprise provisioning and are not sold by any public self-service plan. Enterprise remains Contact Sales.
7. A global User may hold active Memberships in multiple Workspaces—for example through invitations or an Enterprise deployment. Therefore one Workspace per subscription must never be implemented as one Membership per User.
8. The chooser switches among existing server-authorized Memberships. It cannot create a Workspace, grant Membership, assign Role, increase seats, or establish entitlement.

Current local/UAT code has no production billing provider or durable Subscription aggregate. Until separately designed, the persisted onboarding plan plus Workspace entitlement snapshot represents plan intent and enforcement, not proof that money was collected. Phase 4 copy must continue to state that billing is not connected and must not call the flow a completed purchase.

Workspace provisioning retains one transaction: locked verified-User/onboarding eligibility and effective catalog validation; one Workspace; Owner/Admin/Member Role definitions; exactly one initial active Owner Membership; default stages; entitlement snapshot with Owner counted in active seats; trial; activation; onboarding completion; Session Active Workspace; success Audits; outbox; and idempotency result. Failure commits none of them.

The existing per-User onboarding record prevents a second ordinary self-provisioning transaction after `workspace_id` is set. Phase 4 must preserve that control. Enterprise provisioning, Subscription ownership, billing lifecycle, upgrades/downgrades, proration, and commercial multi-Workspace limits require a separate Product/Architecture contract and must not be simulated through browser flags or plan query parameters.

## 7. Workspace and invitation journeys

- `/workspace/create` is available only to a verified authenticated User with incomplete eligible onboarding and no provisioned self-service Workspace. Browser plan/cadence/name values are input only; the server revalidates persisted selection and effective catalog.
- `/workspace/ready` displays only the Session-selected, active, authorized Workspace and its server-derived plan/Owner facts. It cannot infer the earliest Membership or a browser Workspace value.
- `/workspace/switch` lists only active Workspaces reached through active Memberships, with persisted effective Role and current marker. Zero/one/multiple behavior remains server-controlled. A failed or stale switch preserves the previous valid selection; success rotates Session authority, audits, and reconciles other tabs on next request.
- Workspace selection never changes subscription ownership or entitlement and never enables Workspace creation.
- `/invite` remains a clearly labelled client-only demonstration if retained. It must not claim that email, Membership, seat, Role, or Audit state was persisted and must not be presented as the operational post-provision action.
- Workspace-ready should route an authorized Owner/Admin to `/workspace/settings/invite`, or omit the invitation action. Do not blend preview and operational invitation state.
- Invitation acceptance remains authenticated, verified-email-bound, single-use, entitlement/seat checked, Role constrained to Admin/Member, idempotent, transactional, and audited. Existing active Membership acceptance preserves Role, Teams, status, version, and Owner truth; suspended/removed reactivation uses the existing Membership and locks capacity.
- If authentication interrupts acceptance, preserve only a bounded server-owned return intent. The raw invitation token must not be stored in local/session storage or accepted as Workspace authority.

## 8. CSRF/origin, rate limits, email, and Audit

- Every mutation continues through the shared CSRF plus trusted-Origin guard. Missing/cross-origin requests fail before business work and receive private/no-store responses.
- Preserve the accepted rate-limit dimensions for registration, verification/resend, login, reset request/completion, OIDC, provisioning, Workspace selection, and invitation acceptance. Trusted-proxy input is accepted only with the configured internal secret; raw IP/email/token data is not returned or audited.
- Verification, recovery, and invitation email remains outbox-owned. UI success means queued/accepted according to the existing generic contract, not delivered. Local Mailpit and UAT Resend truth remain environment-specific; generalized bounce/complaint delivery is deferred.
- Significant committed identity, Session, Workspace, Owner, selection, and invitation mutations retain their canonical Audit owner and transaction boundary. Client validation, theme changes, page views, preview invitations, and visual state never create success Audit.
- Audit excludes passwords, raw emails except an explicitly approved minimization, tokens/hashes, cookies, provider assertions, raw IPs, request bodies, and foreign-Workspace facts. Denial events remain bounded and non-duplicative.

## 9. Current implementation gaps to close

| ID | Current gap at `b7d3d1e` | Required Phase 4 result |
|---|---|---|
| P4-01 | `.experience-website` exists in the foundation but onboarding/public wrappers do not apply it. | One shared server-rendered website boundary; no route-local theme system. |
| P4-02 | `GoogleUnavailable` always renders a local fixture link; availability is not server-derived. | Hide provider UI while disabled; show truthful fixture-only UI locally; retain direct 404 fail-closed behavior. |
| P4-03 | `LoginForm` ignores API `next` and always navigates to `/workspace/create`. | Navigate only to the validated server-derived destination. |
| P4-04 | Cookie-aware proxy privacy does not cover anonymous verification, reset, or invitation-token documents; no explicit token-page `Referrer-Policy` exists. | Private/no-store plus no-referrer on every token document and state, with positive/negative tests. |
| P4-05 | Verification/reset/invitation tokens remain in the visible URL; invitation token is passed directly into a client component. | Bounded capture, history removal, no storage/log/Audit/outbound leakage, and replay-safe Back/refresh behavior. |
| P4-06 | Identity/onboarding APIs return plain `NextResponse.json`; private/no-store is not centralized across success and early denial. | Central private response boundary covering mutation guard, validation, auth, rate limit, success, and unexpected failure. |
| P4-07 | Workspace-ready links to `/invite`, a sessionStorage-only preview. | Link to the authorized server-backed invitation route or omit; keep preview unmistakably non-operational if retained. |
| P4-08 | Public plan/summary copy says only “includes N users”; it does not state one Workspace or that Owner consumes a seat. | Truthful copy: one self-service Workspace, sole initial Owner, total active seats including Owner, Enterprise Contact Sales for additional Workspaces. |
| P4-09 | Plan UI uses client constants while the server catalog is authority. | Client selection remains intent; server-render or reconcile display with active catalog and revalidate on registration/provisioning. Never trust browser price/seat values. |
| P4-10 | Registration requires agreement to Terms/Privacy marked pending publication, with no accepted versioned-consent persistence. | Remove the claim/requirement or obtain Product/Legal contract and separate persistence review. |
| P4-11 | Post-plan copy implies plan changes as the team grows although production billing and post-provision changes are deferred. | Preserve explicit billing-disconnected language and avoid promising operational upgrades/downgrades. |
| P4-12 | Full branch Playwright gate is unresolved at Phase 3. | Close `c26cb59` before Phase 4 work begins on the branch. |

P4-01 through P4-11 are mandatory candidate acceptance items. P4-12 is the sole start blocker.

## 10. Rollout, rollback, and legacy boundary

Implement only after P4-12 closure, then stage in this order:

1. shared `.experience-website` wrapper, semantic primitives, token-page headers, and server provider configuration;
2. login and recovery/reset;
3. registration and verification;
4. plan selection and Workspace create/ready/switch;
5. invitation preview separation and authenticated acceptance handoff.

Each stage must retain legacy compatibility selectors until all of its normal, loading, error, and token states pass. Phase 4 must not delete Phase 1–3 aliases or migrate Phase 5 administration/settings consumers incidentally.

Rollback is an immutable prior-image application switch. Keep Phase 4 commits separable by the route families above. Rollback must not revert database migrations, delete User preferences, change stored theme choices, rewrite identity/token/Session/Workspace data, revoke valid Memberships, or alter entitlement snapshots. Real Google, billing, legal consent, and Enterprise provisioning remain separate increments so they cannot obstruct a visual rollback.

## 11. Required acceptance evidence

- Boundary/unit tests for `.experience-website` centralization, semantic-only Phase 4 CSS, provider-mode visibility, configured Session-cookie privacy, token-document no-store/no-referrer, API private/no-store on every path, redirect allowlisting, CSP nonce positive/negative behavior, and token URL cleanup.
- PostgreSQL regressions for registration/verification/resend enumeration and replacement; login rotation; reset single-use/concurrency/rollback/all-Session revocation; catalog persistence/revalidation; one-self-service-Workspace eligibility; provisioning replay/conflict/concurrency/rollback/sole distinct Owner/seat snapshot; Workspace selection; and invitation acceptance replay/seat/role/reactivation/cross-tenant behavior.
- Explicit tenancy proof that a five-seat entitlement counts the Owner plus at most four other active Memberships; invitations cannot grant Owner; a completed onboarding User cannot self-provision another Workspace; the same global User can accept a legitimate Membership in another Workspace; the chooser neither creates nor entitles.
- Browser journeys in Light, Dark, and System: plan → registration → verification → login → Workspace creation → ready → CRM; login with zero/one/multiple Workspace states; disabled OIDC UI and direct endpoints; fixture cancel/protocol failure locally; recovery → all-Session revocation → fresh login; Workspace chooser stale/switch/two-tab behavior; invitation authentication handoff, acceptance, seat denial, replay, and preview separation.
- First-paint/SSR inspection on direct entry, refresh, post-login/logout, verification/reset/invitation links, Back, Workspace creation/selection, and OS theme change: no wrong-theme flash, hydration warning, token leakage, or client override of authority.
- Accessibility evidence for logical H1/focus order, error summary links, status/alert announcements, password reveal, disabled/busy duplicate-submit, modal/overlay isolation, 44px targets, 320px, 200% zoom, forced colours, reduced motion, and WCAG 2.2 AA in both themes.
- Complete lint, TypeScript, unit/direct-route, serialized PostgreSQL, production build, migration apply/rerun, full Playwright, baseline review, production nonce/cache/referrer inspection, Caddy validation, and rollback rehearsal.

No Phase 4 integration, deployment, Phase 5 broadening, provider enablement, billing claim, or Enterprise provisioning is accepted by this gate document.
