# DB-08 Deals/Pipeline Product freeze

> Historical Product freeze for the dormant DB-08A package. The package and later Deals runtime are now integrated; retain this document as the original schema and ownership decision record. Current delivery status is in `docs/handover/PROJECT-STATUS.md`.

Authority date: 2026-08-26
Product baseline: `62b1ed09398b79d826cec8c612976f0e24ff4f49`
Donor evidence: `mahmoodmobasher/NexaFlowSystem` at `57d38b0c2091f1376344614720890c9544916933`

## 1. Decision and scope

DB-08A is authorized for **dormant database implementation only**. The completed local convergence work through DB-06B is database/schema/test evidence; no backend or frontend feature implementation has occurred. DB-08A preserves that boundary.

Dev3 DBA is the only implementation role for DB-08A. Architecture and Dev2 review the Product freeze and the eventual immutable candidate. Dev1 and Graphics remain held except for future read-only support/review.

DB-08A does not authorize runtime services, backend commands or queries, routes, frontend work, seed/bootstrap, reconciliation, backfill, writer switching, feature activation, publication, deployment, UAT mutation, reporting, FX, Delivery Project creation, or Lead conversion execution.

## 2. Product outcomes

DB-08 establishes dormant Sales-owned persistence capable of later supporting:

1. Workspace-owned Deal pipelines and ordered stages;
2. retained, versioned Deal aggregates;
3. Company and Contact participation without cross-module ownership leakage;
4. exact currency-labelled Deal value;
5. immutable stage-transition history;
6. durable Lead-to-Deal lineage for a later separately authorized conversion service; and
7. Workspace-safe list and board keysets.

Existing `pipeline_stages` remains Leads-owned compatibility state. DB-08 must not reuse, rename, seed, migrate, or reinterpret it.

## 3. Frozen ownership and identity

- Sales owns `sales_pipelines`, `deal_stage_definitions`, `deals`, `deal_party_refs`, `deal_visible_teams`, `deal_stage_transitions`, and `lead_deal_conversion_lineage`.
- Every aggregate and child is Workspace-qualified and uses an opaque UUID.
- Deal record type is `sales.deal`.
- Pipeline and stage codes are immutable, namespaced, and never reused.
- Labels, order, default probability, active/archive state, and other presentation configuration are versioned metadata.
- Workspace, Membership, Team, Platform Audit, Platform Outbox, and Platform Idempotency remain the non-replaceable Platform authority.
- Companies, Contacts, and Leads remain sole writers for their aggregates. DB-08 stores opaque typed references, not copied authority.

## 4. Pipeline model

The schema is multi-pipeline capable and may store multiple active non-default pipelines. It enforces at most one active default Sales pipeline per Workspace with a partial unique index. V1 runtime will expose only the active default; creating, exposing, or entitling additional pipelines is held behind a later Product decision.

The initial frozen stage template is:

| Code | Label | Outcome class | Default probability |
| --- | --- | --- | ---: |
| `sales.qualification` | Qualification | `open` | 10% |
| `sales.discovery` | Discovery | `open` | 25% |
| `sales.proposal` | Proposal | `open` | 50% |
| `sales.negotiation` | Negotiation | `open` | 75% |
| `sales.closed_won` | Closed won | `won` | 100% |
| `sales.closed_lost` | Closed lost | `lost` | 0% |

DB-08A does not create a pipeline for an existing Workspace and does not backfill any row. The template becomes explicit bootstrap authority only in a later activation package.

Stage outcome class and namespaced code are database-immutable after creation. DB-08A authorizes narrow database immutability triggers for pipeline code, stage code/outcome class, stage-transition evidence, and conversion-lineage evidence. Stage reordering and archiving require a later versioned pipeline-configuration command. An archived stage remains valid historical authority; preventing a future command from selecting it is a service invariant, not a DB-08A claim.

## 5. Deal lifecycle and transitions

