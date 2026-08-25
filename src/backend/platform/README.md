# Backend Platform

P1A consumes six shared mechanisms through public `index.ts` entry points:

- Database: transaction ownership and rollback; no business-table ownership.
- Idempotency: operation- and identity-key advisory serialization; durable receipts remain with their feature owner.
- Authorization: trusted actor facts plus the reviewed Workspace assignment/visibility read-and-lock model; Workspace Administration retains write ownership.
- Audit: typed P1A governing actions, stable operation metadata, and privacy allowlists; owns `audit_events` writes for the command. The accepted table constraint persists the allowed `operation` and `result_version` subset; richer canonical context is type/runtime-validated but intentionally not persisted by this slice.
- Outbox: typed unique event sets and privacy allowlists; owns `outbox_messages` writes for the command.
- Rate limiting: bounded manual mutation admission; durable shared rate-limit storage remains a pre-existing Platform concern.

Platform code must not implement Lead, Contact, Company, or Identity Review business decisions. Feature orchestrators call these mechanisms after acquiring feature locks in the frozen order.
