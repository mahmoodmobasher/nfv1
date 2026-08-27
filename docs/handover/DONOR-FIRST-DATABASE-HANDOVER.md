# Donor-first database convergence handover

> Historical architecture record from the database-first convergence phase. For current source, UAT, migration, and delivery status, use `docs/handover/PROJECT-STATUS.md`.

Authority date: 2026-08-26

## Executive summary

NexaFlow shifted from incremental feature delivery to a whole-portfolio, Architecture-led database convergence program. The private donor application is the product capability blueprint, but NexaFlow's Platform spine remains implementation authority. Work proceeds through small, independently reviewed, additive/dormant packages—not a donor schema import or big-bang migration.

Published UAT remains `v0.5.0-uat.20` at `7ecc1a6b4927d5cc85258ce985a65a460a2d277c`. Local `main` is `c5209634b8852792d698d813996034b009351c91`, containing accepted dormant packages through migration 0022 / DB-08A Deals/Pipeline. The handover working tree contains preserved Product documentation changes. These local packages have not been published, deployed, activated, reconciled against UAT, or used to switch a writer. No backend or frontend feature implementation exists for them.

## Authority and precedence

1. Product freeze/delegation and this handover.
2. CRM-DATA-CONVERGENCE-01 final G1/G2/G7 authority.
3. Exact accepted immutable candidates and repository evidence.
4. UAT20 as the mandatory current Lead parity floor.
5. Donor `mahmoodmobasher/NexaFlowSystem` at `57d38b0c2091f1376344614720890c9544916933` as workflow/product evidence only.

The “Canonical Lead Preservation Addendum” is invalid and superseded. Current Lead internals may evolve under Lead-vNext, but behavior cannot regress and exactly one writer must remain authoritative.

## Architectural pivot

Donor discovery exposed an interdependent CRM portfolio: customer graph and Leads; Activities, Notes, Documents, Customization; Deals/Pipeline, routing/forms/import/reporting; Delivery; Communications; Integrations; and governed AI. The active sequence is now:

1. inventory donor capabilities;
2. classify Adopt, Adapt, Split, Consolidate, Defer, or Reject;
3. freeze global identity, retention, and event rules;
4. freeze wave-local ownership/cardinality/privacy/cutover decisions;
5. implement dependency-ordered dormant database packages;
6. review each immutable SHA through Architecture and Dev2;
7. perform a combined migration/cross-module rehearsal;
8. resume backend, frontend, and disposable-UAT activation wave by wave.

DDL integration never activates a feature. Old and new writers never coexist as authorities.

## Fixed Platform spine

Workspace, Membership, RBAC/Team/Visibility, Platform Audit, Platform Outbox, and Platform Idempotency are non-replaceable. Commands preserve current authority, expected-version concurrency, semantic idempotency, stable lock order, tenant-safe disclosure, and atomic business + Audit + Outbox + receipt effects. Protected reads are private/no-store and finish with a current-authority fence.

Rejected donor patterns: Organization/User/JWT authority, controller-only authorization, donor Prisma/migrations, local audit/events/idempotency, direct cross-module writes/FKs, unsafe cascades, unscoped polymorphism, sensitive event payloads, offset pagination, silent backfill, and dual writers.

## Global G1/G2/G7 rules

G1: RecordRefs are Workspace-qualified `recordType + recordId`. Codes are immutable, namespaced, owner-governed, and never reused. A reference grants no visibility, stores no foreign label/authority, and has no target FK. Owners resolve existence/state/disclosure through typed participants; multi-reference presentation fails closed unless explicitly frozen otherwise.

G2: data classes cover immutable evidence, retained business aggregates, redactable content, sensitive data, rebuildable projections, provider-secret handles, and transient/TTL facts. NO ACTION/RESTRICT is default. Archive/redact/tombstone/purge are explicit versioned commands. Target deletion never cascades through another owner's evidence. Workspace retirement is checkpointed, resumable, owner-ordered, and fall-forward.

G7: Platform Outbox is the sole publisher. `domain-event.v1` uses stable identities/version/classification and minimal payloads. Default is one governing event per aggregate version. Consumers never lock sources; shared delivery persistence is Platform-owned. Gaps wait, poison is explicit, replay is immutable, and historical backfill needs a separately frozen synthetic-event contract.

## Accepted and rejected persistence

Accepted local chain: DB-01 `78002a4` → DB-02 `0129358` → DB-03 `aca3a50` → DB-04 `64ae594` → DB-05A `af17702` → DB-06A `70b2e59` → DB-00A-01 `d1d48c3`.

Never resurrect or transfer acceptance from:

