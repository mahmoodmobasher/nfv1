# P1A frontend typed-contract and fixture plan

Date: 2026-08-24  
Owner: Dev1 frontend planning  
Status: **PLANNING ONLY — IMPLEMENTATION HOLD**

## 1. Boundary and feasibility

This plan translates the accepted-with-conditions P1A Product and Architecture package into frontend transport/view types and deterministic UI fixtures. It does not authorize application code, tests, schema, migrations, configuration, integration, data mutation, deployment, or adapter enablement.

The existing CRM `ProductShell`, Lead list/detail layout, form error summary, stale-version recovery, activity presentation, responsive behavior and design tokens are feasible reuse points. The present Lead editor is not a contract authority and must not be extended by copying its current assumptions: required owner, embedded person/Company identity, mutable source, legacy `open | won | lost`, and client-selected Workspace values are not the P1A model.

### Server authority rule

The browser may collect input, render server-returned capabilities and submit explicit decisions. It has no authority to:

- establish or change Workspace/tenant context;
- match, rank, deduplicate, link or merge identity;
- infer Contact or Company IDs from display fields;
- grant visibility through assignment, source, channel or candidate state;
- determine eligible responsible users or Teams;
- define lifecycle identities or transitions;
- reinterpret legacy lifecycle values;
- validate same-Workspace references as authoritative;
- select automatic create/link outcomes from evidence strength;
- calculate canonical idempotency hashes, row identities or replay results; or
- enable `web_form`, `future_api` or `future_integration`.

All capability flags, candidates, lifecycle definitions, assignments, versions, dispositions, Audit outcomes and job/row states are server-owned.

## 2. Frontend contract conventions

The examples below are documentation shapes, not implementation declarations.

```ts
type OpaqueId = string;
type PositiveVersion = number;
type RequestId = string;

type IntakeChannel =
  | "web_form" | "manual" | "csv" | "spreadsheet"
  | "future_api" | "future_integration";

type EnabledP1AIntakeChannel = "manual" | "csv" | "spreadsheet";

type SourceCategory =
  | "website" | "referral" | "outbound" | "event" | "partner"
  | "social_media" | "import" | "manual" | "other";

type SocialPlatform =
  | "tiktok" | "instagram" | "facebook" | "linkedin" | "x"
  | "youtube" | "other_social";

type SourceMedium = "organic" | "paid" | "unknown";
type IdentityDisposition = "create" | "link" | "hold";
type ReviewState = "pending" | "resolved_create" | "resolved_link" | "dismissed";
type IntakeResultDisposition =
  | "created" | "linked" | "held_for_review" | "replayed" | "rejected";
type EvidenceClass = "strong" | "supplementary" | "probable";
```

`hold` is an explicit decision/disposition. `pending` is the unresolved review state. The UI must never use them as interchangeable state values.

## 3. Shared attribution models

```ts
type CampaignContextInputV1 = Partial<Record<
  "page" | "account" | "campaign" | "ad" | "form" | "post" | "operatorContext",
  string
>>;

type OriginalSourceInputV1 = {
  sourceCategory: SourceCategory;
  sourcePlatform?: SocialPlatform;
  sourceMedium: SourceMedium;
  sourceDetail?: string;
  campaign?: CampaignContextInputV1;
};

type AttributionViewV1 = {
  version: PositiveVersion;
  original: {
    sourceCategory: SourceCategory;
    sourcePlatform: SocialPlatform | null;
    sourceMedium: SourceMedium;
    sourceDetail: string | null;
    campaign: CampaignContextInputV1;
    capturedAt: string;
  };
  correctionSummary?: {
    count: number;
    latestCorrectedAt: string;
  };
};
```

Conditional presentation rules:

- `social_media` requires a controlled platform.
- Non-social sources must not submit a platform.
- `other_social` requires bounded detail identifying the platform.
- Medium defaults visibly to `unknown`; the client does not infer paid/organic.
- Manual, CSV and XLSX adapters fix channel to `manual`, `csv` and `spreadsheet`; channel is not a general user selector.
- Import rows may override batch attribution defaults with their own complete valid attribution.
- Original attribution is read-only after committed intake. A future correction flow is a separate versioned audited command, not ordinary Lead editing.

