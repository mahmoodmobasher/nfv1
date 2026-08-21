# Slice 3 production-state Graphics/UX review

Status: **ACCEPT — Slice 3 Graphics/UX remediation verified**  
Review date: 2026-08-20  
Scope: local production build, light-theme onboarding, protected CRM entry, server-backed identity/workspace/logout surfaces, and still-preview-only invitation/settings/lead surfaces.  
Boundary: local source/build evidence only. No real Google, domain, deployment, Lightsail, UAT, or Caddy access was used.

## Review basis

Architect has accepted the local production foundation in `docs/architecture/slice-3-gate-review.md`. The review therefore treats the following as server-authoritative locally:

- Argon2id-backed account password registration and login
- OIDC fixture identity flow, with the fixture explicitly non-production
- Email verification and password recovery APIs
- Persisted plan/cadence selection
- Idempotent workspace provisioning and persisted initial Owner assignment
- Server-protected workspace-ready and CRM route entry
- CSRF-protected, session-revoking logout

Invitations, team administration, workspace settings mutation, and CRM lead/business data remain outside the accepted Slice 3 foundation. Their UI must remain explicitly labelled as local preview/fixture behavior and must not imply server persistence or production email/business-data authority.

## Verified acceptance areas

- `npm run build` passes with the current Next.js production build.
- Workspace creation is protected by server session resolution and posts plan/cadence plus an idempotency key to server APIs.
- Workspace-ready resolves the workspace, plan, trial, and Owner summary server-side and redirects unauthenticated users to sign-in.
- CRM route protection resolves the server session and requires an existing workspace before entry.
- Logout calls the CSRF-protected logout API, clears local demo state only after success, and replaces the browser location with the signed-out route.
- Registration, login, verification, recovery, and reset submit through server APIs rather than treating `sessionStorage` as identity authority.
- The local Google fixture is clearly marked non-production in the CTA and remains separate from the email/password path.
- Lead form errors now expose field IDs, `aria-describedby`, `aria-invalid`, and a focused error summary. Lead loading, duplicate-warning, failure-preservation, and success preview states are present.
- Invite preview includes an Add action, seat-limit messaging, partial-success/retry preview, and network-failure preview.
- Settings preview includes dynamic local workspace/plan display, an Email column, Owner protection, save loading, failure, and permission-denied preview states.

## Remediation verification

### Protected CRM mobile navigation — resolved

The corrected CRM shell renders a mobile header below 901px with a 44px trigger, light menu panel/backdrop, CRM overview, Leads, Workspace settings, and Sign out. Escape closes the menu and restores trigger focus; route selection closes the menu; the remediation evidence reports no page-level overflow at 320px; and mobile logout revokes the session before protected re-entry is attempted.

### Truthful server-backed versus preview boundaries — resolved

The shared shell now labels the local server-backed foundation separately from route-specific preview surfaces. Auth, verification, recovery, workspace creation, workspace-ready, CRM access, and logout no longer claim that account/workspace data is not sent or saved. Invite, settings, and lead routes have always-visible route-specific labels stating that their data and authorization are not persisted.

The local Google fixture remains explicitly labelled non-production. Lead CRM content remains explicitly preview-only.

### Verification, recovery, and persisted plan/cadence — resolved

User-facing labels now use account, email, and password language; Mailpit and local environment details are secondary guidance. Workspace creation reads persisted `onboarding_progress` from the authenticated server context, and query parameters/browser defaults do not provide commercial authority. Missing, invalid, completed, loading, and error states are explicit, with refresh/direct-route resume or redirect behavior derived from server state.

### Preview-only settings/invite/lead boundaries — resolved

Settings, invitation, and lead UI remain deliberately local fixture previews, with route-specific non-persistence/non-authorization banners. Their local success markers are not presented as server-backed identity, membership, or CRM records.

## Accessibility and navigation verification

- Every protected and onboarding route retains one visible H1 and route-specific title mapping after hydration.
- Error summaries focus failure and link to invalid controls; status messages are scoped to meaningful state changes.
- Back/direct-route entry resumes or redirects from server-backed state; stale query parameters and sessionStorage do not override identity/workspace authority.
- Logout failure keeps the protected screen and session intact with retry guidance; success revokes the session and prevents protected re-entry.
- At 320px, protected CRM navigation/logout are available without page-level horizontal scrolling.
- Focus rings, 44×44 px menu/icon targets, forced-colors, and reduced-motion rules remain covered by the remediation evidence.

## Acceptance decision

**ACCEPT for Slice 3 Graphics/UX.**

Develop’s remediation evidence reports `npm run test:e2e` 7/7, lint pass, unit pass, production build pass, and targeted 320px protected-CRM assertions. The previously rejected findings are closed without expanding Slice 3 into invitation delivery, tenant settings authorization, or lead/CRM persistence.

Remaining work is intentionally deferred to the next approved slice: server-backed invitations/seats, membership/settings authorization, and lead/business persistence. The Google provider remains a local fixture and requires a separate external acceptance gate.
