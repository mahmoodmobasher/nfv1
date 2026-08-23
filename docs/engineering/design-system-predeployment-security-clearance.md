# Design System Stage 1/2 pre-deployment backend security clearance

Date: 2026-08-23
Audited base: `origin/main` at `eb17e33edc3f8f30f161c87176ede1c8678e17d5`
Audit branch: `codex/design-system-predeploy-security`
Verdict: **CLEAR after bounded P2 remediation; no P0 or P1 findings**

## Finding classification

- **P0:** none.
- **P1:** none.
- **P2 — remediated:** account-route authentication and privacy normalization. Unauthenticated profile/preferences requests were converted from the identity boundary's `authentication_required` error into `400 validation_failed`; rate-limit errors could likewise be collapsed. Profile/password responses and mutation-guard rejections also lacked an explicit account-owned `Cache-Control: private, no-store` header. A shared account response boundary now preserves tenant-safe `401 authentication_required` and `429 rate_limited` outcomes and marks every profile, preferences, and password success/failure response private/no-store. No identity, Session, Workspace, Membership, Role, or preference data was exposed by the prior generic failure.
- **P3 — open, non-production infrastructure:** integration suites default to one destructively reset local database. Concurrent worktrees can delete each other's fixtures, producing deadlocks and foreign-key cascades. The release gate passed against an isolated migrated Dev2 database. CI and parallel local gates should allocate a database per task. This does not affect application runtime or UAT data.

## Boundary conclusions

- **Server theme authority:** the root Server Component validates the configured Session through `resolveIdentityContext`, reads only the authenticated User's global allowlisted appearance, and falls back to `system` on missing, invalid, expired, or unavailable state. No Workspace authority is derived or disclosed.
- **Session cookie and caching:** Proxy trims `SESSION_COOKIE_NAME`, retains the established fallback, and marks any document carrying that cookie private/no-store before Session validation. Stale/invalid configured-cookie behavior and anonymous non-disclosure pass.
- **Nonce/CSP:** each document request receives an unpredictable nonce in the forwarded request CSP, response CSP, and fixed pre-paint bootstrap. Production `script-src` contains neither `unsafe-inline` nor `unsafe-eval`. Positive nonce equality and negative mismatched-nonce blocking are covered by boundary/unit and browser regressions. Caddy preserves CSP and independently protects authenticated route families.
- **Preferences:** values remain typed and global to the authenticated User. Updates lock the Session and preference row, require `expectedVersion`, return 409 on stale writes, and write success Audit in the same transaction. Failed updates roll back persistence; client preview rollback is covered by the accepted browser regression. Every API outcome is now explicitly private/no-store.
- **Profile:** read/update remains authenticated-self only; display-name normalization and success Audit remain transactional. Responses are explicitly private/no-store.
- **Password/security:** recent authentication, current password, password policy, and password credential are required. Password update, replacement of every active password-reset token, all-Session revocation/security-version rotation, and the singular success Audit share one transaction. The rollback regression preserves the prior password, reset token, Session, and absence of success Audit after a late failure.
- **Production runtime:** all document routes build as dynamic. Live production-mode inspection returned matching CSP/bootstrap nonces, no unsafe production script directives, configured stale-cookie private/no-store, tenant-safe account 401 responses, and private/no-store mutation denials.

## Verification evidence

- `npm audit --omit=dev --json`: 0 production vulnerabilities across all severities.
- ESLint with zero warnings: pass.
- TypeScript `--noEmit`: pass.
- Direct/unit suite: 63 passed.
- Focused theme/CSP/auth suite: 18 passed.
- Focused account service/route PostgreSQL suite: 7 passed.
- Full PostgreSQL suite on isolated migrated database: 121 passed across 15 files.
- Next.js 16.3.1 production build: pass; all document routes dynamically rendered.
- Live production-mode header/API inspection: pass.
- `git diff --check`: pass.

## Deployment recommendation

The bounded remediation branch is suitable for Architecture/integration review. After that change is integrated and the same production build artifact is selected, backend/security clearance supports UAT deployment. Do not deploy this Dev2 branch directly.
