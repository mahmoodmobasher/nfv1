# P1A Lead intake and identity-review UX specification

Date: 2026-08-24  
Status: implementation-ready Graphics/UX planning authority; implementation remains on HOLD  
Scope: manual Lead inquiry intake, CSV/XLSX import mapping and review, identity-review queue and decisions  
Application/assets changed: none

## 1. Outcome and authority boundary

P1A presents one Workspace-scoped intake and identity-review experience:

`Validate inquiry → create Lead → inspect candidate evidence → create identity, link identity, or hold → preserve lineage`

Every accepted intake creates exactly one Lead or replays its committed result. The Lead is the Workspace-owned inquiry. Contact is person identity; Company is organization identity. Contact and Company choices are independent identity dimensions, but one create/link/dismiss resolution applies both dimensions atomically and closes the review. Candidate evidence is not identity proof and never triggers automatic linking or merging.

This document specifies presentation, interaction, copy, responsive behavior, and accessibility for later Dev1 implementation. It creates no client-side authority. Implementation, code, schema, configuration, migration, test, adapter enablement, data mutation, integration, and deployment remain unauthorized.

## 2. Binding UX vocabulary

| Concept | User-facing term | UX rule |
| --- | --- | --- |
| Canonical inbound record | Lead inquiry / Lead | Every accepted intake creates the Lead before identity review. |
| Person identity | Contact | Optional link; never a global User or authentication identity. |
| Organization identity | Company | Optional link; Company is not required for intake. |
| Unresolved review state | Pending review | This is a state, not a user decision. |
| Decision retaining unresolved review | Hold for review | `hold` is a disposition that leaves the case `pending`. |
| Candidate evidence | Possible match | Never call it a confirmed duplicate before an explicit decision. |
| Tenant ownership | Workspace ownership | Permanent and never changed by assignment or identity linking. |
| Operational responsibility | Responsible person / Responsible team | Nullable and never tenant or visibility authority. |
| Origin | Source | Where the inquiry originated. |
| Transport | Intake channel | How NexaFlow received it. |

Machine lifecycle IDs and codes are immutable. Editable labels, colours, display order, terminal metadata, and archive state are presentation only. Lead lifecycle, pipeline stage, review state, and import-row state must never be visually or linguistically collapsed.

## 3. Information architecture and routes

Recommended route plan for later Dev1 implementation:

| Route | Purpose | Primary action |
| --- | --- | --- |
| `/crm/leads/new` | Manual Lead inquiry intake | Create lead |
| `/crm/imports` | Import-job list and status | Import leads |
| `/crm/imports/new` | Upload CSV/XLSX | Continue to mapping |
| `/crm/imports/[jobId]/mapping` | Map file columns and batch defaults | Validate mapping |
| `/crm/imports/[jobId]/preview` | Preview rows, validation, row attribution overrides | Start import |
| `/crm/imports/[jobId]` | Job progress and row outcomes | Review held leads |
| `/crm/identity-reviews` | Pending identity-review queue | Open review |
| `/crm/identity-reviews/[reviewId]` | Candidate evidence and explicit decision | Confirm decision |

Unknown, inaccessible, cross-Workspace, deleted, or no-longer-visible resources use the existing tenant-safe CRM not-found surface. Route parameters, browser storage, query parameters, imported cells, and client state never establish Workspace, Role, visibility, assignment, identity, or lifecycle authority.

## 4. Shared page composition

Every P1A route uses the accepted ProductShell and includes:

1. one visible H1;
2. visible active Workspace context;
3. a concise purpose statement;
4. the route's primary work region;
5. durable inline loading/error/conflict/status regions;
6. safe navigation back to Leads, Imports, or Review queue;
7. server-authoritative permission and state rendering.

Use Spectrum semantic tokens in Light, Dark, and System themes. Do not introduce route-specific colour authority. Status must use text and icon/shape in addition to colour.

## 5. Manual Lead intake — first implementation candidate

### 5.1 Entry and framing