## 4. Manual intake contracts

### Request documentation shape

```ts
type ManualLeadInquiryIntakeRequestV1 = {
  contractVersion: "lead-inquiry-intake.v1";
  idempotencyKey: string;
  intakeChannel: "manual";
  person: {
    displayName: string;
    email?: string;
    phone?: string;
    phoneCountryOverride?: string;
  };
  organization?: { name?: string; domain?: string };
  inquiry?: { subject?: string; message?: string; receivedAt: string };
  source: OriginalSourceInputV1;
  requestedAssignment?: {
    responsibleMembershipId?: OpaqueId | null;
    responsibleTeamId?: OpaqueId | null;
  };
  initialIdentityDecision?: InitialIdentityDecisionInputV1;
};

type InitialIdentityDecisionInputV1 =
  | { disposition: "create"; createContact: boolean; createCompany: boolean }
  | {
      disposition: "link";
      contactCandidate?: { id: OpaqueId; expectedVersion: PositiveVersion };
      companyCandidate?: { id: OpaqueId; expectedVersion: PositiveVersion };
    }
  | { disposition: "hold" };
```

The request contains no caller-authoritative Workspace ID. If transport retains a Workspace path segment, it is correlation only and the server re-establishes authority from Session/Membership. In the first slice, a Member request omits `initialIdentityDecision`: Member identity creation is authorized only later during atomic resolution of a persisted pending review for a Lead the server confirms is both assigned to and visible to that Member. Initial existing-identity links remain Owner/Admin-only and render only from explicit server capability.

### Result documentation shape

```ts
type LeadInquiryIntakeResultV1 = {
  contractVersion: "lead-inquiry-intake-result.v1";
  intakeId: OpaqueId;
  leadId: OpaqueId;
  disposition: IntakeResultDisposition;
  contactId: OpaqueId | null;
  companyId: OpaqueId | null;
  reviewCaseId: OpaqueId | null;
  candidateSummary: {
    strong: number;
    supplementary: number;
    probable: number;
  };
  leadVersion: PositiveVersion;
  reviewVersion: PositiveVersion | null;
  replayed: boolean;
  requestId: RequestId;
  nextView: "lead_detail" | "identity_review";
};
```

An accepted manual intake always returns a Lead ID, including held review. Candidate identity detail is supplied only through an authorized internal review view, never through public adapter results.

## 5. Lifecycle view contracts

```ts
type LifecycleDefinitionView = {
  id: OpaqueId;
  code: "new" | "working" | "qualified" | "disqualified" | "converted";
  label: string;
  displayOrder: number;
  terminal: boolean;
  archived: boolean;
  presentationTone: "neutral" | "active" | "positive" | "negative";
};

type LeadLifecycleView = {
  currentDefinition: LifecycleDefinitionView;
  permittedTransitions: Array<{
    target: LifecycleDefinitionView;
    requiresReason: boolean;
  }>;
  expectedLeadVersion: PositiveVersion;
};
```

Definitions, immutable IDs/codes and permitted transitions come from the server. `converted` is shown as reserved/disabled until its future conversion workflow is authorized. Legacy `open | won | lost` is never mapped in the browser.

## 6. Candidate and identity-review view contracts

```ts
type IdentityCandidateView = {
  candidateId: OpaqueId;
  candidateVersion: PositiveVersion;
  entityType: "contact" | "company";
  safePrimaryLabel: string;
  safeSecondaryLabel: string | null;
  evidenceClass: EvidenceClass;
  evidenceLabel: string;
  matchFields: Array<"normalized_email" | "normalized_phone" | "name_company" | "domain">;
  allowedDecision: "link" | "review_only";
};

type IdentityReviewCapabilities = {
  canResolve: boolean;
  canHold: boolean;
  canCreateContact: boolean;
  canCreateCompany: boolean;
  canLinkContact: boolean;
  canLinkCompany: boolean;
  canDismiss: boolean;
};

type IdentityReviewQueueItemView = {
  reviewCaseId: OpaqueId;
  leadId: OpaqueId;
  leadDisplayLabel: string;
  state: "pending";
  evidenceCounts: Record<EvidenceClass, number>;
  intakeChannel: EnabledP1AIntakeChannel;
  sourceCategory: SourceCategory;
  receivedAt: string;
  updatedAt: string;
  reviewVersion: PositiveVersion;
  capabilities: Pick<IdentityReviewCapabilities, "canResolve">;
};

type IdentityReviewDetailView = {
  reviewCaseId: OpaqueId;
  reviewVersion: PositiveVersion;
  state: ReviewState;
  lead: {
    id: OpaqueId;
    displayName: string;
    lifecycle: LifecycleDefinitionView;
    version: PositiveVersion;
  };
  originalInput: {
    displayName: string;
    displayEmail: string | null;
    originalPhone: string | null;
    organizationName: string | null;
  };
  candidates: {
    contacts: IdentityCandidateView[];
    companies: IdentityCandidateView[];
  };
  attribution: AttributionViewV1;
  assignment: LeadResponsibilityView;
  capabilities: IdentityReviewCapabilities;
  requestId: RequestId;
};
```

