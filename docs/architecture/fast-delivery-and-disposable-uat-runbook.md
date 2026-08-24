# Fast delivery and disposable UAT runbook

Date: 2026-08-24  
Status: proposed forward-looking authority; effective only after Product accepts it  
Scope: NexaFlow development, integration, and UAT; production is excluded

## Decision

Use risk-tiered evidence, parallel independent reviews, one shared server authority, one immutable combined candidate, and a wholesale disposable-UAT rebuild. Run the full affected gate once on the highest-risk immutable checkpoint. Reuse exact prior evidence when the relevant files and dependencies are byte-identical; do not rerun unchanged full suites for every review or docs/test-only follow-up.

This accelerates delivery without relaxing identity, Session, Workspace, Membership, RBAC, Ownership, Audit, entitlement, token, cache, CSP, transaction, or tenant-isolation contracts.

## Risk tiers and minimum gates

| Tier | Change | Mandatory local/integration evidence | Required review | Target elapsed time* |
| --- | --- | --- | --- | ---: |
| T0 | Documentation or test-only | Diff/scope check; document links or focused changed tests; for DB/browser fixtures, deterministic same-database/order proof and residue cleanup | Owning reviewer; Architecture only for an Architecture record or authority change | 15–30 min |
| T1 | Presentation-only | Diff check, lint, TypeScript, production build, focused component/browser accessibility and responsive evidence; visual baselines only for changed surfaces | Graphics/UX; Architecture only when shell, navigation, Workspace context, security copy, forms, or server/client boundaries are affected | 30–90 min |
| T2 | Bounded server authority/API/security | T1 static gates plus focused unit, route and PostgreSQL tests; success, denial, rollback, concurrency where relevant, Audit cardinality, privacy and zero-mutation negatives | Backend/Security and Architecture independently, in parallel, against the same immutable candidate | 90–180 min |
| T3 | Schema or migration | T2 gates plus fresh migration from zero, immediate no-op rerun, forward rehearsal, conflict/atomic rollback, existing-data preservation if applicable, database health, and the full serialized DB suite once | Backend/Security and Architecture | 2–4 h |
| T4 | Caddy, Compose, email/provider, secrets, DNS/TLS, deployment tooling, or security edge | Exact config render/adapt/validate; focused direct and public-edge positive/negative probes; secret-safe logs; rollback/rebuild proof; affected application gates only | Infrastructure/Operations, Backend/Security, and Architecture | 2–4 h plus authorized access |

*Measured from a clean immutable candidate with its handoff/evidence ready and reviewers available. A combined change inherits the highest tier and adds only the focused gates of lower-tier surfaces.

Escalate to Product when a target is exceeded by 50%, the same failure recurs twice, or scope expands tiers. The response is to split scope, assign the owning role, or authorize more time—not to repeat the same full suite without a causal hypothesis.

## Evidence reuse

Prior evidence may be reused only when all of the following are true:

1. the accepted source and new candidate SHAs are immutable;
2. a diff proves the implementation, migration, configuration, dependencies, and relevant test harness are byte-identical for the claimed boundary;
3. no conflict resolution, generated-file drift, environment/version change, shared fixture contamination, or changed upstream contract affects the result;
4. the evidence was produced in the current release line with the same supported database/browser/runtime profile; and
5. the final integrated checkpoint reruns the minimum gate for every actually changed boundary.

Consequences:

- T0 docs-only changes do not rerun builds, DB, or browser suites.
- T0 test-only isolation changes rerun the changed tests and one affected release-order suite; runtime evidence is reused.
- T1 changes do not rerun the full DB suite when server/migration files are unchanged.
- A full serialized DB or browser suite that passed on the exact runtime candidate is not repeated for each independent review record.
- Any semantic merge conflict, runtime edit, dependency update, migration edit, or unexplained test failure invalidates the relevant reused evidence.

## Authority-first implementation

Before parallel development begins, Architecture and Backend/Security define one typed authority contract covering canonical values, validation, errors, transactions, privacy, Audit, and zero-mutation denial. Implement one shared validator/resolver and require every public page, registration/onboarding route, service, provisioning transaction, and administrative mutation in scope to use it.

Frontend constants are presentation helpers only. They must not grant price, seat, Role, Workspace, Membership, Session, token, or entitlement authority. Invitation registration remains distinct from self-service Owner onboarding: it creates a global User and can gain Membership only through the token-bound invitation acceptance service.

Architecture, Backend/Security, and Graphics may review in parallel when their scopes are independent:

- Architecture reviews boundary compliance and integration/rollback guardrails.
- Backend/Security reviews authorization, transactions, privacy, Audit, concurrency, and denial behavior.
- Graphics reviews copy, responsive behavior, accessibility, theme, and visual continuity.

A review that changes the candidate invalidates other final reviews; diagnosis may proceed in parallel, but final ACCEPT records must name the same immutable candidate.

## Deterministic test prerequisites