- Deal retention lifecycle is `active | archived`.
- Commercial outcome is `open | won | lost` and must agree with the selected stage outcome class.
- The selected stage and stored outcome must agree through a Workspace/pipeline/stage/outcome composite reference. Future commands change them atomically under an expected Deal version.
- Same-stage no-op behavior, terminal transition authorization, reopening, and required evidence cardinality are future command invariants and are not claimed by DB-08A.
- Reopening is a separate privileged, versioned command with a controlled reason and remains backend scope outside DB-08A.
- DB-08A provides insert-only stage-transition evidence capable of storing from/to stage and outcome, resulting Deal version, actor Membership, operation identity, and occurred/created timestamps. Narrow database triggers reject evidence update/delete; future commands own when and how one row is appended.
- Deals are retained business aggregates. Archive/restore is explicit; hard delete is not authorized.

Initial controlled lost-reason codes are `budget`, `timing`, `no_decision`, `competitor`, `needs_mismatch`, and `other`. Free-text loss narrative, stage note, description redaction workflow, and Activity/Note linking are deferred.

## 6. Parties, responsibility, and visibility

- Every Deal has exactly one active `customer_company` reference.
- A Deal may have zero to twenty active Contact references. Contact rows carry a bounded `contact_slot` from 1 through 20 so the database can enforce the maximum without trigger-owned command semantics.
- Contact roles initially support `buying_contact` only.
- The database enforces at most one active `customer_company`, no duplicate active party reference, unique active Contact slots, and at most one active primary Contact. The future Sales command, under the Deal lock, enforces at successful commit that a Company exists and that any non-empty Contact set has exactly one primary Contact.
- Company and Contact references use Workspace-qualified `record_type + record_id`, with no target foreign key and no copied label, email, phone, affiliation, or disclosure authority.
- A reference grants no visibility. Future reads resolve current state through typed Company/Contact participants and fail closed.
- Company/Contact archive never rewrites the Deal reference. Current target existence, activity, disclosure, affiliation, and atomic party-set replacement are future typed-participant/service invariants. Presentation later uses a generic unavailable label when disclosure is no longer authorized.
- A Deal stores one non-null responsible Membership identity. A responsible Team identity is optional. DB-08A proves only Workspace-qualified identity/existence through `NO ACTION` foreign keys; current active/authorized state is a future Platform-participant/service invariant.
- Visibility is `workspace | teams`. Team visibility uses `deal_visible_teams` and the existing Platform Team authority. Visible-Team rows use bounded slots 1 through 20, unique per Deal, so DB-08A can prove the static maximum and reject duplicate rows without claiming a complete authorized set.
- Future commands must prove the responsible Membership, optional responsible Team, and every visible Team are currently active and available; `workspace` visibility commits with no visible-Team rows; `teams` visibility commits with a non-empty bounded visible-Team set; and assignment/visibility replacement is atomic under the Deal lock and final Platform current-authority fence.
- Future conversion snapshots the Lead responsibility/Team/visibility facts into the new Deal, after current-authority validation; Sales owns them thereafter.

## 7. Money and probability

- Unknown Deal value is `NULL`; zero is a real value and must remain distinguishable.
- Value uses PostgreSQL `numeric(20,0)` integer minor units, never binary floating point or a JavaScript `number` assumption.
- `amount_minor` satisfies `0 <= amount_minor <= 99999999999999999999`.
- `currency_code` is an uppercase ISO-style three-letter code and `currency_exponent` is persisted with the value.
- DB-08A initially permits `USD` and `CAD`, both with exponent `2`. Adding another currency requires explicit reviewed registry/configuration authority; arbitrary three-letter strings are not accepted as supported currency.
- The tuple is exactly either all `NULL`, or `amount_minor` present with `(currency_code, currency_exponent)` equal to `('USD',2)` or `('CAD',2)`.
- No FX rate, reporting currency, normalized value, recognized revenue, or cross-currency total is stored.
- Operational totals must later group by currency or be omitted.
- Probability is stored in basis points from `0` through `10000`.
- Copying the selected stage default to a new Deal is a future service invariant. Manual probability override and forecast categorization are deferred; the schema may preserve source/provenance without authorizing a runtime override.
- DB-08A enforces probability as an integer from `0` through `10000`, `won = 10000`, and `lost = 0`. Open-stage probability matching the stage default is not a DB-08A claim.

## 8. Lead conversion boundary

