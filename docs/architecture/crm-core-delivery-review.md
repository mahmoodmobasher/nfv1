# CRM Core Delivery Review

**Review date:** 2026-08-20  
**Gate:** Delivery-reset CRM core  
**Verdict:** **ACCEPT**

## Executive decision

The mandatory invitation patch and the local CRM core are accepted. The single bounded blocker, CRM-01, is resolved: `updateLead` now authorizes and locks the Lead using the actor's persisted active Membership, persisted Role, current ownership, and current Team visibility inside the aggregate transaction. Unauthorized, stale/removed-actor, lost-Team, missing, and cross-tenant cases return the same tenant-safe not-found result before reference validation or writes.

No material local-delivery blocker remains within the delivery-reset standard. Deferred pre-UAT hardening is not reopened.

## Scope and evidence reviewed

- `docs/architecture/delivery-scope-reset.md`
- `docs/engineering/delivery-scope-reset-checkpoint.md`
- Invitation acceptance implementation and Slice 4 PostgreSQL tests
- CRM migration `0008`, Drizzle schema, workspace provisioning, lead repository/service, request context, API routes, and UI
- CRM PostgreSQL integration tests and browser journey
- Local verification performed independently:
  - unit tests: **29/29 passed**
  - original PostgreSQL integration evidence: **72/72 passed**, including Slice 4 **23/23**
  - final focused CRM PostgreSQL verification: **11/11 passed**
  - final normal PostgreSQL integration verification: **78/78 passed** across seven files
  - CRM Playwright journey: **1/1 passed**
  - lint: passed
  - production build: passed on Next.js 16.3.1
  - Drizzle schema check: passed

No external provider, deployment, UAT, Lightsail, Caddy, real email, Google, or domain access was performed.

## Mandatory invitation patch — ACCEPT

The implementation and regression evidence cover the reset's mandatory cases:

- Accepting an invitation for an already-active Membership preserves its role, status, team assignments, and version.
- Suspended reactivation is capacity checked and applied once.
- Removed reactivation is capacity checked and applied once.
- The invitation's role and teams are revalidated against current, same-workspace persisted state before activation.
- Failure rolls back Membership, invitation, teams, success audit, and outbox changes.
- The invitation terminal transition is asserted rather than treated as successful when no row changes.

## CRM delivery findings

### Accepted evidence

- **Tenant constraints:** lead stage and owner references use same-workspace composite foreign keys; visible-team assignments are workspace constrained; activities reference the lead and creator Membership within the workspace.
- **Pipeline availability:** migration `0008` seeds default stages for existing workspaces, and new workspace provisioning inserts the default stages in the provisioning transaction.
- **Authentication/session boundary:** CRM routes use the server-derived tenant context and mutation routes apply the existing request/CSRF guard. No client-supplied workspace or role is trusted.
- **Tenant-safe reads:** list/get queries apply workspace scope and the intended Owner/Admin, owner-assignee, workspace-visible, and team-visible rules. Cross-tenant and non-visible reads return tenant-safe not-found behavior.
- **Reference validation:** lead owner, stage, and team inputs are resolved as active same-workspace records.
- **Concurrency:** lead writes require an expected version and stale writes fail without partial mutation.
- **Atomic lead aggregate:** create/update changes to the lead, visible teams, activity, audit, and outbox are performed in one database transaction. Injected create failure proves rollback.
- **Primary journey:** the browser test creates, searches, moves, edits, and records activity for a persistent lead successfully.
- **Existing Owner safety:** no reviewed CRM path changes workspace ownership or bypasses the accepted last-Owner controls.
- **Secret handling:** no material secret disclosure was found in this slice.

### Resolved blocker CRM-01 — persisted authorization on lead updates

`src/server/crm/leads.ts` now resolves `updateLead` through a persisted, active Membership joined to its persisted Role within the target Workspace. Its authorization predicate permits:

- Owner/Admin access to any Lead in the Workspace;
- Member access to Workspace-visible Leads;
- Member access to Leads assigned to that Membership; and
- Member access through current persisted active Team membership.

The authorized Lead and actor are locked before expected-version checking, reference validation, or aggregate writes. The implementation does not trust the caller-provided role: the regression fixture deliberately supplies a forged Member role for a persisted Admin and proves the persisted Admin authorization is used.

The expanded PostgreSQL suite proves:

- hidden known-UUID denial with no Lead/version, visible-Team, activity, audit, or outbox side effects;
- successful Member updates through Workspace visibility, ownership, and current Team visibility;
- successful persisted Owner and Admin updates to hidden Leads;
- tenant-safe cross-tenant denial;
- denial after loss of persisted Team visibility; and
- rollback of Lead, Team visibility, activity, audit, and outbox on an injected update failure.

Independent results on 2026-08-20 match the checkpoint: the focused CRM suite passed **11/11**, and the normal serial PostgreSQL suite passed **78/78** across all seven integration files.

**CRM-01 status: CLOSED.**

## Next product-safe scope

Product development may continue locally with the next user-visible CRM increment: pipeline configuration, richer lead assignment and filters, duplicate handling, activity types, and pagination, while preserving the accepted tenant visibility, expected-version, tenant-safe denial, and aggregate-transaction boundaries.

External email, Google/domain credentials, deployment, UAT, Lightsail, and Caddy remain outside this local scope. The future UAT target must be treated as a clean target with no dependency on former container state; its minimal clean deployment architecture/checklist will be advised after local product readiness and separate authorization.

## Product and Development advice

- **Product:** CRM core is accepted for continued local product development. Prioritize the next user-visible CRM capability; no further security-model decision is required for CRM-01.
- **Development:** proceed with the next bounded product slice and retain the CRM-01 regression coverage. Do not expand this acceptance into deferred pre-UAT hardening or external deployment work.
