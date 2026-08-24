# UAT-GAP-013 controlled integration checkpoint

Date: 2026-08-24

Status: **GO FOR SEPARATELY AUTHORIZED MAIN PROMOTION; NO-GO FOR TAG OR DEPLOYMENT**

## Authority and exact inputs

- Fresh remote baseline: `origin/main` `e0ad785d3efe5ef16a995602aad1e24affe34acb`, re-fetched unchanged immediately before this checkpoint.
- Accepted immutable candidate: `2840495bf34cf75c4e1ab1829c41facfb5844702`.
- Candidate implementation: `4393974a728dbfa6497460bec5f0aa921858cf3c`.
- Backend/Security acceptance: `4203a9cfd2b82a5083e2ffd91ab4bed0e71c4231`.
- Architecture authority: `7d9b42ba9844eb0e193f7ead12a96b278d7318ff`.
- Architecture acceptance: `d5d4483`.
- Integration branch: `codex/uat-gap-013-integration-checkpoint`.
- Exact integrated tree before this append-only checkpoint record: `6c20eff75e100228b20b6ce924143c070e3d20b0`.

Product authorized only a controlled fresh-main integration checkpoint. No main push, tag, release, UAT access, tester admission, email, configuration, database-schema, provider, infrastructure, production, or Phase 5 action occurred.

## Integration method and identity

The branch started from exact `origin/main` `e0ad785`. It fast-forwarded through candidate implementation `4393974`, candidate handoff `2840495`, and Backend/Security acceptance `4203a9c`, preserving that accepted ancestry exactly.

Architecture acceptance lives on an independent Architecture lineage containing older unrelated review history. To avoid introducing that history, only the authorized Architecture decision and acceptance documents were cherry-picked without conflict:

- `7d9b42b` became `7c11486`;
- `d5d4483` became `6c20eff`.

Their committed blobs are byte-identical to the source commits. The Backend/Security review blob is also byte-identical. Every file introduced or modified by candidate `2840495` is byte-identical in the integration tree. There were no conflicts or semantic resolutions.

Before this checkpoint record, the exact delta from `e0ad785` was:

- two Architecture documents;
- three engineering inventory/handoff/review documents;
- nine route files with exactly ten added `await` operations and no other application semantic change; and
- two focused lifecycle test files.

No unrelated review history, Caddy/Compose/migration/schema/configuration/provider file, or Workspace/security authority delta is present.

## Post-integration verification

| Gate | Result |
| --- | --- |
| Ancestry, exact inventory, candidate/review blob identity | PASS |
| `git diff --check` | PASS |
| Un-awaited `auditedFailure` source scan | PASS; none remain in API route-owned pool paths |
| Focused AST invariant | **2/2 PASS** |
| Fresh PostgreSQL migration apply and idempotent rerun | **PASS / PASS** |
| Serialized PostgreSQL lifecycle and required related suites | **57/57 PASS** across 6 files |
| Full direct/unit suite | **246 PASS**, 139 PostgreSQL-gated skips; 23 files passed / 16 skipped |
| Full ESLint | PASS |
| TypeScript `npx tsc --noEmit` | PASS |
| Next.js 16.3.1 production build | PASS; 42/42 static generation tasks and all affected dynamic routes emitted |
| Integrated production-build probes | **3/3 PASS** |

The PostgreSQL gate used a fresh isolated PostgreSQL 16 container, applied all migrations twice, ran the exact 15 lifecycle tests plus 42 accepted Audit/Role/stale/ownership/Slice 4 tests serially, and removed the disposable container afterward. The local Docker daemon was initially unavailable; it was restarted before any test container existed, after which the exact clean gate passed. This was local test-runtime recovery, not a repository or external infrastructure change.

Production-build probes covered Workspace settings `GET`, invitation `GET`, and invitation `POST`. Each returned bounded 401 `authentication_required` with a valid request ID and no pool/PostgreSQL/SQL/stack/Workspace/target disclosure. PostgreSQL recorded exactly three minimized system denial Audits, zero business/Outbox/idempotency rows, and the server emitted no pool-ended, unhandled, or other error output.

## Security and scope disposition

- All ten accepted route-owned denial paths await Audit completion before unchanged `pool.end()` cleanup.
- Response statuses, request IDs, action/target metadata, service-owned splits, guards, rate limits, authorization, transactions, and success paths retain candidate byte identity.
- Normal denials commit one minimized Audit; injected failure rollback and delayed ordering remain covered; concurrent requests retain independent pools and Audits.
- Workspace Session, active Membership, Owner/Admin/Member, ownership, Team/visibility, entitlement, tenant-safe denial, Outbox, and Audit boundaries are unchanged.
- `UAT-GAP-013` is implementation-remediated but remains operationally P1/open until a separately authorized release later than rejected `.7` passes live denial/Audit/log evidence.

## Promotion, release, and rollback disposition

This immutable checkpoint is suitable for a separate Product decision to promote the exact checkpoint commit to `origin/main` by normal non-force update, provided remote main remains `e0ad785` and the checkpoint ancestry/status are unchanged.

No tag or deployment is authorized. Rejected `v0.5.0-uat.7` must never move or be reused. A later Product-authorized immutable UAT attempt must use an identifier later than `.7` and rerun the disposable-UAT denial/Audit/log gate before tester admission or controlled-recipient email.

Rollback is omission/revert of implementation `4393974` and the associated documentation/tests. No schema, data, Caddy, configuration, provider, or infrastructure rollback is required.
