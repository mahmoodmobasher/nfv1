# CRM core slice delivery review

Status: **ACCEPT — final CRM-core UX remediation verified**  
Review date: 2026-08-20  
Design basis: `docs/design/crm-core-slice-screen-spec.md`  
Engineering basis: `docs/engineering/delivery-scope-reset-checkpoint.md`  
Boundary: local server and local browser evidence only. No external systems were accessed.

## Review summary

The smallest persistent CRM workflow is substantially implemented. The checkpoint reports the migration, tenant-scoped persistence, 72/72 PostgreSQL integration tests, 1/1 primary Playwright journey, lint, and production build passing. The rendered light shell is coherent, the local-server banner is truthful, and the primary create → detail → edit → stage/status → note → search journey exists.

Graphics/UX acceptance is held only for the bounded findings below. These are material to the requested primary product journey or to keyboard/screen-reader completion; visual polish and deferred advanced features are not blockers.

## Accepted areas

- Leads are persistent, Workspace-scoped, and server-derived.
- Create, detail/edit, stage/status, owner, Workspace/Team visibility, and notes/activity paths are present.
- Same-Workspace references and tenant-safe not-found behavior are enforced by the server layer.
- Expected-version writes and rollback/error messaging exist for lead mutations.
- Lead list search, empty state, result count, and direct lead links are present.
- CRM shell includes the local-server persistence boundary, protected route context, mobile menu, and real logout failure/success semantics.
- 320px layout rules exist for the shell, cards, forms, and list grid; the product journey evidence covers the main desktop flow.

## Prior release-blocking findings — resolved

### P1 — Mobile CRM navigation omits Pipeline — resolved

Pipeline is now available from the desktop and mobile CRM navigation, with a server-derived `/crm/pipeline` stage overview and narrow-screen stage sections.

Verification:

- Desktop and 320px browser evidence covers Pipeline access, mobile navigation, and no page-level overflow.

### P1 — Stage/status movement — resolved

Won/Lost movement now uses an accessible confirmation dialog with contextual copy, safe initial focus, Escape dismissal, focus containment, and focus restoration. Stage saving exposes loading, rollback, and stale-version recovery.

Verification:

- The checkpoint reports coverage for Won dialog/Escape/focus, stage movement, 409 draft-preserving reload, and database persistence.

### P1 — Lead forms — resolved

LeadEditor now provides custom validation, a linked focused error summary, stable IDs/help/error associations, `aria-invalid`, and explicit Workspace/Team visibility guidance.

Verification:

- The checkpoint reports validation-focus coverage and persisted owner/visibility behavior in the CRM Playwright and PostgreSQL suites.

### P1 — Notes/activity timeline — resolved

The detail screen now exposes a labelled Activity timeline with type, author, timestamp, and content. Note submission has loading/success/failure states and preserves the draft for one-action retry.

Verification:

- The checkpoint reports note failure/retry/timeline coverage in the CRM Playwright journey.

## Bounded follow-up to verify with the corrections

- Re-run the desktop and 320px journeys for list/search/empty, create, detail/edit, stage/status, owner/team visibility, note/activity, stale conflict, not-found, mobile navigation, and logout.
- Verify status/result live regions are polite and do not announce every keystroke or decorative loading animation.
- Verify direct lead routes resolve server state and never accept browser storage/query parameters as lead, owner, visibility, or Workspace authority.
- Verify long email/company values wrap without page-level horizontal scrolling at 320px and 200% zoom.
- Confirm local-server language remains: **“LOCAL SERVER · CRM leads, pipeline movement, visibility, and activities are persisted locally.”** No production provider, billing, analytics, automation, or deployment claims should be added.

## Deferred and non-blocking

Pipeline configuration UI, pagination, duplicate-lead handling, richer activity types, analytics, billing, automation, production providers, deployment, and exhaustive governance remain outside this smallest usable local slice unless separately authorized.

## Final gate decision

**ACCEPT for CRM-core Graphics/UX delivery.**

The updated checkpoint reports the three prior correction groups closed, with 11/11 CRM PostgreSQL tests, 78/78 serial integration tests, and the primary Playwright journey covering validation focus, create/detail, 409 draft-preserving reload, Won dialog/Escape/focus, stage movement, note failure/retry/timeline, search, desktop Pipeline, 320px mobile Pipeline navigation/overflow, and direct database persistence.

Remaining work such as pipeline configuration, pagination, duplicate handling, richer activity types, analytics, billing, automation, providers, and deployment remains intentionally deferred and is not a CRM-core release blocker.
