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
- Adds a deterministic backend-authoritative transport drift gate. It compares frontend transport-only runtime schemas with backend command, queue, detail, capability and reconciliation schemas; enforces exact TypeScript parity for backend-produced intake and decision results; parses every backend-produced stable error, validation-detail and conflict-navigation branch; and executes positive/negative parity matrices for every current custom refinement.
- Maps every currently exposed canonical validation path to a real control with a stable inline-error identifier, `aria-describedby`, one focused summary and an explicitly tested safe form-level fallback.
- Authentication loss, permission loss and unavailable/not-found responses now unmount protected Lead/candidate detail, clear decision state and focus one generic access-change alert.
- CSV/XLSX, public adapters, merging, conversion, routing automation and broad Contact/Company workspaces remain absent.

## Executed remediation evidence — pass 3

- `npm run lint -- --quiet`: passed, zero ESLint errors.
- `npx tsc --noEmit`: passed, zero TypeScript errors.
- `npx vitest run tests/p1a-frontend-transport-contract.test.ts tests/p1a-frontend-interaction.test.ts tests/p1a-manual-intake-form.contract.test.ts tests/p1a-frontend-boundary.test.ts`: 34/34 passed across four files.
- `npm test`: 303 passed, 207 integration-gated tests skipped across 34 passed and 23 skipped files.
- `RUN_DB_INTEGRATION=1 npx vitest run tests/p1a-manual-intake.integration.test.ts tests/p1a-presentation-route.integration.test.ts --no-file-parallelism --maxWorkers=1`: proportional P1A integration gate passed 41/41 across two files. The prior pass-2 full integration gate remains 206 passed with one existing performance test skipped; pass 3 did not repeat unrelated integration tiers and makes no performance claim.
- `npm run build`: passed with Next.js 16.3.1; 42 static pages generated and all dynamic routes traced.
- `npx playwright test --config=playwright.p1a-production.config.ts`: 22/22 passed against the freshly built application, one worker, no retries. The runner uses synthetic local fixture settings and a disposable local database; it is not deployment or UAT evidence. An earlier development-server run was 21/22 because a new assertion matched the Next route announcer as well as the intended error summary; the selector was narrowed and its focused rerun passed before the clean built-app run.

The browser matrix additionally binds rate-limited/unexpected same-key retry, post-conflict key rotation, invalid-match/assignment refetch and selection clearing, all three decision authority-loss codes, authentication/not-found during GET refresh, focused generic access-change state and tenant-safe initial no-detail. The earlier intake, queue, responsive/theme and accessibility journeys remain green. Unit/contract tests bind every backend stable error to a deterministic UI disposition and cover exact result-type parity, complete error branches, all current attribution/candidate/version/summary/capability/stale/navigation refinements, all nine atomic Contact/Company combinations, Owner/Member capability matrices and modular client/server boundaries. Unexecuted combinations are not claimed.

Clean built-app screenshots (no development overlay):

- `test-results/p1a-frontend-journeys-a-re-01f2c-ted-without-a-second-action/manual-intake-replayed-committed.png`
- `test-results/p1a-frontend-journeys-back-c35ca-nd-clear-every-real-control/manual-intake-server-field-errors.png`
- `test-results/p1a-frontend-journeys-soci-3379d-bounded-attribution-context/manual-intake-social-attribution-success.png`
- `test-results/p1a-frontend-journeys-iden-cb3e8-separates-Hold-from-Resolve/identity-review-safe-decision.png`
- `test-results/p1a-frontend-journeys-deci-af35c-d-focuses-the-generic-state/identity-review-authentication_required.png`
- `test-results/p1a-frontend-journeys-deci-91c54-d-focuses-the-generic-state/identity-review-permission_required.png`
- `test-results/p1a-frontend-journeys-deci-b19d2-d-focuses-the-generic-state/identity-review-resource_not_found.png`
- `test-results/p1a-frontend-journeys-P1A--c9846-without-horizontal-overflow/manual-intake-320px-zoom200.png`
- `test-results/p1a-frontend-journeys-P1A--37a9c--colours-and-reduced-motion/manual-intake-dark-forced-reduced.png`

## Risks and rollback

The transport definitions remain physically separate because importing backend executable schemas into client-reachable code violates the modular boundary. Exact backend/frontend result-type parity plus backend-produced error matrices and executable runtime refinement parity are therefore required fast gates whenever either transport changes. Visual assertions are deterministic browser interactions plus captured evidence, not pixel-diff snapshots. The database performance tier remains deliberately skipped by its existing gate.

Rollback is the pass-3 remediation commit on top of `514e2f54311ec30ddde3056026674114824bcb87`. The incorporated accepted backend chain and accepted pass-2 frontend commit must not be reverted as part of a narrower rollback.

## Future Product record (not implemented)

Pipeline drag/drop with an equal accessible Change-stage alternative, and replacement of the duplicate authenticated Account control with direct Sign out, remain future scope. Both require Product-approved Graphics mockups and Architecture review before implementation.
