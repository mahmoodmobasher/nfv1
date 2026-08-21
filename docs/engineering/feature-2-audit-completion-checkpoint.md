# Feature 2 Work Item 5 — Audit completion checkpoint

Date: 2026-08-21  
Status: **ready for bounded Architecture and Graphics re-review**

## Delivered boundary

- Canonical Feature 2 taxonomy now follows the approved contract:
  - invitation create/resend/revoke/accept and bounded administration/accept denial;
  - `workspace.membership_changed` for generic Role, suspend, and remove changes, `workspace.membership_restored` for restore, and one shared membership denial action;
  - ownership transfer success/denial;
  - workspace selection success and `workspace.selection_denied`.
- The shared audit writer enforces runtime allowlists for metadata and before/after state. It rejects non-allowlisted fields before persistence.
- Successful mutations receive bounded before/after evidence, a versioned allowlisted metadata object, and a non-secret SHA-256 correlation identifier when the caller did not supply one.
- Caller idempotency keys are hashed for audit correlation and never stored in audit rows.
- Route-level validation/authentication/tenant/rate denials and transactional service denials have one explicit owner. Invite resend/revoke/accept and Owner transfer no longer double-audit service failures.
- Authenticated CSRF/Origin rejection on Feature 2 mutation routes now writes one bounded denial before returning the existing generic 403 response; unauthenticated rejected traffic does not create audit-table noise.
- Safe denial attribution re-resolves the active actor Membership. A target identifier is retained only when a same-Workspace actor scope is verified; foreign or unresolved targets are omitted.
- Same-key replay returns the recorded result before a second business audit/outbox/mutation. Success audits remain in the same transaction as their mutation, idempotency result, and invitation outbox write.

No administrator audit-history screen was added. The approved Product Work Item 5 contract explicitly states that such a screen is not required; this increment is the required audit-write completeness boundary.

## Durable evidence

Focused audit unit suite:

- `tests/audit.unit.test.ts`: **3/3 passed**
- Proves deterministic non-plaintext correlations, legacy-to-canonical normalization, safe inferred state, and runtime rejection of email/token-shaped non-allowlisted payloads.

Focused live PostgreSQL audit suite:

- `tests/feature2-audit-completion.integration.test.ts`: **5/5 passed**
- Proves:
  - one Role success + replay suppression + one stale denial;
  - lifecycle rollback with no false success;
  - invitation audit/outbox/idempotency coupling and payload exclusion;
  - one committed Owner-transfer winner and one bounded concurrent loser while retaining one Owner;
  - hashed Workspace transition plus exactly one invitation route/service denial.

Relevant live PostgreSQL regressions:

- Feature 2/Slice 4 focused matrix: **40/40 passed**.
- Complete integration command: **13 files, 111/111 tests passed**.
- Database health: `{ ok: true, latencyMs: 17 }`.

Browser regressions:

- Role authority, stale-data reconciliation, and Workspace selection: **9/9 passed**.
- Includes desktop, 320px, 200% zoom, concurrent stale edits, authority reload, multi-tab switching, inaccessible-option reconciliation, and logout protection.
- Audit evidence is intentionally server-side and has no new visual surface; existing user-facing mutation and recovery behavior is unchanged.

Static validation:

- Unit/route command: **11 files passed, 41/41 tests passed**; **111 database tests skipped by design** without `RUN_DB_INTEGRATION=1`.
- ESLint: **passed, zero warnings**.
- TypeScript: **passed** after the production build generated Next route types.
- Next.js 16.3.1 production build: **passed**, 32 static pages generated and all dynamic routes collected.

## Files changed for Work Item 5

- `src/server/security/audit.ts`
- `src/server/tenant-admin/denial.ts`
- `src/server/tenant-admin/http.ts`
- `src/server/tenant-admin/invitations.ts`
- `src/server/tenant-admin/administration.ts`
- `src/server/tenant-admin/role-authority.ts`
- `src/server/workspaces/selection.ts`
- `src/app/api/invitations/accept/route.ts`
- `src/app/api/workspaces/[workspaceId]/invitations/[invitationId]/resend/route.ts`
- `src/app/api/workspaces/[workspaceId]/invitations/[invitationId]/revoke/route.ts`
- `src/app/api/workspaces/[workspaceId]/invitations/route.ts`
- `src/app/api/workspaces/[workspaceId]/memberships/[membershipId]/route.ts`
- `src/app/api/workspaces/[workspaceId]/ownership/transfer/route.ts`
- `src/app/api/workspaces/switch/route.ts`
- `tests/audit.unit.test.ts`
- `tests/feature2-audit-completion.integration.test.ts`
- Canonical taxonomy expectation updates in the existing Feature 2/Slice 4 PostgreSQL and browser tests.
- `docs/product/feature-2-implementation-checklist.md`
- This checkpoint.

## Remaining boundary

- Work Item 6 has not started.
- No audit-history UI, Feature 3, external provider, deployment, or unrelated hardening work was added.
- The existing broader shared-worktree changes from Work Items 1–4 remain present and were not reverted.