Candidates are already Workspace-scoped, deterministically ordered and capped by the server at ten per evidence class. The client does not re-rank, combine or fuzzy-match them. Contact and Company decisions remain independent.

### Review decision request/result

```ts
type IdentityReviewDecisionRequestV1 = {
  contractVersion: "identity-review-decision.v1";
  idempotencyKey: string;
  expectedReviewVersion: PositiveVersion;
} & (
  | { disposition: "hold" }
  | {
      disposition: "resolve";
      contactDecision:
        | { action: "dismiss" }
        | { action: "create" }
        | { action: "link"; candidateId: OpaqueId; expectedCandidateVersion: PositiveVersion };
      companyDecision:
        | { action: "dismiss" }
        | { action: "create" }
        | { action: "link"; candidateId: OpaqueId; expectedCandidateVersion: PositiveVersion };
    }
);

type IdentityReviewDecisionResultV1 = {
  reviewCaseId: OpaqueId;
  state: ReviewState;
  leadId: OpaqueId;
  contactId: OpaqueId | null;
  companyId: OpaqueId | null;
  resultReviewVersion: PositiveVersion;
  leadVersion: PositiveVersion;
  replayed: boolean;
  requestId: RequestId;
};
```

The server rejects invalid combinations. `hold` carries no Contact or Company decision, creates or links nothing, and retains `pending`. A resolving command atomically supplies one `create | link | dismiss` decision for each identity dimension and closes the review; partial resolution with a held remainder is not representable. Resolving identity never changes Lead lifecycle automatically.

### Permission matrix for the first slice

| Actor and state | Create Contact | Create Company | Link existing | Hold | Resolve |
| --- | --- | --- | --- | --- | --- |
| Owner/Admin with authorized pending review | Server capability | Server capability | Server capability | Server capability | Server capability |
| Member with Lead both assigned to and visible to them | Server capability | Server capability | **Never** | Server capability | Create/dismiss choices only |
| Member without both persisted assignment and visibility | **Never** | **Never** | **Never** | **Never** | **Never** |

Member identity creation is authorized only inside the atomic resolution transaction for an existing `pending` review on a Lead that the server revalidates as both assigned to and visible to that Member. It is not general Contact/Company creation authority and does not permit initial linking, later linking, independent identity creation, or cross-Workspace action. The UI renders only the server-returned capabilities and never derives this permission from cached Lead or Membership state.

## 7. Assignment view/request contracts

```ts
type LeadResponsibilityView = {
  responsibleUser: { membershipId: OpaqueId; displayName: string } | null;
  responsibleTeam: { teamId: OpaqueId; name: string } | null;
  version: PositiveVersion;
  updatedAt: string | null;
  capabilities: {
    canClaim: boolean;
    canReturn: boolean;
    canAssign: boolean;
    canReassign: boolean;
    canUnassign: boolean;
    canChangeTeam: boolean;
  };
};

type LeadResponsibilityMutationRequestV1 = {
  operation: "claim" | "return" | "assign" | "reassign" | "unassign";
  expectedVersion: PositiveVersion;
  idempotencyKey: string;
  responsibleMembershipId?: OpaqueId | null;
  responsibleTeamId?: OpaqueId | null;
  reason?: string;
  source: "lead_list" | "lead_detail" | "identity_review";
};
```

