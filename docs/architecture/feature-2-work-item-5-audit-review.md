# Feature 2 Work Item 5 — Architecture audit review

**Scope:** Audit coverage completion  
**Review mode:** Application code remains Develop-owned; Architecture review is read-only  
**Status:** **ACCEPT**  
**Final review date:** 2026-08-21

## Final decision

**ACCEPT. No material Work Item 5 blocker remains.**

The completed implementation establishes a canonical Feature 2 audit-write boundary with runtime-safe payloads, transactional success evidence, bounded denial ownership, replay deduplication, concurrency semantics, and tenant-safe attribution. It does not weaken the accepted Work Item 4 boundary, and no Work Item 6 work or audit-history UI is required by this gate.

### Final evidence assessment

- **Canonical taxonomy:** the shared writer normalizes legacy Membership and Workspace-selection names to the approved canonical actions. Invitation create/resend/revoke/accept, Membership change/restore, ownership transfer, Workspace selection, and their bounded denial families are asserted in the focused and regression suites.
- **Transactional success:** success events are written through the same PostgreSQL transaction/client as the protected mutation and, where applicable, its outbox and idempotency result. A rollback cannot leave a false success event.
- **Denial and conflict coverage:** service wrappers own post-rollback business denials; routes own authenticated request-boundary denials such as CSRF/Origin rejection. Focused evidence proves one event rather than route/service duplication. Stale version, authority, invalid target, invitation state, concurrency loser, and other approved reason codes remain bounded.
- **Attribution and state:** same-Workspace events derive actor User, actor Membership, Session, Workspace, target, outcome, and bounded before/after version/status/Role evidence from persisted context. The audit writer rejects metadata or state keys outside explicit runtime allowlists before persistence.
- **Correlation and minimization:** caller idempotency material is SHA-256 correlated and is never persisted in plaintext. A correlation identifier is populated even when no caller value is supplied. Audit payloads omit names, email, credentials, tokens/hashes, cookies, provider assertions, raw request bodies, and raw network data.
- **Replay and concurrency:** same-key replay returns the recorded outcome before a second mutation, success audit, outbox message, Session rotation, or seat use. Changed/stale attempts are denied without rewriting the original success. Concurrent Owner transfer records one committed winner, one bounded loser, and preserves exactly one active Owner.
- **Tenant isolation:** denial attribution re-resolves the active actor Membership. A target ID is retained only after verifying same-Workspace actor scope; unresolved or foreign-tenant denials omit the target and do not disclose foreign facts.

### Checks

Independently rerun on 2026-08-21:

| Check | Result |
| --- | --- |
| Audit unit suite | **3/3 passed** |
| Focused live PostgreSQL audit suite | **5/5 passed** |

Development's durable checkpoint additionally records unit/routes **41/41**, complete PostgreSQL **111/111**, focused Feature 2 Playwright **9/9**, database health, clean lint, and clean TypeScript/production build. This is proportionate evidence for the bounded gate and is consistent with inspected source and independent results.

### Residual boundaries

- `request_id` remains most useful at HTTP denial boundaries, while transactional service successes are primarily correlated by a non-secret correlation identifier. This is adequate for the current gate and is not a material security or data-integrity risk.
- Audit retention/export, administrator audit-history UI, external log delivery, deployment, and broader observability remain outside Work Item 5. Product explicitly does not require an audit-history screen.
- Work Item 4 remains accepted. Work Item 6 is not authorized by this review and requires separate Product direction.

## Review gate

Architecture will accept this local increment when the implementation and PostgreSQL evidence establish all of the following:

1. One canonical, documented event taxonomy covers invitation creation/resend/revoke/acceptance, Membership Role and lifecycle changes, ownership transfer, and Workspace selection.
2. Each successful protected mutation writes exactly one success event in the same transaction as the business mutation, outbox record when applicable, and idempotency outcome.
3. Each denied or conflicted authenticated mutation attempt writes exactly one bounded denial event after business rollback, including stale-version, authority, inactive Membership, cross-tenant, last-Owner, rate-limit, and invalid-target paths where a safe actor scope can be established.
4. Audit attribution is derived from current persisted authority. Same-Workspace successes include Workspace, actor User, actor Membership, Session, target type/ID, outcome, and bounded before/after or expected/result version evidence. Cross-tenant denials do not retain a foreign target identifier or disclose its existence.
5. Request/correlation identifiers are populated consistently enough to correlate one HTTP attempt with its event without storing credentials or client-authored authority.
6. Same-key replay returns the recorded result without another mutation, audit, outbox message, Session rotation, or seat consumption. A changed request under the same key is denied without corrupting the original outcome.
7. Concurrent attempts produce only committed-winner success evidence; losers receive bounded conflict/denial evidence and cannot create false success events.
8. Metadata follows an explicit allowlist and excludes email, names, passwords, tokens/hashes, cookies, authorization headers, provider assertions, raw IP addresses, full request bodies, and foreign-tenant facts.

## Material blocker boundary

Architecture rejects this local increment only when an audit defect creates or conceals a material risk of cross-tenant access, authentication/session bypass, loss of the last active Owner, secret disclosure, or non-atomic core-data corruption. Taxonomy or observability inconsistencies that do not create those risks remain required Work Item 5 corrections but are not elevated beyond their actual impact.

## Pre-completion observations

- Invitation services and their HTTP routes currently appear able to audit the same service denial twice; the final design must establish one owner for each denial event.
- Role-change event names currently differ from the approved Feature 2 taxonomy; one canonical name must be selected, documented, and asserted.
- Workspace-selection success metadata must identify the bounded previous/new Workspace transition, and replay must not duplicate it.
- Request/correlation columns exist in the audit schema but must be populated consistently by the completed boundary.

## Pre-completion decision (superseded)

Pending completed Develop implementation and validation evidence.
