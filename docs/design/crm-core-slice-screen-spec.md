# NexaFlow CRM core slice screen specification

Status: **implementation-ready local product handoff**  
Scope authority: `docs/architecture/delivery-scope-reset.md`  
Visual authority: approved light system in `docs/design/onboarding-screen-spec.md`  
Boundary: local server-backed CRM product slice only. No production providers, billing, analytics, deployment, advanced automation, or exhaustive governance.

## 1. Product boundary and principles

The smallest usable workflow is:

**Create lead → assign owner/visibility → move through pipeline → add notes/activities → find and review lead details → edit safely.**

- Leads, pipeline state, owner, visibility, notes, and activities are persisted by the local server.
- Every read and mutation is scoped to the authenticated Workspace context. Browser storage, query parameters, client role strings, and hidden fields never grant access.
- Workspace visibility means all authorized members can see the lead. Team visibility means only authorized members of the selected team can see it. Private visibility is optional only if the server contract supports it; do not expose an unsupported option.
- Use the existing protected CRM shell and mobile menu. Keep the banner truthful: **“LOCAL SERVER · Leads and CRM activity are saved and authorized by the local server.”**
- Do not claim real Google, production email, production billing, cloud hosting, analytics, automation, or deployment. Mailpit is not involved in CRM core delivery.
- Use one primary action per screen, visible H1s, durable inline success/error states, and no blank screen during network work.

## 2. Route map

| Route | Purpose | Primary action |
|---|---|---|
| `/crm` | Lead list and pipeline overview | Add a lead |
| `/crm/leads/new` | Create a lead | Save lead |
| `/crm/leads/[leadId]` | Lead detail, timeline, stage/owner/visibility controls | Edit lead / Add note |
| `/crm/leads/[leadId]/edit` | Edit lead fields | Save changes |
| `/crm/pipeline` | Stage board/list and stage movement | Add a lead |
| `/crm/settings/pipeline` | Configure ordered pipeline stages/default stage | Save pipeline |
| `/crm/activities/new?lead={leadId}` | Add a note/activity from a lead | Add activity |

Unknown, unauthorized, suspended-membership, removed-workspace, and cross-tenant lead IDs use the same tenant-safe not-found surface:

- H1: **“Lead not found”**
- Body: **“This lead may have been removed or you may no longer have access.”**
- Primary: **Return to leads**

Do not reveal whether a lead exists in another Workspace.

## 3. Protected CRM shell and information hierarchy

### Desktop

- Sidebar: CRM overview, Leads, Pipeline, Workspace settings, then Sign out.
- Header: workspace name, current role, search affordance, and account menu.
- Main content max width 1180px; preserve the approved canvas `#F5F3EE`, white surfaces, muted summaries, dark ink, orange primary action, and dark-orange focus ring.
- Page hierarchy: eyebrow/context → H1 → concise support copy → primary action/filter row → content surface → inline states.

### Mobile, 320px minimum

- Reuse the protected CRM mobile header/menu: 44×44px trigger, `aria-expanded`, `aria-controls`, light panel/backdrop, Escape close, route-close, focus return.
- Menu order: CRM overview, Leads, Pipeline, Workspace settings, Sign out.
- List filters stack vertically. Lead cards show name, company, stage, owner, and visibility without horizontal scrolling.
- Pipeline board becomes a vertical stage list; never require horizontal-scroll-only access to the primary lead workflow.
- Tables become cards or bounded internal scrollers with an accessible scroll hint. Page-level horizontal overflow is prohibited.

## 4. Pipeline stages and status movement

### Default stages

Seed the local server catalog with ordered, active stages:

1. **New**
2. **Working**
3. **Qualified**
4. **Won**
5. **Lost**

Stages have immutable IDs, Workspace scope, display name, order, active/archive status, and version. New leads default to **New** unless the server-configured default differs.

### `/crm/pipeline`

H1: **Pipeline**  
Support: **“See where leads are in your process and move work forward.”**

- Desktop: ordered columns/cards or an equivalent grouped list; each lead card shows name, company, owner, visibility badge, and updated time.
- Mobile: stacked stage sections with a stage heading, lead count, and cards. Provide **Change stage** from each card; do not require drag and drop.
- Filters: Search leads, Owner, Team visibility, Stage, and **Clear filters**.
- Empty pipeline: **“No leads match these filters.”** / **Clear filters**.
- No leads: **“Your pipeline is empty.”** / **“Add your first lead to start tracking customer work.”** / **Add a lead**.

### Stage movement

- Control: labelled **Stage** select on detail/edit; optional drag/drop enhancement must have the same select/action path.
- When moving to Won or Lost, require confirmation:
  - Won title: **“Mark {lead} as Won?”**
  - Won body: **“This lead will move to the Won stage.”**
  - Lost title: **“Mark {lead} as Lost?”**
  - Lost body: **“This lead will move to the Lost stage. You can change it later.”**
  - Actions: **Cancel**, **Move to {stage}**.
