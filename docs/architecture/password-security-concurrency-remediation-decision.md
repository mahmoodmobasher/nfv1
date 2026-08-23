# Password security concurrency remediation decision

Date: 2026-08-23  
Base candidate: `caa1f65308f311ffe3986c5774171398343795c0`  
Architecture finding: `635c188` P2  
Candidates: Dev3 `d4f9db99ff5d406d28754063b3d29872ebad4947`; Dev2 `f8b7dfcb1a81254d073953f76811bdf0399c066e`

## Decision

**ACCEPT `f8b7dfcb1a81254d073953f76811bdf0399c066e` — no material Architecture blockers.**

Select Dev2's transaction-scoped per-User advisory-lock remediation for integration. Do not also integrate Dev3's alternative row-lock helper or its service changes.

## Evidence and rationale

- Both password change and reset completion acquire `lockPasswordOperation(client, userId)` before locking or mutating Session, reset-token, credential, User security-version, or Audit state. Reset completion performs only a non-locking token-to-User discovery first, then revalidates the token under `FOR UPDATE` after acquiring the canonical lock. The original Session/reset-token lock inversion is therefore removed.
- The lock is transaction-scoped. Password mutation, reset-token consumption or supersession, security-version increment, all-Session revocation, and the single success Audit remain one atomic commit. The existing injected late-Audit-failure regression continues to prove rollback of password, token, Session/security-version, and Audit effects.
- Deterministic PostgreSQL tests queue both operations behind the same advisory lock in each order. They prove the password-change-first loser returns generic `invalid_or_expired`, while the reset-first loser returns `authentication_required` after its initiating Session has been revoked.
- Both orderings assert exactly one winner password, exactly one terminal reset-token state, security version incremented once, zero active Sessions, and exactly one password-success Audit. Retrying both losing requests proves no further mutation or Audit.
- The shared security primitive is smaller and easier to extend than duplicating a multi-table row-lock sequence and materializing all tokens and Sessions merely to establish order. Future password-security mutations have one explicit serialization boundary.

Dev3 `d4f9db9` also removes the observed cycle through a common credential → ordered reset tokens → User → ordered Sessions sequence. It is not selected because its deterministic regression covers only password-change-first, not reset-first bounded-loser behavior, and its correctness contract exposes a larger multi-table lock sequence to future maintenance.

## Integration and maintenance guardrails

1. Cherry-pick/integrate `f8b7dfc` as a unit; do not combine it with `d4f9db9`.
2. Every future operation that changes a User's password credential, completes or invalidates password-reset authority as part of a password mutation, or revokes Sessions as part of that mutation must acquire the same transaction-scoped per-User lock before mutable security-row locks or writes.
3. A reset flow may discover the User without a row lock, but must revalidate its token and authorization after acquiring the canonical lock and before mutation.
4. Preserve bounded domain loser responses; do not add database-deadlock retries as the concurrency contract.
5. Preserve both deterministic winner-order regressions and the late-failure rollback regression in the deployment gate.
6. The lock is global-User security infrastructure and must remain independent of Workspace context, Membership, RBAC, visibility, and entitlements.

## Findings

- P0: none.
- P1: none.
- P2: none in selected candidate.
- P3: advisory key hashing can conservatively serialize an unrelated User on a rare hash collision; this affects throughput only, not authorization or state correctness, and is not a release blocker.
