# P1A Lead intake and identity contract

> Retained original Product contract. Manual intake, identity review, and later conversion are now active in bounded forms; deferred import/provider scope remains held. Current status is in `docs/handover/PROJECT-STATUS.md`.

Date: 2026-08-24
Status: **reconciled Product planning authority; implementation HOLD**
Scope: canonical Lead inquiry intake, minimum Contact and Company identity, identity review, attribution, imports, concurrency, Audit, and domain-event boundaries

## 1. Decision and authorization boundary

P1A establishes one versioned, Workspace-scoped Lead inquiry intake contract used by manual entry, CSV, XLSX, and later approved adapters. Every accepted intake creates a Lead inquiry. Identity resolution is a separate decision and can create a Contact or Company, link an existing identity, or remain held for review. A held identity decision never discards the Lead.

This document authorizes implementation planning only. Implementation is on **HOLD** pending one immutable reconciled Product/DBA checkpoint and separate Product sequencing. It does not authorize code, schema, migration, configuration, fixtures, data, commit, merge, deployment, public API, provider, or production changes. Manual intake is the first implementation candidate. No confirmed existing public web-capture service was found; `web_form` remains a planned channel until Product identifies and approves its source/form authority.

## 2. Preserved platform boundaries

- Workspace permanently owns each Lead, Contact, Company, identity-review case, import job, lineage record, Audit, and domain event.
- A trusted Session and active Workspace Membership establish tenant authority. A payload Workspace identifier, source field, import cell, Contact link, Company link, operational assignment, or candidate match never grants tenant access.
- User and Team responsibility are nullable operational assignments only. They are not identity, ownership, tenant, or visibility authority.
- Existing RBAC, Lead visibility, Team membership, entitlement, CSRF/Origin, rate-limit, tenant-safe denial, transaction, and Audit boundaries remain authoritative.
- Source attribution describes where the inquiry originated. Intake channel describes how NexaFlow received it. They are independent.
- Original attribution and original phone input are immutable. Corrections append versioned, audited lineage rather than overwriting original evidence.
- Identity evidence is not identity proof. P1A performs no automatic Contact or Company merge.

## 3. Domain boundaries and cardinalities

### Lead inquiry

A Lead is the canonical Workspace-scoped inquiry and is created for every accepted intake.

- One Workspace owns zero or more Leads.
- One Lead belongs to exactly one Workspace.
- One Lead has exactly one lifecycle-definition identity. The definition ID and machine code are immutable; label, display order, colour, terminal metadata, and archive state are configurable presentation metadata.
- One Lead has exactly one original attribution snapshot and zero or more audited attribution corrections.
- One Lead has zero or one linked Contact.
- One Lead has zero or one linked Company.
- Contact and Company links are independent: either, both, or neither may exist.
- One Lead has zero or one active identity-review case. `pending` means the review is unresolved; `hold` is a decision/disposition and is never a stored unresolved-state synonym.
- One Lead may have zero or one responsible active user and zero or one responsible active Team under the separate responsibility contract.
- One Lead has one positive aggregate version. Identity-review and attribution records carry their own positive versions.

### Contact

A Contact is a minimum Workspace-owned person identity, not a global User and not authentication authority.

- One Workspace owns zero or more Contacts.
- One Contact belongs to exactly one Workspace.
- One Contact may be linked from zero or more Leads in the same Workspace.
- P1A stores one primary email and one primary phone at most. Multiple identity points are deferred.
- Contact lifecycle is `active | archived`.

### Company

A Company is a minimum Workspace-owned organization identity.

- One Workspace owns zero or more Companies.
- One Company belongs to exactly one Workspace.
- One Company may be linked from zero or more Leads and Contacts in the same Workspace.
- Company lifecycle is `active | archived`.

### Identity-review case

- One review case belongs to one Lead and one Workspace.
- A review records a versioned candidate snapshot and evidence classes.
- A review command has governing outcome `hold | resolve`.
- Resolving a review never deletes, moves, or silently merges the Lead.
- Candidate IDs and versions are revalidated inside the decision transaction.
- A `hold` command preserves the Lead and `pending` review but creates no Contact or Company and changes no identity link.
- A `resolve` command supplies one action for each dimension: `contactAction: create | link | dismiss` and `companyAction: create | link | dismiss`. It closes the entire pending review atomically. It cannot resolve one identity dimension while leaving the other held or pending.

### Import job and row

- One import job belongs to one Workspace and one initiating active Membership.
- One job contains 1–1,000 durable row records.
- One row produces at most one canonical intake result.
- Job and row state are orchestration evidence, not CRM authority.
- CSV and XLSX are the only approved P1A file types.

## 4. Lifecycle identities and transitions

### Lead lifecycle

