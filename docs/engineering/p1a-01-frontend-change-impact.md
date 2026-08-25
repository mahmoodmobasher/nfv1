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

Rollback is the single frontend candidate commit. The incorporated accepted backend chain must not be reverted as part of a frontend rollback.
