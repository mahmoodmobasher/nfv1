# NexaFlow Architecture Transition Handover

Status: **authoritative transition handover — Workspace Foundation and deployed UAT candidate Architecture ACCEPT**
Prepared: 2026-08-21; updated after rc.2 deployment review
Scope: accepted Workspace Foundation, Feature 1, Feature 2, deployed UAT candidate, and downstream inheritance
Change boundary: documentation only; no application code changed by this handover update

## 1. Executive position

NexaFlow has a locally proven Workspace security and data foundation. The platform tenant is the **Workspace**. Global identity is represented by **User**; access is represented separately by an active **Workspace Membership**. Trusted Session state identifies the **Active Workspace Context**. Roles/RBAC, Ownership, Team, Visibility, Audit, and Entitlements refine what an authenticated Member may do and see.

This is one shared platform contract. CRM, Leads, Companies, Contacts, Deals, Projects, Tasks, Communications, Automation, AI, Reporting, Finance, and Client Portal must inherit it. A downstream feature must not invent another tenant, ownership, access, audit, or entitlement model.

The milestone **NexaFlow Workspace Foundation Complete** is now **Architecture ACCEPTED**. The consolidated Feature 1 + Feature 2 release candidate passed the Architecture and Graphics release gates, and the final rc.2 candidate was deployed to NexaFlow UAT and passed bounded post-deployment Architecture review.

The accepted UAT release is application commit `c1125ba7c7b5bc075b89003eb0ecc9840665b5e1`, annotated tag `v0.2.0-rc.2`, image digest `sha256:320715aa55983fa07e50ba71cfed9fe2dbb26080278f4caddc8f24792a96e279`, at `https://app.nexaflowsystems.com`. Deployment evidence is commit `d005d52772ad49268b87dce1c01004a8859825f1`.

Do not keep expanding or refactoring the accepted foundation speculatively. Deliver vertical features and reopen the foundation only when a real vertical demonstrates a concrete unmet requirement.

## 2. Authority order and durable sources

Use these sources in descending order for new work:

1. Product's shared foundation direction, recorded in [`docs/architecture/workspace-foundation-direction.md`](../architecture/workspace-foundation-direction.md).
2. This transition handover.
3. The detailed security/data contract in [`docs/architecture/security-data-contracts.md`](../architecture/security-data-contracts.md).
4. Feature 2's implementation-ready contract in [`docs/architecture/feature-2-user-role-membership-contract.md`](../architecture/feature-2-user-role-membership-contract.md).
5. The relevant accepted gate review for the behavior being reused.
6. The release and deployment verdicts in [`feature-1-2-architecture-release-gate.md`](../release/feature-1-2-architecture-release-gate.md) and [`feature-1-2-architecture-deployment-review.md`](../release/feature-1-2-architecture-deployment-review.md).
7. Engineering checkpoints as implementation evidence; a checkpoint does not override an Architecture contract or ACCEPT/REJECT verdict.