Each lifecycle definition has an immutable ID and immutable machine code. Label, display order, colour, terminal metadata, and archive state are configurable presentation metadata. Archiving prevents new selection but does not rewrite historical Leads. Pipeline stage and identity review remain independent dimensions.

| From | To | Meaning | Authority |
| --- | --- | --- | --- |
| — | `new` | Accepted intake created the Lead | Canonical intake service |
| `new` | `working` | Active qualification work began | Authorized Lead mutation |
| `working` | `qualified` | Inquiry met the approved qualification threshold | Authorized Lead mutation |
| `new`, `working`, `qualified` | `disqualified` | Inquiry was explicitly closed as not proceeding | Authorized Lead mutation with reason |
| `qualified` | `converted` | A separately authorized conversion workflow completed | Future bounded conversion service |
| `disqualified` | `working` | Authorized reopening | Authorized Lead mutation with Audit |

P1A intake creates `new`; identity review, including a `hold` decision and unresolved `pending` review, never changes Lead lifecycle automatically. `converted` is reserved but P1A does not implement broad conversion, Deals, or expanded Contact/Company workflows. Legacy `won` must never be automatically mapped to `converted`. Any legacy `open | won | lost` migration requires a separately reviewed mapping and explicit evidence; ambiguous `won` rows must be preserved for manual or Product-approved classification.

### Identity-review lifecycle

| From | To | Meaning |
| --- | --- | --- |
| — | `pending` | Candidate evidence requires or permits an explicit decision |
| `pending` | `resolved` | One atomic `resolve` outcome committed explicit Contact and Company actions, each `create | link | dismiss` |

`hold | resolve` is the governing decision-outcome registry. `hold` leaves or creates a `pending` unresolved review and carries no per-dimension identity mutation. `resolve` closes it as `resolved` and carries explicit Contact and Company actions. `pending | resolved` is the review-state registry. A stale decision does not transition the review, and a held review retains its Lead without changing Lead lifecycle.

## 5. Minimum canonical fields

### Lead inquiry

Required:

- Workspace ID from trusted context
- person/display name, trimmed and bounded
- at least one of email or phone
- lifecycle status
- original source attribution
- intake channel
- received timestamp
- aggregate version
- created and updated timestamps

Optional and bounded:

- preserved display email plus normalized email
- preserved original phone plus normalized phone, default-country code, explicit country override, and normalization-version identity
- Company name supplied by the inquiry
- inquiry subject and message
- responsible Membership and Team under the separate responsibility contract
- linked Contact and Company IDs

### Contact

- Workspace ID
- display name; optional structured first and last names
- optional preserved-display and normalized primary email
- optional preserved-display and normalized primary phone
- phone default/override country and normalization version when a phone exists
- lifecycle status and positive version
- created and updated timestamps

At least one meaningful person identity value is required. P1A does not assert uniqueness of email or phone because duplicates become review evidence, not silent merge authority.

### Company

- Workspace ID
- required display name and normalized name
- optional normalized domain
- lifecycle status and positive version
- created and updated timestamps

Company is optional on Lead intake. Name alone may form a probable candidate but cannot silently link or merge a Company.

## 6. LeadInquiryIntakeCommandV1

The canonical service accepts this single semantic command for manual, CSV, and XLSX rows. Transport representations may differ only where separately approved; no entry path may define a second mutation contract. `web_form`, `future_api`, and `future_integration` remain disabled until Product authorizes a named adapter and its trusted Workspace/source authority.

| Field | Requirement | Contract |
| --- | --- | --- |
| `contractVersion` | Required | Exact `lead-inquiry-intake.v1` |
| `workspaceId` | Required, trusted | Server Session or approved adapter configuration; never caller authority |
| `idempotencyKey` | Required | 16–128 bounded printable characters or approved UUID profile |
| `intakeChannel` | Required | Registry in section 8 |
| `person.displayName` | Required | Trimmed, bounded, non-empty |
| `person.email` | Conditional | Required when phone absent; original and normalized forms preserved |
| `person.phone` | Conditional | Required when email absent; original, normalized, country decision, and normalization version preserved |
| `person.phoneCountryOverride` | Optional | Explicit supported country identity; otherwise Workspace default applies |
| `organization.name` | Optional | Bounded; never creates or links identity implicitly |
| `organization.domain` | Optional | Normalized candidate evidence only |
| `inquiry.subject` | Optional | Bounded plain text |
| `inquiry.message` | Optional | Bounded plain text; excluded from Audit, metrics, and general event payloads |
| `inquiry.receivedAt` | Required | Trusted adapter time or bounded caller value under adapter policy |
| `source` | Required | Original attribution object in section 7 |
| `sourceOverride` | Import row only | Optional complete valid override of batch category, platform, medium, detail, and campaign defaults; validated as one effective attribution object |
| `requestedAssignment` | Optional | Membership and Team IDs; validated in Workspace; never authority |
| `adapterContext.externalSubmissionId` | Adapter-specific | Stable web/integration replay identity |
| `adapterContext.importJobId` | Import only | Same-Workspace durable job ID |
| `adapterContext.sourceRowId` | Import only | Stable row identity inside the immutable upload/mapping version |