Assignment is nullable operational responsibility and never Workspace ownership or visibility authority. Controls render only from server-returned capabilities and eligible-target views. The browser never calculates Team boundary or fallback behavior.

## 8. CSV/XLSX job, mapping and row contracts

```ts
type ImportFileKind = "csv" | "xlsx";
type ImportJobState =
  | "uploading" | "uploaded" | "mapping_required" | "validating"
  | "ready" | "processing" | "completed" | "completed_with_issues"
  | "failed" | "expired";
type ImportRowState =
  | "unmapped" | "invalid" | "ready" | "processing" | "created"
  | "linked" | "held_for_review" | "replayed" | "retryable" | "rejected";

type ImportMappingField =
  | "person.displayName" | "person.email" | "person.phone"
  | "person.phoneCountryOverride" | "organization.name" | "organization.domain"
  | "inquiry.subject" | "inquiry.message" | "inquiry.receivedAt"
  | "source.sourceCategory" | "source.sourcePlatform" | "source.sourceMedium"
  | "source.sourceDetail" | "source.campaign.page" | "source.campaign.account"
  | "source.campaign.campaign" | "source.campaign.ad" | "source.campaign.form"
  | "source.campaign.post" | "source.campaign.operatorContext"
  | "requestedAssignment.responsibleMembershipId"
  | "requestedAssignment.responsibleTeamId";

type ImportMappingDraftV1 = {
  mappingVersion: string;
  sheetId: string | null;
  headerRow: number;
  columns: Array<{
    sourceColumnId: string;
    sourceHeader: string;
    targetField: ImportMappingField | null;
  }>;
  batchAttributionDefaults?: OriginalSourceInputV1;
};
```

Mapping is an explicit bounded mapping to the V1 field registry, not a generic designer. The frontend does not derive stable row identity, upload fingerprint or canonical row hash.

```ts
type ImportJobView = {
  jobId: OpaqueId;
  fileKind: ImportFileKind;
  safeFileLabel: string;
  state: ImportJobState;
  version: PositiveVersion;
  mappingVersion: string | null;
  rowLimit: 1000;
  counts: {
    total: number; ready: number; created: number; linked: number;
    held: number; invalid: number; retryable: number; rejected: number;
  };
  capabilities: {
    canMap: boolean; canValidate: boolean; canStart: boolean;
    canRetry: boolean; canViewRows: boolean;
  };
  evidenceExpiresAt: string;
  uploadExpiresAt: string;
  requestId: RequestId;
};

type ImportRowAttributionView = {
  effective: OriginalSourceInputV1;
  origin: "row" | "batch_default";
};

type ImportRowResultView = {
  rowId: OpaqueId;
  stableRowLabel: string;
  state: ImportRowState;
  version: PositiveVersion;
  validationErrors: Array<{
    code: P1AErrorCode;
    field: ImportMappingField | "row";
    message: string;
  }>;
  attribution: ImportRowAttributionView | null;
  result: {
    leadId: OpaqueId;
    disposition: IntakeResultDisposition;
    reviewCaseId: OpaqueId | null;
  } | null;
  candidateSummary: Record<EvidenceClass, number> | null;
  capabilities: { canReview: boolean; canRetry: boolean };
};
```

Every valid import row executes the canonical intake command with channel fixed by file kind. Mixed-source imports preserve effective row attribution. A held row is an accepted Lead outcome, not an import failure.

## 9. Error models and stale reconciliation

```ts
type P1AErrorCode =
  | "authentication_required" | "permission_required" | "resource_not_found"
  | "validation_failed" | "unsupported_contract_version"
  | "invalid_source_category" | "source_platform_required"
  | "source_platform_not_allowed" | "invalid_source_platform"
  | "invalid_source_medium" | "source_detail_too_large"
  | "idempotency_conflict" | "stale_version" | "invalid_match_decision"
  | "assignment_unavailable" | "rate_limited" | "batch_too_large"
  | "import_mapping_invalid" | "intake_unavailable" | "unexpected_error";

type P1AErrorEnvelope = {
  error: {
    code: P1AErrorCode;
    message: string;
    fieldErrors?: Array<{ field: string; code: string; message: string }>;
    requestId: RequestId;
    retryable: boolean;
    authoritativeView?:
      | IdentityReviewDetailView
      | LeadResponsibilityView
      | ImportJobView
      | ImportRowResultView;
  };
};
```

