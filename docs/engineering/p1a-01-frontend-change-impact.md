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
- Adds a deterministic backend-authoritative transport drift gate. It compares the frontend's transport-only runtime schemas with the backend command, queue, detail, capability, reconciliation and stable-error schemas, including JSON-schema constraints, nullable fields, refinements and negative drift fixtures.
- Maps every currently exposed canonical validation path to a real control with a stable inline-error identifier, `aria-describedby`, one focused summary and an explicitly tested safe form-level fallback.
- Authentication loss, permission loss and unavailable/not-found responses now unmount protected Lead/candidate detail, clear decision state and focus one generic access-change alert.
- CSV/XLSX, public adapters, merging, conversion, routing automation and broad Contact/Company workspaces remain absent.

## Executed remediation evidence

- `npm run lint`: passed, zero ESLint errors.
- `npx tsc --noEmit`: passed, zero TypeScript errors.
- `npm test`: 299 passed, 207 integration-gated tests skipped across 34 passed and 23 skipped files.
- `npm run test:integration`: 206 passed, one performance test skipped across 22 passed and one skipped file. The first sandboxed attempt could not open the local PostgreSQL socket; the permitted rerun passed. No performance result is claimed.
- `npm run build`: passed with Next.js 16.3.1; 42 static pages generated and all dynamic routes traced.
- `npx playwright test --config=playwright.p1a-production.config.ts`: 14/14 passed against the freshly built application, one worker, no retries. The runner uses synthetic local fixture settings and a disposable local database; it is not deployment or UAT evidence.

The browser matrix executed retry identity, new-inquiry timestamp/key rotation, replay/double-submit protection, held routing, edited-body key rotation, every current canonical field path, error focus/announcement/clearing, conditional social attribution, safe Resolve/Hold decision copy, authority-loss clearing, stale candidate/refetch/reselection, 320px at 200% zoom, empty and populated queue cursor recovery, dark/forced-colour/reduced-motion behavior, keyboard focus and console-error checks present in the journeys. Unit/contract tests additionally execute all nine atomic Contact/Company action combinations, Owner/Member capability matrices, transport drift negatives and modular client/server boundaries. Unexecuted combinations are not claimed.

Clean built-app screenshots (no development overlay):

- `test-results/p1a-frontend-journeys-a-re-01f2c-ted-without-a-second-action/manual-intake-replayed-committed.png`
- `test-results/p1a-frontend-journeys-back-c35ca-nd-clear-every-real-control/manual-intake-server-field-errors.png`
- `test-results/p1a-frontend-journeys-soci-3379d-bounded-attribution-context/manual-intake-social-attribution-success.png`
- `test-results/p1a-frontend-journeys-iden-cb3e8-separates-Hold-from-Resolve/identity-review-safe-decision.png`
- `test-results/p1a-frontend-journeys-auth-8f4a6-d-focuses-the-generic-state/identity-review-authority-loss.png`
- `test-results/p1a-frontend-journeys-P1A--c9846-without-horizontal-overflow/manual-intake-320px-zoom200.png`
- `test-results/p1a-frontend-journeys-P1A--37a9c--colours-and-reduced-motion/manual-intake-dark-forced-reduced.png`

## Risks and rollback

The transport definitions remain physically separate because importing backend executable schemas into client-reachable code violates the modular boundary. The deterministic backend-authoritative drift gate is therefore the chosen architecture option and must remain a required fast gate whenever either transport changes. Visual assertions are deterministic browser interactions plus captured evidence, not pixel-diff snapshots. The database performance tier remains deliberately skipped by its existing gate.

Rollback is the new remediation commit on top of `cd9b1fc`. The incorporated accepted backend chain must not be reverted as part of a frontend rollback.

## Future Product record (not implemented)

Pipeline drag/drop with an equal accessible Change-stage alternative, and replacement of the duplicate authenticated Account control with direct Sign out, remain future scope. Both require Product-approved Graphics mockups and Architecture review before implementation.