Normalization must not destroy original display values. For an import row, effective attribution is produced by overlaying its valid category, platform, medium, detail, and campaign overrides on batch defaults, then validating the complete object as one unit. `social_media` requires one controlled platform; non-social categories require platform absent; medium is `organic | paid | unknown`; an unknown platform uses `other_social` plus bounded detail.

Canonical hashing excludes transport-only values and uses normalized, ordered fields. The row request hash includes the fully effective attribution object and attribution-contract version. The exact hashed effective attribution is copied to the Lead's immutable original-attribution snapshot, while intake channel is copied separately. Reusing the same batch/row/idempotency authority with changed effective attribution returns `idempotency_conflict`; it cannot replay the earlier semantic input.

## 7. Original source attribution

The immutable original source object contains:

- `sourceCategory`
- optional `sourcePlatform`
- `sourceMedium`
- optional bounded `sourceDetail`
- optional bounded campaign context
- attribution version
- capture time

### Source-category registry

`website | referral | outbound | event | partner | social_media | import | manual | other`

### Social-platform registry

When `sourceCategory = social_media`, `sourcePlatform` is required and must be:

`tiktok | instagram | facebook | linkedin | x | youtube | other_social`

Non-social categories must not store a social platform. Unknown/new platforms use `other_social` plus bounded `sourceDetail`; they do not require a code release.

### Source-medium registry

`organic | paid | unknown`

The server must not infer organic or paid without trusted evidence. Default is `unknown`.

### Detail and campaign allowlist

The bounded planning allowlist is:

- `page`
- `account`
- `campaign`
- `ad`
- `form`
- `post`
- `operator_context`

Values are sanitized bounded strings, not arbitrary nested objects. They are excluded from ordinary logs and metrics. Original attribution cannot be changed through ordinary Lead edits. Corrections create a new attribution version with before/after allowlisted values, actor, time, source, reason, request ID, and correlation ID while preserving the original snapshot.

## 8. Intake-channel registry

`web_form | manual | csv | spreadsheet | future_api | future_integration`

- `manual` is the first implementation candidate.
- `csv` means an approved CSV import.
- `spreadsheet` means an approved XLSX import.
- `web_form` is a planned registry identity but disabled pending Product identification and authorization of the exact form/source authority.
- `future_api` and `future_integration` are reserved registry identities and disabled pending separate Product authorization.
- Enabled P1A command paths are `manual`, `csv`, and `spreadsheet` only, and all invoke `LeadInquiryIntakeCommandV1`.

Source and channel remain independent. Examples:

| Scenario | Source | Platform | Medium | Channel |
| --- | --- | --- | --- | --- |
| Instagram DM entered by a representative | `social_media` | `instagram` | `unknown` unless known | `manual` |
| Facebook lead form through an approved adapter | `social_media` | `facebook` | As evidenced | `web_form` or `future_integration` according to adapter authority |
| TikTok campaign uploaded as CSV | `social_media` | `tiktok` | `paid` when evidenced | `csv` |
| Referral entered manually | `referral` | — | `unknown` | `manual` |

## 9. LeadInquiryIntakeResultV1

| Field | Contract |
| --- | --- |
| `contractVersion` | Exact `lead-inquiry-intake-result.v1` |
| `intakeId` | Durable intake receipt ID |
| `leadId` | Always present for an accepted intake |
| `disposition` | `created | linked | held_for_review | replayed | rejected` |
| `contactId` | Optional; same Workspace only |
| `companyId` | Optional; same Workspace only |
| `reviewCaseId` | Present when a pending review exists |
| `candidateSummary` | Counts only: strong, supplementary, probable |
| `leadVersion` | Current Lead aggregate version |
| `reviewVersion` | Present when review exists |
| `replayed` | Boolean |
| `requestId` | Safe support correlation |

Public adapters must return an enumeration-safe accepted envelope and never expose candidate identities or matching detail.

## 10. Candidate evidence and hold/resolve matrix

Evidence classes:

- Strong: exact normalized email inside the Workspace.
- Supplementary: exact normalized phone under the recorded normalization version/country decision.
- Probable: normalized person name plus Company name/domain evidence.
- Unsupported: fuzzy name, spelling similarity, unbounded text similarity, or cross-Workspace evidence.

