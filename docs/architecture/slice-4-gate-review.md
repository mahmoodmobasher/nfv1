# Architect Slice 4 Gate Review

Status: **REJECT — bounded invitation/session/audit remediation required**  
Review date: 2026-08-20  
Scope: tenant administration, invitations, Role/Membership/Team concurrency, recent-authenticated Owner operations, tenant-safe reads, audit/outbox, and local UI authorized by `slice-4-tenant-admin-contract.md`  
Boundary: local source, local PostgreSQL/Mailpit, and local browser evidence only. No real Google, production email/domain/provider credentials, deployment, Lightsail, UAT, or Caddy was accessed or modified.

## Verdict

Slice 4 is not accepted yet. The additive schema, composite tenant constraints, token hashing/rotation, invitation terminal states, create/resend/revoke transactions, email proof for new Memberships, last-seat serialization for new Memberships, server-derived Role ceilings, expected-version writes, signed cursors, Team scope, explicit email outbox routing, recent-auth primitives, tenant-safe reads, and most browser administration behavior are credible and substantially evidenced.

Four bounded gaps remain:

1. Invitation acceptance mishandles an existing Membership: suspended/removed reactivation bypasses seat capacity, while an already-active Membership is overwritten with the invitation Role. The latter can demote an active Owner outside the dedicated transfer/last-Owner boundary.
2. Ownership transfer is not recoverably idempotent with Session rotation. Replay checks happen after persisted Owner permission/version checks, and the committed rotation immediately invalidates the request token. A lost success response cannot recover the original result or rotated cookie.
3. The fixture-OIDC recent-auth browser path is not currently reproducible. The formal rerun failed this journey twice with `authentication_required` at the start route.
4. Denial/rate-limit coverage is incomplete at the HTTP boundary, and invitation “destination” dimensions use invitation IDs or token prefixes rather than the normalized destination email. Several failures occur before the service denial-audit wrapper, and generic invitation denial currently loses the bounded email/revoked/consumed reason.

These findings do not require redesigning the accepted Slice 1–3 foundation or the main Slice 4 schema. Slice 5 is not authorized.

## Evidence inspected

- `docs/architecture/slice-4-tenant-admin-contract.md`
- `docs/architecture/security-data-contracts.md`
- `docs/architecture/slice-3-gate-review.md`
- `docs/engineering/slice-4-checkpoint.md`
- Drizzle schema, migration `0007_omniscient_famine.sql`, and migration metadata
- Tenant permission/context, denial, cursor, pagination, invitation, administration, extended administration, and read-model services
- All Slice 4 API routes and recent-password/fixture-OIDC routes
- Session, OIDC, Workspace provisioning, audit, rate-limit, request/CSRF, and email outbox foundations
- Settings, people, invitation, Team, transfer, and acceptance UI wiring
- Slice 4 unit, PostgreSQL, and Playwright tests

## Independent checks

| Check | Result |
| --- | --- |
| Unit/direct-route/cursor suite | Passed: **29/29**; 61 live tests skipped by design |
| Drizzle migration-history check | Passed |
| Lint | Passed |
| Next.js production build | Passed on Next.js 16.3.1; **30** routes/pages generated |
| Normal serial PostgreSQL command | Passed: **61/61** across all six selected files |
| Full Playwright rerun | **Failed: 9/11 passed**. Existing logout and Slice 4 recent-OIDC/transfer journeys failed in the full run |
| Isolated rerun of the two failed browser tests | Logout passed; recent-OIDC/transfer failed again. Isolated result: **1/2 passed** |

The isolated logout pass makes the full-run logout failure likely test-state/flakiness rather than a demonstrated logout regression. The recent-OIDC failure is reproducible and remains blocking. The checkpoint's recorded 11/11 pass is therefore not the current independent execution result.

## Gate assessment

