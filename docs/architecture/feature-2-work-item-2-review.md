# Feature 2 Work Item 2 — Architecture Gate Review

Status: **ACCEPT**  
Final review date: 2026-08-21  
Scope: bounded re-review of WI2-01 through WI2-03 only  
Review mode: read-only source, documentation, and local PostgreSQL evidence; no application code or external system changed

## Final verdict

Feature 2 Work Item 2 is accepted. Develop resolved the transactional actor-authority race, requires an active target for generic Role changes, and added the focused adversarial evidence required by the prior review.

No material blocker remains for cross-tenant access, authentication/session bypass, loss of the last Owner, secret disclosure, non-atomic corruption, or the primary authority-aware Role journey.

## Evidence reviewed

- `docs/engineering/feature-2-role-authority-checkpoint.md`
- `docs/architecture/feature-2-user-role-membership-contract.md`
- `src/server/tenant-admin/role-authority.ts`
- `src/server/tenant-admin/permissions.ts`
- Membership PATCH route
- server-derived People/invitation capabilities and authority-aware UI controls
- `tests/feature2-role-authority.integration.test.ts`
- relevant Slice 4 and route regression coverage

Independent execution:

| Check | Result |
| --- | --- |
| Focused WI2 PostgreSQL suite | **5/5 passed** |
| Complete PostgreSQL integration suite | **95/95 passed across 10 files** |

The independently observed counts match the Development checkpoint.

## WI2-01 — Transactional actor authority

**ACCEPT.**

Before idempotency replay or target access, the dedicated Role service begins one transaction and locks/revalidates:

- active persisted User;
- Session owned by that User;
- Session not revoked and within idle and absolute expiry;
- Session security version equal to current User security version;
- active Workspace; and
- active actor Membership and its persisted Workspace-local Role.

Caller Role, Membership version, authentication timestamp, and other context fields do not grant authority. The focused matrix proves denial after User suspension, Session revocation, idle expiry, absolute expiry, security-version change, Workspace suspension, actor Membership suspension, and mismatched/forged actor identity. These paths create no target change, success audit, or idempotency outcome.

## WI2-02 — Active target and authority ceilings

**ACCEPT.**

The locked target query is Workspace-scoped. The service requires the target to be:

- present in the actor Workspace;
- active;
- non-self; and
- non-Owner.

The generic route schema accepts only `admin|member`, while the service independently rejects `owner`. Only a persisted Owner may perform generic Role changes. Persisted Admin and Member callers cannot elevate authority through forged context. Owner assignment remains exclusively behind the dedicated ownership-transfer boundary, so generic Role mutation cannot remove or replace the last Owner.

Suspended, removed, self, Owner, and cross-Workspace targets are denied without Role/version mutation. The selected replacement Role is resolved inside the same Workspace.

## WI2-03 — Versioning, atomicity, audits, and evidence

**ACCEPT.**

- The target row is locked and checked against `expectedVersion`.
- The update repeats Workspace, active-status, and expected-version predicates and increments exactly once.
- Concurrent writes produce exactly one success; the competing write cannot silently overwrite it.
- Idempotency is bound to persisted actor Membership, operation, key, Workspace, target, Role, and expected version.
- Same-key replay returns the stored result without repeating the mutation or success audit.
- Role change, `workspace.membership_role_changed` success audit, and idempotency outcome commit atomically.
- Denials use `workspace.membership_role_change_denied` with bounded metadata and no target mutation or replay record.
- The route avoids duplicate denial audit for service-owned failures and directly rejects generic Owner input.
- No password, cookie, Session hash/token, provider assertion, or foreign-tenant detail is returned or audited.

Focused evidence proves:

1. Owner Member→Admin and Admin→Member success and replay.
2. Admin/Member ceilings and forged caller Role denial.
3. Owner input, self, Owner target, inactive target, and cross-tenant denial.
4. all required User/Session/security/Workspace/Membership invalidations.
5. concurrent write serialization.
6. direct API Owner rejection and bounded denial audit.
7. exactly-once success audit/idempotency behavior.

## Non-blocking boundaries

- The checkpoint's unrelated full-Playwright legacy failures are outside WI2 and do not intersect the independently accepted PostgreSQL authority boundary or focused WI2 journeys.
- Workspace switching remains a later Feature 2 work item.
- Feature 3 profile/preferences/security, real Google, post-provision plan changes, deployment, and unrelated pre-UAT hardening remain outside this review.

## Authorization

Develop may proceed to the next planned Feature 2 work item. Future review should not reopen WI2 unless later changes regress one of these accepted material invariants.