H1: **Add a lead**  
Support: **Record an inquiry and preserve where it came from. NexaFlow will show possible Contact or Company matches for review.**

The form has four ordered sections:

1. Person
2. Company, optional
3. Inquiry
4. Source and responsibility

### 5.2 Person fields

- **Name** — required, trimmed and bounded.
- **Email** — conditionally required when Phone is absent.
- **Phone** — conditionally required when Email is absent.
- **Phone country** — explicit supported override; otherwise explain that Workspace default applies.

Copy: **Enter at least an email address or phone number.**

Preserve display email and original phone presentation after server normalization. Never present normalization as a correction to the person's entered identity.

### 5.3 Company and inquiry fields

- **Company name** — optional.
- **Company domain** — optional candidate evidence, not a verified website claim.
- **Subject** — optional bounded plain text.
- **Message** — optional bounded plain text.
- **Received at** — server default; show an editable value only if Product later authorizes bounded operator entry.

Company input never implies that a Company will be created or linked automatically.

### 5.4 Source attribution

Show Source separately from the fixed Manual intake channel.

**Source category** options:

- Website
- Referral
- Outbound
- Event
- Partner
- Social media
- Import
- Manual
- Other

**Source platform** appears and becomes required only when Source is Social media:

- TikTok
- Instagram
- Facebook
- LinkedIn
- X
- YouTube
- Other social

Selecting Other social reveals **Platform detail**, a bounded source-detail value. Non-social sources must not retain a social platform.

**Source medium**:

- Organic
- Paid
- Unknown

Default to Unknown. Never infer Organic or Paid on the client.

Optional bounded attribution context uses explicit fields:

- Page
- Account
- Campaign
- Ad
- Form
- Post
- Operator context

Helper: **Original attribution is preserved. Later corrections are recorded separately.**

Summary example:

- Source: Social media
- Platform: Instagram
- Medium: Organic
- Intake channel: Manual
- Detail: Instagram DM

### 5.5 Operational responsibility

Responsible person and Team are optional presentation of the separate responsibility contract. The server returns only eligible values. Do not imply that selection changes Workspace ownership or Lead visibility.

Helper: **Responsibility helps your team coordinate work. The Workspace continues to own this lead.**

If assignment becomes invalid before commitment, show `assignment_unavailable`, preserve safe form input, refresh eligible options, and require a new confirmation.

### 5.6 Submit behavior

Primary: **Create lead**  
Secondary: **Cancel**

Pending: **Creating lead…**; preserve button width, set the form busy, and block duplicate submission.

After an accepted response:

- no pending review: **Lead created.** Actions **View lead**, **Add another lead**;
- pending review: **Lead created and ready for identity review.** Actions **Review possible matches**, **View lead**;
- replay: **This lead was already created.** Open the committed Lead; do not imply a second creation;
- rejected: remain on the form with focused error summary and preserved safe values.

Manual submission never shows candidate identities before the server has created/replayed the Lead and returned authorized review state.

## 6. CSV/XLSX import journey

Only CSV and XLSX appear as enabled formats. Maximum: 1,000 data rows. Import initiation and job administration are Owner/Admin-only.

### 6.1 Import list

H1: **Lead imports**  
Support: **Upload CSV or XLSX files, review validation, and track each row without creating duplicate leads on retry.**

Each job shows safe display metadata only:

- created time;
- initiating member display name when authorized;
- file type, not raw filename if privacy policy disallows it;
- mapping version;
- total rows;
- Created, Linked, Held, Invalid, Retryable, Processing counts;
- status and expiry notice for the encrypted raw upload.

Job completion does not mean every identity review is resolved.

### 6.2 Upload

H1: **Import leads**

Upload control accepts `.csv` and `.xlsx` only. State requirements:

- idle drop/select zone;
- chosen file summary;
- unsupported type;
- empty/unreadable/encrypted workbook;
- size or row-limit rejection;
- upload progress;
- retryable service failure;
- completed upload awaiting mapping.

Copy: **Files may contain personal information. Upload only data your Workspace is authorized to process. Raw uploads are retained for seven days.**

