# Slice 4 tenant administration checkpoint

Date: 2026-08-20  
Status: **ready for Architect review**  
Boundary: local PostgreSQL, Mailpit, fixture OIDC, and browser tests only. No real provider, production email/domain, deployment, Lightsail, UAT, or Caddy access occurred.

## Implemented

- Additive Drizzle schema and migration `0007_omniscient_famine.sql`: row versions, Session recent-auth fields/method, Workspace Invitations, Teams, Team Memberships, Invitation Teams, state checks, composite Workspace foreign keys, pending-email/token uniqueness, expanded audit metadata and rate-limit action constraints.
- Migration backfills legacy Session authentication and seeds immutable Owner/Admin/Member policy snapshots for existing Workspaces. New provisioning creates all three fixed Roles.
- Server-derived policy registry and active Session/User/Workspace/Membership authorization context.
- Hashed, purpose-prefixed, seven-day invitation token creation; encrypted outbox envelope; explicit invitation email topic; create replay/conflict; resend rotation/throttle/version; revoke; verified-email acceptance; atomic seat count; Membership creation/reactivation; Team assignment; success audit/non-email outbox.
- Optimistic Membership, Workspace settings, Role policy, Team, Invitation, and Membership-Team endpoints. Admin target ceiling and Owner-only critical operations are enforced from persisted context.
- Password/fixture-OIDC recent authentication and recent-authenticated Owner transfer with scoped versions, promote-before-demote transaction, correct audit attribution, and current-session rotation.
- Server-backed settings overview, people/roles, invitation create/list/resend/revoke, teams create/archive, transfer, and invitation acceptance screens. CRM and workspace mobile navigation expose the new administration routes. Lead persistence remains explicitly preview-only.
- Local Mailpit email worker claims identity and invitation email topics only; non-email membership events remain unclaimed.

## Initial checkpoint evidence (superseded by final verification below)

- Migration first exposed an ordering defect (composite FKs preceded supporting unique indexes); the migration transaction rolled back. The checked-in SQL was repaired.
- `npm run db:migrate`: passed on the disposable local database.
- immediate `npm run db:migrate` rerun: passed/no-op through Drizzle history.
- `npm run db:health`: `{ ok: true, latencyMs: 18 }`.
- targeted Slice 4 PostgreSQL suite: **7/7 passed**.
- normal serial PostgreSQL integration command: **51/51 passed** across 6 files.
- unit/direct-route baseline: **25 passed**, 51 live tests skipped by the normal unit command.
- Playwright: **8/8 passed**. The added journey proves Owner settings → invitation persistence → invitation email worker → Mailpit link → verified invitee acceptance → protected CRM entry with one Membership.
- lint: passed.
- Next.js 16.3.1 production build: passed; 28 generated application pages.
- `npm audit --omit=dev`: **0 vulnerabilities**. The sandboxed request first failed DNS; the approved network retry succeeded.
- Docker Compose: PostgreSQL and Mailpit both healthy and bound to `127.0.0.1`.

## Slice 4 completion evidence

All eleven continuation gaps are closed within the authorized local Slice 4 boundary:

1. Every Slice 4 service mutation now uses the centralized separately committed, minimized denial-audit boundary. Invitation acceptance/admin, Membership, Team, Team Membership, Workspace settings, Role policy, ownership transfer, password recent-auth, and fixture-OIDC recent-auth use bounded action/reason metadata and omit untrusted targets on denial.
2. Observing an expired pending invitation commits `pending → expired` plus the safe denial audit. Explicit resend of that observed expiry creates a new replacement row, copies the current Team assignment set, rotates the token/generation, and leaves the expired row terminal.
3. Actor, Workspace, network, and destination dimensions are invoked across invitation create/resend/revoke/accept, Membership, Team, Workspace, Role-policy, transfer, and recent-auth flows. PostgreSQL evidence asserts all four invitation dimensions are persisted.
4. People, Invitations, and Teams use signed opaque cursors bound to endpoint and Workspace. Cursor tests cover round-trip, tampering, endpoint reuse, Workspace reuse, stable non-overlapping pages, and PostgreSQL timestamp precision.
5. Teams UI provides exact server-backed Membership assignment/removal, removal confirmation, optimistic Membership versions, preserved selection on failure, and visible stale-conflict recovery text.
6. Invitation UI supports entry by Add, Enter, comma, semicolon, space, and paste; removable rows; per-row Role and Team choices; grouped Sent/Needs-attention state; and per-row retry while preserving failures.
7. Local fixture OIDC recent-auth has exact allowlisted start/callback routes. It requires the current active Session and an already linked provider subject, validates locked state/PKCE/nonce/issuer/audience/signature/expiry/subject, rotates only the current Session, marks fixture recent-auth, and fails closed outside fixture mode.
8. Owner transfer rotates the current Session in place. PostgreSQL and Playwright evidence prove a fresh authorization read resolves the prior Owner as Admin and that the rotated browser Session remains usable.
9. The PostgreSQL matrix covers expiry/replacement, replay, accept-vs-revoke, accept-vs-resend, last-seat serialization, Team scope/version conflicts, Workspace/Role stale writes, minimized denial audits, current-Session rotation, Owner transfer/removal concurrency, cursor stability, recent fixture OIDC replay rejection, and limiter dimensions.
10. Playwright covers old-link invalidation, identical safe unavailable state, no-seat acceptance, multi-entry partial retry, Team Membership save/removal/stale conflict, Admin ceilings, suspended-member immediate loss, fixture recent-auth transfer, refreshed authorization, logout/session behavior, and Mailpit invitation acceptance.
11. Slice 4 administration, invitation, settings-client, and acceptance-client explicit-any suppressions are removed and replaced by concrete row/API/UI types.

## Final verification — 2026-08-20

- Disposable local Compose reset: passed; only `docker-compose.local.yml` was used.
- Compose config: passed. PostgreSQL, SMTP, and Mailpit UI remain bound to `127.0.0.1`; PostgreSQL and Mailpit reported healthy.
- Migration from an empty database: passed.
- Immediate migration rerun: passed/no-op through checked-in Drizzle history.
- Database health: `{ ok: true, latencyMs: 16 }`.
- Unit/direct-route/cursor suite: **29/29 passed**; the normal command intentionally skipped **61** live tests.
- Targeted Slice 4 PostgreSQL suite: **17/17 passed**.
- Normal serial PostgreSQL integration command: **61/61 passed** across 6 files.
- Full Playwright suite: **11/11 passed**.
- Mailpit/outbox: **5** verification, **2** reset, and **4** invitation messages delivered; **21** local Mailpit messages present. Non-email `workspace.membership_activated` and `workspace.provisioned` messages remained pending and were not claimed by the email worker.
- Lint: passed with no warnings.
- Next.js 16.3.1 production build: passed; **30** generated application pages, including the two recent-OIDC routes.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- No real Google account, production email/domain/provider credentials, deployment, Lightsail, UAT, Caddy, lead lifecycle, or billing work was accessed or introduced.

## Files added or materially changed

- `.env.example`
- `src/server/db/schema.ts`
- `src/server/db/migrations/0007_omniscient_famine.sql` and Drizzle metadata
- `src/server/env.ts`
- `src/server/security/session.ts`
- `src/server/email/outbox.ts`
- `src/server/workspaces/provision.ts`
- `src/server/tenant-admin/{permissions,http,page,read-models,cursor,pagination,denial,invitations,administration,extended}.ts`
- `src/server/identity/oidc.ts`
- Slice 4 API routes under `src/app/api/workspaces/[workspaceId]`, `src/app/api/invitations/accept`, and `src/app/api/auth/recent/{password,oidc}`
- Slice 4 pages/components under `src/app/workspace/settings` and `src/app/workspace/invitations/accept`
- `src/app/crm/page.tsx`
- `src/app/globals.css`
- `tests/slice4.integration.test.ts`
- `tests/slice4.cursor.test.ts`
- `tests/e2e/local-identity.spec.ts`
- `tests/routes.test.ts`
- `docs/engineering/slice-4-checkpoint.md`

## Review request

Slice 4 is ready for Architect review. No Slice 5 or broader feature work has started.
