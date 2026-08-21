# NexaFlow Architecture Transition Handover

Status: **authoritative transition handover**  
Prepared: 2026-08-21  
Scope: Workspace Foundation, Feature 1, Feature 2 Work Items 1–5, next Architecture gates, and downstream inheritance  
Change boundary: documentation only; no application code or external system changed

## 1. Executive position

NexaFlow has a locally proven Workspace security and data foundation. The platform tenant is the **Workspace**. Global identity is represented by **User**; access is represented separately by an active **Workspace Membership**. Trusted Session state identifies the **Active Workspace Context**. Roles/RBAC, Ownership, Team, Visibility, Audit, and Entitlements refine what an authenticated Member may do and see.

This is one shared platform contract. CRM, Leads, Companies, Contacts, Deals, Projects, Tasks, Communications, Automation, AI, Reporting, Finance, and Client Portal must inherit it. A downstream feature must not invent another tenant, ownership, access, audit, or entitlement model.

The next formal milestone is **NexaFlow Workspace Foundation Complete**. Feature 2 Work Items 1–5 are implemented locally; Work Items 2–5 have explicit Architecture ACCEPT reviews. Work Item 1 has a completed engineering checkpoint and has remained covered by later regression evidence, but the final Work Item 6 validation must consolidate the whole Feature 2 journey before Product marks the milestone complete.

After that milestone, do not keep expanding or refactoring the foundation speculatively. Deliver vertical features and reopen the foundation only when a real vertical demonstrates a concrete unmet requirement.

## 2. Authority order and durable sources

Use these sources in descending order for new work:

1. Product's shared foundation direction, recorded in [`docs/architecture/workspace-foundation-direction.md`](../architecture/workspace-foundation-direction.md).
2. This transition handover.
3. The detailed security/data contract in [`docs/architecture/security-data-contracts.md`](../architecture/security-data-contracts.md).
4. Feature 2's implementation-ready contract in [`docs/architecture/feature-2-user-role-membership-contract.md`](../architecture/feature-2-user-role-membership-contract.md).
5. The relevant accepted gate review for the behavior being reused.
6. Engineering checkpoints as implementation evidence; a checkpoint does not override an Architecture contract or ACCEPT/REJECT verdict.

Where old documents describe earliest/first Membership selection or Feature 2 as incomplete before Work Items 4–5, the accepted Work Item 4 and Work Item 5 reviews supersede that historical state.

## 3. Classification legend

- **Proven:** implemented locally and supported by an accepted Architecture review or proportionate durable evidence.
- **Assumed:** safe default for local vertical design, but not yet demonstrated end to end for the new resource.
- **Deferred:** valid work intentionally postponed to a named future gate; it must not be represented as complete.
- **Prohibited:** a pattern that violates an accepted invariant and cannot be introduced without an explicit Architecture contract change.

## 4. Authoritative Workspace Foundation contract

### 4.1 Mandatory evaluation order

Every Workspace-scoped operation must enforce this server-side sequence:

1. The resource belongs to exactly one Workspace.
2. The authenticated User is active and has an active Membership in that Workspace.
3. The Active Workspace is validated and stored in trusted Session context.
4. RBAC determines whether the action is permitted.
5. Ownership, Team, and Visibility determine record-level access.
6. Significant mutations and security-relevant denials produce bounded Audit evidence.
7. Package Entitlement determines whether the capability is enabled.

Entitlement can enable a capability but never grants Membership, Role, or record access. Ownership or Team association cannot bypass RBAC. A Role cannot bypass tenant scope.

### 4.2 Tenant, Session, and Active Workspace rules

**Proven**