Do not expose file contents in toasts, URLs, logs, or generic errors.

### 6.3 Mapping

H1: **Map import columns**

Layout:

- source column;
- sample values, bounded and masked where appropriate;
- canonical destination field;
- required/optional status;
- mapping error.

Required mapping must satisfy Name plus at least Email or Phone. Mapping supports person, Company, inquiry, source attribution, and optional requested responsibility fields only where server-authorized.

Provide batch attribution defaults for source category, platform, medium, and allowlisted detail/campaign fields. Clearly state: **Rows may override these defaults when mapped row values are valid.**

Mapping version and upload fingerprint are server authority. Reordering or changing file/mapping content requires a new job identity; the UI must never imply an existing job can be edited in place after processing begins.

### 6.4 Preview and row-level overrides

H1: **Review import**

Top summary:

- total rows;
- ready;
- held after intake;
- invalid;
- warnings;
- ignored blank rows.

Every row has a stable display reference derived from its server row identity. Show source sheet name when applicable and a stable row number/label, but never treat position alone as replay authority.

Desktop uses a semantic table. At narrow widths use stacked row cards; do not require page-level horizontal scrolling.

Each row shows:

- row reference;
- person and Company summary;
- effective Source / Platform / Medium;
- channel fixed to CSV or Spreadsheet;
- validation state;
- predicted intake disposition: Ready, Will be held for review, Invalid;
- bounded candidate-count summary only, not candidate identities;
- action **Review row**.

Row-level source override opens an inline section or accessible overlay. It begins with batch defaults and supports valid category, conditional social platform, medium, and allowlisted detail/campaign values. Copy: **This row's attribution overrides the batch default. Its intake channel remains CSV/Spreadsheet.**

Clearing an override restores the batch default. Invalid override values make only that row invalid and never silently fall back to a different attribution.

### 6.5 Row validation

Row error presentation includes:

- stable row reference;
- affected canonical field;
- stable error label;
- correction guidance;
- whether the row can process;
- link/focus navigation to the field or mapping.

Required visible mappings for server errors include:

- missing name;
- email and phone both absent;
- invalid email/phone/country decision;
- invalid source category;
- social platform required;
- social platform not allowed;
- invalid platform or medium;
- source detail too large;
- invalid assignment;
- unsupported contract/mapping version.

Errors requiring action remain inline. Do not communicate invalidity through cell colour alone.

### 6.6 Confirm and process

Confirmation states exact counts and policies:

- valid rows create Leads through the same canonical command as manual intake;
- candidate rows create Leads and remain Pending review;
- invalid rows create nothing;
- rows may finish with mixed outcomes;
- retry/restart does not duplicate completed rows.

Primary: **Start import**  
Secondary: **Back to mapping**

Processing is asynchronous. Do not trap the user on the page. Provide **View import status**.

### 6.7 Job status and row outcomes

Job status identities must be server-provided and distinct from row outcomes. Required outcome filters:

- All
- Processing
- Created
- Linked
- Held for review
- Invalid
- Retryable

Counts must update without reshaping the page unexpectedly. Announce meaningful count changes politely. A completed job with Held or Invalid rows uses **Completed with review needed**, not a generic success state.

Raw upload expiry is visible: **Original file scheduled for deletion [date]. Lead records and completed decisions are retained under Workspace policy.**

## 7. Identity-review queue

### 7.1 Queue composition

H1: **Identity review**  
Support: **Review possible Contact and Company matches. Every Lead remains available even while identity is unresolved.**

Queue columns/cards:

- Lead name;
- Company supplied by inquiry, if any;
- source and intake channel;
- evidence summary: Strong, Supplementary, Probable counts;
- received time;
- responsible person/Team where visible;
- review state;
- **Review** action.

Filters:

- evidence class;
- source category;
- intake channel;
- received period;
- responsible person/Team where authorized;
- search current visible Lead information;
- Clear filters.

Member results are server-filtered to Leads both visible and assigned to them. Owner/Admin may view all Workspace cases. The client must not infer review permission from assignment labels.