Lead conversion execution is not part of DB-08A, but lineage persistence is authorized now because its ownership and cardinality are frozen.

- Leads owns the future `lead-convert-to-deal.v1` orchestration and remains the sole Lead writer.
- Eligibility requires Lead lifecycle `qualified`, no pending Identity Review, current actor/Workspace authority, current expected Lead/intake/review/party versions, and no prior effective conversion lineage.
- Legacy Lead status `open | won | lost` is not conversion authority and is never silently mapped. Runtime conversion remains blocked until Lead-vNext lifecycle/status and single-writer cutover are separately accepted.
- V1 permits at most one Deal created from one Lead and at most one originating Lead for a converted Deal. The Lead side is opaque `(workspace_id, record_type='crm.lead', record_id)` with no foreign key to Leads. The Deal side uses a Workspace-qualified `NO ACTION` foreign key because Deal and lineage share Sales ownership. Unique Lead-ref and Deal-ref keys enforce only at-most-one cardinality.
- Conversion initially requires an existing active Company reference. An existing Contact is optional; Sales does not create or silently upsert Company/Contact roots.
- Lineage is insert-only retained Sales evidence with operation identity, actor Membership, timestamps, result/source versions, and no copied Lead/customer data. DB-08A creates no lineage rows and does not claim conversion eligibility, atomic Lead mutation, Platform replay, or event completeness.
- One future atomic operation creates Deal/party/history/lineage effects, transitions Lead lifecycle to `converted` through the Leads participant, writes the governing Audit and complete event set, and records the Platform idempotency result.
- Failure leaves zero partial effects. Same-key replay returns the committed result; changed-hash reuse conflicts.
- Deal stage or outcome changes never write back to Lead.

## 9. Retention and deletion

- All permitted Workspace, Membership, Team, pipeline, stage, Deal, and same-owner Sales-child foreign keys use Workspace-qualified references and `NO ACTION`/`RESTRICT` behavior. Cross-owner RecordRefs, including the Lead side of conversion lineage and Company/Contact parties, deliberately have no target foreign key.
- No cascade or `SET NULL` is authorized.
- Pipelines and stages archive; Deals archive/restore; party references end; stage transitions and conversion lineage are immutable retained evidence.
- Target archive/deletion never cascades through Sales evidence.
- Workspace retirement remains a later checkpointed, resumable, owner-ordered fall-forward process.
- App rollback leaves dormant additive DB-08 schema installed. After any real DB-08 write, rollback requires restore or fall-forward; destructive schema rollback is not the operating plan.

## 10. Platform evidence and privacy

DB-08A creates no local Audit, event, or idempotency subsystem, foreign key, registration, or allowlist. Sales rows may retain an opaque governing-operation correlation. Future commands use Platform authority with stable operation identities:

- `sales-deal-create.v1`
- `sales-deal-update.v1`
- `sales-deal-stage-transition.v1`
- `sales-deal-reopen.v1`
- `sales-deal-archive.v1`
- `sales-deal-restore.v1`
- Lead-owned `lead-convert-to-deal.v1`

Future effective writes commit business state, immutable stage/lineage evidence, one governing Audit, the complete required `domain-event.v1` set, and the Platform receipt atomically. Event/Audit payloads omit names, Contact channels, descriptions, next steps, loss narrative, and Deal value unless a later classified consumer proves need.

## 11. Keysets and database evidence

DB-08A must support these deterministic access paths:

- Deal list: Workspace + lifecycle + `updated_at DESC, id DESC`;
- board stage: Workspace + pipeline + stage + lifecycle + `stage_entered_at ASC, id ASC`;
- responsible Membership and Team variants;
- overdue candidates: Workspace + open outcome + expected close + ID;
- party reverse lookup: Workspace + record type + record ID + lifecycle + Deal ID;
- stage history: Workspace + Deal + `occurred_at DESC, id DESC`; and
- active pipeline/stage ordering.

DB-07 remains deferred. DB-08 owner tables and typed synchronous participants are sufficient for the first Sales commands and reads. Shared delivery/projection DDL requires a named event-fed consumer with frozen latency, checkpoint, gap, poison, replay, rebuild, and retention contracts.

