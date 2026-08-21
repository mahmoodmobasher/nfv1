# Slice 3 Graphics/UX remediation evidence

Date: 2026-08-20  
Scope: bounded corrections from `docs/design/slice-3-production-state-review.md`  
Boundary: local-only. No Google account, external provider, deployment, domain, Lightsail, UAT, or Caddy access.

## Outcome

The four rejected production-state areas are corrected without adding Slice 4 tenant, invitation, settings, or lead persistence.

- Protected CRM again exposes a mobile header below 901px. Its menu has a 44px trigger, light panel/backdrop, overview, leads, settings, and real server logout. Escape closes it and restores trigger focus. Native route links close it through navigation. Layout uses viewport-relative sizing and no page-level horizontal overflow at 320px; forced-colors, visible focus, and reduced-motion rules remain.
- `Shell` now distinguishes the local server-backed identity/workspace foundation from preview-only routes. Invite, settings, and lead routes receive always-visible, route-specific non-persistence/non-authorization labels.
- Registration, login, verification, recovery, reset, and email subjects use user-facing account/password language. Mailpit is secondary local-environment guidance. The Google identity CTA remains explicitly a non-production local fixture.
- `/workspace/create` resolves plan and cadence only from the authenticated user's persisted `onboarding_progress`. Query parameters and browser defaults cannot render commercial authority there. Missing, completed, invalid, loading, and server-error states redirect or render explicitly, and refresh/direct entry resume from server state.
- Settings, invite, and lead success text remains explicitly preview-only. CRM copy does not represent local lead markers as persisted records or authorization state.

## Browser evidence

`npm run test:e2e`: **7/7 passed** in 21.8 seconds against the local PostgreSQL/Mailpit fixture.

The OIDC/provisioning journey now additionally checks the CRM shell at a 320×640 CSS-pixel viewport:

- mobile trigger is visible and at least 44×44px;
- menu exposes workspace settings (with overview, leads, and sign-out rendered in the same navigation);
- Escape closes the menu and returns focus to the trigger;
- selecting settings navigates, tears down the menu, and exposes the settings-preview boundary;
- document width does not exceed the viewport;
- mobile sign-out revokes the session, and a later protected CRM request redirects to sign-in.

The same suite also passes desktop registration/worker/verification/login, invalid/expired/replayed links, current/all-device logout, idle expiry/touch, reset-driven revocation, and unauthenticated protected-route redirect scenarios.

## Verification

- `npm run lint`: passed.
- `npm test`: 25 passed; 44 live PostgreSQL tests skipped by the normal unit command as designed.
- `npm run build`: passed on Next.js 16.3.1; 26 application routes generated.
- `npm run test:e2e`: 7 passed, 0 failed.

## Files changed

- `src/app/onboarding/components.tsx`
- `src/app/onboarding/forms.tsx`
- `src/app/verify-email/page.tsx`
- `src/app/workspace/create/page.tsx`
- `src/app/workspace/create/loading.tsx`
- `src/app/workspace/create/error.tsx`
- `src/app/crm/page.tsx`
- `src/app/globals.css`
- `src/server/identity/service.ts`
- `tests/e2e/local-identity.spec.ts`
- `docs/engineering/slice-3-ux-remediation.md`

## Remaining boundary

Invitation delivery/seats, workspace settings and membership authorization, and lead/CRM persistence remain intentionally unimplemented previews. Google remains a local fixture. These require later approved backend slices; this remediation does not weaken or simulate them.