### 7.2 Candidate cap and overflow

Candidate presentation is capped at ten per evidence class and deterministically ordered by the server. The UI must not request, infer, or locally rank additional candidates.

When a class reaches ten, show: **Showing the first 10 authorized matches for this evidence type. Refine the inquiry or hold it for review.** Do not imply that exactly ten total candidates exist.

## 8. Identity-review detail

### 8.1 Page hierarchy

H1: **Review identity matches**

Regions:

1. Lead inquiry summary
2. Original attribution
3. Contact decision
4. Company decision
5. Decision summary and optional reason
6. Confirm action

Original attribution is read-only. Any future **Correct attribution** journey is separate, expected-version controlled, and outside this screen's ordinary edit behavior.

### 8.2 Candidate evidence

Evidence classes and copy:

- **Strong evidence:** **Email matches exactly after normalization.**
- **Supplementary evidence:** **Phone matches under the recorded country and normalization rules.**
- **Probable evidence:** **Name and Company information may refer to the same identity. Review required.**

Unsupported fuzzy similarity is never displayed as actionable evidence.

Each candidate card shows only authorized minimum information:

- Contact or Company type;
- display name;
- Company relationship where applicable;
- minimally necessary masked email/phone/domain;
- active/archived state;
- last updated time;
- exact evidence class;
- selection control;
- **Open record** only when the reviewer may access that record.

Do not show internal IDs, raw normalization values, scores, cross-Workspace facts, or hidden fields. Candidate detail is emitted only by the authorized server review model; the client must not derive, enrich, retain, or recover additional candidate fields. A candidate that becomes inaccessible is removed or replaced by the generic stale/tenant-safe recovery state without confirming that the record exists.

### 8.3 Independent identity choices, one atomic resolution

Contact and Company sections each require one explicit choice:

- **Create new Contact/Company**
- **Link existing Contact/Company**
- **Dismiss Contact/Company candidates**

Contact and Company choices are independently selected, then committed together as one resolution. Examples:

- link Contact and create Company;
- create Contact and link Company;
- link Contact and dismiss Company candidates;
- create Company and dismiss Contact candidates;
- dismiss both identity dimensions and resolve without links.

Only Owner/Admin receive Link existing controls. A Member receives Create new and Dismiss choices only when the server confirms that the pending review's Lead is both visible to and assigned to that Member. Members never receive Link existing controls. Loss of assignment, visibility, Membership, or review authority removes the create controls and resolves through the permission/stale recovery states rather than client inference.

The resolution cannot close only Contact or only Company while leaving the other dimension Pending. Both dimensions require a choice, and the server applies the complete decision atomically or applies nothing.

### 8.4 Create new

Show the minimum fields that will create the identity and state that the Lead remains a separate inquiry. Confirmation copy:

**Create a new Contact/Company and link it to this Lead. Existing records will not be merged or overwritten.**

For a Member, also show: **You can create new identities only while this Lead remains assigned to you and visible to you. You cannot link existing identities.**

### 8.5 Link existing

Show the selected record, captured candidate version, evidence class, and the exact link that will be added. Confirmation copy:

**Link this Lead to the selected Contact/Company. The inquiry, original attribution, and existing identity fields remain unchanged.**

Never offer “Merge,” “Replace,” or “Use latest values.”

### 8.6 Hold for review

Primary disposition: **Hold for review**  
Meaning: the Lead remains created and usable; the review stays Pending; no Contact or Company is created, no identity link is added or changed, and no per-dimension decision is committed.

Reason options:

- Insufficient identity evidence
- Conflicting information
- Another reviewer is needed
- Information requires correction
- Other

Optional notes must be bounded and excluded from ordinary Audit/events according to server policy.

Do not add a separate Held review state. The visible state remains **Pending review**, with the latest Hold disposition and reason available to authorized reviewers. Hold is separate from the Contact/Company choice form: selecting Hold must not preserve or partially apply draft Create, Link, or Dismiss choices.

### 8.7 Dismiss review