- Activity `fe86df0` or short-code `1b9d066`; final schema is `78002a4`.
- Notes `64b216a`; fixed by `0129358`.
- Documents `e0689d5`; fixed by `aca3a50`.
- Customization `711a1eb` or intermediate `cc54624`; final is `64ae594`.
- Customer Graph `8f7aa03`; fixed by `af17702`.
- DB-06A `677c8b0`; fixed by `70b2e59`.
- DB-06B `8de96f8`; rejected and never to integrate.

## DB-06B live work

Dev3 delivered fast-track candidate `849e4e4159d66bfb5207b2f4bbf62c21cdcf6544` from `d1d48c3`, which Architecture accepted. At user request, Dev3 then produced test-organized replacement `62b1ed09398b79d826cec8c612976f0e24ff4f49`: core integrity/readiness/races (591 lines), bounded 100-row evidence (336 lines), and shared typed-parity/fixture helpers (307 lines). Architecture and Dev2 independently issued exact-SHA ACCEPT after code/evidence inspection, and Product fast-forwarded exact `62b1ed0` into local `main`. Database testing remained closed and was not rerun.

The replacement must independently compare Lead/intake, Identity Review cases/candidates/decisions/heads, Teams, lifecycle/stage, Contact/Company links, Lead history/activity, Audit, Outbox, and receipts. HMAC encoding uses explicit typed tokens. Real current-command fixtures use operation/contract `lead-inquiry-intake.v1` with normalization `p1a-identity-v2`; retained `p1a-identity-v1` rows are explicitly versioned legacy compatibility evidence and must never be presented as current-writer output. Canonical parity includes the exact stored normalization version and never rewrites or upgrades it. Readiness derives from persisted run/mapping/checkpoint/issue/authority facts. It must exercise accepted command races, crash/resume/replay/stale/fall-forward and a bounded-plan smoke check proving use/catalog fit of the new Audit index. No DDL, runtime, route, service, UI, real reconciliation, or activation is permitted.

Recognized retained normalization versions are `p1a-identity-v1` and `p1a-identity-v2`. Readiness accepts internally consistent retained v1 lineage and current-writer v2 lineage. It does not require universal version equality across owners: Contact/Company-owned facts may legitimately remain v1 while a current Lead/intake is v2. Each owner's frozen contract and explicit lineage are validated separately. An unknown version or unexplained mismatch within one Lead/intake/review lineage blocks with `issue_code=unsupported_legacy_row` and `safe_code=unsupported_identity_normalization_version`; no raw identity enters issue evidence.

### DB-06B performance deferral and test maintenance

User direction supersedes the earlier DB-06B performance completion gate. Current acceptance is migration/integrity focused and uses exactly 100 representative Leads/rows per tested stream as the maximum/current fixture, including deterministic duplicate, equal-timestamp, and cursor-order cases inside those 100 rows. The full 500-row page-boundary gate, 100,001+ cardinality fixture, full-scale HMAC sweep, memory/throughput evidence, and repeated 30-sample p95 gates are preserved but deferred to a separately named mandatory pre-activation/cutover performance scope. They must pass before Lead-vNext activation/cutover, but they no longer delay dormant migration completion.

Architecture observed that the WIP's runtime came from well over one million fixture rows, thousands of database round trips, 100,001 independent HMAC comparisons, repeated plan samples, and broad regressions—not merely file parsing. Existing performance code/results must not be discarded or misrepresented; Dev3 may make the minimum focused changes needed to keep the deferred gate out of the current default completion path.

After DB-06B integrity acceptance, Product may separately authorize a test-only organizational refactor with no semantic or assertion drift: split pure encoder/inventory/readiness contracts, persisted integrity/race/resume integration, and the opt-in large-scale performance/HMAC suite. Splitting improves diagnostics but does not replace the deferred pre-activation gate.

## Donor reuse map

Adopt workflow vocabulary, chronological interaction concepts, occurred/created-time separation, source/provider identity concepts, UX groupings, fixtures, and scenarios.

Adapt Organization→Workspace, User actor→Membership, relations→RecordRefs, access→typed participants, indexes→Workspace keysets, deletes→retention commands, events→Platform Outbox, and mutations→expectedVersion/idempotency/Audit/receipt.

Split manual Activities from Unified Timeline; FollowUps from Delivery Tasks; Document metadata/refs from storage/scan; Communications records from credentials/providers; Lead eligibility from Contact/Company/Deal conversion participants; AI governance evidence from memory/output.

Consolidate donor activity/AI audit into Platform Audit; interactions into Activities/Timeline; legacy content into canonical owners only after mapping; projections from registered events.

Defer broader Activity refs, revisions/purge, system Timeline, providers/channels, AI, duplicates, MGMT-02, and customer migration.

### Frontend leverage found

Activities can reuse newest-first timeline structure, kinds, direction/outcome/time/duration/subject/details, manual/system provenance, filters, and “load older.” Rebuild in Nexa Spectrum with accessible focus/live states, truthful failures, privacy/current authority, and explicit record-only Email semantics.