Phone is supplementary even when exact. Name plus Company is manual-review evidence only. No evidence class authorizes automatic merge. Candidates are deterministically ordered by evidence priority and stable candidate UUID, deduplicated by candidate type/UUID/evidence kind/normalization version, and capped at ten per evidence class. A cap never upgrades evidence or silently chooses a match.

| Candidate outcome | Intake result | Permitted identity action |
| --- | --- | --- |
| No candidates | Lead created; identity may remain absent or explicit create selected | Create new Contact/Company independently when authorized |
| One strong email candidate | Lead always created; hold unless authorized initial link decision is included | Owner/Admin may explicitly link; Member may not initially link existing identity |
| Multiple strong email candidates | Lead created and held | Explicit review only |
| Phone-only candidate | Lead created and held when linking is desired | Explicit review; never automatic link |
| Name plus Company candidate | Lead created and held when linking is desired | Explicit review; never automatic link |
| Conflicting Contact and Company evidence | Lead created and held | One later atomic resolution decides Contact and Company independently and closes the review |
| Invalid identity fields but valid Lead minimum not met | Rejected | No Lead or identity mutation |

The governing decision outcome is exactly `hold | resolve`. A `hold` command is non-mutating for Contact/Company creation and Lead identity links: it preserves the Lead, candidate snapshot, and `pending` review only. A `resolve` command is atomic across both identity dimensions and closes the pending review. Contact and Company actions are each exactly `create | link | dismiss`, including dismissing both. No command may partially resolve Contact or Company while leaving the remainder held or pending.

## 11. Permissions

- Owner/Admin may create manual Leads, import CSV/XLSX jobs, view and resolve all Workspace identity reviews, and explicitly create or initially link Contact/Company identities.
- Members may create Leads through approved manual intake.
- Members may view and resolve only review cases for Leads both visible and assigned to them under persisted server authority.
- In the first implementation slice, Members may create a new Contact and/or Company only while atomically resolving a pending review for a Lead that is both assigned to them and visible to them at decision time.
- Members may never link an existing Contact or Company.
- Only Owner/Admin may initially link existing Contact/Company identities.
- No role may link cross-Workspace candidates.
- Import initiation and job administration are Owner/Admin-only in P1A.
- Source, channel, Contact, Company, responsibility, import, or candidate state never replaces the Workspace authorization chain.

### Candidate-detail read authorization

- Every candidate-summary or candidate-detail request re-resolves the trusted active Workspace, active actor Membership, Role permission, review state, current Lead visibility, and current assignment. Cached UI state is never authority.
- Owner/Admin may read candidate details for a `pending` review in their authorized Workspace.
- A Member may read candidate details only while the review remains `pending` and the Lead remains both assigned and visible to that Member.
- Assignment or visibility loss, Membership suspension/removal, review resolution, and Workspace switch take effect on the next request and fail tenant-safely.
- Public callers and disabled `web_form`, `future_api`, or `future_integration` adapters receive no candidate identity or candidate-existence detail beyond the approved generic response or count-only envelope.
- Unauthorized responses must not reveal candidate IDs, Contact/Company IDs, names, emails, phones, Company names/domains, normalized match keys, evidence values, candidate counts beyond the approved envelope, or whether a same-value identity exists in any Workspace.
- Candidate list pagination, deterministic ordering, and ten-per-evidence-class caps do not weaken this authorization boundary.

## 12. Idempotency and replay

Intake receipt uniqueness is scoped by Workspace, operation, channel, and idempotency key.

- Same key plus same canonical request hash returns the committed result with `replayed = true`.
- Replay creates no duplicate Lead, review, Contact, Company, lineage, activity, Audit, or Outbox event.
- Same key plus a different canonical hash returns `idempotency_conflict`.
- Concurrent identical requests produce one committed result; contenders replay it.
- A validation failure before receipt commitment may retry after correction.
- Once a business result commits, the receipt is retained according to canonical Lead/lineage policy rather than a short HTTP cache expiry.
- Intake, review decision, attribution correction, import job, and import row use separate operation identities and keys.
- Import restart reuses the same job/row identities and does not duplicate completed rows.

## 13. Expected-version concurrency

