# P1A-01 presentation wire-contract addendum

Status: frozen additive authority for the manual-only P1A-01 backend presentation surface. The implementation gate remains separate. This addendum changes no schema and does not authorize deferred adapters.

## Stable identities and transport

| Surface | Identity | Transport |
| --- | --- | --- |
| Manual intake command | `lead-inquiry-intake.v1` | `POST /api/workspaces/:workspaceId/leads` |
| Manual intake result | `lead-inquiry-intake-result.v1` | private JSON |
| Review detail query/result | `lead-identity-review-detail.v1` | `GET /api/workspaces/:workspaceId/leads/:leadId/identity-review` |
| Review queue query/result | `lead-identity-review-queue.v1` | `GET /api/workspaces/:workspaceId/identity-reviews` |
| Hold/Resolve command | `lead-identity-review-decision.v1` | `POST /api/workspaces/:workspaceId/leads/:leadId/identity-review` |
| Hold/Resolve result | `lead-identity-review-decision-result.v1` | private JSON |

Both POST operations require a printable ASCII `Idempotency-Key` header of 16–128 characters. A body idempotency key is not authority. The canonical assignment names are `responsibleMembershipId` and `responsibleTeamId`; the older `membershipId` and `teamId` names are compatibility-input aliases only, may not conflict with canonical values, and are never emitted.

Every decision requires positive `expectedLeadVersion`, `expectedReviewVersion`, and `expectedIntakeVersion`. A link dimension requires all of `candidateId`, `targetId`, and `expectedTargetVersion`. Hold contains no identity dimensions. Resolve contains both Contact and Company dimensions, each `create | link | dismiss`.

Decision results always contain `contactId` and `companyId`, each nullable. Hold returns both as null and `nextView={kind:"identity_review_detail",leadId,reviewId}`. Resolve returns the committed IDs or null for dismissed dimensions and `nextView={kind:"identity_review_queue"}`. Intake results always contain nullable `contactId`, `companyId`, `reviewCaseId`, and `reviewVersion`; identity IDs are null because intake never creates or links identity records, while review fields are non-null only when held. Held intake returns identity-review detail as `nextView`; created intake returns Lead detail.

## Protected detail

The detail response contains `requestId`, safe Lead summary, immutable original attribution, operational assignment using the canonical responsibility names, Lead/review/intake versions, masked candidates, reconciliation, and server-produced capabilities. Candidate email is first-character-plus-domain masked; phone exposes at most the final four digits. Normalized keys and Company domains are never presented.

Capabilities are exactly `canCreateContact`, `canCreateCompany`, `canLinkContact`, `canLinkCompany`, `canDismiss`, `canHold`, and `canResolve`. They are recomputed from current server authority. Owner/Admin may create and link; an assigned-visible Member may create and dismiss but never link. Company creation additionally requires Company input on the Lead. Link capability additionally requires a current candidate of that dimension. Missing, archived, inaccessible, or version-stale candidate evidence produces no candidate detail, disables Resolve/Create/Link, preserves Hold, and returns `reconciliation={status:"stale",retryable:true,action:"refresh_identity_review"}`.

Every request revalidates active Workspace, session, user, Membership, Role, pending review, Lead assignment, and visibility. Unauthorized, cross-Workspace, assignment/visibility loss, suspended/removed actors, and resolved reviews return the same tenant-safe `resource_not_found` response. Such responses contain no candidate or target IDs, names, email, phone, Company/domain, match keys, evidence, counts, Lead/review identity, or `nextView`.

Disclosure has a bounded final authority boundary. Detail locks Lead/intake, review/head, Company targets, Contact targets, then assignment/visibility references; queue performs the same classes for one bounded page, globally sorting all page Memberships, Teams, Leads, visibility rows, and target UUIDs. Immediately before constructing the response, the server locks and revalidates the current Workspace, User, Session, Role, Membership, pending review, Lead/review/intake versions, assignment/visibility, and candidate target versions. Authority loss or concurrent resolution returns `resource_not_found`; candidate-only archive/version drift returns the approved stale envelope with no candidate detail. Locks remain transaction-scoped while the strict presentation model is produced.

## Authorized queue

The queue contains only currently authorized pending reviews. Owner/Admin can use `assignment=all|mine|unassigned`; Members are always server-restricted to assigned-visible Leads. Allowlisted query keys are `limit`, `cursor`, `assignment`, and `evidence`. `limit` defaults to 25 and is bounded to 1–50. Evidence is `any|email|phone|name_company`. Unknown keys, invalid values, malformed cursors, or a cursor bound to different filters return `validation_failed`.

Ordering is `review.updated_at DESC, review.id DESC`. The opaque cursor binds that boundary to canonical filters. Page queries use the Workspace/state/update/id review index, bounded owner-participant reads, current authorization checks, and no candidate identity fields. Rows contain safe Lead/attribution/assignment summaries, versions, bounded candidate counts, capabilities, and update time.

Detail, queue, row, capability, reconciliation, attribution, candidate, cursor, and navigation objects are strict runtime-validated allowlists. Unknown fields, invalid registries, unbounded values, navigation/enclosing-ID mismatch, candidate evidence/type contradictions, enabled stale actions, stale counts/details, and summary/detail count mismatch fail closed before protected serialization. Company candidates cannot carry masked person email or phone.

## Stable errors and reconciliation

Errors are `{error:{code,message,retryable,reconciliation:{required,action}},requestId}`. Messages are stable and non-sensitive. Reconciliation action is `none`, `refetch_identity_review`, or `retry_same_request`. A 409 may include a strictly validated identity-review `nextView` only when a typed server error/result was produced after current Lead disclosure authorization in that same operation; route/input IDs never create navigation. Authentication, cross-Workspace, inactive actor, inaccessible/reassigned/hidden Lead, and resolved-review paths all return identical `resource_not_found` with no identifiers or navigation. Validation details, when present, are limited to an allowlisted bounded field-path array. Responses use `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache`, and `Vary: cookie` for success, validation, authentication, tenant-safe denial, conflict, rate/availability, and unexpected failures.

Replay revalidates current authority before result disclosure, returns the original committed `requestId`, nullable IDs, and deterministic `nextView`, and creates no new effects. Stale decisions are non-retryable until authoritative refresh. Transient rate or availability failures are retryable with the same idempotency key.

## Deferred

CSV/XLSX, `web_form`, public/future APIs and integrations, automatic/fuzzy matching, merge, conversion, frontend implementation, and deployment remain outside this addendum.
