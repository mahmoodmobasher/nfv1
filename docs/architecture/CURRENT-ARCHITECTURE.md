# Current NexaFlow architecture

Status date: 2026-08-27

## Runtime and authority

NexaFlow is a Next.js 16.3.1 application backed by PostgreSQL and Drizzle migrations. UAT runs the application, worker, PostgreSQL, Caddy, and Mailpit/approved delivery adapters in an isolated Compose project. Current source authority is `600a9aa96ec598b38aed557c2c4cb9b62d4afc08`; the database ledger has 26 entries through migration 0025.

Workspace, active Membership, Role, Team, record ownership/visibility, and trusted Session Workspace context govern every protected operation. Platform owns authorization, transaction mechanics, Idempotency, Audit, and Outbox. Domain modules remain single writers for their aggregates.

## Active domain owners

- Leads: Lead root, current source/platform, immutable intake provenance, pipeline stage, visibility, identity-review orchestration, and Lead-to-Deal conversion orchestration.
- Customer Graph: Companies, Contacts, identity/domain/channel facts, canonical affiliation, assignment, and profile lifecycle.
- Identity Review: review, candidates, decisions, and effective decision heads.
- Sales: pipelines, stages, Deals, parties, visibility, transition history, and conversion lineage.
- Notes: Note roots, revisions, and typed Contact references.
- Workspace Administration and Platform: Workspace, User, Session, Membership, Role, Team, Team Membership, authorization, Audit, Outbox, and receipts.

## Active verticals

- Companies and Contacts list/detail/create/edit/archive/restore and Contact affiliation.
- Lead intake, list, pipeline, detail, expanded profile edit, stage movement, inline Company creation, and identity review.
- Deals list, board, detail, create/edit, stage transitions, archive/restore.
- Lead-to-Deal conversion.
- Contact internal Notes add/list.
- Current-authority navigation and personal/Workspace administration links.

## Non-negotiable boundaries

- Workspace qualification and tenant-safe not-found behavior.
- Expected versions, target-bound idempotency, deterministic locks, final current-authority fences, and atomic domain/Audit/Outbox/receipt writes.
- No cross-owner direct writes or donor Organization/auth assumptions.
- No copied sensitive labels/channels in evidence payloads.
- Private/no-store protected responses and capability-derived browser actions.
- Keyset pagination for bounded lists; no offset or unbounded donor queries.
- UAT fall-forward by default; production requires separate authorization.

## Next architecture slice

`ACTIVITY-01A` should activate manual Lead activity create/list using `activity_records` and `activity_record_references`, including the DB-01A target timeline projection. New writes must not use legacy `lead_activities`. Broader timelines, system projections, Tasks, and multi-target activities remain deferred.