On `stale_version`, the UI:

1. applies no automatic retry or overwrite;
2. preserves the operator's proposed decision as a local draft;
3. renders the returned/fresh authoritative model;
4. identifies what changed without exposing hidden tenant facts;
5. requires a new explicit confirmation using the fresh version; and
6. leaves server state untouched if the user cancels.

On permission loss or tenant-safe not-found, the UI clears no server data and discloses no hidden candidate/user/Team existence.

## 10. Truthful capability and deferred-state models

```ts
type CapabilityAvailability =
  | { state: "available" }
  | { state: "disabled"; reason: string }
  | { state: "planned"; reason: string };

type P1ACapabilityView = {
  manualIntake: CapabilityAvailability;
  csvImport: CapabilityAvailability;
  xlsxImport: CapabilityAvailability;
  webForm: { state: "planned"; reason: "Form authority is not approved." };
  publicApi: { state: "planned"; reason: "Public API is deferred." };
  genericIntegration: { state: "planned"; reason: "Integration adapters are deferred." };
  automaticLinking: { state: "disabled"; reason: "Explicit identity decisions are required." };
  automaticMerge: { state: "disabled"; reason: "Identity merge is outside P1A." };
};
```

Disabled/deferred capabilities must not render as usable navigation or submit controls. If Product requires roadmap disclosure, render static explanatory copy without fake interactivity.

## 11. Fixture and test-state inventory

All fixtures use opaque synthetic identifiers and `.test` data. No fixture may encode client authority; capabilities and candidate order are explicitly server-returned.

### Manual intake fixtures

- `manual.empty`: pristine form, channel fixed to manual.
- `manual.valid_email_only`: minimum accepted person identity.
- `manual.valid_phone_only`: original phone, country decision and normalization version represented in result view.
- `manual.valid_person_company`: optional Company input.
- `manual.social_instagram_unknown_manual`: social platform required, unknown medium.
- `manual.other_social_detail`: bounded detail required.
- `manual.invalid_no_email_or_phone`.
- `manual.invalid_social_without_platform`.
- `manual.invalid_non_social_with_platform`.
- `manual.invalid_detail_too_large`.
- `manual.busy` and `manual.retryable_failure_draft_preserved`.
- `manual.created_no_candidates`.
- `manual.held_one_strong_email`.
- `manual.held_multiple_strong_email`.
- `manual.held_phone_only`.
- `manual.held_name_company`.
- `manual.conflicting_contact_company_candidates`.
- `manual.replayed_same_key_same_hash`.
- `manual.idempotency_conflict_same_key_changed_hash`.
- `manual.permission_denied_zero_mutation`.

### Identity-review queue fixtures

- empty queue.
- one pending case.
- mixed evidence counts.
- assigned-visible Member case with restricted capabilities.
- Owner/Admin full-resolution capability.
- paginated queue with deterministic cursor.
- queue loading, retryable error and tenant-safe unavailable.
- evidence-near-expiry state without implying Lead deletion.

### Identity-review detail fixtures

- no candidates with create/hold.
- one strong Contact candidate.
- multiple strong Contact candidates, deterministic order.
- supplementary phone candidates.
- probable name/Company candidates.
- independent Contact create plus Company link.
- Contact link plus Company none.
- hold remains pending and Lead retained with no Contact/Company creation or link.
- resolving review requires an explicit create/link/dismiss choice for both identity dimensions.
- atomic Contact create plus Company dismiss closes review.
- atomic Contact dismiss plus Company create closes review.
- partial identity resolution plus held remainder is unavailable.
- dismissed without links and Lead retained.
- assigned-visible Member can atomically create a new Contact, a new Company, both, or dismiss either dimension.
- assigned-visible Member cannot link an existing Contact or Company.
- Member without both persisted assignment and visibility has no review-resolution controls.
- Member permission is revalidated inside the resolution transaction.
- unauthenticated/public review-detail request returns only `authentication_required` and no candidate count, label, field, ID or evidence detail.
- authenticated but unauthorized review-detail request returns a tenant-safe denial/not-found model with no candidate identity or existence disclosure.
- assigned-visible Member loses assignment before detail load and receives no candidate-detail model.
- assigned-visible Member loses assignment after detail load; resolution is denied with zero mutation, the stale candidate view is removed, and focus moves to a generic access-change alert.
- Lead visibility loss after queue load prevents detail disclosure even when the prior queue item remains in browser history.
- cross-Workspace candidate/review identifiers return the same bounded unavailable presentation as an unknown identifier.
- public intake result exposes candidate counts only and never candidate IDs, labels, match fields or evidence detail.
- archived/inaccessible candidate after initial load.
- stale review version with fresh authoritative view.
- stale candidate version with draft preserved.
- concurrent winner/reviewer loser.
- replayed committed decision.
- generic unexpected failure without PII.

