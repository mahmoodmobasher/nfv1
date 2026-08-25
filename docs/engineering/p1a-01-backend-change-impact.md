# P1A-01 end-to-end Lead creation backend remediation change-impact

Date: 2026-08-25. Base candidate: `eefb718`. Scope is backend, transport-only shared contracts/fixtures, tests, and evidence. There is no schema, migration, frontend UI, merge, deployment, data repair, Pipeline mutation, or top-bar work.

## Changed capabilities and contracts

- Leads owns `submitLeadInquiryV1`, `listLeadSummariesV1`, `getLeadDetailV1`, and `listLeadPipelineStagesV1`, plus the identity-review orchestration already accepted on the base chain. Stable public identities are `lead-inquiry-intake.v1`, `listLeadSummaries.v1`, `getLeadDetail.v1`, and `listLeadPipelineStages.v1`.
- The authoritative `p1a-identity-v2` phone value object accepts approved formatted 10-digit CA/US, leading-1 11-digit, and explicit `+` E.164 forms. It rejects ambiguity, extensions, controls, letters, misplaced/repeated plus signs, and unsupported punctuation before transaction entry. Explicit blank/whitespace phone is absent when valid email exists.
- The canonical request hash removes raw phone/country input and adds the derived phone authority: preserved display, E.164, actual calling code, normalization version, and effective national-country input. Explicit international input has no effective country. Same key plus changed display/canonical/country semantics conflicts; unchanged absent/blank semantics replays.
- Semantically compatible retained v1 and new v2 email/phone/Company identities use one stable advisory namespace. All present email and phone keys are sorted and acquired, Company precedes Contact authority, and candidates are re-run after the final identity lock. Normalization version remains immutable lineage/evidence, not a lock partition.
- Canonical Lead list/detail DTOs are strict runtime allowlists with nullable Contact, Company, structured name, user assignment, Team assignment, and masked channels. They preserve lifecycle/stage/version/review/timestamps and immutable source-versus-intake attribution. `canEdit=false`; pending-review `canReview` and navigation are server-produced from current role/assignment.
- The Pipeline-stage DTO returns the full ordered active registry, including stages with no Leads. It is read-only and does not authorize drag/drop or stage mutation.
- A transport-only handoff in `src/frontend/shared/contracts/p1a-transport.ts` and safe fixtures in `src/frontend/features/leads/testing/lead-presentation.fixtures.ts` mirror backend JSON schemas without importing server/repository code. It includes success/error envelopes, masks, capabilities/navigation, stable field-path controls, the complete accepted phone matrix, nullable examples, and Pipeline stages. This is contract infrastructure, not frontend behavior.

## Routes, authorization, pagination, and legacy isolation

- Thin authenticated GET/POST Lead routes remain private/no-store. The additive Pipeline-stage GET route uses the same transport/error/cache boundary.
- List visibility is applied inside the Workspace-qualified SQL using the public Platform reviewed disclosure predicate. It returns no invisible counts, uses at most 50 public rows plus one internal sentinel, and no longer truncates a fixed pre-filter population.
- The opaque cursor orders by `(updated_at,id)` descending and carries PostgreSQL’s exact timestamp text, avoiding JavaScript millisecond truncation when many rows share a microsecond timestamp. Returned rows are neither duplicated nor skipped under stable keys. If an unseen row is updated ahead of the current boundary, it appears on refresh rather than being injected into the remainder of an in-progress traversal; an already selected Lead that changes before serialization fails closed.
- List and detail first read a repeatable presentation snapshot, then use a separate current read transaction immediately before serialization to revalidate active Workspace/User/Session/Membership/current role, Lead version/update marker, assignment, Team visibility, and disclosure. That same final transaction re-fetches active assignment and Company labels through public participants; suspended/archived references cannot leak stale labels. Capabilities are shaped from the fresh actor. Authority or Lead drift returns tenant-safe no-detail.
- Legacy PATCH checks canonical intake lineage before parsing or invoking the legacy updater. A canonical P1A Lead is always read-only through this route, and the modular/route tests prove the canonical DTO cannot reach the old mutation authority.

## Modules, ownership, and traces

- The accepted end-to-end chain changed Leads orchestration/contracts/read repositories, Contact normalization/candidate/create contracts and repository behavior, Company participants, Identity Review participants, and Platform authorization/idempotency/Audit/Outbox mechanisms. This remediation specifically changes Leads, the Company presentation SQL export, Platform authorization, shared transport fixtures, tests, registry/manifests, and evidence; it does not falsely classify the Contact changes in `eefb718` as unchanged.
- Leads remains the single owner of `leads`, `lead_intakes`, `lead_activities`, `lead_visible_teams`, lifecycle reads, and Pipeline-stage reads. Contacts, Companies, and Identity Review remain their single table owners. Workspace Administration tables are consumed only through Platform authority contracts.
- The Platform-owned reviewed `WORKSPACE_LEAD_DISCLOSURE_SQL_PREDICATE_V1` is a public read-model contract embedded by the Leads public query. This keeps Team membership/visibility SQL in Platform, Lead predicates in Leads, and avoids private repository imports.
- Reads produce no Audit/outbox record and mutate no versions, timestamps, assignment, visibility, review/decision state, or identity data. Accepted intake still commits one Lead/intake outcome, one governing Audit, and its exact unique outbox set atomically; replay adds no effects.

## Test and performance impact

- Phone tests cover every Architecture fixture, persisted display/E.164/calling-code/version, blank/absent behavior, hash/replay/conflict semantics, and full protected-table zero deltas for every rejected class.
- Controlled retained-v1 review resolution versus v2 intake shares email, phone, and Company authority and proves one canonical identity outcome, candidate/review truth, no partial effect, and no deadlock.
- Presentation tests cover sparse Members beyond 201 rows, exact timestamp cursor continuity, multi-page filters, Team visibility changes, role/assignment/session loss, null combinations, legacy rows, tenant denial, masks, strict schemas, stages, no-write GETs, and legacy PATCH zero mutation.
- Representative default-planner evidence uses 100,001 Leads, 100,030 Contacts, 25,010 Companies, 10,001 pending reviews, 10,030 candidates, one full 30-candidate review, and a sparse Member with a 450-row invisible prefix. Exact 30-sample p50/p95 and plans are recorded in `p1a-01-postgresql-evidence.md`; all public p95 targets pass without a new index.

## Risk and rollback

- Real substring search remains a bounded tenant-leading index traversal with filtering, not a surrogate exact-email lookup. It passes the current fixture budget but should be monitored as tenant size grows; any search index proposal returns to DBA/Architecture.
- Keyset traversal deliberately does not promise a frozen multi-request snapshot. Refresh is the authoritative reconciliation after concurrent updates.
- Rollback is application-only: revert the single remediation commit or deploy the preceding accepted image. No database rollback or repair is needed. Preserve canonical Lead/intake/review/Audit/outbox lineage; do not delete committed data.