- A User is global and may have one Membership in each of multiple Workspaces.
- Tenant authority is per Session through server-owned `sessions.active_workspace_id`.
- Identity resolution requires an active User, matching security version, an unrevoked Session, and valid idle and absolute expiry.
- Exactly one active Membership may be bootstrapped into an unselected Session. Multiple active Memberships require explicit Workspace selection.
- A switch validates persisted User, Session, Workspace, Membership, and Workspace-local Role; rotates the Session; supports bounded same-request replay; and writes safe Audit evidence.
- Every tenant-scoped route/API must compare requested Workspace scope with the selected Workspace before resolving tenant authority.
- Suspended/removed Memberships and inactive Workspaces are not selectable and grant no access.
- Cross-tenant and non-selected resources return tenant-safe denial without implicit switching or foreign-resource disclosure.
- Logout revokes server Session authority; clearing browser state alone is not logout.

Evidence: [`feature-2-work-item-4-review.md`](../architecture/feature-2-work-item-4-review.md), [`slice-2-gate-review.md`](../architecture/slice-2-gate-review.md), and [`crm-home-dashboard-review.md`](../architecture/crm-home-dashboard-review.md).

**Prohibited**

- Earliest, first, route-provided, body-provided, query-provided, client-cached, or UI-labelled Workspace as authority.
- Mutable Role, Membership, visibility, or entitlement claims trusted from the browser.
- A URL Workspace ID silently changing the Session selection.
- Tenant reads or writes before Active Workspace and active Membership validation.

### 4.3 Provisioning and Owner invariants

**Proven**

- Signup, verification, login, and package confirmation do not create a Workspace.
- Workspace creation occurs only when the authenticated, verified User submits the Workspace creation mutation after server-catalog plan/cadence validation.
- One transaction creates the Workspace, the three Workspace-local Role definitions, exactly one initial Membership using the Owner Role, default stages, entitlement snapshot, trial, onboarding completion, Audit events, Outbox event, and idempotency result.
- Admin and Member rows seeded during provisioning are Role definitions, not Memberships.
- Failure rolls back the complete aggregate. Same-key replay does not duplicate it; different-key concurrent attempts serialize on onboarding eligibility.
- The first Membership is the sole initial Owner.
- Later generic Membership APIs cannot assign, demote, suspend, remove, or restore an Owner. Ownership changes use only the dedicated transfer transaction.
- Owner transfer re-resolves persisted authority, requires recent authentication and expected versions, promotes the successor before demoting the verified prior Owner, rotates/recoverably hands off the Session, and preserves at least one active Owner under rollback and concurrency.

Evidence: [`workspace-provisioning-validation.md`](../architecture/workspace-provisioning-validation.md), [`slice-3-gate-review.md`](../architecture/slice-3-gate-review.md), and [`onboarding-workspace-boundary-answers.md`](../architecture/onboarding-workspace-boundary-answers.md).

**Prohibited**

- A committed Workspace without an active Owner.
- Treating seeded Admin/Member Role definitions as users.
- Generic Role or invitation APIs granting Owner.
- Last-Owner demotion, suspension, or removal.
- Partial transfer, or trusting a stale/caller-authored actor Membership.

### 4.4 Memberships, RBAC, Teams, Ownership, and Visibility

**Proven**

- Membership access states are `active`, `suspended`, and `removed`; inactive states grant no Workspace access.
- Owner/Admin/Member are fixed Workspace-local system Roles with server-derived capabilities and actor/target ceilings.
- Generic Role changes are expected-version controlled, re-resolve the persisted actor and target, exclude Owner/self/cross-tenant targets, and return authoritative state.
- Suspend, restore, and remove preserve Membership history. Restore/reactivation checks active-seat capacity atomically.
- Invitation acceptance never changes an already-active Membership's Role, Teams, status, version, or Owner state. Suspended/removed reactivation reuses the unique Membership and applies capacity under lock.
- Teams and Team Memberships are Workspace-scoped through composite constraints. Team association is optional and does not itself grant tenant access.
- Stale writes cannot silently overwrite newer state. Conflict/reload/retry uses authoritative server state and performs at most one mutation/Audit/idempotency outcome.
- CRM Lead visibility uses the shared ownership/Team/visibility union and tenant-safe denials.

