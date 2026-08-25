# Backend Platform

P1A consumes six shared mechanisms through public `index.ts` entry points:

- Database: transaction ownership and rollback; no business-table ownership.
- Idempotency: operation- and identity-key advisory serialization; durable receipts remain with their feature owner.
- Authorization: trusted actor facts plus the reviewed Workspace assignment/visibility read-and-lock model; Workspace Administration retains write ownership. The public `WORKSPACE_LEAD_DISCLOSURE_SQL_PREDICATE_V1` read-model contract lets the Leads owner apply Member visibility inside its tenant-scoped keyset query without importing a private Platform repository or post-filtering/leaking invisible population. Final disclosure is independently revalidated against current authority.
- Audit: runtime-enforced P1A operation/action/target pairings, typed metadata and privacy allowlists; owns `audit_events` writes for the command. The accepted table constraint persists the allowed `operation` and `result_version` subset; richer canonical context is runtime-validated but intentionally not persisted by this slice.
- Outbox: runtime-enforced topic/aggregate/topic-specific payload contracts, unique event sets, and privacy allowlists; owns `outbox_messages` writes for the command.
- Rate limiting: bounded manual mutation admission; durable shared rate-limit storage remains a pre-existing Platform concern.

Platform code must not implement Lead, Contact, Company, or Identity Review business decisions. Feature orchestrators call these mechanisms after acquiring feature locks in the frozen order.
