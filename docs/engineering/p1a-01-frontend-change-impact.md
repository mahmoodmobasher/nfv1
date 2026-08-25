# P1A-01 frontend change-impact record

## Scope and authority

This slice composes the accepted `lead-inquiry-intake.v1` and protected identity-review presentation contracts. The server remains authoritative for Workspace scope, visibility, identity matching, lifecycle, assignment, capabilities, deduplication, concurrency and resolution. No frontend code imports persistence, schema or authorization evaluators.

## Routes and traces

| User route | Read/write trace | Result states |
| --- | --- | --- |
| `/crm/leads/new` | server bootstrap -> `POST /api/workspaces/:workspaceId/leads` | committed, replayed, held, validation, denied and retry-safe failure |
| `/crm/identity-reviews` | protected queue loader -> `GET /api/workspaces/:workspaceId/identity-reviews` | loading, empty, populated, stale marker, denied/retry failure and cursor paging |
| `/crm/identity-reviews/:leadId` | protected detail loader -> `GET/POST /api/workspaces/:workspaceId/leads/:leadId/identity-review` | safe no-detail, masked candidates, Hold, atomic Resolve, replay, stale refetch, denied and retry-safe failure |

## Impact

- Replaces only the new-Lead composition; existing Lead reads and CRM shell remain intact.
- Adds Identity review navigation and feature-scoped responsive, forced-colour and reduced-motion styles.
- Source and intake channel are separate; approved social platforms and organic/paid/unknown are represented.
- Candidate fixtures contain masked values only. Controls follow server capability flags.
- CSV/XLSX, public adapters, merging, conversion, routing automation and broad Contact/Company workspaces remain absent.

## Rollback

Executed remediation gates are TypeScript, ESLint, strict transport parity/drift tests, frontend dependency gates, interaction tests, the repository Vitest suite, database integration suite, production build and six authenticated Playwright journeys. Browser coverage includes intake validation/focus and retry identity, new-inquiry timestamp/key rotation, masked decision/Hold-only transport, effective 320px at 200% zoom with overflow/keyboard checks, queue filter/reset context, and dark/forced-colour/reduced-motion semantics. Screenshots are emitted by Playwright for the safe decision, narrow intake and forced-colour journeys. Unexecuted combinations are not claimed.

Rollback is the remediation commit on top of `3dee846`. The incorporated accepted backend chain must not be reverted as part of a frontend rollback.

## Future Product record (not implemented)

Pipeline drag/drop with an equal accessible Change-stage alternative, and replacement of the duplicate authenticated Account control with direct Sign out, remain future scope. Both require Product-approved Graphics mockups and Architecture review before implementation.