- Lead, Contact, Company, review, attribution, import job, and import row carry positive versions where mutable.
- Review decisions require `expectedReviewVersion` and the candidate versions captured for each selected Contact/Company.
- Attribution correction requires `expectedAttributionVersion`.
- Lead lifecycle or content changes require `expectedLeadVersion`.
- Stale candidate or review state returns `stale_version`; the server returns or makes available a fresh authoritative review model without applying the stale decision.
- Same-email concurrent creates serialize and re-run candidate detection. They do not silently merge.
- Canonical lock order: idempotency authority; intake batch and then intake row; Lead and review; selected Companies sorted by UUID; selected Contacts sorted by UUID; operational assignment references.
- Import leasing is two-phase and fenced. A short orchestration transaction claims an eligible row, records lease owner/expiry, and increments its fencing generation without locking Lead, review, identity, assignment, Audit, or Outbox business aggregates.
- The separate row business transaction then locks idempotency authority, batch/row, Lead/review, sorted Companies, sorted Contacts, and assignment references in canonical order. It revalidates row state, lease owner, fencing generation, and unexpired lease after acquiring batch/row locks and again before commit.
- A stale, expired, superseded, or lease-losing worker cannot commit a Lead, review, decision, identity, link, job counter, governing Audit, idempotency outcome, or Outbox event. Its work rolls back and the row remains safely resumable by the current lease generation.
- A hold transaction revalidates expected Lead/review/row versions, actor permission, current Lead visibility, and current assignment, then retains `pending` without creating/linking identities or altering identity links.
- A resolving transaction revalidates expected Lead/review/row and candidate versions, current actor permission, current Lead visibility, and current assignment before atomically applying the complete `resolve` outcome with Contact and Company `create | link | dismiss` actions and closing the review.
- Cross-Workspace, archived, deleted, or newly inaccessible candidates fail tenant-safely with zero mutation.
- Audit, lineage, Outbox events, review transition, and identity links commit in the same transaction as the business decision.

## 14. Error taxonomy

| Code | HTTP/result | Meaning |
| --- | --- | --- |
| `authentication_required` | 401 | No trusted active identity |
| `permission_required` | 403 | Actor lacks the allowed action |
| `resource_not_found` | 404 | Tenant-safe missing or inaccessible resource |
| `validation_failed` | 400 | Command or row violates the V1 contract |
| `unsupported_contract_version` | 400 | Unknown command version |
| `invalid_source_category` | 400 | Source category outside registry |
| `source_platform_required` | 400 | Social source lacks platform |
| `source_platform_not_allowed` | 400 | Non-social source carries platform |
| `invalid_source_platform` | 400 | Platform outside registry |
| `invalid_source_medium` | 400 | Medium outside registry |
| `source_detail_too_large` | 400 | Detail/campaign context exceeds bounds |
| `idempotency_conflict` | 409 | Committed key reused with different command hash |
| `stale_version` | 409 | Expected mutable version no longer current |
| `invalid_match_decision` | 409 | Decision does not match current candidate state or permissions |
| `assignment_unavailable` | 409 | Requested operational assignment is inactive or invalid |
| `rate_limited` | 429 | Actor/Workspace/network/form/job limit exceeded |
| `batch_too_large` | 413/422 | Import exceeds 1,000 rows or approved file bound |
| `import_mapping_invalid` | Row/job result | File or row cannot map to V1 |
| `intake_unavailable` | 503 | Retryable service dependency failure |
| `unexpected_error` | 500 | Generic non-disclosing failure |

`review_required` is a successful held disposition, not a transport error. All denials and failures create zero partial business mutation.

## 15. Audit, lineage, and Outbox contracts

### Canonical Audit actions

- `crm.inquiry_intake_received`
- `crm.inquiry_created`
- `crm.inquiry_held_for_review`
- `crm.inquiry_linked`
- `crm.inquiry_review_resolved`
- `crm.inquiry_resolution_denied`
- `crm.contact_created`
- `crm.company_created`
- `crm.source_attribution_corrected`
- `crm.import_job_created`
- `crm.import_job_completed`
- `crm.import_row_rejected`

One committed command produces exactly one governing success Audit for the operation. Governing Audit is separate from versioned Outbox domain events: an operation may emit its required aggregate events without creating additional governing success Audits. Replays produce neither another governing Audit nor duplicate Outbox events.

### Operation-level Audit cardinality

| Committed command | Governing success Audit | Required Outbox events | Replay behavior |
| --- | --- | --- | --- |
| Manual/row intake with created Lead and no pending review | Exactly one `crm.inquiry_created` | One `crm.inquiry.created.v1`; identity-created events only for identities created in the same authorized command | Return prior result; no new Audit/event |
| Intake resulting in pending review through `hold` | Exactly one `crm.inquiry_held_for_review` | One `crm.inquiry.created.v1` and one `crm.inquiry.review_required.v1` | Return prior result; no new Audit/event |
| Intake with authorized initial link | Exactly one `crm.inquiry_linked` | One `crm.inquiry.created.v1` and one `crm.inquiry.linked.v1` | Return prior result; no new Audit/event |
| Review `hold` command | Exactly one `crm.inquiry_held_for_review` | One versioned `crm.inquiry.review_required.v1` only when the effective pending-review version changes | Return prior result; no new Audit/event |
| Atomic review resolution by complete Contact/Company create/link/dismiss decision | Exactly one `crm.inquiry_review_resolved` | One versioned `crm.inquiry.review_resolved.v1` plus identity-created events for newly created aggregates and a link event when links change | Return prior result; no new Audit/event |
| Attribution correction | Exactly one `crm.source_attribution_corrected` | One `crm.source_attribution.corrected.v1` | Return prior result; no new Audit/event |
| Import job creation or completion | Exactly one governing job Audit for each committed job command | One matching versioned job event where defined | Return prior result; no new Audit/event |

