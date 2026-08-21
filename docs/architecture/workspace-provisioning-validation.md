# Workspace Provisioning Validation

Status: **ACCEPT**  
Review date: 2026-08-21  
Scope: current Workspace creation and initial Owner assignment against accepted security/data contracts  
Boundary: local source, schema, documentation, and PostgreSQL evidence only; no application code or external system changed

## Verdict

Workspace provisioning is accepted. A Workspace is **not** created at package browsing/selection, signup, email verification, or login. It is created only after an active verified User has an authenticated Session, confirms a valid server-catalog package/cadence, supplies a Workspace name, and submits the Workspace creation mutation.

The provisioning transaction creates exactly one initial Workspace Membership, and that Membership references the Workspace's seeded Owner Role. The simultaneously seeded Admin and Member rows are Role definitions only; they are not users and do not create Admin/Member Memberships. The successfully provisioned Workspace therefore begins with exactly one active member and exactly one active Owner.

No material provisioning or initial-ownership blocker was found.

## Exact creation timing

| Journey point | Durable writes | Workspace created? |
| --- | --- | --- |
| Package selection before signup | Browser selection is passed as an onboarding hint; no tenant authority | **No** |
| Signup (`POST /api/auth/register`) | User, password credential, one onboarding record, verification token/outbox, identity audit | **No** |
| Email verification (`POST /api/auth/verify`) | User becomes active/verified; onboarding moves to `workspace` | **No** |
| Login (`POST /api/auth/login`) | Opaque PostgreSQL Session is created/rotated; login audit | **No** |
| Authenticated package confirmation (`POST /api/onboarding/plan`) | Active/effective server catalog validates package/cadence; onboarding selection is updated | **No** |
| Workspace form submission (`POST /api/workspaces`) | Calls the atomic provisioning transaction after Session resolution | **Yes, on successful transaction commit** |

The current password UI performs the final two mutations in order from **Create workspace**: it first confirms the persisted package/cadence through `/api/onboarding/plan`, then sends the Workspace name and one UUID idempotency key to `/api/workspaces`.

Registration may initially persist an enum-bounded package/cadence from the pre-signup screen, but that value is not sufficient to create a Workspace. The authenticated confirmation and provisioning transaction revalidate it against the current effective server catalog.

Returning users log in and resume `/workspace/create`. If onboarding already has a `workspace_id`, the page redirects to Workspace-ready rather than provisioning again. A verified identity produced through the accepted OIDC boundary likewise obtains identity/session state first and uses the same later Workspace provisioning boundary; OIDC completion itself does not create the Workspace.

## Atomic provisioning invariant

`provisionWorkspace` executes one PostgreSQL transaction containing:

1. idempotency serialization and replay check;
2. locked onboarding/User eligibility resolution;
3. effective server plan/cadence validation;
4. Workspace insert in `provisioning` state;
5. one Owner, one Admin, and one Member Role definition;
6. exactly one active Workspace Membership for the provisioning User, referencing the Owner Role;
7. default Pipeline Stage inserts;
8. entitlement snapshot and one trial interval;
9. Workspace activation;
10. onboarding attachment/completion;
11. `workspace.created` and `workspace.initial_owner_assigned` Audit Events;
12. one `workspace.provisioned` Outbox Message; and
13. the durable idempotency outcome.

Only after all steps succeed does the transaction commit. Any thrown database/service error executes rollback, so a Workspace without its initial Owner, entitlement, completion state, audit/outbox boundary, or idempotency outcome is not committed.

## Sole initial Owner evidence

### Role definitions are not Memberships

Provisioning inserts three Workspace-scoped system Role definitions:

- `owner`
- `admin`
- `member`

These rows define available authorization policies. They do not represent people and do not grant access by themselves.

Provisioning then performs one—and only one—`workspace_memberships` insert. Its `role_id` is the ID captured from the seeded `owner` Role. It does not insert Admin or Member Memberships, Teams, Team Memberships, or Invitations.

### Schema support

- `(workspace_id, role code)` is unique, preventing duplicate seeded Role codes in one Workspace.
- `(workspace_id, user_id)` is unique for Memberships.
- the composite `(workspace_id, role_id)` foreign key requires the Membership's Role to belong to the same Workspace.
- onboarding has one row per User and one nullable `workspace_id` attachment.
- the provisioning eligibility check rejects an onboarding row already attached to a Workspace.
- later ownership services separately enforce the accepted last-active-Owner and atomic transfer rules.

The database schema permits later invited Memberships and ownership transfer by design; “exactly one Owner” is the **initial provisioning invariant**, not a permanent maximum-one-Owner schema constraint. Immediately after provisioning, the transaction creates one Membership total, so there is exactly one initial active Owner.

## Idempotency and concurrency

- Idempotency identity is bound to authenticated User principal, operation `workspace.provision`, UUID key, and a canonical SHA-256 request hash of the trimmed Workspace name.
- The same principal/key/hash returns the stored `{workspaceId, slug}` result without recreating Workspace, trial, Membership, audits, or outbox.
- Reusing the same key with a changed Workspace name returns `idempotency_conflict`.
- A transaction-scoped advisory lock serializes identical principal/key requests.
- Requests using different keys still serialize on `SELECT ... FOR UPDATE` of the User's unique onboarding row. The first successful request attaches `workspace_id`; a waiting request then observes that attachment and fails `not_eligible` before creating another Workspace.
- The unique idempotency constraint provides an additional database guard for principal + operation + key.

This means retries and concurrent double submissions cannot produce two initial Workspaces from one onboarding record through the provisioning service.

## Rollback and execution evidence

The reviewed transaction helper always performs `BEGIN`, commits only after the returned work completes, and rolls back on every thrown error. Every provisioning insert/update/audit/outbox/idempotency write uses that same checked-out client.

Independent focused PostgreSQL result on 2026-08-21:

- `tests/slice3.integration.test.ts`: **4/4 passed**.

The provisioning assertions prove:

- one Workspace, one Membership, one entitlement snapshot, two scoped audits, and one outbox record;
- the sole Membership authorizes as `owner`;
- identical replay returns the original result;
- changed-input key reuse conflicts;
- replay does not duplicate the Workspace or restart the trial; and
- cross-tenant authorization is denied and the last Owner cannot be removed.

The accepted Slice 3 checkpoint additionally records successful browser provisioning/refresh with server-derived Workspace Owner state and the normal PostgreSQL regression suite.

## Invariants accepted

- [x] Signup never creates a Workspace.
- [x] Verification never creates a Workspace.
- [x] Login never creates a Workspace.
- [x] Package confirmation is server-catalog validated and still does not create a Workspace.
- [x] Workspace creation requires an authenticated active, verified User and incomplete onboarding record.
- [x] Workspace and initial Owner Membership commit atomically.
- [x] Exactly one initial Membership is created and it uses the Owner Role.
- [x] Seeded Admin/Member Roles do not create Admin/Member Memberships.
- [x] Trial, entitlement, activation, onboarding completion, audit, outbox, and idempotency share the transaction.
- [x] Same-key replay is stable; changed-input reuse conflicts.
- [x] Different-key concurrent attempts serialize through the locked onboarding row.
- [x] Later removal/demotion cannot eliminate the last active Owner through accepted services.

## Material blockers

None.
