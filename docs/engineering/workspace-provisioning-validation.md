# Workspace provisioning validation

Date: 2026-08-21  
Status: validated with fresh local PostgreSQL evidence  
Boundary: local source and database only; no external systems

## Direct answers to Product

### 1. Does signup, verification, login, or package selection create a Workspace or Owner?

**No.** Fresh evidence showed the following exact Workspace-domain counts immediately after password registration:

| Entity | Count |
| --- | ---: |
| Workspaces | 0 |
| Roles | 0 |
| Workspace Memberships | 0 |
| Entitlement snapshots | 0 |
| Trials | 0 |

The User was then verified, logged in through a real PostgreSQL Session, and the server-persisted package/cadence was changed to `scale` / `annual`. The exact counts remained `0 / 0 / 0 / 0 / 0`. Before provisioning, the authoritative onboarding row was:

- `selected_plan_code = scale`
- `billing_cadence = annual`
- `current_step = workspace`
- `workspace_id = null`
- `completed_at = null`

Registration creates the identity/onboarding boundary only: User, password credential, onboarding progress, verification token/outbox, and safe identity audit. Verification activates the User and advances onboarding. Login creates a Session. Package confirmation validates and updates onboarding. None of those operations creates tenant authority or starts a trial.

### 2. When is the Workspace created, and how many initial Owners/members exist?

The Workspace is created **only when the active verified User, authenticated by a live server Session, submits the Workspace creation operation after server-catalog plan confirmation** (`POST /api/workspaces` → `provisionWorkspace`). It exists only after the provisioning transaction commits.

Immediately after the fresh successful transaction:

- Workspaces: **1**, status `active`.
- Workspace-local Role definitions: **3** — `owner`, `admin`, and `member`.
- Workspace-local Owner Role definitions: **exactly 1**.
- Workspace Memberships: **exactly 1**.
- Active Owner Memberships for the initiating User: **exactly 1**.
- Admin Memberships: **0**.
- Member-role Memberships: **0**.

The seeded Admin and Member rows are policy definitions, not people. The Workspace begins with one active member total, and that member is the initiating Owner.

## Fresh isolated database evidence

To preserve existing local evidence, validation used a new database rather than clearing the shared test database:

- Database: `nexaflow_provision_validation_20260821`
- PostgreSQL: local Docker, loopback `127.0.0.1:54329`
- Checked-in migrations applied successfully from an empty database.
- Final database health: `{ ok: true, latencyMs: 13 }`.
- The isolated database was retained after validation; no existing database was dropped or cleared.

The accepted `scale` catalog fixture had catalog version `validation-2026-08-21`, 15 active seats, and a 21-day trial.

### Successful transaction

The transaction produced:

| Persisted result | Exact evidence |
| --- | --- |
| Workspace | 1 active Workspace, `scale` / `annual` |
| Trial | One interval; start `2026-08-21T06:39:36.547Z`, end `2026-09-11T06:39:36.547Z`, exactly 21 days |
| Roles | `admin`, `member`, `owner`; one row each |
| Membership | 1 active Membership; initiating User; Role `owner` |
| Entitlement | 1 snapshot; `scale`; catalog `validation-2026-08-21`; `activeSeats: 15` |
| Pipeline foundation | 4 default stages |
| Onboarding | `current_step = complete`, Workspace attached, completion timestamp present |
| Audit | 1 `workspace.created` and 1 `workspace.initial_owner_assigned` |
| Outbox | 1 `workspace.provisioned` message |
| Idempotency | 1 `workspace.provision` result row |

All writes use the same checked-out PostgreSQL transaction. The Workspace is inserted as `provisioning`, receives its Roles, sole Owner Membership, stages, entitlement/trial, onboarding completion, audits, outbox, and idempotency result, then becomes `active` before commit.

### Replay and changed input

Replaying the same principal, operation, key, and trimmed-name hash returned the identical `workspaceId` and slug. Counts after replay remained:

- Workspaces: **1**
- Memberships: **1**
- Entitlement snapshots: **1**
- Workspace audits: **2**
- Provisioning outbox messages: **1**

Reusing the same key with a changed Workspace name returned `idempotency_conflict`; it created nothing new and did not restart the trial.

### Failure rollback

A validation-only PostgreSQL trigger injected failure when the transaction attempted to insert `workspace.provisioned`. The service returned the injected failure and rollback left:

- Workspaces, Roles, Memberships, entitlements, trials: **0 each**
- Pipeline stages: **0**
- Workspace-scoped audits: **0**
- Provisioning outbox: **0**
- Provisioning idempotency rows: **0**
- Onboarding: still `workspace`, `workspace_id = null`, `completed_at = null`

The trigger and function were removed immediately after the scenario. This proves the Workspace cannot commit without its Owner, entitlement/trial, onboarding completion, audit/outbox, and idempotency boundary.

### Concurrent/duplicate submission

Two concurrent submissions using the same key and request hash both returned the same Workspace ID and slug. Final counts were one Workspace, three Role definitions, one Membership, one entitlement, and one trial.

Two concurrent submissions using different keys for the same onboarding row produced one success and one `not_eligible` result. Final counts again remained one Workspace, three Role definitions, one Membership, one entitlement, and one trial. The onboarding-row lock therefore prevents a second Workspace even when idempotency keys differ.

## Regression evidence

Focused command after repair:

- `tests/identity.integration.test.ts` and `tests/slice3.integration.test.ts`: **2 files, 18/18 tests passed**.

Normal PostgreSQL command:

- `RUN_DB_INTEGRATION=1 npm run test:integration`: **8 files, 82/82 tests passed**.

Additional checks:

- `npm run lint`: passed with zero errors/warnings.
- `npm test -- --run`: **9 files, 36/36 selected tests passed**; 82 database tests were intentionally skipped by the non-integration command.
- Local PostgreSQL and Mailpit containers were healthy.

## Material blocker found and repaired

The first focused regression run produced 17/18 passes. `tests/slice3.integration.test.ts` cleared identity/workspace tables between tests but left `rate_limit_windows` from earlier local runs. A stale registration limiter caused a later fixture User not to be created, and the test then attempted to read an undefined row.

The narrow repair adds `rate_limit_windows` cleanup to that integration file. No application or provisioning behavior changed. The focused suite then passed 18/18 and the normal database regression passed 82/82.

## Files changed in this validation package

- `tests/slice3.integration.test.ts` — isolated rate-limit fixture cleanup only.
- `docs/engineering/workspace-provisioning-validation.md` — this evidence report.

## Final conclusion

Current behavior matches the accepted provisioning boundary. Signup does not create a Workspace. Verification, login, and persisted package/cadence still do not create a Workspace. The explicit authenticated Workspace creation transaction creates one active Workspace with one and only one initial active Owner Membership, plus the expected Role definitions, entitlement/trial, onboarding completion, audits, outbox, and replay protection. Failure and concurrency do not leave partial or duplicate tenant state.
