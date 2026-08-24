# Nexa Spectrum Phase 4 backend/security preparation

Date: 2026-08-23  
Baseline: `origin/main` at `7a146fef9c0abe05561ec699d52a480732cd86ad`, with Phase 1–2 backend boundary `ae39bae`  
Scope: authentication and onboarding presentation migration; no integration or deployment

## Result

The Phase 4 business flows are already implemented behind suitable service/data-layer boundaries. Visual migration is presentation-only except for explicit API privacy/minimization applied in this branch:

- `/api/auth/session` now returns only `{ authenticated }`, never `userId`, and emits `Cache-Control: private, no-store` for both outcomes.
- onboarding plan, Workspace summary/provisioning, Workspace selectable/switch, and invitation-acceptance responses emit `private, no-store` on success, validation/authentication denial, CSRF rejection, and service failure.

Next.js Route Handlers are dynamic and uncached by default, but the explicit header is required at browser/proxy boundaries. Document privacy remains independently enforced by configured-session-cookie classification in Proxy plus Caddy defense in depth.

## Canonical commercial and tenancy contract

- One public self-service subscription/onboarding entitlement can provision exactly one Workspace for one company. The onboarding row is consumed by the atomic provisioning transaction; another key/name after completion returns `not_eligible` and cannot create another Workspace.
- The verified registering representative receives the single initial active `owner` Membership. Owner is a distinct persisted Workspace Role, not Admin. Provisioning also seeds Admin/Member Role definitions but no additional people.
- `activeSeats` counts all active Memberships, including Owner. A five-seat plan therefore permits the Owner plus four additional active Admin/Member Memberships.
- Normal invitation schemas, service types, and acceptance queries permit only `admin` or `member`; they cannot assign Owner. Admin permission ceilings protect Owner and subscription/ownership operations.
- Ownership changes only through the recent-authenticated dedicated transfer transaction; exactly one Owner remains and the prior Owner becomes Admin.
- Self-service company teams remain Teams/RBAC/ownership/visibility inside the same Workspace. The chooser selects among already-authorized active Memberships and grants no Workspace or commercial entitlement.
- Membership uniqueness is `(workspace_id,user_id)`, not global `user_id`. A User may retain active Memberships in another company or an explicitly provisioned Enterprise deployment.
- Additional company Workspaces, billing/provider integration, upgrades/downgrades, and Enterprise capacity/terms remain separately authorized. Phase 4 must not expose a public additional-Workspace control or imply that the chooser creates one.

## API and presentation map

| Flow | Stable server contract | Phase 4 presentation boundary |
| --- | --- | --- |
| Plan selection | Accepted catalog code/cadence persisted before provisioning; browser price/seat copy is not authority; post-provision changes denied | Cards, cadence control, billing-disconnected/Contact Sales copy |
| Registration | CSRF/Origin, server validation/password policy, generic 202, transactional User/credential/onboarding/token/Audit/outbox; no Workspace | Form, requirements, pending/error/focus and environment banner |
| Verification/resend | Generic resend 202; single-use/replaced/expired token; bounded invalid response; transactional activation/Audit | Waiting/checking/verified/invalid/resent states |
| Login/session/logout | Generic invalid credentials; opaque configured cookie; rotation; idle/absolute expiry/touch; server-derived next destination; minimized private session status | Form and navigation states; never infer authority from UI/session status |
| OIDC | UAT/production disabled routes remain 404; fixture is local-only; cancelled/protocol/link-conflict/password failure remain distinct | Disabled/unavailable/cancelled/failed copy only; no provider enablement |
| Recovery/reset | Enumeration-safe request 202; network/subject limits; password policy; reset single-use; Session/security-version revocation; Audit and rollback/concurrency invariants | Generic request success and invalid/expired/replayed reset states |
| Workspace create/ready | Trusted Session, persisted plan, replay-safe idempotency; atomic Workspace/Roles/sole Owner/entitlement/trial/stages/onboarding/Audit/outbox | Form/progress/retry and server-derived ready summary |
| Workspace selection | Active Session/Membership/Role only; cookie rotation; idempotency/recovery; tenant-safe denial; no entitlement creation | Zero/one/multiple routing, current marker, access-changed reload |
| Invitation acceptance | Authenticated intended verified identity; Admin/Member only; seat count includes Owner; Team validation; token hash/expiry/replay; Audit/outbox atomicity | Invalid/expired/seat-limit/busy/success states; token never logged/telemetried |
| Transactional email | Outbox only for verification/reset/invitation; encrypted payload; provider idempotency and worker fencing; server-only provider secrets | Truthful “queued” versus delivered language; no direct provider/UI API |

`/invite` remains a sessionStorage demonstration and is not the server invitation workflow. It must not share transactional delivery claims with `/workspace/invitations/accept` or Workspace administration invitations.

## Dev1 implementation dependencies

- `POST /api/auth/login` already returns the authoritative `next` destination based on zero, one-current, or multiple-unselected active Workspaces. The current `LoginForm` discards that value and always navigates to `/workspace/create`; Phase 4 must consume the returned allowlisted destination rather than reimplementing or hardcoding routing.
- Public plan cards are presentation data; the provisioning transaction revalidates the persisted code/cadence and derives seats/trial/feature limits from the effective server catalog. Phase 4 must not make exact seat, trial, price, upgrade, additional-Workspace, or payment claims beyond Product's approved self-service catalog. A future dynamic public-catalog/billing contract requires separate authorization and is not introduced here.
- Workspace creation must preserve one idempotency key across retry/response loss. The chooser and login destination must never expose a “create another Workspace” action for an already-completed self-service onboarding.
- Verification, recovery, reset, and invitation URLs may provide opaque tokens to their single consuming client component only. Tokens are prohibited from UI telemetry, logging, screenshots, shared shell state, and error reporting.

## Required verification

1. Direct routes: CSRF and cross-origin rejection; generic identity envelopes; minimized session JSON; private/no-store for session/onboarding/Workspace/invitation outcomes; OIDC disabled 404; configured cookie and CSP nonce positive/negative cases.
2. PostgreSQL identity: registration rollback/concurrency, verification rotation/replay, generic recovery, reset rate limits/single use, password/reset lock orders, reset supersession, all-Session revocation, exactly one success Audit, retry and late-failure rollback.
3. PostgreSQL tenancy: no Workspace before provisioning; exactly one self-service Workspace and sole Owner; seats include Owner; Admin/Member-only invitations; Admin ceilings; dedicated ownership transfer; same-Workspace uniqueness plus valid global multi-Membership; chooser tenant denial and no creation side effect.
4. Email: local worker/Mailpit token rotation and fencing; provider evidence only under separate approved-recipient authorization; never retain recipient, credential, token/link, body, cookie, or provider ID.
5. Browser: complete identity/onboarding journeys; truthful disabled-provider/billing/demo copy; mutation retry/idempotency; Workspace ready/selection; invitation states; logout/back protection; Light/Dark/System no-flash, keyboard/focus, 320px, 200% zoom, and CSP/hydration cleanliness.
6. Candidate gate: diff check, lint, TypeScript, direct/unit, serialized isolated PostgreSQL, migration apply/rerun, production build, supported Playwright/baselines, production audit, and live response-header inspection.

No schema or production-provider dependency is identified. Dev1 should preserve these contracts while replacing presentation; Architecture should reject any client-derived subscription, seat, Owner, Membership, Workspace-selection, or delivery authority.