Evidence: [`feature-2-user-role-membership-contract.md`](../architecture/feature-2-user-role-membership-contract.md), [`feature-2-work-item-2-review.md`](../architecture/feature-2-work-item-2-review.md), [`feature-2-work-item-3-review.md`](../architecture/feature-2-work-item-3-review.md), [`crm-core-delivery-review.md`](../architecture/crm-core-delivery-review.md), and [`delivery-scope-reset.md`](../architecture/delivery-scope-reset.md).

**Assumed for future verticals**

- A new record that supports collaboration should normally have a Workspace ID, an owner Membership, optional Team, and explicit visibility policy.
- The exact visibility vocabulary may vary by vertical only when mapped to the same effective-access sequence. A vertical must document why a resource is Workspace-wide, owner-only, Team-visible, or otherwise constrained.

**Prohibited**

- Global business records without Workspace ownership.
- User ID used as a substitute for Membership ID in Workspace authority.
- Team ID accepted without same-Workspace validation.
- Client-only permission ceilings or optimistic authority.
- Silent last-write-wins for security-significant Role, Membership, ownership, Team, or visibility changes.

### 4.5 Audit

**Proven**

- Feature 2 uses a canonical Audit taxonomy for invitation, Membership, ownership, and Workspace-selection events.
- Protected mutation success evidence commits in the same transaction as business state and, where applicable, Outbox and idempotency state.
- Authenticated business and request-boundary denials have one event owner to avoid duplicates.
- Same-Workspace attribution derives Workspace, actor User, actor Membership, Session, target, outcome, and bounded before/after or version evidence from persisted context.
- Cross-tenant/unresolved denials omit foreign target identifiers.
- Correlation values do not retain plaintext idempotency keys. Runtime allowlists reject unsafe metadata/state before persistence.
- Email, names, passwords, tokens/hashes, cookies, authorization headers, provider assertions, raw IPs, full request bodies, and foreign-tenant facts are prohibited from Audit payloads.
- Replay and rollback do not create duplicate or false success evidence.

Evidence: [`feature-2-work-item-5-audit-review.md`](../architecture/feature-2-work-item-5-audit-review.md).

**Deferred**

- Administrator Audit history/read UI, search/export, retention/archive governance, and external log delivery. Product explicitly did not require an Audit-history screen for Work Item 5.

### 4.6 Entitlements

**Proven**

- Provisioning attaches the validated server-catalog plan/cadence to the Workspace and creates a versioned entitlement snapshot in the same transaction.
- Active-seat capacity is enforced for invitation acceptance and Membership restore/reactivation.
- Browser-provided price, limits, plan labels, or feature flags are not authority.

**Assumed for downstream verticals**

- A capability gate reads the current effective Workspace entitlement after identity, Active Workspace, Membership, and RBAC validation.
- Absence of an enabled entitlement denies capability use but does not modify Membership or record visibility.

**Unresolved**

- Commercial seat counts, suspended-seat treatment, overages, billing lifecycle, payment provider, post-provision upgrade/downgrade, proration, grace periods, and entitlement effective-date policy.

**Prohibited**

- Building production billing behavior from provisional display prices or browser values.
- Entitlement used to infer Role or record visibility.

## 5. Acceptance status

