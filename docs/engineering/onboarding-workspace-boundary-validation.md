# Onboarding and Workspace Boundary Validation

Date: 2026-08-21  
Status: **validated locally; two material correctness defects found and repaired**  
Boundary: local source, local PostgreSQL, and a local headless browser only. No external Google, Lightsail, UAT, DNS, email provider, or production service was accessed.

## Direct answers

### 1. Are the selected package, Workspace values, and entitlement values consistent?

**Yes, at provisioning.** Registration persisted `growth/monthly` only in `onboarding_progress`; Workspace, Role, Membership, and entitlement counts remained zero. An authenticated pre-provision change persisted `scale/annual`. Provisioning then created an active Workspace with `plan_code=scale`, `billing_cadence=annual`, a 21-day trial, and one entitlement snapshot with `plan_code=scale`, `catalog_version=boundary-v1`, feature flags from the catalog, and `activeSeats=15`. It also created three Workspace-local Role definitions (`owner`, `admin`, `member`), exactly one active Membership, and exactly one active Owner.

Browser-supplied prices or limits are not persisted as authority. Provisioning revalidates the persisted code/cadence against an active, effective catalog row and copies catalog-derived values into the Workspace and entitlement snapshot in the same transaction.

### 2. What constrains User-to-Workspace membership, and can a User join multiple Workspaces?

**A User may belong to multiple Workspaces, but only once per Workspace.** The database unique constraint `membership_workspace_user_uq` is `(workspace_id,user_id)`, not global `user_id`. The composite foreign key `membership_workspace_role_fk` requires the assigned Role to belong to the same Workspace as the Membership.

Fresh PostgreSQL assertions proved:

- a duplicate Membership in one Workspace fails with PostgreSQL `23505`;
- assigning a Role from another Workspace fails with `23503`;
- `requireWorkspaceAuthorization` returns the persisted active Owner context for the matching tenant;
- it returns `null` for a User without an active same-Workspace Membership.

The onboarding record permits only one self-provisioned Workspace. Invitation acceptance may add Memberships in other Workspaces. The current UI has no Workspace picker and `workspaceSummary` selects the earliest active Membership, so multi-Workspace navigation remains a Product limitation.

### 3. Can signup succeed and Workspace provisioning fail without stranding the User?

**Yes.** A PostgreSQL trigger injected failure at the `workspace.provisioned` outbox insert. The whole provisioning transaction rolled back, leaving the verified User's onboarding state at `current_step=workspace`, `workspace_id=null`, and leaving zero Workspaces, Roles, Memberships, entitlements, Workspace audits, provisioning outbox rows, and provisioning idempotency rows. Removing the validation trigger and retrying the identical operation/key succeeded, and onboarding became `complete` with a Workspace ID.

If a committed response is lost, the existing idempotency contract returns the stored outcome for the same principal/operation/key/request hash without duplicating the Workspace or trial.

### 4. What happens when the package changes before or after provisioning?

**Before provisioning:** an active/effective catalog selection can replace the onboarding plan/cadence, and provisioning uses the latest persisted values.

**After provisioning:** onboarding package changes are rejected as `not_eligible`; Workspace, cadence, trial, and entitlement values remain unchanged. No upgrade/downgrade or billing workflow exists.

The validation initially found that the guarded database update affected zero rows after provisioning but `savePlanSelection` still returned a success-shaped result. The service now requires exactly one eligible row to update and throws `not_eligible` otherwise. The current API route maps service errors to its existing generic HTTP 400 `invalid_plan` response; a dedicated post-provision billing/entitlement contract should define a more specific public conflict response before package management is exposed.

### 5. How does the local OIDC fixture handle new, existing, linking, and collision cases?

**The local fixture behaves correctly; it is not real Google.** Fresh PostgreSQL evidence proved:

- new provider `sub` plus a new email created one active, verified User, a Google-labelled fixture credential keyed by `sub`, onboarding at `workspace` with local default `growth/monthly`, no Workspace, and one Session;
- the same provider `sub` logged into the same existing User;
- an authenticated existing User linked a new provider `sub` to that same User;
- attempting to link a provider `sub` already owned by another User returned `link_conflict`, retained the original credential owner, created no switched Session, and committed no collision success event;
- the success audit counts were exactly one each for `identity.oidc_account_created`, `identity.oidc_login`, and `identity.oidc_linked`.

The completion service also retains one-time state, PKCE, nonce, exact redirect allowlist, signature, issuer, audience, expiry, verified-email, and non-empty-sub validation. The callback route separately records bounded denied `identity.oidc_failure` or `identity.oidc_link_conflict` events. Fixture mode fails closed outside its configured local mode. No real Google code, credentials, issuer, JWKS, or network flow was used.

### 6. Are registration, verification, login, and provisioning audited?