When both identity dimensions use Dismiss, label the governing action **Resolve without identity links**. Confirmation:

**Keep the Lead without linking a Contact or Company? The Lead and original attribution will remain. This review will close.**

This closes the review with one atomic dismissed resolution. It is distinct from Hold, which changes no identity state and leaves the review Pending.

## 9. Decision confirmation and success

Before commitment, summarize:

- Lead retained;
- Contact action;
- Company action;
- original attribution retained;
- no merge/overwrite;
- optional reason;
- current review version.

For every non-Hold resolution, the summary must show both the Contact choice and Company choice. If either choice is missing, confirmation remains unavailable with linked guidance. The UI must never describe one dimension as resolved while the other remains held.

Primary labels match the decision:

- **Create and link identities**
- **Link selected identities**
- **Apply identity decision**
- **Hold for review**
- **Resolve without links**

Pending label: **Applying decision…**; block duplicate submission.

Success variants:

- **Identity review completed.**
- **Contact linked. Company candidates dismissed.**
- **New Company created. Contact candidates dismissed.**
- **New Contact and Company created and linked.**
- **Lead held for further identity review.**
- **Review resolved without identity links.**

Actions: **View lead**, **Next review**, **Return to review queue**.

## 10. Stale-version reconciliation

Review decisions require current review and selected-candidate versions. On `stale_version` or `invalid_match_decision`:

- apply zero optimistic success state;
- show alert heading **Identity information changed while you were reviewing it.**;
- explain **No identity decision was applied. Reload the latest candidates before continuing.**;
- preserve the intended Contact/Company decision locally only as a non-authoritative draft;
- actions **Reload latest**, **Discard my draft**, **Return to queue**.

After reload:

- announce **Latest review information loaded.**;
- focus the review-change summary;
- show which selected candidate changed, archived, disappeared, or became inaccessible without disclosing why an inaccessible record exists;
- require explicit reselection and reconfirmation;
- never automatically replay the prior decision.

If permission or visibility changed, use the permission or tenant-safe not-found surface rather than stale detail.

Import-job and row stale states use the same rule: server state wins, completed rows replay, and changed upload/mapping content requires a new job.

## 11. Shared state matrix

| State | Required presentation | Recovery |
| --- | --- | --- |
| Loading | Preserve heading, controls, and list/form geometry; polite status | None until resolved |
| Empty review queue | **No identity reviews need attention.** | View Leads / Imports |
| No filtered results | **No reviews match these filters.** | Clear filters |
| Empty imports | **No lead imports yet.** | Import leads if authorized |
| Validation failed | Focused linked summary plus field/row errors | Correct and retry |
| Permission denied | Durable generic alert; no protected candidate details | Return to safe route |
| Tenant-safe not found | Existing CRM generic not-found pattern | Return to Leads/queue |
| Rate limited | Explain bounded wait without security detail | Retry when allowed |
| Intake unavailable | Confirm no result yet unless a replay receipt exists | Retry safely |
| Idempotency conflict | Explain that this submission key belongs to different content | Start a new submission |
| Stale review | No mutation; latest-state recovery | Reload latest |
| Candidate capped | Show first ten authorized results/class, not total existence | Refine or Hold |
| Import processing | Progress/counts with page-exit allowed | View status later |
| Mixed completion | Exact Created/Linked/Held/Invalid/Retryable counts | Filter affected rows |
| Replay | Open the committed result; no duplicate-success claim | View Lead/job |
| Unexpected failure | Generic non-disclosing inline alert; preserve safe draft | Retry / return safely |
| Success | Durable completion summary and resulting links | Next primary action |

Never announce `review_required` as an error. It is a successful Lead creation with a Pending identity review.

## 12. Accessibility requirements