- For other stages, use optimistic UI with a visible **Saving stage…** status and rollback on failure.
- Success: **“Stage updated to {stage}.”**
- Version conflict: **“This lead changed while you were editing. Reload the latest lead before moving it.”** Actions **Reload latest**, **Keep my draft** where safe.
- Failure: **“We couldn’t update the stage. Your lead is still unchanged. Try again.”**

### `/crm/settings/pipeline`

H1: **Pipeline settings**  
Support: **“Configure the stages your team uses to track leads.”**

- List stages with order, active/archive state, and default indicator.
- Controls: **Add stage**, drag/reorder only if keyboard-equivalent controls exist, rename, set default, archive.
- Exact fields: **Stage name** required; optional description only if supported.
- Primary: **Save pipeline**. Loading: **Saving pipeline…**. Success: **Pipeline updated.**
- Empty/error: **“We couldn’t load pipeline stages. Try again.”**
- Duplicate: **“A stage with this name already exists.”**
- Archive confirmation: **“Archive {stage}?”** / **“Existing leads will remain visible and must be moved before this stage can be removed from the active pipeline.”** Actions **Cancel**, **Archive stage**.
- Do not allow archiving the only active/default stage; explain inline.

## 5. Lead list and search

### `/crm`

H1: **Leads**  
Support: **“Track customer work from first contact through outcome.”**

Primary: **Add a lead**. Secondary: **View pipeline**.

Filter/search row:

- Search input: **Search leads**; helper/placeholder **“Search by name, company, or email.”**
- Stage select: All stages plus server-derived stages.
- Owner select: All owners plus authorized owners.
- Visibility select: Workspace, Team, Private only if supported.
- Team select: All teams plus authorized teams.
- **Clear filters** appears when any filter is active.
- Debounce only as a performance detail; announce result count after meaningful result changes, not each keystroke.

List fields: Lead name, Company, Email, Stage, Owner, Visibility, Updated, and row action **Open lead**. Use cards at mobile.

States:

- Loading: **“Loading leads…”** while retaining filter controls and list geometry.
- No data: **“No leads yet.”** / **“Add a lead to start building your pipeline.”** / **Add a lead**.
- No matches: **“No leads match these filters.”** / **Clear filters**.
- Server error: **“We couldn’t load leads. Try again.”** / **Try again**.
- Session expiry: **“Your session expired. Sign in to continue.”**
- Permission denial: **“You don’t have permission to view these leads.”** / **Return to CRM**.
- Tenant-safe not-found for a filtered/linked lead remains the generic lead-not-found surface.

## 6. Create lead

### `/crm/leads/new`

H1: **Add a lead**  
Support: **“Create a shared customer record so your team can follow up.”**

Fields, in order:

1. **First name** — required, `given-name`.
2. **Last name** — required, `family-name`.
3. **Work email** — required, `email`.
4. **Company** — required, `organization`.
5. **Phone** — optional, `tel`.
6. **Stage** — required, defaults to the server-configured default stage.
7. **Owner** — required, defaults to current member; server validates same-workspace ownership.
8. **Visibility** — required, options permitted by the server: Workspace, Team, optionally Private.
9. **Team** — required only for Team visibility; same-workspace teams only.
10. **Notes** — optional, plain text.

Actions: primary **Save lead**; secondary **Cancel**. If dirty, Cancel opens **Discard changes?** / **Your unsaved lead details will be lost.** Actions **Keep editing**, **Discard changes**.

Validation:

- First name: **“Enter a first name.”**
- Last name: **“Enter a last name.”**
- Email: **“Enter a valid work email address.”**
- Company: **“Enter a company name.”**
- Stage: **“Choose a stage.”**
- Owner: **“Choose an owner.”**
- Team visibility: **“Choose a team for this lead.”**

Loading: **“Saving lead…”**; disable duplicate submission while preserving entered values. Success: **“Lead created.”** / **View lead** primary / **Add another lead** secondary. Failure: **“We couldn’t save this lead. Your information is still here. Try again.”**

## 7. Lead detail and edit

### `/crm/leads/[leadId]`

H1: **{Lead name}**  
Support/meta: company, email, current stage, owner, visibility, and last updated time.

Primary: **Edit lead**. Secondary: **Change stage**. Contextual: **Add note**, **Log activity**.

Summary card:

- Stage with text label and status icon.
- Owner with member name.
- Visibility with Workspace/Team/Private text and team name where applicable.
- Company/contact details.
- Actions remain available only when server authorization permits them.

Timeline heading: **Activity**. Empty: **“No activity yet.”** / **“Add a note or log an activity to keep the team informed.”**

### `/crm/leads/[leadId]/edit`

Reuse create fields and values. H1: **Edit lead**. Primary **Save changes**; secondary **Cancel**. Loading **“Saving changes…”**; success **“Lead updated.”**; failure preserves safe draft values: **“We couldn’t save your changes. The latest saved lead is unchanged. Try again.”**

Expected-version conflict:

