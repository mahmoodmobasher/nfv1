# Delivery Scope Reset: Security Foundation to Product Delivery

Status: **approved Architect delivery directive**  
Date: 2026-08-20  
Applies to: Product, Develop, QA, and future architecture reviews

## Decision

NexaFlow has enough local identity and tenant-security foundation to resume CRM product development. Architecture review will no longer block local product work on production-hardening refinements that do not threaten tenant isolation, authentication integrity, or irreversible data corruption.

One correction remains mandatory before CRM persistence begins:

- Invitation acceptance must never overwrite an already-active Membership's Role and must never demote an Owner.
- Reactivating a suspended or removed Membership through an invitation must enforce current active-seat capacity atomically.

Develop should implement and test this correction as a short stabilization patch. Once its targeted PostgreSQL tests pass, persistent CRM product work is authorized locally. A further full Slice 4 re-review is not required to begin CRM implementation.

## Minimum stabilization acceptance

The stabilization patch is complete when targeted PostgreSQL tests prove:

1. An existing active Owner remains Owner after accepting any stale or racing Member/Admin invitation.
2. Existing active Admin and Member Memberships retain their current Role, status, Team assignments, and version; acceptance returns the existing Membership result without duplicating it.
3. Suspended/removed reactivation checks seat capacity under the Workspace lock; at capacity it changes nothing and leaves the invitation retryable.
4. Successful reactivation below capacity creates no duplicate Membership, increments version once, consumes the invitation once, and writes one success audit/outbox event.
5. Injected failure rolls back Membership, invitation, Team assignment, audit, and outbox changes together.

Normal unit and PostgreSQL regression suites must remain green. Browser, build, and lint evidence may be collected with the next product checkpoint rather than as a separate gate ceremony.

## Deferred pre-UAT hardening

The following Slice 4 findings remain valid but are explicitly deferred until the pre-UAT security gate:

- Recoverable idempotent replay after Owner-transfer Session rotation.
- Complete route-level denial auditing and normalized-destination rate-limit refinement.
- Fixture-OIDC recent-auth browser-test stabilization. Password recent auth remains available locally; real Google recent auth requires external configuration later.
- Full clean Playwright rerun and invitation-administration polish beyond the minimum stabilization tests.

These items must remain documented and must be closed before external UAT or production deployment. Deferral does not authorize weakening existing authentication, CSRF, Session revocation, tenant scoping, or last-Owner controls.

## Product direction

Product should now prioritize the smallest usable CRM workflow:

1. Persistent Leads.
2. Pipeline stages and status movement.
3. Lead ownership and Workspace/Team visibility.
4. Notes or activities sufficient to demonstrate ongoing customer work.
5. Search, list, detail, create, and edit journeys.

Product does not need to decide production Google, email vendor, canonical domain, billing behavior, audit retention, or deployment topology to support this local product slice. Those decisions remain part of the pre-UAT readiness plan.

## Develop direction

Develop should proceed in this order:

1. Apply the invitation existing-Membership stabilization and targeted tests above.
2. Record the result in the engineering checkpoint without expanding the security scope.
3. Begin a local tenant-scoped CRM data slice with Leads as the first aggregate.
4. Reuse current server-derived Session and Workspace context, expected-version writes, tenant-safe not-found behavior, and audit/outbox foundations where appropriate.
5. Do not build billing, real provider integrations, production infrastructure, support tooling, or generalized enterprise policy systems during this local product slice.

## Architecture review policy going forward

During local CRM development, an Architecture blocker requires evidence of at least one of:

- cross-tenant data exposure or mutation;
- authentication/session bypass;
- loss of the last active Owner;
- secret/token disclosure;
- irreversible or non-atomic corruption of core Workspace/CRM data;
- a failing primary user journey that prevents product validation.

Other findings are recorded for pre-UAT hardening and do not stop local feature delivery.

## External boundary

All work remains local. No real Google, production email/domain/provider credentials, deployment, Lightsail, UAT, or Caddy access is authorized by this directive.
