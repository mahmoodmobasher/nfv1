# Delivery scope reset checkpoint

Date: 2026-08-20  
Status: mandatory invitation stabilization and bounded CRM-core remediation complete  
Directive: `docs/architecture/delivery-scope-reset.md`

## Mandatory stabilization evidence

The invitation acceptance transaction now preserves every already-active Membership exactly as authorized. It returns the existing Membership and current Role without changing Role, status, Team assignments, or version. Suspended and removed Membership reactivation remains serialized by the Workspace lock, counts as an active seat, and either rolls back at capacity or updates the existing Membership exactly once below capacity.

Targeted PostgreSQL command:

`RUN_DB_INTEGRATION=1 npx vitest run tests/slice4.integration.test.ts --no-file-parallelism --maxWorkers=1`

Result: **23/23 passed**.

The five directive cases are evidenced by:

1. Active Owner remains Owner after a stale Member invitation, with unchanged version and one Membership.
2. Active Admin and Member cases retain Role, active status, Team assignments, version, and identity while the invitation is terminally accepted.
3. Suspended reactivation at capacity leaves Membership and pending invitation unchanged with no activation outbox event.
4. Removed reactivation below capacity reuses one Membership, increments version once, consumes once, applies validated Team assignment, and writes one success audit plus one activation outbox event.
5. An injected outbox failure rolls back Membership, invitation, Team assignment, success audit, and activation outbox changes together.

The broader Slice 4 Owner-transfer replay, route denial/rate refinement, fixture-OIDC browser stability, and complete administration UX rerun remain deferred to the pre-UAT gate per the delivery reset. Safe completed local changes were preserved; no external system was accessed.

## Product slice

Status: **smallest usable local CRM slice complete**.

Implemented:

- Persistent Workspace-scoped Leads with contact details, source, open/won/lost status, expected version, and timestamps.
- Per-Workspace pipeline stages seeded as New, Contacted, Qualified, and Proposal for provisioned Workspaces; the migration backfills existing Workspaces.
- Active Workspace Membership ownership with database-enforced same-Workspace references.
- Workspace visibility or selected-Team visibility. Owners and Admins can administer all Workspace Leads; Members can read Workspace-visible Leads, owned Leads, and Leads visible to one of their persisted Teams.
- Atomic create/edit, pipeline/status movement, Team visibility replacement, activity creation, audit, and local non-email outbox writes.
- Notes and generated created/updated/stage/status activity history.
- Server-derived authenticated list, search, detail, create, and edit journeys under `/crm`.
- Tenant-safe not-found behavior, cross-Workspace reference rejection, and stale expected-version rollback.

## CRM-core remediation evidence

`updateLead` now resolves and locks the Lead through the current actor's persisted active Membership and persisted Role inside the aggregate transaction. Owners and Admins may update any Lead in their Workspace. Members may update only Workspace-visible Leads, their owned Leads, or Leads visible through one of their current active Team memberships. A hidden known UUID, stale/removed actor, lost Team membership, missing Lead, or cross-tenant Lead produces the same tenant-safe `resource_not_found` result before reference validation or writes.

The focused PostgreSQL suite was expanded to **11/11 passed** and proves hidden-known-UUID denial with no Lead, Team, activity, audit, or outbox side effects; all allowed Member visibility paths; persisted Owner/Admin authorization (including a forged caller role); cross-tenant denial; visibility loss denial; and complete aggregate rollback after an injected outbox failure.

The product correction adds:

- Pipeline in desktop and mobile CRM navigation and a server-derived `/crm/pipeline` stage overview with search, clear/empty states, and usable narrow-screen stage sections.
- Custom accessible Lead validation with a linked, focused error summary; stable field/help/error associations; `aria-invalid`; and explicit Workspace/Team visibility guidance.
- Won/Lost alert-dialog confirmation with exact contextual copy, initial focus, focus containment, Escape dismissal, and focus restoration.
- Explicit `Saving stage…`, rollback failure, and stale-version recovery states. `Reload latest` refreshes the authoritative version/stage/status while preserving unrelated draft entries and returning focus to the stage control.
- A labelled activity timeline with activity type, author, timestamp, and content. Note submission exposes loading/success/failure states and preserves the draft for a one-action retry.
- A corrected mobile overlay boundary: backdrop dismissal and panel interaction are independent, the trigger remains 44px, and route selection performs a reliable route transition at 320px.

Migration: `src/server/db/migrations/0008_daffy_rawhide_kid.sql`. The first local attempt exposed generated composite-key ordering and rolled back; the migration was repaired to declare `(workspace_id, id)` uniqueness before adding foreign keys. It then applied successfully and a second migration run completed with no changes.

## Final verification

| Check | Result |
| --- | --- |
| Mandatory invitation targeted file | **23/23 passed** |
| CRM PostgreSQL target | **11/11 passed** |
| Normal unit/direct-route command | **29/29 passed**, integration suites skipped by design |
| Normal serial PostgreSQL command | **78/78 passed** across seven files |
| CRM Playwright product journey | **1/1 passed in 7.9s**: validation focus, create/detail, 409 draft-preserving reload, Won dialog/Escape/focus, move stage, note failure/retry/timeline, search, desktop Pipeline, 320px mobile Pipeline navigation/overflow, and direct DB assertion |
| Migration apply and rerun | **Passed** after the recorded transactional ordering repair |
| Database health | **Passed**, `{ ok: true, latencyMs: 16 }` |
| Lint | **Passed**, no warnings |
| Production build | **Passed**, Next.js 16.3.1 and 30 generated pages/routes |

The full legacy/Slice 4 Playwright suite was not required by the reset and was not claimed as passing. The directive explicitly defers that clean rerun and fixture recent-OIDC stabilization to pre-UAT. The new primary CRM product journey passes independently.

## Local boundary and next product work

This slice remains local PostgreSQL and local browser only. No real Google, production email/domain, provider credential, billing, deployment, Lightsail, UAT, or Caddy access occurred. Lightsail is treated only as a clean future target; this implementation makes no assumption about any former container state. A clean UAT deployment remains a separate, explicitly authorized pass after local acceptance. The next product increment can refine pipeline configuration, lead assignment UX, duplicate handling, activity types, and pagination while preserving the tenant and transaction boundaries established here.
