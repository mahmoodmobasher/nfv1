# Combined predeployment Architecture review

Review date: 2026-08-23

Candidate: `caa1f65308f311ffe3986c5774171398343795c0` on `codex/predeployment-defect-clearance`

Base: `eb17e33edc3f8f30f161c87176ede1c8678e17d5`

Verdict: **REJECT — one P2 transaction blocker remains**

Review boundary: read-only inspection of the immutable integration candidate, its component commits, conflict result, source, tests, and durable clearance records. This commit changes Architecture documentation only and does not modify application code or deployment state.

## Severity summary

| Priority | Findings | Disposition |
| --- | ---: | --- |
| P0 | 0 | None identified. |
| P1 | 0 | None identified. |
| P2 | 1 | Concurrent password-change/password-reset completion can still deadlock because their first locked resources differ. Remediation required before deployment. |
| P3 | 1 | Shared disposable-database interference remains a test-infrastructure limitation; isolated serialized release runs are the accepted workaround. |

## P2 — password/reset lock order remains cyclic

**Status: BLOCKER**

The candidate changes password-change ordering so reset tokens are updated before the password credential. That closes the narrower credential/token inversion, but it does not align the complete transaction lock order.

Evidence in `caa1f65`:

- `src/server/account/service.ts:174-180` starts password change by selecting the current Session `FOR UPDATE`, locking the Session row.
- `src/server/account/service.ts:189-193` then updates and locks all active password-reset token rows.
- `src/server/account/service.ts:194-198` next updates the credential and revokes all Sessions.
- `src/server/identity/service.ts:168-175` starts reset completion by selecting the reset token `FOR UPDATE` and consuming it.
- `src/server/identity/service.ts:176-177` then updates the credential and revokes all Sessions, which includes the Session row already locked by password change.

A valid concurrent schedule remains:

1. Password change locks Session `S`.
2. Reset completion locks token `R`.
3. Password change waits for `R`.
4. Reset completion reaches all-Session revocation and waits for `S`.
5. PostgreSQL detects the cycle and aborts one otherwise valid security operation.

PostgreSQL rollback prevents partial password, token, Session, or Audit state, so this is not a P0/P1 integrity or account-takeover defect. It is a reproducible security-operation availability and transaction-contract defect and remains P2 for the predeployment gate.

### Required remediation

Responsible role: **Dev3 database**, coordinated with **Dev2 backend/security**.

1. Establish one complete canonical lock order shared by password change and reset completion, not only token-before-credential ordering.
2. Preserve active-Session, recent-authentication, current-password, password-policy, and password-credential validation.
3. Preserve atomic reset-token supersession/consumption, password update, User security-version increment, all-Session revocation, and exactly one success Audit.
4. Preserve generic invalid/expired reset behavior and bounded account-route denial responses.
5. Do not introduce retries that can duplicate Audit, Session rotation/revocation, or password mutation.

### Required acceptance evidence

- A deterministic PostgreSQL concurrency regression runs password change and reset completion for the same User and outstanding token with controlled interleaving.
- The test completes without PostgreSQL deadlock (`40P01`), indefinite wait, or partial state.
- Exactly one valid committed winner is represented according to the chosen serialization contract; the losing/reconciled request returns a bounded existing error rather than an unexpected database failure.
- Final password, token terminal state, User security version, revoked Sessions, and Audit events agree with the committed winner.
- Injected late failure continues to roll back password, token, Session/security-version, and success Audit together.
- Full isolated serialized PostgreSQL regression, unit/routes, lint, TypeScript, and build remain green.

## Accepted integrated areas

### Account API authentication and privacy

- `src/server/account/http.ts` centralizes private/no-store account responses.
- Unauthenticated account reads retain `401 authentication_required`; rate limits retain `429 rate_limited`; unexpected/internal detail remains hidden.
- Success, validation/authentication failures, and early mutation-guard denials for profile, preferences, and password routes are explicitly `private, no-store`.
- No User, credential, Session, Workspace, Membership, Role, or preference data is exposed through normalized denials.

### Cache, CSP, theme, and Session boundary

- Configured `SESSION_COOKIE_NAME` detection, stale/invalid-cookie private/no-store handling, anonymous safety, server-authoritative theme first paint, nonce propagation, production CSP restrictions, Caddy defense in depth, ephemeral preview rollback, and System-only listener lifecycle remain unchanged from accepted `eb17e33`.
- No candidate conflict changes `src/proxy.ts`, the root theme resolver, nonce bootstrap, Caddy cache/CSP boundary, or theme preference authority.

### Workspace Foundation

- Personal profile/preferences/security remain global User resources and do not introduce Workspace, Membership, Role, Team, ownership, visibility, Audit, or Entitlement authority.
- Pipeline changes are semantic presentation and test-fixture changes only. Existing server-derived Workspace context, active Membership, persisted RBAC, ownership/Team/visibility access, and tenant-safe denials remain intact.
- No schema or migration change is introduced. Migration `0011` remains additive and installed on rollback.

### Pipeline and visual remediation

- Pipeline stage, card, count, metadata, visibility, brand, Workspace-control, and search styles use the accepted semantic token layer in Light and Dark.
- Paired settled Pipeline and refreshed Leads baselines, contrast, focus, 44px, 320px, 200% proxy, populated/empty/no-match, and full browser evidence are recorded.
- Graphics re-review records no remaining material blocker.

### Conflict and rollback review

- The component commits touch separate presentation, account-route, and password-transaction areas; the final candidate contains their intended changes without conflict markers or whitespace errors.
- Application rollback must leave migration `0011` installed and retain stored preferences.
- Visual rollback must not remove configured-cookie cache protection, nonce CSP, or server-authoritative theme behavior.
- Account-route rollback must not restore generic cached failures or remove private/no-store headers.
- Password remediation must remain one transaction; no down migration or UAT data operation is required.

## Evidence disposition

Accepted recorded evidence includes:

- fresh apply plus clean migration rerun, 12 migration ledger rows, and healthy database;
- unit/direct suite up to 64 tests;
- focused theme/CSP/account boundary tests;
- focused account PostgreSQL tests and full isolated PostgreSQL evidence up to 121 tests across 15 files;
- full Playwright 30/30 plus focused Pipeline and design-system journeys;
- ESLint, TypeScript, production build, Caddy validation, production header/API inspection, and zero production dependency vulnerabilities.

That evidence is sufficient for every reviewed area except the unresolved cross-flow password/reset concurrency cycle. The static test in `tests/feature3-data-model.test.ts:25-30` verifies only source-text token-before-credential order and cannot prove absence of Session/token deadlock.

## P3 — test database isolation

Integration suites destructively reset a shared local database by default. Concurrent worktrees can interfere with fixtures and produce misleading failures. Release evidence correctly uses an isolated migrated database and serialized execution. Retain per-task database allocation for CI/parallel work; this is not an application-runtime or deployment blocker.

## Final disposition

**REJECT.** No P0 or P1 finding remains. Dev3/Dev2 must close the P2 complete lock-order defect and provide the deterministic concurrency evidence above. Architecture will re-review a new immutable candidate. Product must not treat the current clearance records or successful non-concurrent suites as predeployment Architecture acceptance.