| Scope | Status | Durable basis |
| --- | --- | --- |
| Feature 1 — identity, onboarding, Workspace provisioning | **Product-accepted / Architecture accepted locally** | [`onboarding-workspace-boundary-answers.md`](../architecture/onboarding-workspace-boundary-answers.md), [`workspace-provisioning-validation.md`](../architecture/workspace-provisioning-validation.md), Slice 2 and Slice 3 reviews |
| Feature 2 WI1 — Membership lifecycle UI | **Implemented locally; final milestone consolidation pending WI6** | [`feature-2-membership-lifecycle-checkpoint.md`](../engineering/feature-2-membership-lifecycle-checkpoint.md); later WI2/WI3/full regressions preserve its behavior. No separate durable Architecture WI1 verdict exists. |
| Feature 2 WI2 — authority-aware Role assignment | **Architecture ACCEPT** | [`feature-2-work-item-2-review.md`](../architecture/feature-2-work-item-2-review.md) |
| Feature 2 WI3 — stale/concurrent state handling | **Architecture ACCEPT** | [`feature-2-work-item-3-review.md`](../architecture/feature-2-work-item-3-review.md) |
| Feature 2 WI4 — server-controlled Workspace selection | **Architecture ACCEPT** | [`feature-2-work-item-4-review.md`](../architecture/feature-2-work-item-4-review.md); WI4-01 ready-page blocker closed |
| Feature 2 WI5 — Audit-write completion | **Architecture ACCEPT** | [`feature-2-work-item-5-audit-review.md`](../architecture/feature-2-work-item-5-audit-review.md) |
| Feature 2 WI6 — final validation | **Not yet accepted** | Exact gate in section 9 below; no WI6 verdict exists |
| NexaFlow Workspace Foundation Complete | **Pending WI6 plus Product acceptance** | Must consolidate the milestone criteria in [`workspace-foundation-direction.md`](../architecture/workspace-foundation-direction.md) |

Feature 1's recorded follow-ons do not reopen it: real Google OIDC, post-provision plan changes, improved suspended/no-access copy, and any remaining Workspace-switcher follow-on that was not already closed by accepted WI4.

## 6. Material Architecture blocker threshold

For local vertical delivery, reject only evidence-backed defects that cause or materially conceal one or more of:

- cross-tenant data exposure or mutation;
- authentication or Session bypass;
- Active Workspace override or stale tenant authority;
- loss of the last active Owner;
- privilege escalation through Role, ownership, Team, visibility, or entitlement bypass;
- secret/token or prohibited personal-data disclosure;
- irreversible or non-atomic corruption of core Workspace/business data;
- false/duplicate Audit evidence that conceals a protected mutation's committed outcome; or
- a broken primary journey that prevents meaningful Product validation.

Accessibility, UX polish, observability consistency, performance, and generalized hardening remain important. They block only when they break the primary journey, create one of the risks above, or are explicit acceptance criteria for the current work item.

Do not inflate a non-material inconsistency into a foundation redesign. Record it at its actual severity and route it to the appropriate future gate.

## 7. Accepted residual risks and pre-UAT deferred hardening

The delivery reset intentionally deferred these four items to the pre-UAT security gate:

1. recoverable idempotent replay after Owner-transfer Session rotation;
2. complete route-level denial auditing and normalized-destination rate-limit refinement;
3. fixture-OIDC recent-auth browser-test stabilization (fresh release evidence now passes this journey, but Architecture has not separately closed the historical item); and
4. a clean full Playwright rerun plus invitation-administration polish beyond the mandatory invitation stabilization (the full rerun now passes 25/25; any remaining polish still requires explicit disposition).

Later Work Items may have partially improved these areas, especially Audit coverage, but no durable Architecture document formally closes the complete pre-UAT list. The pre-UAT reviewer must re-evaluate current evidence rather than assuming historical findings remain or are closed.

Additional accepted local-only residuals/deferred boundaries:

- real Google OIDC adapter, Google project/consent configuration, client ID/secret, canonical HTTPS domain, and production redirect URIs;
- production transactional-email provider/account, sender identity, deliverability, and webhook/reconciliation policy;
- production billing and post-provision plan changes;
- Audit retention/read/export and external security monitoring;
- backup/restore proof, incident response, support access, data retention/deletion/export, regional storage, legal policy acceptance, and production operations;
- production trusted-proxy/firewall/domain/secrets configuration and external UAT approval;
- fixture OIDC must remain disabled in production and clearly local/UAT-only wherever temporarily enabled.

An engineering deployment checkpoint or reachable environment is not by itself Architecture closure of these pre-UAT controls.

