# Customer Graph backend

CUSTOMER-GRAPH-01 is the bounded Companies/Contacts management coordinator on DB-05A. It owns no Lead, Deal, import,
provider, communication, customization, migration, or frontend behavior. New writes use `customer-graph-v1`; legacy roots
are read-only. The reviewed coordinator SQL spans the Company and Contact aggregate/authority tables plus current Platform
Membership/Team facts so visibility is applied before keyset limits and final disclosure is fenced in one transaction.

Writes use Workspace-scoped semantic idempotency, root-first stable locks, sorted affiliation Company locks, current Platform
authority, `expectedVersion`, retained identity/domain/affiliation history, one governing Audit, one minimal Outbox event, and
one receipt atomically. Reads are private/no-store, minimize list identity, mask Contact channels for non-managers, and never
disclose a hidden affiliation Company's identity.

Collection GET responses expose final-authority `capabilities.canCreate`. `?bootstrap=true` returns the same strict envelope
with an empty item stream, allowing create pages to obtain authority without customer identity disclosure.