### Assignment fixtures

- fully unassigned.
- responsible user only.
- responsible Team only.
- responsible user plus Team.
- Member can claim visible unassigned Lead.
- Member can return own Lead.
- Member cannot assign another user.
- Member cannot override Team responsibility.
- Owner/Admin eligible target list.
- inactive user produces server-selected fallback/unassigned view.
- stale assignment expected version.
- assignment denial without visibility change.
- assignment changes leave Workspace ownership read-only.

### CSV/XLSX mapping fixtures

- CSV with canonical headers.
- XLSX single supported sheet.
- XLSX multiple sheets requiring explicit sheet selection.
- header row selection.
- duplicate source-column mapping.
- missing display name.
- missing both email and phone.
- unmapped required field.
- unsupported column retained as ignored, never arbitrary metadata.
- over-1,000-row rejection.
- unsupported file type truthful denial.
- batch attribution default inherited by row.
- row attribution overrides batch default.
- mixed Instagram/manual-origin rows with channel CSV/XLSX.
- `other_social` with and without required detail.
- mapping version changed requires new job identity.
- safe filename label; no raw filename in Audit fixture.

### Import job/row fixtures

- upload progress.
- mapping required.
- validating.
- ready to start.
- processing with bounded counts.
- mixed created/linked/held/invalid/retryable completion.
- held row counted as accepted, not failed.
- row replay after restart.
- retryable row resumes.
- completed row never duplicates.
- stale lease/job version.
- expired raw upload while canonical Leads remain.
- row evidence retained/expired according to server state.
- row validation field association.
- paginated row results and deterministic cursor.
- per-row attribution displayed with `row` versus `batch_default` origin.

### Lifecycle fixtures

- new intake creates `new`.
- permitted `new -> working`.
- qualified and disqualified states.
- reopening `disqualified -> working` with reason requirement.
- converted displayed reserved/disabled.
- legacy ambiguous value shown as unresolved migration state, never client-mapped.
- lifecycle label change with stable ID/code.
- archived definition remains historically displayable.

### Error and reconciliation fixtures

- every documented error code with safe copy.
- field-error summary links to exact controls.
- stale review, candidate, assignment, job and row versions.
- authentication required.
- tenant-safe missing/inaccessible record.
- rate-limited retry guidance.
- service unavailable with draft preserved.
- unexpected error with request ID only.
- no response contains raw email/phone/message/source-detail/file content in logs/Audit presentation fixtures.

## 12. Accessibility and responsive acceptance states

### Manual intake

- Programmatic labels, autocomplete attributes and conditional field descriptions.
- Error summary receives focus and links to invalid fields.
- Social-platform field requirement is announced when social media is selected.
- Busy state prevents duplicate submission while retaining readable values.
- Candidate results appear after a stable heading and do not steal focus unexpectedly.
- Create/link/hold uses a labelled group with explanatory evidence text.

### Mapping and row results

- Upload state and asynchronous progress use restrained `status` announcements.
- Mapping controls associate source header, preview sample and target field.
- Row validation identifies stable row label, field and error without color alone.
- Result table has caption, column headers and accessible pagination.
- At 320px and 200% zoom, wide data uses a labelled internal horizontal region; document overflow is absent.
- Job counts have text equivalents and do not rely only on charts/badges.

### Identity review