## 8. Unresolved Product and Operations decisions

### Product

- Work Item 6 scheduling and final Feature 2/Product acceptance.
- Commercial plan catalog and seat counts; billing provider and lifecycle; post-provision upgrades/downgrades.
- Whether and when to expose removed-Membership restoration outside invitation acceptance.
- Exact downstream vertical sequence if it differs from Profile → Companies/Contacts → Leads → Deals/Pipeline → Projects/Delivery → Communications.
- Audit retention/history/export if later required by customers or compliance.
- Production no-access/suspension language and support journey.

### Product/Legal/Operations

- Terms/Privacy policy versions and consent requirements.
- Data retention, deletion, export, backup/restore, incident response, support access, and regional-storage policies.
- Canonical domain, public-UAT authorization, DNS ownership, TLS policy, and environment naming.

### Vendor/Operations

- Google OIDC account/project, consent screen, credentials, allowed origins, and exact redirects.
- Transactional-email vendor, verified sender/domain, credentials, bounce/complaint handling, and provider idempotency behavior.
- Production secret owner/store/rotation process.
- Backup key owner and destination, monitoring/alerting destination, and operational log retention.

These decisions are not required for local WI6 unless Product explicitly adds them. They are required before the corresponding production/provider journey is claimed.

## 9. Exact Architecture gate for Feature 2 Work Item 6

WI6 is a final validation and milestone gate, not authorization for new foundation features or refactoring.

### Required inputs

- One durable Development WI6 checkpoint referencing exact commit/worktree state and migrations.
- Current Product checklist with Work Items 1–5 mapped to evidence.
- Unit, route, migration, PostgreSQL, focused concurrency/idempotency, browser, lint, type, and production-build results.
- Explicit list of skipped, flaky, deferred, or provider-dependent tests; no silent exclusions.
- Product confirmation of the complete Owner/Admin/Member/invitee/suspended-user/multi-Workspace journeys.

### Required Architecture proof

1. **Identity and tenant:** active User/Session and server-selected Active Workspace are enforced on every protected Feature 2 page/API; path/body IDs cannot override context.
2. **Invitation and Membership:** create/resend/revoke/accept, existing active Membership preservation, suspended/removed reactivation, seat checks, and rollback are tenant-scoped, idempotent, and transactional.
3. **Authority:** Owner/Admin/Member ceilings are server-derived; generic Owner mutation is impossible; inactive/self/cross-tenant targets are safely denied.
4. **Lifecycle:** suspend, restore, and remove take effect on the next authorization check and return authoritative expected-version state.
5. **Stale/concurrency:** racing Role/Membership/seat/Owner/switch operations produce committed-winner outcomes, stable conflicts, no silent overwrite, and no duplicate side effects.
6. **Ownership:** recent-auth transfer, Session rotation/recovery, attribution, rollback, and last-Owner invariant hold under concurrency.
7. **Workspace switching:** A→B→A changes both visible and API scope; multiple-without-selection requires choice; invalid/stale targets preserve safe authority; no prior-tenant data survives switch.
8. **Teams/visibility:** same-Workspace Team constraints and Role ceilings hold; Team/visibility never grant tenant access independently.
9. **Audit:** canonical transactional successes, bounded denials, correlation, replay deduplication, cross-tenant omission, and sensitive-data minimization hold across the complete journeys.
10. **Entitlement:** plan snapshot is attached to Workspace; seat limits are server-derived and concurrency-safe; no browser entitlement authority exists.
11. **Sessions/logout:** logout protects all Workspace routes; suspended/removed access and stale Session authority are denied.
12. **Primary journeys and accessibility:** all Product-required WI6 journeys work locally with keyboard, confirmation focus behavior, recovery actions, 320px, and 200% evidence proportionate to the supported UI.

### WI6 verdict rule