Where old documents describe earliest/first Membership selection, pending WI6/Foundation acceptance, open historical pre-UAT items, or deployment as pending, the accepted Work Item 4/5 reviews and final release/deployment reviews supersede that historical state.

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
| Feature 1 — identity, onboarding, Workspace provisioning | **Product/Architecture accepted; deployed UAT ACCEPT** | [`onboarding-workspace-boundary-answers.md`](../architecture/onboarding-workspace-boundary-answers.md), [`workspace-provisioning-validation.md`](../architecture/workspace-provisioning-validation.md), release/deployment reviews |
| Feature 2 WI1 — Membership lifecycle UI | **Consolidated release ACCEPT** | [`feature-2-membership-lifecycle-checkpoint.md`](../engineering/feature-2-membership-lifecycle-checkpoint.md); final unit/PostgreSQL/Playwright and UAT evidence consolidated it in the release gate |
| Feature 2 WI2 — authority-aware Role assignment | **Architecture ACCEPT** | [`feature-2-work-item-2-review.md`](../architecture/feature-2-work-item-2-review.md) |
| Feature 2 WI3 — stale/concurrent state handling | **Architecture ACCEPT** | [`feature-2-work-item-3-review.md`](../architecture/feature-2-work-item-3-review.md) |
| Feature 2 WI4 — server-controlled Workspace selection | **Architecture ACCEPT** | [`feature-2-work-item-4-review.md`](../architecture/feature-2-work-item-4-review.md); WI4-01 ready-page blocker closed |
| Feature 2 WI5 — Audit-write completion | **Architecture ACCEPT** | [`feature-2-work-item-5-audit-review.md`](../architecture/feature-2-work-item-5-audit-review.md) |
| Feature 2 WI6 — consolidated final validation | **Architecture ACCEPT through release gate** | [`feature-1-2-architecture-release-gate.md`](../release/feature-1-2-architecture-release-gate.md); clean migration/build/unit **41/41**, PostgreSQL **111/111**, Playwright **25/25** |
| NexaFlow Workspace Foundation Complete | **Architecture ACCEPT; deployed UAT ACCEPT** | [`workspace-foundation-direction.md`](../architecture/workspace-foundation-direction.md), release gate, and [`feature-1-2-architecture-deployment-review.md`](../release/feature-1-2-architecture-deployment-review.md) |

Feature 1's recorded follow-ons do not reopen it: real Google OIDC, post-provision plan changes, improved suspended/no-access copy, and any remaining Workspace-switcher follow-on that was not already closed by accepted WI4.

### Deployed rc.2 disposition

The reviewed UAT deployment is **ACCEPT** under these proven boundaries:

- all 11 migrations applied and the immediate rerun was ledger-safe;
- public liveness/readiness returned HTTPS 200 with no-store and expected Caddy/TLS security headers;
- fixture/general and recent-auth OIDC routes returned public 404; real Google is not represented as enabled;
- unauthenticated CRM remained protected, while password registration, verification, login/logout, refresh, Back/direct protection, Workspace provisioning/context, CRM create/read, People/Roles, invitations, private Mailpit delivery, and tenant-safe denial passed real-browser UAT smoke;
- provisioning produced the initiating sole Owner and corresponding Workspace/Owner Audit evidence;
- PostgreSQL and app were not directly host-published; Caddy remained the public edge;
- the rc.1 production-only title hydration loop was bounded to `TitleUpdater`, corrected in rc.2, passed lint/unit/type/build, and rendered successfully in real-browser and independent public checks; and
- no secret or provider credential was found or publicly exposed.

The user explicitly authorized destructive UAT replacement and waived backup, restore proof, and preservation for this release. That absence was not a blocker and must not be generalized into a future production backup policy.

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

## 7. Accepted residual risks and UAT/production boundaries

The release gate explicitly closed all four historical pre-UAT items for Feature 2:

1. Owner-transfer response-loss replay is bounded, encrypted, expiring, request-bound, and regression-tested without duplicate Role/Audit mutation;
2. Feature 2 route-level denial ownership and normalized-destination rate limiting are closed, without implying automatic coverage for future vertical routes;
3. fixture-OIDC recent-auth browser stability passed for local testing, while fixture OIDC remains prohibited publicly/under production mode; and
4. the full supported Playwright suite passed **25/25**, including current invitation/Team/confirmation/conflict journeys, and Graphics issued ACCEPT.

The deployed UAT review confirmed public fixture OIDC closure, password identity, private Mailpit, selected Workspace context, tenant-safe denial, sole initial Owner, 11 migrations, TLS/readiness, and primary journeys.

Remaining UAT-versus-production limitations:

- real Google OIDC adapter, Google project/consent configuration, client ID/secret, production canonical domain decision, and production redirect URIs;
- production transactional-email provider/account, sender identity, deliverability, and webhook/reconciliation policy;
- production billing and post-provision plan changes;
- Audit retention/read/export and external security monitoring;
- production backup/restore policy and proof, incident response, support access, data retention/deletion/export, regional storage, legal policy acceptance, and production operations;
- production trusted-proxy/firewall/secrets governance and production-launch approval;
- fixture OIDC must remain disabled in production and must never be presented as real Google.

The accepted rc.2 deployment is UAT only. Its password/Mailpit/provider limitations and the user-specific backup waiver must remain explicit; they do not authorize production launch.

## 8. Unresolved Product and Operations decisions

### Product

- Commercial plan catalog and seat counts; billing provider and lifecycle; post-provision upgrades/downgrades.
- Whether and when to expose removed-Membership restoration outside invitation acceptance.
- Exact downstream vertical sequence if it differs from Profile → Companies/Contacts → Leads → Deals/Pipeline → Projects/Delivery → Communications.
- Audit retention/history/export if later required by customers or compliance.
- Production no-access/suspension language and support journey.

### Product/Legal/Operations

- Terms/Privacy policy versions and consent requirements.
- Data retention, deletion, export, backup/restore, incident response, support access, and regional-storage policies.
- Production domain/launch authorization, DNS ownership, TLS operations policy, and environment naming beyond accepted UAT.

### Vendor/Operations

- Google OIDC account/project, consent screen, credentials, allowed origins, and exact redirects.
- Transactional-email vendor, verified sender/domain, credentials, bounce/complaint handling, and provider idempotency behavior.
- Production secret owner/store/rotation process.
- Backup key owner and destination, monitoring/alerting destination, and operational log retention.

These decisions do not reopen Workspace Foundation or UAT acceptance. They are required before the corresponding production/provider journey is claimed.

## 9. Completed Work Item 6 / Foundation release gate

WI6's consolidated final validation was completed through the Feature 1 + Feature 2 Architecture release gate. It validated the milestone without adding a new foundation feature, provider integration, deployment abstraction, Audit UI, billing, or speculative refactor.

### Final inputs satisfied

- Development published a durable release-readiness checkpoint tied to the exact working-tree candidate and migrations.
- Work Items 1–5 were mapped to accepted contracts and regression evidence.
- Fresh dependency, migration/rerun, health, unit/route **41/41**, serial PostgreSQL **111/111**, full Playwright **25/25**, lint, type, production-build, Compose, and image evidence passed.
- Skipped/provider-dependent boundaries and the unsupported concurrent shared-database test command were explicitly classified.
- Graphics accepted the supported end-to-end Owner/Admin/Member/invitee/suspended-user/multi-Workspace journeys.

### Architecture proof satisfied

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

### Final disposition

- [`feature-1-2-architecture-release-gate.md`](../release/feature-1-2-architecture-release-gate.md) issued **ACCEPT** and formally accepted the technical milestone **NexaFlow Workspace Foundation Complete** for the reviewed candidate.
- [`feature-1-2-architecture-deployment-review.md`](../release/feature-1-2-architecture-deployment-review.md) issued **ACCEPT** for the deployed rc.2 UAT candidate with no bounded material blocker.
- Feature 3 was not started. Future work proceeds vertically under section 10 and may not reopen the accepted foundation absent a concrete downstream gap.

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

1. Treat **NexaFlow Workspace Foundation Complete** and deployed UAT rc.2 as Architecture ACCEPTED.
2. Preserve the accepted release identity and UAT limitations; a different image, environment, migration state, hostname, or public fixture setting requires proportionate re-review.
3. Move to the next Product-approved vertical rather than extending the foundation speculatively.
4. Require every vertical to inherit Workspace scope, active Membership, trusted Active Workspace context, RBAC, Ownership/Team/Visibility, Audit, and Entitlement in the mandatory order.
5. Keep real Google, production email, billing, production backup/operations, and production launch under separate explicit gates. UAT acceptance is not production authorization.