**Yes.** One focused password journey produced exactly:

| Action | Outcome | Count |
| --- | --- | ---: |
| `identity.registered` | success | 1 |
| `identity.email_verified` | success | 1 |
| `identity.login` | denied (`invalid_credentials`) | 1 |
| `identity.login` | success | 1 |
| `workspace.created` | success | 1 |
| `workspace.initial_owner_assigned` | success | 1 |

The successful login event targets the Session and carries the Session ID; the denied login uses bounded reason metadata and stores no password. Workspace events carry Workspace, initiating User, verified initial Owner Membership, and Session attribution. An injected provisioning failure committed no Workspace success audit because those events share the rolled-back core transaction; its successful retry committed exactly the two Workspace events.

The OIDC success event counts are listed in answer 5. Route-level failed fixture callbacks use the bounded denial actions described there.

### 7. What happens on direct `/crm/home` access without usable Membership authority?

**Live CRM data requires a current active same-Workspace Membership.** Both the page boundary and the dashboard read model derive authority from the opaque Session, active User, active Workspace, active Membership, and Workspace-scoped Role. The dashboard independently re-resolves that authority in its read-only transaction.

Local browser evidence at `http://127.0.0.1:3011/crm/home`:

| State | Result |
| --- | --- |
| No Session | `/login?next=/crm`, H1 `Welcome back` |
| Active Session, no Membership and no provisioned onboarding Workspace | `/workspace/create`, H1 `Create your workspace` |
| Active Session and active Owner Membership | `/crm/home`, H1 `CRM home` |
| Active Session and suspended Membership for the provisioned Workspace | `/login?error=workspace_access`, H1 `Welcome back` |

The first browser attempt found a redirect loop for a suspended Membership because `/crm` sent the User to Workspace creation while completed onboarding sent the User to Workspace ready, which returned to creation without an active Membership. The protected CRM boundary now distinguishes an unprovisioned User from a provisioned User without active access, producing the stable denial above.

There is no caller-selectable Workspace ID on `/crm/home`. Cross-tenant evidence therefore uses the server read model directly: supplying another Workspace ID with a valid outsider Session returns `access_denied`; `requireWorkspaceAuthorization` returns `null`; and no tenant data is returned. The absence of a Workspace picker remains the limitation described in answer 2.

## Fresh evidence

Isolated database: `nexaflow_onboarding_boundary_validation_20260821` on local PostgreSQL `127.0.0.1:54329`. It was newly created for this validation and retained with dummy-only evidence. Existing development databases were not cleared.

- Initial checked-in migration application: passed.
- Migration rerun: passed with no duplicate-object or data error.
- Database health: `{ ok: true, latencyMs: 12 }`.
- Focused boundary suite: **7/7 passed** in `tests/onboarding-boundary.integration.test.ts`.
- Normal PostgreSQL regression command: **89/89 passed**, 9/9 files.
- Unit/direct-route command: **36/36 passed**; 89 database tests correctly skipped without `RUN_DB_INTEGRATION=1`.
- ESLint: passed with no errors.
- Next.js 16.3.1 production build: passed; TypeScript passed and 30 application pages were generated, including dynamic `/crm/home`.
- Direct browser boundary check: four states passed as recorded above.

Docker Compose control was not used because `/Users/moemahmood/.docker/run/docker.sock` returned permission denied. This did not block validation: the already-running local PostgreSQL endpoint accepted direct connections and all migration, health, and live integration checks completed. Mailpit was not required for these seven boundary questions.

## Files changed for this validation

- `src/server/workspaces/provision.ts` — reject zero-row/post-provision onboarding plan updates.
- `src/app/crm/layout.tsx` — prevent provisioned suspended/missing-access Users entering the Workspace create/ready loop.
- `src/server/crm/page.ts` — apply the same stable protected-page boundary.
- `tests/onboarding-boundary.integration.test.ts` — seven focused live PostgreSQL cases and exact count/audit assertions.
- `docs/engineering/onboarding-workspace-boundary-validation.md` — this report.

## Limitations and blockers

- Real Google OIDC remains deliberately unavailable; only the local fixture was tested.
- Multi-Workspace schema and invitation membership are supported, but no explicit Workspace selector exists.
- Post-provision package changes remain unavailable; the public plan endpoint still uses its generic `invalid_plan` response envelope for the new ineligible rejection.
- Anonymous `/crm/home` is currently normalized by the shared CRM layout to `next=/crm`, rather than retaining the more specific `/crm/home` return target. Authentication remains protected; this is a navigation-resume limitation, not an authorization bypass.
- The login page does not yet show dedicated explanatory copy for `error=workspace_access`; it is a stable safe destination and no longer loops, but Product/UX may want a specific suspended-access message.
- No external-system blocker affected this local validation.