- **ACCEPT / Workspace Foundation Complete:** all material invariants above are proven, required local journeys pass, Product accepts the end-to-end feature, and any remaining failures are explicitly demonstrated unrelated/non-material or assigned to pre-UAT.
- **REJECT:** identify only bounded, evidence-backed material blockers and the smallest testable remediation. Do not reopen accepted Work Items wholesale.
- WI6 must not introduce Work Item 7, Feature 3, provider integration, deployment, Audit UI, billing, or speculative foundation abstractions.

The durable verdict should be written to `docs/architecture/feature-2-work-item-6-foundation-review.md` and explicitly state whether the milestone **NexaFlow Workspace Foundation Complete** is achieved.

## 10. Architecture gate for every future vertical slice

Each vertical must provide a short implementation-ready contract or checkpoint mapping the resource to the inherited foundation. Architecture should review the vertical, not redesign the platform.

### Contract before coding

Define:

- Workspace ownership and database constraints;
- server-derived Active Workspace and Membership boundary;
- RBAC actions and actor/target ceilings;
- owner Membership, optional Team, and visibility semantics;
- entitlement feature code/limits, or an explicit statement that no package gate applies yet;
- expected-version, idempotency, transaction, lock order, and rollback for material writes;
- canonical success/denial Audit actions and safe fields;
- API request/response/error semantics and tenant-safe not-found behavior;
- cache/no-store and stale-state behavior where authority or visibility can change;
- minimum PostgreSQL, route/unit, browser, concurrency, and cross-tenant acceptance matrix.

### Review after implementation

Verify:

1. every row and relationship is constrained to one Workspace;
2. all reads/writes inherit trusted Active Workspace context;
3. current persisted Membership/Role is re-resolved for protected actions;
4. ownership/Team/visibility filters are applied in both list and direct-resource paths;
5. entitlement checks cannot grant access or be overridden by clients;
6. expected-version/idempotency/concurrency behavior prevents silent overwrite and duplicate side effects;
7. success Audit/Outbox commits atomically and denials reveal no foreign facts or secrets;
8. cache and navigation cannot retain prior-Workspace data after switching;
9. the primary vertical journey works for the intended Roles and safely denies adversarial paths; and
10. no separate tenant, Role, Team, visibility, Audit, or entitlement framework was introduced.

### Vertical verdict rule

Block only the material threshold in section 6 or an explicit primary acceptance failure. Record non-material polish and pre-production controls without halting local vertical delivery. Reopen the Workspace Foundation only when the vertical supplies a concrete requirement that cannot be represented safely by the existing contract.

## 11. Prohibited architecture patterns summary

- A second tenant model or module-specific Workspace authority.
- First/earliest Membership selection as authority.
- Client-selected Workspace, Role, ownership, Team, visibility, or entitlement authority.
- Cross-Workspace foreign keys or unscoped resource queries.
- Global User authorization used where Workspace Membership is required.
- Owner assignment through generic Role/invitation endpoints or last-Owner loss.
- Team association treated as Membership or RBAC permission.
- Entitlement treated as record authorization.
- Security-significant last-write-wins updates without expected-version/concurrency control.
- Audit or Outbox success outside the protected business transaction.
- Duplicate success/denial audits for one attempt, plaintext idempotency keys, secrets, raw personal data, or foreign-target facts in Audit/log/error output.
- Fixture OIDC represented as Google or enabled in production.
- A downstream vertical refactoring the foundation speculatively instead of demonstrating a concrete gap.

## 12. Immediate handover recommendation

1. Development should prepare Work Item 6 as evidence consolidation and bounded gap closure only.
2. Architecture should perform the section 9 gate and issue one durable milestone verdict.
3. Product should accept or reject the end-to-end Feature 2 journeys.
4. If accepted, declare **NexaFlow Workspace Foundation Complete** and move to the next Product-approved vertical.
5. Before external UAT, separately close or explicitly disposition the pre-UAT items in section 7; do not confuse local foundation acceptance with production/provider readiness.