## 12. DB-08A implementation boundary

Exact base: `62b1ed09398b79d826cec8c612976f0e24ff4f49`.

Dev3 may change only:

- `src/server/db/schema.ts`;
- `src/server/db/migrations/0022_db_08_deals_pipeline_v1.sql`;
- `src/server/db/migrations/meta/0022_snapshot.json`;
- `src/server/db/migrations/meta/_journal.json`;
- `tests/db-08-deals-pipeline-schema.integration.test.ts`;
- `tests/db-08-deals-pipeline-migration.integration.test.ts`; and
- `docs/engineering/db-08-deals-pipeline-v1-handoff.md`.

DB-08A must return one clean immutable candidate SHA. It must prove fresh migration, forward migration from exact 0021 with prior data byte-stable, immediate no-op rerun, 23-row ledger/head/health, schema/SQL/snapshot fidelity, Workspace qualification, `NO ACTION`, deterministic 100-row-per-stream cursor boundaries, planner/catalog fit, and exact allowed-file/no-runtime-drift evidence.

DB-08A database acceptance is limited to:

- DDL-enforceable column tuples and ranges;
- Workspace-qualified permitted foreign keys and `NO ACTION` retention;
- partial uniqueness, bounded Contact slots, and duplicate-active-party rejection;
- selected-stage/outcome referential agreement;
- narrow immutability triggers for codes/outcome class and insert-only Sales transition/lineage evidence;
- competing inserts/updates against frozen database uniqueness and immutability constraints;
- migration-runner no-op rerun, not command/idempotency replay;
- failed database transaction/migration rollback with no partial DB-08 schema/data effects;
- catalog/data-minimization proof that party/lineage/evidence rows contain no copied names, labels, email, phone, affiliation, description, loss narrative, local authorization data, or local Audit/Outbox/idempotency payloads; and
- exact allowed-file diff with no runtime imports, registrations, allowlists, services, or routes.

The following are explicitly future service invariants and are not claimed or tested by DB-08A: required Company presence at successful command commit; conditional primary-Contact existence; current target activity/disclosure/affiliation; atomic party-set replacement; responsible Membership current active/authorized state; optional responsible Team and every visible Team current active/available state; `workspace` visibility with no visible-Team rows; `teams` visibility with a non-empty Product-approved visible-Team set; atomic assignment/visibility replacement under the Deal lock and Platform current-authority fence; stage availability/default copying; terminal transition/reopen authorization; one transition per effective command; expected-version behavior; and Platform Audit/Outbox/receipt concurrency, rollback, replay, or cardinality. DB-08A proof is limited to non-null responsible Membership identity, optional responsible Team identity, Workspace-qualified `NO ACTION` foreign keys, the visibility enum, unique visible-Team rows, and the frozen 20-slot static bound. Dormant database transactions may contain a Deal without its required complete party or visibility set until an authorized Sales command exists; no trigger-owned cross-module command semantics are introduced to disguise that boundary.

## 13. Explicit holds

- No backend commands, queries, services, participant extensions, authorization allowlists, or routes.
- No frontend, graphical asset, navigation, Board/List/detail, drag/drop, or conversion UI.
- No pipeline/stage seed, Workspace bootstrap, reconciliation, or backfill.
- No Lead lifecycle mutation, conversion execution, Company/Contact creation, or writer switch.
- No Deal metrics, weighted forecast, velocity, reporting, FX, Delivery Project, Activities, Notes, tags, custom fields, import, routing, AI, communications, or providers.
- No publication, deployment, UAT mutation, production/customer migration, credentials, secrets, or DNS.

## 14. Review and sequence

1. Architecture reviews this exact Product freeze for boundary consistency.
2. Dev2 reviews implementability and participant/runtime non-assumptions.
3. After both accept, Product delegates DB-08A to Dev3 from exact `62b1ed0`.
4. Dev2 and Architecture independently review the immutable Dev3 candidate.
5. Product fast-forwards only the accepted exact SHA into local `main`.
6. Backend and frontend remain held after DB-08A integration pending the combined foundation rehearsal and a separately frozen runtime wave.
