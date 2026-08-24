# Nexa Spectrum Phase 1–2 backend/security contract

Date: 2026-08-23  
Graphics authority: `f9ecd346a69d4f4865d869096274acc6cbc11f7f`  
Reviewed base: `origin/main` at `7a146fef9c0abe05561ec699d52a480732cd86ad`  
Scope: Phase 1 foundation and Phase 2 authenticated shell only; no integration or deployment

## Decision and bounded change

Nexa Spectrum Phase 1–2 remains presentation-only except for one response-header correction at the shell data boundary. `/api/workspaces/selectable` supplies active-Membership Workspace names, Roles, Membership identifiers, and current-selection state to the authenticated shell, while `/api/**` bypasses the document Proxy. Its success and authentication-denial responses now explicitly emit `Cache-Control: private, no-store`. Workspace-switch success, CSRF/Origin rejection, and service denial responses use the same private response boundary.

No schema, migration, Session, identity, Membership, Role, entitlement, preference, password, reset-token, Audit, rate-limit, outbox, or Workspace-selection logic changed.

## Exact contract for Dev1

### Theme and first paint

- Root layout remains the only appearance authority before hydration. It validates the configured opaque Session and reads only the authenticated User's global allowlisted `light | dark | system` preference. Missing, stale, invalid, expired, unavailable, or anonymous state resolves to `system` without disclosing Session validity or Workspace state.
- Initial HTML carries `data-theme-preference`; `system` is resolved by the nonce-authorized bootstrap from `prefers-color-scheme`. Browser storage may be updated only after a successful preference save and must never override initial server authority.
- Immediate preview remains client-only until the versioned preference API succeeds. Failure restores the last confirmed server value. Do not create a second appearance resolver in the new shell.
- Public routes use anonymous `system` resolution. Authenticated and public shells must share the same semantic theme attributes and `color-scheme`, without route-specific theme authority.

### CSP and cache boundary

- `src/proxy.ts` creates one nonce per document request, forwards it as `x-nonce` and request CSP, and sets the identical response CSP. The fixed pre-paint script receives that nonce. Production `script-src` must contain neither `unsafe-inline` nor `unsafe-eval`.
- Any document carrying the trimmed configured `SESSION_COOKIE_NAME` is `private, no-store` before Session validation, including stale/invalid cookies. Anonymous documents remain unclassified and reveal no authentication result. Do not replace this configured-cookie rule with a hardcoded cookie or path-only classification.
- Caddy remains defense in depth for protected document families. It does not replace application classification and must not overwrite the nonce CSP.
- Account profile/preferences/password responses retain their existing shared `private, no-store` success and failure boundary.
- Workspace-choice and switch API responses now retain `private, no-store` on success and denial. Dev1 should continue client `fetch(..., { cache: "no-store" })`; client fetch policy is defense in depth, not a substitute for the response header.

### Authenticated shell data

- Shell Workspace name and effective Role are derived server-side from the trusted Session's active Workspace, active Membership, and persisted Workspace Role. Navigation visibility is presentation only and never authorization.
- The selectable endpoint returns only active Workspaces reached through active Memberships. A path, query, body, browser cache, theme value, or shell state cannot select a tenant.
- Switching retains exact Origin/CSRF validation, idempotency key, tenant-safe denial, response-loss replay, opaque cookie rotation, success/denial Audit, and current-selection preservation on failure.
- Do not add User IDs, Session IDs, entitlement internals, cross-Workspace records, or hidden authorization claims to client shell props. Search and Create affordances must remain truthful: no server capability should be implied before its Product/backend contract exists.

### Protected invariants

- Account API authentication/privacy and typed preference versioning remain unchanged.
- Password change/reset lock order, recent authentication, reset-token supersession, all-Session/security-version revocation, singular committed success Audit, concurrency responses, retry safety, and late-failure rollback remain unchanged.
- Workspace authority, RBAC, Ownership/Team/Visibility, entitlements, tenant-safe denial, Audit attribution, and rate-limit dimensions remain service/data-layer decisions. Shell refactoring cannot move them into client state or Proxy.
- Local/UAT environment banners and disabled-provider language remain truthful while their conditions hold. Phase 1–2 does not enable OIDC, billing, global search, integrations, notification subscriptions, or new Create operations.

## Verification plan

1. Diff guard: no schema/migration, identity, password, Audit, rate-limit, entitlement, outbox, or Workspace service query changes.
2. Unit/direct: semantic token/contrast/focus states; theme bootstrap; configured custom-cookie and stale-cookie classification; CSP nonce equality and corrupt-nonce blocking; Workspace response private/no-store on success and denial; CSRF/cross-origin switch rejection.
3. PostgreSQL: existing account preference stale-write/rollback/Audit matrix; password/reset deterministic concurrency orders and late-failure rollback; Workspace selection authority, response-loss replay, cross-tenant denial, and Audit attribution.
4. Production runtime: anonymous and configured stale-cookie documents; Light/Dark/System authenticated first paint; matching CSP/bootstrap nonce; no unsafe production script directives; account and Workspace API success/denial cache headers; Caddy response preservation.
5. Browser/visual: paired Light/Dark and System/no-flash evidence for public and authenticated shells; theme save failure rollback; Workspace switch/Back/two-tab reconciliation; role-aware navigation; drawer focus entry/Escape/return; keyboard focus; 44px targets; 320px, 200% zoom, reduced motion, forced colours, and hydration/CSP console cleanliness.
6. Gate: diff check, lint, TypeScript, direct/unit, serialized isolated PostgreSQL suite, migration apply/rerun, production build, focused/full supported Playwright and paired baselines, production dependency audit, and header inspection before Architecture/Graphics review.

Integration should take this bounded header commit before or with Dev1's immutable Phase 1–2 candidate. Do not deploy this branch directly.