| Contract area | Decision | Evidence/reason |
| --- | --- | --- |
| Migration and tenant constraints | **ACCEPT FOR SLICE 4** | Migration 0007 adds row versions, Session recent-auth fields, Workspace Invitations, Teams, TeamMemberships, InvitationTeams, composite Workspace foreign keys, pending-email/token uniqueness, state checks, policy Roles, rate-limit actions, and safe audit metadata. Drizzle history passes, and recorded empty-database/rerun evidence is credible. |
| Invitation token lifecycle | **ACCEPT WITH REMEDIATION BELOW** | Tokens are random and purpose-prefixed/keyed-hashed; only encrypted email envelopes carry plaintext; resend rotates the hash/generation and invalidates the old token; revoke/expiry/terminal replay are implemented. Acceptance's existing-Membership branch remains unsafe. |
| Email proof and generic public errors | **PARTIAL / REJECT** | New-Membership acceptance requires active verified User and constant-time normalized-email equality. Public errors are generic. Internally, revoked/consumed/email-mismatch paths collapse to `invalid_target` in the separately committed audit rather than preserving the safe bounded reason required for operations evidence. |
| Seat enforcement and races | **PARTIAL / REJECT** | Workspace locking serializes concurrent new-Membership last-seat acceptance. But the code checks `if (!existing && active >= limit)`; any suspended/removed existing Membership bypasses capacity and is reactivated, allowing active seats above entitlement. |
| Existing Membership acceptance | **REJECT** | Every existing Membership is updated to the invitation Role and active state. An already-active Owner can therefore be changed to Member/Admin by accepting a stale/racing invitation, bypassing target ceilings, expected version, recent auth, dedicated transfer, and last-Owner protection. Contract requires an existing active Membership to return its current authorized result without changing Role. |
| Idempotency | **ACCEPT EXCEPT OWNER TRANSFER** | Invitation and ordinary administration operations bind principal/operation/key/request hash and reject changed-input reuse. Acceptance is durably replayable through terminal Invitation fields. Owner transfer replay is inaccessible after the successful Role/session mutation and cannot recover a rotated cookie. |
| Outbox/email routing | **ACCEPT** | Invitation email payload is encrypted, provider idempotency uses the Outbox ID, accepted lease/fencing/error behavior remains, and the email claimant selects only two identity topics plus `workspace.invitation_email_requested`. Non-email Workspace events remain pending. |
| Audit and denial boundary | **PARTIAL / REJECT** | Service-level success and most denial audits are safely scoped and target-minimized. Rate-limit and tenant-context failures occur before `withDenialAudit`; recent-OIDC start has no safe catch/audit response; invitation invalid reasons are flattened. The checkpoint's claim that every Slice 4 mutation uses the centralized denial boundary is not true at the route boundary. |
| Rate limits | **PARTIAL / REJECT** | Actor, Workspace, network, and a fourth dimension are persisted and bounded. For resend/revoke the fourth dimension is Invitation ID, and for acceptance it is a token prefix—not normalized destination email. The targeted test calls the limiter directly with an email and does not prove actual route/service behavior. |
| Server-derived permissions and ceilings | **ACCEPT** | Active persisted Membership and Role code are re-resolved after the Workspace lock; caller Role is ignored; Owner/Admin/Member policy and target ceilings are enforced. Generic APIs cannot assign Owner. |
| Expected versions | **ACCEPT** | Workspace, Role policy, Membership, Team, Invitation, and exact Team-assignment mutations use expected versions, scoped predicates, transaction rollback, and stale conflict behavior. |
| Signed cursors and tenant-safe reads | **ACCEPT** | Cursors are signed and bound to endpoint and Workspace. Pagination uses stable timestamp/UUID ordering. Settings/people/invitation/Team reads require persisted tenant context and Workspace-scoped queries. |
| Recent password authentication | **ACCEPT FOR LOCAL SLICE** | Current active Session is resolved first; password proof uses the existing adaptive verifier; success rotates the Session and updates persisted recent-auth time/method; success/failure audit and rate limiting exist. |
| Recent fixture OIDC | **REJECT ON EXECUTION EVIDENCE** | Source validates mode, allowlisted return/redirect, state/PKCE/nonce/signature/issuer/audience/expiry/provider `sub`, linked User, active Session update, replay, rotation, and audit. However, the actual Playwright journey reproducibly remains on the start route with `authentication_required`, so the integrated browser/session contract is not accepted. |
| Owner transfer and Session rotation | **PARTIAL / REJECT** | Persisted actor, recent auth, expected versions, promote-before-demote, correct attribution, one-Owner invariant, and fresh authorization are implemented. Recoverable idempotency across the committed Session rotation is not. |
| Teams and TeamMemberships | **ACCEPT** | Same-Workspace composite constraints, normalized uniqueness, status/version checks, target ceilings, exact assignment, stale rollback, archive behavior, and server-backed UI evidence are present. |
| Session/logout | **ACCEPT WITH TEST-STABILITY FOLLOW-UP** | Existing server revocation and protected-route behavior remain structurally intact; the independently failed logout journey passed immediately in isolation. The full suite must nevertheless return to a clean 11/11 result during remediation evidence. |
| External-boundary compliance | **ACCEPT** | Source and checkpoint remain local-only. No real provider, domain, email vendor, deployment, Lightsail, UAT, or Caddy access is evidenced. |

## Blocking remediation

Develop is authorized to perform only the following bounded Slice 4 remediation before re-review.

### 1. Correct existing-Membership invitation acceptance

