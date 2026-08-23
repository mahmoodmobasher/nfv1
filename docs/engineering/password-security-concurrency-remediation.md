# Password security-operation concurrency remediation

Date: 2026-08-23
Architecture finding: `635c188` P2
Base candidate: `caa1f65308f311ffe3986c5774171398343795c0`

## Canonical contract

Password change and reset completion acquire the same transaction-scoped per-User PostgreSQL advisory lock before locking or mutating any Session, reset token, credential, User security version, or Audit row. Reset completion performs only a non-locking token lookup to discover the User, acquires the canonical lock, then revalidates the token under `FOR UPDATE`. No database-error retry is introduced.

The serialized loser uses an existing bounded outcome:

- If password change wins, it supersedes the reset token and reset completion returns the generic `{ ok: false, code: "invalid_or_expired" }` response.
- If reset completion wins, it consumes the token and revokes every Session; the waiting password change revalidates its initiating Session and returns `authentication_required`.

Both winner paths keep password mutation, token terminal state, User security-version increment, all-Session revocation, and their single success Audit in one transaction. Repeating either losing request cannot change the password, increment security version, revoke again, or create another password success Audit.

## Deterministic PostgreSQL evidence

The account integration suite holds the canonical advisory lock from a controller transaction, queues the intended winner and observes it waiting, queues the loser and observes both waiters, then releases the controller. PostgreSQL's advisory-lock wait queue establishes each controlled order.

Both password-change-first and reset-first cases assert:

- completion without `40P01`, unexpected database failure, or indefinite wait;
- the expected bounded loser response;
- exactly one committed password success Audit;
- User security version equals `2` after one initial version increment;
- zero active Sessions;
- exactly one reset-token terminal state (`replaced_at` or `consumed_at`);
- retry of both original requests produces no additional mutation or Audit;
- only the winning password authenticates.

The existing injected late-failure regression continues to prove rollback of password, reset token, Session/security version, and success Audit. No schema or migration change is required.
