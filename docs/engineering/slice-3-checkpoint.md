# Architect Slice 3 local engineering evidence

**Date:** 2026-08-20  
**Status:** Final bounded Owner-transfer/audit correction complete; ready for Architect re-review  
**Boundary:** Local PostgreSQL, local Mailpit, and an in-process signed OIDC fixture only. No Google account, production domain, provider credential, Lightsail, UAT, or Caddy was accessed.

## Implemented

- Local Authorization Code-style OIDC fixture behind the identity adapter with persisted single-use state, nonce, PKCE verifier/challenge, exact callback URI, signed JWT issuer/audience/expiry/signature/provider-sub validation, and safe cancellation/failure redirects.
- Google identity is keyed only by provider `sub`. An email match cannot link accounts; linking requires an already authenticated local session plus successful OIDC proof.
- Active, versioned plan catalog seed for Essentials, Growth, and Scale. Plan/cadence changes are validated and persisted in server onboarding progress before provisioning.
- One transactional provisioning operation creates the provisioning Workspace, sole initial Owner role/membership, entitlement snapshot, one-time trial timestamps, activation, onboarding completion, scoped audit, and outbox record.
- Idempotency is bound to authenticated user, operation, key, and canonical request hash. Identical retries return the stored outcome; changed-input reuse returns conflict.
- Workspace-ready authority and CRM entry are gated from the current session, completed onboarding record, active Workspace, active membership, and scoped role. Query parameters and `sessionStorage` no longer grant workspace/plan/Owner access; remaining lead/invite browser state is explicitly demo-only content.
- Workspace authorization requires session user plus active membership in the requested active Workspace. Cross-tenant lookup returns no context. Last-Owner removal/downgrade is transactionally rejected.
- Invitations and teams remain optional and outside provisioning.

## Final verification

| Check | Result |
| --- | --- |
| Migration history | Passed: all 7 checked-in migrations; migration 0006 removes the obsolete hardcoded local redirect constraint |
| Immediate migration rerun | Passed |
| Database health | Passed: `{ ok: true, latencyMs: 15 }` |
| Unit/direct-route suite | Passed: 25 tests; 44 live tests skipped by design |
| Targeted Owner PostgreSQL suite | Passed: 5 tests in `ownership-remediation.integration.test.ts` |
| Normal live PostgreSQL command | Passed: 44 tests across 5 selected serial files, including both Slice 3 suites and the Owner remediation suite |
| Playwright | Passed: 7 journeys, including safe OIDC failure/cancellation, provisioning/refresh, and real CRM logout |
| Lint | Passed after final navigation annotation |
| Production build | Passed: Next.js 16.3.1, 26 routes/pages; CRM routes are dynamically server-gated |
| Mailpit/worker | Passed: 21 delivered local messages; restartable worker exited cleanly with no pending work |
| npm audit | 0 critical, 0 high, 4 moderate development-tool findings; only proposed fix is a forced breaking Drizzle downgrade and was not applied |

Live Slice 3 evidence covers catalog validation, complete provisioning side effects, sole Owner, entitlement/trial creation, identical replay, changed-input conflict, cross-tenant denial, last-Owner rollback, signed OIDC completion, and OIDC transaction replay rejection. Browser evidence proves the local OIDC journey reaches server-provisioned workspace-ready state and retains server-derived Workspace Owner state after refresh; all accepted Slice 2 browser journeys continue to pass.

## Remaining external gates

Real Google acceptance still requires the approved Google Cloud project, consent screen, canonical HTTPS domain, exact production redirect URI, client identifier/secret, and Product/Operations linking sign-off. None are required or used by this local fixture.

## Gate-remediation evidence

- OIDC completion now locks the unconsumed transaction and validates state, verifier, exact redirect, signature, issuer, audience, expiry, nonce, verified-email status, and non-empty `sub` before consuming it in the same identity/session/audit transaction. Live tests reject every dimension and prove failed attempts leave the transaction unconsumed.
- Authenticated linking rejects a provider `sub` owned by another User without creating a session or changing either identity. Tests also prove email-only matching fails, new-sub proof linking succeeds, and same-user relinking is idempotent.
- `OIDC_MODE` is explicit. Fixture start/issuer/callback return 404 when disabled, and environment validation forbids fixture mode in production. Redirects are checked against the exact configured allowlist before persistence or issuance.
- Safe OIDC success/failure/link-conflict audits are emitted without tokens or claim payloads. Provisioning emits distinct `workspace.created` and `workspace.initial_owner_assigned` events. The email claimant filters to the two identity-email topics; a live assertion proves `workspace.provisioned` remains pending for its future consumer.
- Owner mutations lock the Workspace, re-resolve the active actor Owner membership, serialize count-and-change, audit success, and reject stale/unauthorized actors. Competing Owner removals leave exactly one Owner. Atomic transfer promotes the successor before removing the prior Owner and preserves exactly one active Owner.
- CRM sign-out calls the CSRF-protected server logout route, clears demo state only after success, and uses history replacement. Playwright proves Back plus authenticated reload and direct `/crm` navigation cannot reuse the revoked session.

Migration `0006_awesome_mattie_franklin.sql` removes the obsolete hardcoded local callback constraint so exact redirect policy is owned by validated configuration. All seven checked-in migrations were applied and immediately rerun successfully.

## Final Owner-transfer and audit correction

- Owner authority is re-resolved after the Workspace row lock from active membership ID + User ID + Workspace ID + joined persisted Owner role. The caller-provided role string is ignored.
- Transfer requires an active same-Workspace successor and rejects self-transfer. It promotes the successor first, then removes the verified prior Owner with membership, User, Workspace, active-status, and persisted-role predicates. Both updates must affect exactly one row or the transaction rolls back.
- Successful transfer audit attribution records the verified prior Owner membership as `actor_membership_id` and the promoted successor membership as `target_id`; the live valid-transfer assertion proves both IDs alongside Workspace, actor User, success outcome, rollback, and active-Owner invariants.
- Owner-change uses the same database-derived actor boundary and scoped one-row mutation assertion.
- Successful Owner changes/transfers audit inside the business transaction. Denials roll back the business transaction and then pass through a separate safe audit boundary that re-derives any actor scope from membership + User, omits supplied target identifiers, and never scopes the event from caller-provided Workspace/role data.
- The targeted 5-test PostgreSQL suite covers forged role, stale/removed actor, cross-Workspace actor membership, mismatched User, cross-tenant successor, self-transfer, forced zero-row mutation rollback, denial and success audits, and concurrent transfer/removal. It asserts no cross-tenant changes and at least one active Owner after every path.
- `npm run test:integration` expands `tests/*.integration.test.ts` with `RUN_DB_INTEGRATION=1`; the final output explicitly selected five files and passed all 44 tests.

Final attribution rerun: targeted Owner suite **5/5 passed** and normal integration command **44/44 passed** across all five selected files.

No schema change or migration was needed for this service-and-test-only correction.