- One visible H1 per route and correctly nested section headings.
- Upload, mapping, preview, queue, and review regions use explicit landmarks/names.
- Error summaries receive focus after submit and link to the exact field, mapping, or row.
- Help IDs precede error IDs in `aria-describedby`; invalid fields use `aria-invalid`.
- Candidate selection uses native radio controls or equivalent single-selection semantics.
- Contact and Company decision groups use separate fieldsets and legends, followed by one atomic resolution summary.
- Tables use captions, header associations, and accessible sorting/filter state.
- Import count updates and filtered-result counts use polite live regions; actionable failures use alerts without duplicate announcements.
- Busy forms/regions use `aria-busy`; controls prevent duplicate mutation while retaining readable labels.
- Confirmation dialogs, if used, have visible title/body, `aria-modal`, Cancel-first focus, Escape cancellation, containment, and trigger restoration.
- Focus returns to the relevant section after overlays, row edits, conflicts, and validation navigation.
- Status, evidence class, invalidity, selection, and disabled/deferred state never rely on colour alone.
- All interactive targets are at least 44×44px.
- Forced colours, reduced motion, and native control theme behavior are preserved.
- Long names, emails, domains, campaign values, and row labels wrap without hiding actions.
- Screen-reader users receive compact error/count summaries and are not forced through every valid import row.

## 13. Responsive behavior

Breakpoints follow the shared Spectrum shell rather than route-specific device assumptions.

### Desktop

- Manual form may use two columns only for logically paired fields.
- Mapping and preview use bounded tables with sticky headings only when they do not obscure focus.
- Review detail may place inquiry summary beside candidate decisions while preserving source order.

### Tablet

- Mapping table may retain two columns; samples and errors wrap beneath controls.
- Candidate cards use two columns only when reading and focus order remain linear.

### Mobile and 320px

- All forms use one column.
- Import preview becomes stacked row cards with stable row reference first.
- Candidate evidence and actions stack; no side-by-side comparison is required.
- Primary and secondary actions become full width where needed.
- Filters use an accessible disclosure/drawer with visible Apply/Clear and focus return.
- No primary journey depends on horizontal page scrolling.

### 200% zoom

- Step context, error summary, selected mapping, decision summary, and primary recovery remain visible and reachable.
- Fixed/sticky actions must not cover form fields, status regions, or focused controls.

## 14. Truthful disabled and deferred states

Deferred capability must not look enabled, accept data, or imply an adapter exists.

### Web form

Show only in an informational **Planned intake channels** region when useful:

**Web form intake — Planned. No public form adapter is currently connected.**

No Upload, Configure, Test, or Enable action. Do not use `web_form` for manual entry.

### Future API

**API intake — Not available in P1A. Public API credentials and submission endpoints are not enabled.**

Do not expose token controls, sample keys, or fake endpoint values.

### Future integrations

**Integration intake — Not available in P1A. Third-party adapters require separate Product and security approval.**

Do not show provider logos as connectable controls.

### Automatic merge and fuzzy matching

**Automatic merging — Not supported. NexaFlow shows bounded evidence for an authorized person to review.**

**Fuzzy matching — Not supported in P1A. Name similarity alone never links or merges records.**

Do not add confidence sliders, merge toggles, AI badges, or “recommended match” authority.

### Advanced administration

Source-category, platform, mapping-template, lifecycle, matching, retention, and routing designers remain deferred. Use the approved registries and fixed mapping flow. Do not show editable system registries or disabled Save controls that imply imminent availability.

## 15. Privacy and truthful-content rules

- Candidate identities appear only after server authorization and within the active Workspace.
- Queue and candidate cards show the minimum personal information necessary to decide.
- Audit-facing UI must not expose raw normalization values, inquiry messages, uploaded cells, filenames, source detail/campaign values, or internal identifiers.
- Original attribution is read-only and clearly distinguished from later corrections.
- Import source-detail values never appear in generic job summaries or logs.
- Raw-file retention is seven days; row/mapping/review evidence is 30 days unless resolved and safely reduced. UI must not imply expiry deletes canonical Leads.
- Archived candidates are not selectable unless the server explicitly returns an authorized recovery path.
- Assignment labels never establish review permission or visibility.

## 16. Dev1 implementation handoff requirements

Before implementation authorization, Dev1 will require one immutable handoff containing:

1. final routes and navigation placement;
2. server view-model schemas for manual intake, mapping, preview, jobs, queue, and review detail;
3. exact permission/action matrix by Owner, Admin, and Member, including Member Create-new authority only for an assigned-visible pending review;
4. stable lifecycle, review, import-job, and row status identities with display labels;
5. canonical field bounds and validation-copy mapping;
6. deterministic candidate ordering metadata and capped-result flag;
7. per-row effective attribution and override view model;
8. expected-version and stale reconciliation model;
9. idempotency/replay response model;
10. pagination, filtering, and performance boundaries;
11. retention/expiry timestamps suitable for display;
12. exact success Audit cardinality matrix from Product/Architecture;
13. paired Light/Dark/System acceptance fixtures without personal data;
14. desktop/tablet/320/200%-zoom state matrix;
15. keyboard, focus, live-region, forced-colour, and reduced-motion test plan.

No frontend constant may grant Workspace, Role, visibility, assignment, lifecycle, matching, linking, source, channel, or candidate authority.

## 17. Graphics acceptance matrix

Graphics may return ACCEPT only when one immutable later candidate proves:

- manual intake valid, validation, pending-review, replay, assignment-unavailable, and service-error states;
- source/channel separation and conditional social platform behavior;
- immutable original attribution presentation;
- upload rejection, mapping errors, batch defaults, row overrides, and preview counts;
- CSV and XLSX channel truth and maximum-row failure;
- job processing, mixed completion, resume/replay, and retention messaging;
- queue empty/no-match/loading/error/permission and capped candidates;
- independently selected Contact/Company Create/Link/Dismiss choices committed as one atomic resolution;
- Owner/Admin link authority and Member Create-new authority only for assigned-visible pending reviews;
- Hold creates no Contact/Company or link mutation and leaves Pending, while a complete two-dimension resolution closes review;
- stale review and candidate reconciliation with zero false success;
- no automatic merge, fuzzy match, client ranking, or cross-tenant disclosure;
- disabled web/API/integration/advanced-admin states are truthful and non-operational;
- keyboard, focus, screen reader, contrast, Light/Dark/System, forced colours, reduced motion, 320px, 200% zoom, long content, and no-overflow behavior.

## 18. Product questions that still affect Dev1 detail

The following do not block this planning specification but must be frozen in the final reconciled authority before implementation:

1. Exact field bounds for manual intake, attribution context, identity creation, and optional review reasons/notes.
2. Safe candidate-card display and masking rules for names, email, phone, domain, Company relationship, lifecycle, and timestamps.
3. File-size, workbook-sheet, cell, column, encoding, and supported XLSX-feature limits within the approved 1,000-row maximum.
4. Exact pagination sizes and deterministic pagination model for queue, job list, and row outcomes.
5. Polling cadence, backoff, terminal-state behavior, and background/visibility handling for asynchronous import status.
6. Supported phone-country registry, Workspace default-country presentation, and explicit override behavior.
7. Exact user-facing seven-day upload and 30-day row/review-evidence retention labels, timestamps, expiry warnings, and post-expiry states.
8. Final first-slice boundary: included routes/states, whether `receivedAt` is operator-editable, raw-filename visibility, downloadable error-file inclusion, and fixed/read-only mapping-preset availability.

## 19. Readiness and implementation hold

This specification is ready for Product, Architecture, Backend/Security, Dev3, and Dev1 review. It incorporates the accepted planning invariants and Architecture conditions: full per-row attribution, Pending-versus-Hold terminology, immutable lifecycle identities, server-authoritative decisions, Member Create-new authority only for assigned-visible pending reviews, atomic two-dimension resolution, same-Workspace identity, expected-version reconciliation, and ten-per-evidence-class candidate caps.

The prior Product contract, canonical lock order, and operation-level Audit rules are present and are not outstanding UX dependencies. Implementation remains on HOLD pending one final reconciled and frozen authority plus the genuine UI parameters in section 18, followed by the required Product, Architecture, Backend/Security, data-design, and Dev1 implementation authorization. This planning gate does not itself authorize build work.