Validation rejection before a command transaction commits produces no success Audit or domain event. Authorization denial may produce one bounded denial Audit under the shared denial policy and creates no business mutation or Outbox event. An injected transactional failure commits no governing Audit, domain event, Lead, identity, decision, lineage, or row outcome.

Outbox cardinality means exactly one copy of every event required by the matrix, not one total event per command. Each event has a durable uniqueness identity over event type, Workspace, aggregate type/ID, governing operation or command receipt, and aggregate/result version. The governing Audit, idempotency outcome, complete required event set, and business mutation commit in one transaction. Same-key replay, lost response, worker retry, lease recovery, and concurrent decision must return/reconcile the committed event set without inserting another event with the same uniqueness identity.

### Audit metadata allowlist

Allowed bounded metadata keys for this scope:

- `operation`
- `contract_version`
- `intake_channel`
- `source_category`
- `source_platform`
- `source_medium`
- `disposition`
- `candidate_strong_count`
- `candidate_supplementary_count`
- `candidate_probable_count`
- `expected_version`
- `result_version`
- `import_job_id`
- `source_row_id`
- `normalization_version`

Audit before/after state may contain lifecycle, version, link-present booleans, and canonical registry values. It must not contain names, emails, phones, inquiry content, raw file rows, source-detail values, campaign values, filenames, external tokens, or spreadsheet cell content.

### Outbox events

- `crm.inquiry.received.v1`
- `crm.inquiry.created.v1`
- `crm.inquiry.review_required.v1`
- `crm.inquiry.linked.v1`
- `crm.inquiry.review_resolved.v1`
- `crm.contact.created.v1`
- `crm.company.created.v1`
- `crm.source_attribution.corrected.v1`
- `crm.import.job_completed.v1`

Event allowlist:

- event and schema version
- Workspace and aggregate IDs
- aggregate/result versions
- lifecycle/disposition identities
- intake channel
- source category/platform/medium
- candidate-count summary
- link-present state or linked aggregate IDs where the consumer is authorized
- request/correlation and import job/row IDs
- occurred time

Events exclude raw personal identity values, inquiry messages, source detail/campaign strings, upload contents, filenames, and candidate display data. Future routing may consume canonical events but cannot bypass the command, authorization, matching, or expected-version services.

## 16. CSV/XLSX import semantics

- Only CSV and XLSX are accepted.
- Maximum 1,000 data rows per job.
- Owner/Admin creates the job and chooses an explicit mapping version.
- The raw upload is encrypted at rest and associated with a content fingerprint; protected values never enter logs or Audit.
- Parsing and mapping occur outside Lead mutation transactions.
- Rows run asynchronously in bounded concurrency with one short transaction per row.
- Valid rows create Leads through `LeadInquiryIntakeCommandV1`.
- Invalid rows remain rejected with bounded validation evidence.
- Candidate/review rows create their Leads and remain held; they are not treated as failed imports.
- Each row begins with batch source defaults and may override category, platform, medium, detail, and campaign context. The complete effective row attribution independently satisfies the taxonomy rules; a partial social override cannot produce a missing or prohibited platform.
- A job may complete with mixed created, linked, held, invalid, and retryable counts. `held` is a row disposition; its unresolved review state is `pending`.
- Job restart is resumable and idempotent. Completed rows replay; retryable rows resume; changed file or mapping content requires a new job identity.
- Row identity is stable within the immutable upload fingerprint and mapping version. Row position alone is not sufficient across changed/reordered files.
- Job completion does not imply every identity review was resolved.
- No row may choose or override Workspace authority.

## 17. Retention and deletion