- Evidence strength is textual, not color-only.
- Candidate cards expose entity type, safe labels and selectable action.
- Contact and Company decision groups are independent and clearly labelled.
- Confirmation dialogs trap focus, support Escape and restore focus.
- Stale-conflict alert receives focus; proposed draft and authoritative state are distinguishable.

### Cross-cutting matrix

- Keyboard-only completion.
- Light, Dark and System themes.
- Forced-colors mode.
- Desktop, tablet, 320px mobile and 200% zoom.
- Reduced motion.
- 44px touch targets.
- No clipped evidence, platform, campaign, assignee or job-state labels.
- Back/forward/refresh never replays a mutation without an idempotency-protected explicit submit.

## 13. Graphics UX dependencies

Graphics must decide and record:

1. Manual intake information hierarchy across person, organization, inquiry, attribution, assignment and identity-decision sections.
2. Text and non-color visual treatment for strong, supplementary and probable evidence.
3. Clear distinction between `hold` action and `pending` review state.
4. Independent Contact and Company create/link/none controls without implying a merge.
5. Queue density, review-card hierarchy and deterministic candidate-list presentation.
6. Mapping layout at desktop/tablet/mobile, including safe source samples and ignored columns.
7. Row-state vocabulary and visual treatment for created, linked, held, invalid, retryable, replayed and rejected.
8. Batch-default versus per-row attribution presentation.
9. Stale reconciliation pattern that preserves the proposed draft beside the fresh authoritative state.
10. Assignment language distinguishing Workspace ownership, responsibility and visibility.
11. Truthful disabled/deferred treatment for web form, API, generic integrations, automatic linking/merge and conversion.
12. Accessible confirmation, error-summary, progress, pagination, internal-overflow and forced-colors patterns.

## 14. Remaining implementation dependencies

The corrected package, Audit matrix, lifecycle identity requirement, first-slice Member create permission and non-mutating hold semantics are accepted authority rather than open questions. Implementation remains blocked only on the following concrete inputs:

1. **Frozen authority/version:** Product must identify the immutable combined contract package and exact version/SHA that Dev1, Dev2 and Dev3 implement without local reinterpretation.
2. **Seeded lifecycle IDs:** Dev3 must publish the exact immutable lifecycle-definition UUIDs seeded at migration time for `new`, `working`, `qualified`, `disqualified` and reserved `converted`, plus the server representation for unresolved legacy states.
3. **Field bounds and masked candidate views:** Product/Backend/Security must approve exact bounds for person, organization, inquiry, attribution, campaign, assignment reason and safe file labels, and the exact masked Contact/Company fields permitted in each Owner/Admin, assigned-visible Member, unauthorized and public response.
4. **File and sheet limits:** Dev2/Dev3 must publish the maximum upload bytes, XLSX sheet count/selection rules, header-row bounds, supported cell types and malformed/encrypted/workbook rejection behavior; the 1,000-data-row ceiling remains fixed.
5. **Pagination and polling:** Dev2 must publish queue/job/row page sizes, cursor envelopes, candidate caps already mandated by Architecture, polling interval/backoff, timeout, terminal states and retry rules.
6. **Phone-country registry:** Product/Backend must publish supported country identities, Workspace-default-country read shape, explicit override behavior and normalization-version display requirements.
7. **Retention labels:** Product/Graphics/Backend must approve customer-visible labels for upload expiry, row evidence retention and unresolved-review evidence, including whether dates/countdowns are exposed and the state after evidence reduction.
8. **First-slice scope:** Product must freeze whether the first authorized frontend work item is manual intake only, manual plus pending-review resolution, or also includes CSV/XLSX planning surfaces. No unlisted adapter or deferred capability is implied.

## 15. Documentation acceptance checkpoint

This frontend plan is ready for Product, Architecture, Backend/Security and Graphics review when:

- the typed shapes are confirmed as presentation/transport views rather than browser authority;
- Product names the frozen immutable authority/version for implementation;
- Graphics answers the UX dependencies above;
- Dev2 publishes exact envelopes, capability flags and safe candidate fields;
- Dev3 confirms the exact seeded lifecycle IDs, job/row states and per-row attribution persistence;
- Product explicitly authorizes a bounded implementation work item.

Until then, implementation remains HOLD.
