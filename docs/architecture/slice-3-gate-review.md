# Architect Slice 3 Gate Review

Status: **ACCEPT — Slice 3 local production foundation complete**  
Review date: 2026-08-20  
Scope: re-review of the six bounded Slice 3 remediations  
Boundary: local source and local evidence only. No real Google service, production credential/domain, UAT, Lightsail, Caddy, or other external infrastructure was accessed or modified.

## Verdict

Slice 3 is accepted. The final audit-attribution defect is resolved: successful ownership transfer records the verified prior Owner membership as `actor_membership_id` and the promoted successor membership as `target_id`. The live regression assertion proves both identities.

The complete Owner correction is accepted: authority is re-resolved from persisted active Owner membership under the Workspace lock; successor and prior-Owner mutations are tenant-scoped and row-count checked; invalid, stale, self, and cross-tenant paths roll back; success and denial audits are safely attributed; and concurrent transfer/removal preserves at least one active Owner.

Independent final execution passed the targeted Owner suite at 5/5 and the normal `RUN_DB_INTEGRATION=1` command at 44/44 across all five selected integration files. No Slice 3 blocker remains.

## Evidence checked

- The accepted Slice 3 scope and six blockers in the previous revision of this review
- `docs/architecture/security-data-contracts.md`
- `docs/engineering/slice-3-checkpoint.md`
- Migration 0006 and current migration metadata
- OIDC environment validation, start/fixture/callback routes, and completion/linking service
- Workspace provisioning, authorization, Owner mutation, and transfer services
- Audit writer and email outbox claimant
- CRM sign-out UI and logout API wiring
- OIDC unit tests, Slice 3 PostgreSQL tests, remediation tests, and Playwright logout coverage

## Independent checks

| Check | Result |
| --- | --- |
| Compose configuration | Passed using `docker-compose.local.yml` |
| Drizzle migration-history check | Passed |
| Unit/direct-route suite | Recorded passed: 25 tests; 44 database tests skipped by the unit command as designed |
| Lint | Passed |
| Next.js production build | Passed on Next.js 16.3.1; all 26 routes/pages compiled |
| Targeted Owner PostgreSQL suite | Independently passed: 5 tests |
| Normal `RUN_DB_INTEGRATION=1` command | Independently passed: 44 tests in all 5 selected serial files, including both Slice 3 suites and the Owner remediation suite |

The recorded checkpoint counts are reconciled with the independent run. Integration selection is no longer a blocker.

## Six-remediation assessment

| Original blocker | Decision | Evidence |
| --- | --- | --- |
| Atomic and exhaustive OIDC completion | **ACCEPT** | The OIDC transaction is locked; state, PKCE verifier, exact configured redirect, signature, issuer, audience, expiry, nonce, verified email, and non-empty `sub` are validated before consumption. Identity/session/audit/consumption commit together, and rejected paths roll back. Targeted tests cover all listed protocol dimensions and replay. |
| Provider-`sub` linking collision | **ACCEPT** | Authenticated linking rejects a `sub` owned by another User, email-only matching cannot link, same-User linking is idempotent, and collision failure creates no session or identity change. |
| Fixture fail-closed and configured redirects | **ACCEPT FOR LOCAL SLICE** | `OIDC_MODE` is explicit; fixture mode is forbidden in production; start, callback, and issuer return 404 when disabled; redirects are checked against an exact configured allowlist. Migration 0006 removes the obsolete local-only database constraint. |
| Safe audits and outbox routing | **ACCEPT FOR OIDC/PROVISIONING** | OIDC success and callback failure/link conflict use bounded metadata without token/claim payloads. Provisioning writes distinct Workspace-created and initial-Owner-assigned audits. The email claimant explicitly limits itself to identity email topics and leaves `workspace.provisioned` for a future consumer. |
| Authorization/concurrency-safe Owner mutations and transfer | **ACCEPT** | Both operations use a Workspace lock and persisted active-Owner revalidation. Transfer rejects self/cross-tenant successors, promotes before removal, scopes both writes, asserts one-row effects, and rolls back partial work. Safe denial audits use a separately derived boundary. Five targeted tests cover forged/stale/mismatched actors, cross-tenant/self transfer, forced zero-row rollback, success/denial audit presence, and concurrent transfer/removal while preserving an active Owner. |
| Ownership-transfer audit attribution | **ACCEPT** | The success audit stores `verified.id` as `actor_membership_id` and `successor.id` as `target_id`. The valid-transfer PostgreSQL test selects and asserts both fields, along with Workspace, actor User, success outcome, rollback, and active-Owner invariants. |
| Real server logout UI | **ACCEPT** | CRM Sign out calls the CSRF-protected logout API, clears demo state only after success, and replaces browser history. Playwright clicks the real control and proves the revoked session cannot re-enter protected CRM navigation. |

## Final correction evidence

- `transferOwnership` writes `actorMembershipId: verified.id` and `targetId: successor.id` in the same successful business transaction.
- The regression assertion explicitly checks the prior Owner membership and successor membership in their correct audit fields.
- Targeted Owner PostgreSQL suite independently passed: **5/5**.
- Normal integration command independently selected all five files and passed: **44/44**.
- No schema migration was required.

## Residual risks

- Real Google acceptance remains blocked on the approved Google Cloud project, consent screen, canonical HTTPS domain, exact redirect URI, client credentials, and Product/Operations linking approval.
- The local HS256 fixture does not prove Google discovery/JWKS rotation, provider outage behavior, or production callback deployment.
- Commercial plan values, billing lifecycle, invitations, tenant administration UI, support access, observability, backup/restore, and deployment operations remain outside Slice 3.
- Owner mutation services are not yet exposed through recent-authenticated production APIs; that boundary belongs in the next slice and must derive actor context server-side.

## Next authorized slice

**Slice 4 is authorized locally: tenant administration and invitations.**

The authorized boundary is:

1. Workspace invitations using hashed single-use tokens, configurable expiry, resend/revoke, invited-email proof, transactional acceptance, seat enforcement, idempotent membership creation, safe outbox routing, and success/denial audit.
2. Server-derived Owner/Admin/Member authorization and versioned role/team/membership writes with tenant-safe denial and expected-version concurrency.
3. Recent-authenticated Owner-transfer and membership administration APIs that reuse the accepted persisted-context and last-Owner controls.
4. Optional Team and TeamMembership persistence with Workspace-scoped constraints.
5. Server-derived Workspace settings and people/role UI replacing demonstration authority.
6. PostgreSQL and Playwright evidence for invitation replay, expiry, revocation, wrong email/Workspace, seat limits, cross-tenant access, role races, Owner transfer, and session/logout revocation.

Slice 4 remains local-only. It may use local PostgreSQL, Mailpit, and test fixtures. It must not access or configure real Google, production email/domain/provider credentials, deployment infrastructure, Lightsail, UAT, or Caddy. Real provider and deployment acceptance remain separate gates requiring Product/Operations inputs.