- Raw encrypted CSV/XLSX upload: seven days from job creation, then securely deleted.
- Invalid-row validation and mapping evidence: 30 days from the row's terminal validation timestamp.
- Resolved-review candidate and row evidence: 30 days from `resolvedAt`, after which it may be reduced only to the minimized durable evidence below.
- A `pending` unresolved review survives raw-upload deletion and retains the bounded candidate/normalization evidence needed for a later decision regardless of upload age. Review operation must never depend on reopening the expired raw file.
- Canonical Lead, Contact/Company links, identity decisions, original/corrected attribution lineage, Audit, and domain-event retention follow the Workspace policy.
- Expiry of upload or row evidence never deletes the canonical Lead.
- After cleanup, the minimized durable set is: review/decision IDs and versions; Lead and selected candidate target IDs; evidence kind/strength; normalization version; effective attribution and attribution-contract lineage; minimized request hash and idempotency outcome; governing Audit request/correlation identity; required Outbox event identities; terminal validation/decision codes and timestamps. It excludes raw upload/cells, filenames, inquiry message, source-detail/campaign strings, and non-canonical duplicate personal payloads.
- Audit/event records retain only allowlisted identifiers and state, not raw upload or personal content.
- Operational deletion must be retryable, bounded to the exact Workspace/job object, and observable without exposing file contents.
- Cleanup must never delete a Lead, pending review, canonical Contact/Company, idempotency authority required for replay, effective decision, required attribution lineage, governing Audit, or required Outbox identity.
- Production retention, legal hold, export, and generalized data-subject workflows remain separately authorized.

## 18. Performance and rate acceptance

Planning targets are measured at representative supported database size with tenant indexes and warm application dependencies:

- Manual intake end-to-end p95 below 500 ms, excluding external providers.
- Email/phone candidate lookup p95 below 100 ms.
- Name-plus-Company candidate lookup p95 below 200 ms.
- Review-queue read p95 below 200 ms for a bounded page.
- Import maximum 1,000 rows, processed asynchronously in bounded row transactions and concurrency.
- Candidate results are deterministically ordered and capped at ten per evidence class.
- No unbounded fuzzy scan, cross-Workspace scan, full-table similarity pass, or arbitrary spreadsheet query is permitted.
- Rate dimensions include actor, Workspace, network, approved form/adapter, import job, and destination identity where safe.
- Measure validation, normalization, candidate lookup, transaction, replay, held-review, row-throughput, and retry rates without recording personal values.
- Query-plan acceptance must prove Workspace-leading indexes for normalized email, normalized phone, Company normalized name/domain, Lead lifecycle, review state, import job/row state, and deterministic pagination.

## 19. Acceptance criteria

1. Every accepted channel command creates exactly one Workspace-scoped Lead or replays its prior result.
2. Manual, CSV, and XLSX paths execute the same V1 service; later adapters cannot bypass it.
3. Lead requires a display name and at least one of email or phone; Company remains optional.
4. Phone preserves original value, default/override country decision, normalized value, and normalization version.
5. Source and channel remain independent; original attribution is immutable and corrections are versioned and audited.
6. Social source requires a controlled platform; unknown platforms use `other_social` plus bounded detail.
7. Email is strong evidence only, phone supplementary, and name plus Company probable/manual-review only.
8. No fuzzy or automatic Contact/Company merge exists.
9. Contact and Company create/link/dismiss actions are independently selected but commit as one complete atomic review resolution; no partially resolved identity plus held remainder exists.
10. A hold command never creates a Contact/Company or changes identity links; it retains the Lead, unchanged lifecycle, and pending review.
11. Owner/Admin may create or link. A Member may create new Contact/Company records only while resolving a Lead both assigned and visible to them, and may never link an existing identity.
12. Same-key replay produces no duplicate Lead, identity, review, lineage, Audit, or event; changed-key content conflicts deterministically.
13. Stale candidates and concurrent decisions fail with zero partial mutation and authoritative reconciliation.
14. Imports accept only CSV/XLSX, enforce 1,000 rows, process asynchronously per row, retain valid/held Leads, and resume without duplication.
15. Seven-day raw-upload retention, 30 days from terminal validation for invalid-row evidence, and 30 days from resolution for resolved-review evidence are enforced; pending reviews retain bounded decision evidence after upload deletion without deleting canonical Leads or authority records.
16. Audit and Outbox payloads satisfy the privacy allowlists and contain no raw personal or upload content.
17. Tenant isolation, rollback, concurrency, idempotency, migration/backfill, rate, query-plan, and performance targets pass with measurable evidence.

### Mandatory failure and replay verification

