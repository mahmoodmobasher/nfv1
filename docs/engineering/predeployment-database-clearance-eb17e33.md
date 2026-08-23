# Pre-deployment database clearance — `eb17e33`

Date: 2026-08-23  
Scope: database and transaction review of `origin/main` at `eb17e33`; local disposable PostgreSQL only  
UAT mutation: none

## Verdict

**CLEAR AFTER P2 CORRECTION.** No P0 or P1 database defect was found. One P2 lock-order defect in the account password-change transaction was corrected on `codex/dev3-predeploy-db-clearance`. No migration change is required.

## Findings

| Priority | Finding | Disposition |
| --- | --- | --- |
| P0 | None | — |
| P1 | None | — |
| P2 | Password change updated the password credential before superseding reset tokens, inverse to reset completion's token-before-credential order. Concurrent password change/reset completion could deadlock; PostgreSQL rollback prevented partial state but one valid request could fail. | Corrected by superseding outstanding reset tokens before updating the credential. Added a regression guard for the lock order. |
| P3 | None | — |

## Migration and schema evidence

- Drizzle generation reported no uncommitted schema change; `drizzle-kit check` passed.
- All 12 migrations applied to a fresh, explicitly named disposable database. Immediate rerun was clean.
- Ledger count/head: `12` / `1787501845245`, matching `0011_white_masque`.
- Database health passed.
- `user_preferences` remains global-to-User with one row per User, cascading FK, typed appearance/locale/time-zone checks, positive version, and timestamps.
- Partial unique `identity_password_user_uq` and session lookup `sessions_user_active_idx` are present.
- Aggregate integrity checks found zero duplicate password credentials and zero invalid preference rows.
- Migration `0011_white_masque.sql` and its Drizzle metadata are unchanged.

## Transaction and query evidence

- Password change keeps reset-token supersession, credential update, security-version/session revocation, and success Audit in one transaction.
- Outstanding reset tokens are updated only when purpose is `password_reset` and both `consumed_at` and `replaced_at` are null.
- The token update now precedes the credential update, matching reset completion's lock order.
- Existing injected-late-failure coverage proves password, reset token, Session/security version, and success Audit roll back together.
- Preferences retain authenticated self-only scope, row locking, expected-version predicates, and authoritative returned state.

## Verification

- Focused data-model tests: **3/3 passed**.
- Serialized PostgreSQL suite on the isolated database: **119/119 passed** across 14 files.
- ESLint: passed.
- TypeScript (`tsc --noEmit`): passed.
- Backup/restore scripts pass syntax review and retain fail-closed boundaries: encrypted backup, explicit absolute targets, refusal to restore over configured UAT, refusal to overwrite an existing restore database, and retention of failed disposable restores for investigation.
- Routine application rollback must leave additive migration `0011` installed. Restoring a pre-migration backup or deleting preferences remains separately authorized database work.

An earlier run against the shared default local database was discarded because another test workload was mutating the same fixtures. The recorded results above are from the isolated disposable database only.

## Integration

Cherry-pick the Dev3 clearance commit onto the release integration branch. No UAT data operation, migration generation, or deployment action is included.