- Lock and read existing Membership status, Role code/ID, and version before seat/Role decisions.
- If it is already active, do not change Role, status, Team assignments, or version. Consume or terminally resolve the same-User invitation according to the contract and return the existing Membership's current Role/result. In particular, an Owner must remain Owner.
- If it is suspended or removed, treat reactivation as consuming a seat: under the Workspace lock, reject when active count is at the entitlement limit. On success, reactivate using the invitation's permitted non-Owner Role and increment the version exactly once.
- Assert the Invitation terminal update changes one pending row. Revalidate the invitation Role as a same-Workspace immutable system `admin|member` Role and all Teams as active/same-Workspace before mutation.
- Add tests for active Member/Admin/Owner conflicts, sole-Owner preservation, suspended and removed reactivation at/under capacity, stale/racing Membership state, Role revalidation, and full rollback/audit/outbox behavior.

### 2. Make Owner-transfer response loss recoverable

- Define and implement an idempotent Session-rotation protocol in which a committed transfer can be safely retried with the same idempotency key after response loss without repeating Role changes or losing authenticated access.
- Do not place a reusable plaintext Session token in idempotency storage. A suitable design may defer/coordinate rotation through a one-time server-held handoff bound to the old Session and idempotency record, or preserve a short, tightly bounded old-token replay path that can only retrieve/complete the same committed outcome.
- Check idempotency at a point compatible with the post-transfer actor Role/version while still revalidating identity and original principal ownership of the record.
- Test identical retry after commit before/after cookie delivery, changed-input conflict, stale/different actor denial, single Role mutation/audit, Session usability, and expiry of the recovery path.

### 3. Repair and stabilize fixture-OIDC recent authentication

- Determine why the browser's restored Owner cookie is rejected at `/api/auth/recent/oidc/start` after the invitation/seat flow. The start route must return a controlled tenant-auth error/redirect rather than an unhandled route failure.
- Preserve the accepted proof-linked subject, PKCE/state/nonce/signature/issuer/audience/expiry, fixture-mode, allowlist, replay, and current-Session-only rotation checks.
- Make the full browser suite deterministic and independently repeatable. Required evidence is the full suite passing at least once after a clean local reset and the recent-OIDC/transfer journey passing repeatedly in isolation.

### 4. Complete audited rate-limit/denial semantics

- Ensure route-level rate-limit, tenant-context, permission, and recent-auth failures flow through a safe denial-audit boundary where an actor can be safely derived. CSRF/anonymous failures may remain in security logs when no safe audit actor exists, but must return the standard safe envelope.
- Apply invitation destination limiting to the normalized invitation email resolved server-side; do not substitute Invitation ID or token prefix and do not persist raw email. Keep actor, Workspace, and trusted-network dimensions.
- Preserve safe internal reason codes for `email_mismatch`, `invitation_revoked`, `invitation_consumed`, `invitation_expired`, `seat_limit_reached`, and `rate_limited` while continuing to return one generic public invalid-invitation response.
- Add route/service PostgreSQL assertions—not only direct limiter-helper tests—for all four invitation dimensions, denial audit persistence/minimization, and absence of raw destination/token data.

## Required re-review evidence

- Targeted PostgreSQL tests for all existing-Membership acceptance branches and capacity races.
- Targeted transfer idempotency/Session response-loss tests.
- Route-level rate-limit and denial-audit tests with safe internal reasons and generic public responses.
- Repeated fixture-OIDC recent-auth browser success and a clean full Playwright pass.
- Normal unit, all serial PostgreSQL suites, migration history/rerun, lint, build, outbox routing, and local-only checkpoint evidence.
- Updated `docs/engineering/slice-4-checkpoint.md` reconciling the independent 9/11 browser result and documenting final remediation counts.

## Residual risks after remediation

- Real Google recent authentication and account linking remain blocked on provider project, canonical HTTPS domain, redirect registration, credentials, consent configuration, and provider outage/JWKS behavior.
- Production invitation delivery, sender/domain authentication, branding, bounce/complaint handling, and delivery webhooks remain external gates.
- Commercial seat counts, suspended-seat policy, overages, billing lifecycle, and downgrade/grace behavior remain Product decisions.
- Audit retention/export/tamper evidence, support access, monitoring, backup/restore, and deployment operations remain outside this local slice.
- CRM Lead persistence and business-record authorization remain preview-only and are not accepted by this gate.

## Delivery scope reset and next authorization

The subsequent Architect delivery directive in `delivery-scope-reset.md` supersedes the sequencing restriction above. Develop must first correct existing-Membership invitation acceptance and pass the five targeted stabilization cases. After that evidence, local tenant-scoped CRM product implementation may begin without another full Slice 4 review.

The remaining transfer-replay, denial/rate-limit, fixture recent-auth, and full-browser findings stay open for the pre-UAT security gate and do not block local CRM product validation.

The next local product slice is **tenant-scoped CRM data foundation**—persistent Leads, pipeline stages, ownership and Workspace/Team visibility, notes/activities, expected-version writes, tenant-safe APIs, and primary browser journeys. Architecture review during that work follows the material-risk blocker policy in the delivery directive.

No real Google/email/domain/provider credentials, deployment, Lightsail, UAT, or Caddy work is authorized.