| Case | Required result |
| --- | --- |
| Same-key/same-hash replay after success or lost response | Original result returned; exactly one Lead/effective decision/governing Audit/event set |
| Same-key/different-hash replay | `idempotency_conflict`; zero additional mutation |
| Stale Lead, row, review, Contact, or Company version | `stale_version`; zero partial mutation and refreshed authoritative state available |
| Batch or row validation rejection | Stable bounded code; invalid rows create no Lead, success Audit, or Outbox event |
| Authentication, permission, visibility, assignment, or cross-tenant denial | Tenant-safe response; at most one bounded denial Audit; zero business mutation/event |
| Worker lease loss or fencing-generation mismatch before commit | Stale worker cannot commit; row remains resumable; no duplicate Lead/decision/Audit/event |
| Injected failure after Lead, candidate, Contact, Company, decision, Audit, or Outbox step | Whole row/command transaction rolls back; zero partial records or counter drift |
| Competing `hold | resolve` commands | Exactly one effective decision; losers receive replay or stale conflict with zero duplicates |
| Member resolves assigned-visible hold by creating Contact only, Company only, both, or dismissing either/both | Complete atomic resolution closes review; expected new identities/links only; one governing Audit |
| Member attempts existing Contact/Company link, or loses assignment/visibility before commit | Permission/tenant-safe denial; review stays pending; zero identity/link/Lead-lifecycle mutation |
| Owner/Admin resolves with independent Contact and Company create/link/dismiss choices | Both dimensions commit together and review closes; injected failure in either dimension rolls back all |
| Hold command with requested Contact/Company creation or link | `invalid_match_decision`; Lead and review remain pending; zero identity/link mutation |

### Final Backend/Security closure evidence

The immutable implementation candidate must provide all of the following before any implementation gate can proceed:

1. Cross-Workspace composite-FK and route/service denial coverage for every Lead, Contact, Company, batch, row, review, candidate, decision, assignment, actor, Audit, and Outbox relationship.
2. Candidate-disclosure coverage for Owner, Admin, assigned-visible Member, unassigned Member, hidden Lead, stale/lost assignment, suspended/removed Membership, resolved review, Workspace switch, public caller, and disabled adapter. Unauthorized responses must exclude every no-leak field listed in section 11.
3. Same-key/same-hash replay, same-key/changed-hash conflict, changed effective-row-attribution conflict, lost-response replay, stale aggregate/candidate versions, concurrent hold/resolve, worker crash, lease expiry/loss, fencing race, and safe retry evidence.
4. Failure injection after Lead, candidate, Contact, Company, link update, decision, governing Audit, idempotency outcome, and each required Outbox-event insertion, proving whole-transaction rollback and exact Audit/event-set cardinality.
5. Mixed CSV/XLSX jobs, every valid row-attribution override, complete-unit taxonomy validation, all social platform/medium cases, invalid mapping, 1,000-row cap, bounded concurrency, resume, counter correctness, seven-day raw cleanup, and 30-day evidence cleanup.
6. Cleanup/retry proof that pending reviews survive raw-upload deletion and no Lead, canonical identity, idempotency authority, effective decision, required attribution lineage, governing Audit, or required Outbox identity is removed.
7. Candidate and review-queue query plans and latency at representative scale, demonstrating Workspace-leading indexed scans, deterministic ten-result caps, bounded pagination/memory, and no cross-tenant or fuzzy/unbounded scan.
8. Privacy evidence that raw uploads/cells, inquiry content, source detail/campaign values, full identity payloads, secrets, tokens, filenames, normalized match keys, and cross-tenant identifiers do not enter logs, errors, Audit, Outbox, metrics, or unauthorized responses.

## 20. Deferred scope

- Public APIs and enabling `future_api`
- Unidentified public web-capture implementation and enabling its adapter
- Generic third-party integrations and enabling `future_integration`
- Automatic identity linking or merging
- Fuzzy, probabilistic, AI, enrichment, or cross-Workspace matching
- Broad source, mapping, routing, or identity admin designers
- Multiple Contact emails/phones and expanded Contact/Company workspaces
- Deal creation, Lead-to-Deal conversion, and expanded Activities/Tasks
- Round-robin, territories, capacity routing, notifications, and automation
- CRM email, shared inbox, communications, campaign delivery, and generalized analytics
- Billing, production retention/governance, and production deployment

## 21. Recommended implementation sequence after authorization

1. Dev2 and Dev3 produce a schema/migration/backfill checkpoint, preserving existing Lead IDs, tenant ownership, activities, visibility, attribution, and ambiguous lifecycle state.
2. Implement the canonical manual V1 command/result, durable receipt, minimum Lead fields, candidate lookup, review, Audit, and Outbox boundary.
3. Add explicit Owner/Admin and assigned-visible Member review decisions.
4. Add CSV/XLSX job orchestration and retention lifecycle.
5. Run fresh migration and no-op rerun, forward rehearsal, injected rollback, serialized PostgreSQL, concurrency, privacy, rate, query-plan, and performance gates.
6. Integrate and refresh disposable UAT only under separate Product authority.
7. Identify and contract the actual web-form authority before implementing `web_form`.

Implementation remains on **HOLD**. No implementation step begins solely because this planning contract exists; Product must separately authorize work from one immutable reconciled Product/DBA package.