- Heading: **“This lead changed while you were editing.”**
- Body: **“Review the latest values before saving so you don’t overwrite someone else’s update.”**
- Actions: **Reload latest** primary, **Keep my draft** secondary.
- After reload announce **“Latest lead values loaded.”** and focus the changed section.

## 8. Notes and activities

### `/crm/activities/new?lead={leadId}`

Use a full page on mobile and a focused panel on desktop.

- H1: **Add activity**
- Type select: **Note** (required; future activity types may be added only by approved scope).
- Content textarea: **What happened?** required.
- Optional activity date/time if supported; default current server time.
- Primary **Add activity**; secondary **Cancel**.
- Loading **“Adding activity…”**; success **“Activity added.”**; failure **“We couldn’t add this activity. Your note is still here. Try again.”**
- Notes are plain text in this slice; no automation, AI summaries, reminders, attachments, or external sync.

Timeline items show type, author, timestamp, content, and visibility inherited from the lead. Do not expose activity from a lead the current context cannot view.

## 9. Ownership and visibility controls

- Owner select lists only active same-workspace members the server permits. Never accept an arbitrary member ID from the client.
- Workspace visibility: **“Everyone with access to this workspace can view this lead.”**
- Team visibility: **“Only members of {team} and authorized workspace administrators can view this lead.”**
- Private, if supported: **“Only you and authorized workspace administrators can view this lead.”**
- Changing visibility from Team to Workspace may broaden access; use confirmation:
  - **“Make this lead visible to the workspace?”**
  - **“Everyone with workspace access may be able to view this lead.”**
  - **Cancel**, **Change visibility**.
- If the selected Owner becomes inactive or loses access, server response must return a recoverable error: **“That owner is no longer available. Choose another owner.”**
- If a team is archived, preserve the lead record but require a new valid team before saving Team visibility.

## 10. Shared errors, permissions, loading, and not-found

- Use inline page alerts for blocking errors; use toasts only for non-blocking confirmation.
- Error summaries receive focus after invalid submission and link every invalid field.
- Permission failures do not reveal target existence. Use **“You don’t have permission to perform this action.”** or the generic not-found copy.
- Every mutation uses server authorization, CSRF protection, idempotency where applicable, and expected versions for editable records.
- Back/direct route/refresh must resolve server state. Browser storage and query parameters may preserve navigation intent only; they cannot supply lead, owner, stage, visibility, or Workspace authority.
- Keep safe draft values after network/version errors; never retain passwords, tokens, or secret invitation values.

## 11. Accessibility and responsive acceptance

- Every route has one visible H1, unique title, keyboard order matching visual order, and usable landmarks.
- All fields have programmatic labels, descriptions, `autocomplete` where applicable, `aria-invalid`, and `aria-describedby` when invalid.
- Search/filter result changes use a polite live region with a stable result count; do not announce every keystroke.
- Stage/visibility/owner controls expose text labels and descriptions; status never depends on color alone.
- Stage movement and visibility expansion confirmations use `role="alertdialog"`, visible title/body, safe initial focus, Escape cancellation, focus trap, and trigger restoration.
- Error summaries focus after submit and link to invalid controls. Server errors and conflicts remain visible until recovered.
- At 320px: no page-level horizontal scroll; full-width primary actions; long emails wrap; list/detail content remains readable; pipeline is vertically usable.
- At 200% zoom and forced colors, filters, cards, status labels, focus rings, and dialogs remain understandable and operable.
- Respect `prefers-reduced-motion`; no information depends on animation or drag/drop.

## 12. Local-only boundary

Use this banner on protected CRM core routes:

**“LOCAL SERVER · Leads, pipeline, ownership, visibility, notes, and activities are saved and authorized by the local server. Production providers and deployment are not connected.”**

Do not mention real Google, production email, billing, analytics, automation, or deployment in core workflow copy. If a future feature is not implemented server-side, label that specific surface **“LOCAL PREVIEW · This feature does not persist or authorize production data.”**

## 13. Develop acceptance checklist

- [ ] Persistent, tenant-scoped Leads support list, search/filter, detail, create, edit, and safe not-found.
- [ ] Server-configured/default pipeline stages support list, order, default, archive, movement, confirmation, optimistic rollback, and expected-version conflict.
- [ ] Owner, Workspace/Team visibility, and permitted team controls are server-derived and validated.
- [ ] Notes/activities persist and appear in the lead timeline with author/timestamp.
- [ ] Loading, empty, no-match, permission, session-expiry, error, success, and conflict states match this copy.
- [ ] Mobile protected shell, lists, pipeline, detail, forms, dialogs, and logout work at 320px without page overflow.
- [ ] Keyboard, focus, live regions, error links, 44px targets, forced colors, reduced motion, and 200% zoom pass.
- [ ] No production provider, billing, analytics, advanced automation, deployment, or exhaustive governance work is introduced.
- [ ] Local integration/browser evidence proves tenant isolation, expected-version safety, ownership/visibility enforcement, persistence, and primary journeys.

