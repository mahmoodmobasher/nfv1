# Leads module

Purpose: own Workspace Lead inquiry lifecycle and the canonical P1A manual intake transaction.

- Public entry: `index.ts`.
- Owns: `leads`, `lead_lifecycle_definitions`, `lead_intakes`, `lead_activities`, `lead_visible_teams`, and P1A reads of `pipeline_stages`.
- Public operations: `submitLeadInquiryV1`, legacy manual compatibility translation, `getIdentityReviewDetailV1` (`lead-identity-review-detail.v1`; compatibility alias `getIdentityReviewCandidatesV1`), `listIdentityReviewQueueV1` (`lead-identity-review-queue.v1`), and `decideLeadIdentityReviewV1` for explicit Hold/Resolve.
- Consumes: Contacts, Companies, and Identity Review public transaction participants; Platform tenancy/authorization, database, idempotency, Audit, and Outbox ports.
- Intake write trace: route -> public command -> non-locking trust lookup -> idempotency/intake -> Lead -> Company key -> all candidate/probable Company rows in UUID order + recheck -> Contact key -> all selected Contact rows in UUID order + exact shared-cap recheck -> Platform assignment/visibility references -> immediate actor/assignment/candidate revalidation -> review/head + one governing Audit + exact events -> commit/result.
- Decision write trace: route -> public command -> idempotency -> Leads-owned intake/Lead locks -> Identity Review review/head locks -> declared link snapshot check -> Company key/rows/recheck -> Contact key/rows/recheck -> assignment/visibility locks -> immediate permission, Lead/intake/review/head/target/candidate revalidation with no later identity locks -> atomic Hold or Resolve mutation + one governing Audit + exact events.
- Candidate read trace: authenticated route -> Leads public query -> Identity Review reference/evidence -> Leads-owned intake/Lead context -> current active assigned-visible pending authority -> Contact/Company protected presentation -> at most 10 per class/30 allowlisted candidates -> private/no-store response. Exact indexed lookups and protected operation target p95 below 200 ms.
- Queue read trace: authenticated route -> Leads public query -> Identity Review Workspace/state/update/id index-backed pending-reference page -> Leads-owned batched Lead/intake/lifecycle context -> current per-row Workspace assignment/visibility and target freshness -> safe bounded rows/cursor -> private/no-store response. Page target p95 below 200 ms.
- Invariants: every accepted command creates one Lead at `new`; Workspace ownership is permanent; hold never mutates identity; no automatic/fuzzy merge.
- Tests: P1A contract, modular boundary, PostgreSQL transaction/replay/concurrency/rollback/privacy, and route suites.
- Deferred: CSV/XLSX, web/public adapters, conversion, routing, merge, expanded CRM workspaces.