- Start each DB release run from an explicitly disposable test database, apply migrations from zero, and rerun migrations as a no-op.
- Seed one canonical full authority fixture; delete or retire conflicting test rows explicitly.
- Run PostgreSQL suites serially when they share a database. Tests must clean namespaced triggers, functions, rows, Sessions, tokens, and external fixtures in `beforeEach` and `finally` as appropriate.
- Start the browser server from the candidate with an owned process, exact hostname/port, and readiness check. Do not reuse an unknown development host.
- Capture browser console, page errors, failed framework assets, hydration errors, and security headers before first navigation.
- Use real provider-independent fixtures locally. UAT uses testers' real email addresses and the configured provider; Mailpit is not part of UAT.
- A flaky aggregate gate is a blocker until a test-only cause is proved and the affected aggregate run is clean.

## Immutable integration fast path

1. Development produces one clean immutable candidate and concise handoff with exact base, scope, commands, results, and known limitations.
2. Required reviewers issue ACCEPT on that exact SHA. Product then separately authorizes integration.
3. Integration starts from fresh `origin/main` and applies the accepted commits without modification. Any semantic conflict creates a new candidate and invalidates final acceptance.
4. Record final ancestry, changed-file inventory, migration head, and diff check.
5. Rerun only the integrated gates required by the changed risk tiers. Run the full affected suite once if runtime or migration code changed; reuse byte-identical evidence otherwise.
6. Product authorizes pushing the verified integrated checkpoint to `main`. A main push is not tag or deployment authority.

## Disposable UAT fast path

UAT application data is disposable. No cohort, Session, token, Workspace, CRM record, Audit record, database volume, or previous UAT release data must be preserved. Testers use their real deliverable email addresses. UAT is rebuilt wholesale rather than incrementally repaired.

1. Product authorizes a new immutable UAT identifier and deployment from an exact `main` SHA. Never move or reuse a prior tag; a failed identifier remains retired permanently.
2. Build or pull application/worker images from that exact SHA and record image digests. Version-controlled Compose, Caddy, and provisioning automation may recreate the environment.
3. Destroy and recreate only the positively identified UAT stack, including app/worker/Caddy containers and the UAT database/volume. Production and unrelated Docker resources are never in scope.
4. Generate new UAT secrets or inject them through the approved deployment channel. Secrets are never committed. External DNS/TLS/email automation may recreate its configuration using separately authorized bootstrap credentials.
5. Apply migrations from zero, rerun them as a no-op, start the stack, and require health/readiness. No backup or data-restore rehearsal is required for disposable UAT.
6. Run only the post-deploy smoke below. Do not rerun the full local DB/browser matrix on UAT.

Minimum UAT smoke:

- exact source/image provenance, expected migration head, health/readiness, HTTPS and intended public ports;
- homepage and plan truth, one self-service registration/verification/login/Workspace creation, Owner as seat one, and billing-disconnected copy;
- one real-email invitation registration/verification/login/acceptance, proving no new Workspace/Owner/entitlement for the invitee;
- Personal settings with an active Workspace and the authenticated no-Workspace fallback;
- one seat-cap denial and one tenant-safe cross-Workspace denial with expected Audit and zero mutation;
- CSP/nonce, cache, Referrer-Policy, cookie, redirect and token-privacy probes for the affected routes; and
- bounded logs without secrets, raw tokens, fatal errors, migration drift, repeated delivery failures, or framework asset/hydration failures.

Target: integration checkpoint within 60 minutes of all ACCEPT records; disposable UAT rebuild and smoke within 60–90 minutes of Product deployment authorization, excluding external DNS/provider propagation.

## Stop, rollback, and authority boundaries

Stop integration or UAT admission on:

- ambiguous candidate ancestry, dirty scope, mutable/moved tag, unreviewed conflict, or image/SHA mismatch;
- migration failure/drift, unhealthy services, secret disclosure, provider/TLS failure, or unexpected public exposure;
- catalog/entitlement/Role/Workspace inconsistency, unexpected tenant authority, Audit mismatch, or any failed zero-mutation denial;
- token in URL/body/history/storage/log/Audit/plaintext cookie, or weakened CSP/cache/referrer/cookie policy;
- invitation creating a Workspace/Owner/subscription, self-service creating multiple Workspaces, cross-tenant access, or failed seat enforcement; or
- failed smoke, hydration/framework asset failure, or unexplained release-order contamination.

Because UAT is disposable, rollback is a clean destroy/rebuild from the last accepted immutable image or a corrected new identifier. Database restoration and cohort preservation are not required. Retain non-secret provenance and deployment results.

Authorization is explicit and separate:

- Development may prepare candidates and evidence.
- Architecture and Backend/Security may ACCEPT an immutable candidate but cannot push `main`, tag, or deploy.
- Product authorizes each `main` integration/push, each immutable UAT tag/artifact, and each UAT deployment/tester admission.
- Operations executes only the authorized UAT scope.
- Production always requires a separate Product decision, production-specific Architecture/Backend/Security review, data-preservation/backup/rollback plan, provider/secrets approval, and deployment authorization. This runbook never authorizes production.

