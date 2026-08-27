# Activities

ACTIVITY-01A owns manual Lead activity roots in `activity_records` and their single typed `crm.lead` references in
`activity_record_references`. The bounded v1 runtime supports create and target-scoped newest-first list only. Email is
record-only evidence and never sends a message.

Create uses `activity-create.v1`, an expected Lead version, target-bound idempotency, a Leads-owned visibility/action
participant, and a final current-authority fence. Root, reference, minimized Audit, versioned Outbox event, and a receipt
that excludes subject/details commit atomically. A committed replay strict-validates and binds that safe receipt, then
reauthorizes current Lead disclosure without reapplying the original expected-version/create-capability precondition.
New creates compare normalized millisecond occurrence time to the transaction's single PostgreSQL timestamp; occurrence
may be at most five minutes in the future to tolerate clock skew and is immutable after the reference exists.

List uses `activity-list-query.v1` and the DB-01A reference-first descending `(occurred_at,activity_id)` keyset with a
page-size-plus-one sentinel. Cursors bind query version, Workspace, Lead, and kind filter. Responses are private/no-store.

Deferred: global and multi-target timelines, system activities, Tasks/follow-ups, delivery providers, edit, archive,
revision, rescheduling, legacy `lead_activities` writes, and additional target types.