Lead-adjacent concepts include explainable scoring, routing and “Why assigned,” capture-form lifecycle/preview/consent, import mapping/preview/per-row outcomes, and conversion preview. Reject donor mock scores, broad editors, raw identity disclosure, mock Kanban, direct conversion writes, inaccessible overlays, native confirm, and toast-only errors.

Graphics has not deeply reviewed every donor area. Portfolio inclusion is not UX acceptance; later capabilities require pinned-SHA review.

### Backend leverage rule

Mine donor validators, services, workflow states, and scenarios for vocabulary and edge cases, recording exact file provenance. Re-express them through NexaFlow contracts and participants. Never transplant donor controllers, repositories, Prisma types, auth, tenant identity, writes, or evidence paths. Append Dev2's detailed donor inventory below when delivered.

### Pinned donor sources already reviewed

Activities: `Documentation/change-control/CRM-ACTIVITY-unified-customer-timeline.md`, `Documentation/customer-activity-timeline.md`, `Documentation/change-control/COM-002-manual-interaction-logging.md`, `Documentation/guides/manual-interaction-logging.md`, `frontend/src/app/(protected)/activities/page.tsx`, `frontend/src/components/activity/ActivityTimeline.tsx`, `backend/src/validators/activity.schema.ts`, `backend/scripts/testCrmActivity.js`, and `backend/scripts/testManualInteractionLogging.js`.

Lead-adjacent: `Documentation/leads.md`, `Documentation/change-control/SLS-002-lead-conversion.md`, `Documentation/change-control/SALES-ROUTING-automated-lead-assignment.md`, `Documentation/change-control/MKT-FORMS-embeddable-lead-capture.md`, `Documentation/change-control/CRM-IMPORT-csv-import-export.md`, the donor Lead list/my/new/edit pages, `frontend/src/components/leads/LeadForm.tsx`, `LeadScoreBadge.tsx`, `LeadScoreBreakdownModal.tsx`, `frontend/src/components/pipeline/KanbanBoard.tsx`, and `frontend/src/validators/lead.ts`.

These paths are relative to donor SHA `57d38b0c`. No checked-in donor Activity or Lead visual-regression baseline was found. The donor also lacks a Lead detail page at that SHA; its “My Leads” scoring is partly client-fabricated, and its Kanban includes mock Deal data. Those limitations must stay visible in later adoption work.

## UAT20 parity floor

Preserve manual intake/original attribution, Identity Review continuity, masked list/detail, server-authoritative search/filter/keysets/capabilities, Pipeline order and accessible movement, bounded operational edit, concurrency/idempotency/evidence, light/dark/system, 320–390px and 200%-proxy behavior, keyboard/focus/dialog/live regions, forced colours/reduced motion, and truthful loading/empty/error/conflict/replay/authority-loss.

“Duplicate Leads” is inaccurate; future preferred naming is “Possible matches.” The user previously chose no current rename, so this is a future recommendation only.

## After DB-06B

DB-07 DDL waits for a real projection consumer. DB-08A Deals/Pipeline is frozen, independently accepted, and integrated as exact `c520963`; rejected `5534f4d` must never integrate. DB-09 through DB-14 cover routing/forms/import/reporting, Delivery, Communications, Integrations, and governed AI. During the current migration-completion phase, every package needs fresh/forward/no-op migrations, ledger/health/schema proof, Workspace/NO ACTION/privacy/failure evidence, deterministic cursor-boundary integrity, and Architecture + Dev2 review. Portfolio-scale 100,001+ plans, throughput, memory, and repeated p95 evidence are consolidated into separately named mandatory pre-activation/release performance gates rather than blocking dormant schema completion.

## Restart checklist

1. Read `AGENTS.md` and all indexed handovers.
2. Verify status, local/origin SHAs, tag, worktrees, and ledger; never infer deployment.
3. Identify the one active package, exact base/SHA, and allowed files.
4. Confirm holds and whether work is planning, DDL, backend, frontend, review, integration, or activation.
5. Use donor code only at the pinned SHA and cite exact paths.
6. Require visible Architecture and Dev2 dispositions; silence is not acceptance.
7. Product alone integrates, publishes, deploys, or activates.
8. Preserve dormant, single-writer, and fall-forward rules.
9. Record new authority and evidence under `docs/`.

## Role state

- Dev3: DB-08A replacement `c520963` delivered, accepted, and locally integrated; awaiting the next bounded database package or rehearsal.
- Architecture: exact-SHA ACCEPT for DB-06B complete; read-only support for the next Product freeze.
- Dev2: exact-SHA ACCEPT for DB-08A complete; backend remains analysis/review only and no runtime work is authorized.
- Dev1: frontend held; clean `7ecc1a6`; no recoverable Activity work.
- Graphics: handover complete; formal UI review resumes after accepted backend and immutable frontend.
- Product/root: sequencing, integration, release, and durable record.
