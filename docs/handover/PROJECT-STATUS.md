# NexaFlow project status

Status date: 2026-08-29. Supersedes the earlier 2026-08-29 status (the one that stopped
at the unmerged `00c2395` fix).

## Current authority

- `design-system-consistency-local`, pushed to `design-system-consistency`, head
  `1237a93`. **Merged to `main`.**
- `main` merged `design-system-consistency-local` at `1237a93` (26 commits, 75 files since
  the prior `main` head `1843381`). The merge brings the full branch — lead lifecycle,
  conversion, both fixes below, and the earlier design-system-consistency visual/authz
  work (CRM home Direction A, legacy-PATCH role enforcement, migrations `0026`/`0027`) —
  not a lifecycle-only subset.
- UAT runs `1237a93-uat56`, healthy, migration ledger 28, head
  `0027_default_sales_pipeline_backfill`.
- Test baseline: **967 passed, 12 failed, 9 skipped** across 122 files (at `1237a93`). The
  12 are the same documented known-red set as before; the count is 967 not 966 because a
  regression test was added for the second blocker below.

## The arc walked end to end, for real, for the first time

`Mobasher UAT Lead 01` went `intake → identity review resolved (Create new contact +
Create new company) → new → working → qualified → convert → Deal → Deal closed won →
Lead outcome settled to won`, entirely through the UI, with `status_source='system'`.
Two blockers were found and fixed doing this; both are now on UAT and on `main`.

## Fourth conversion blocker — identity-review Contacts were legacy records

Identity review's "Create new contact" decision wrote Contacts through the legacy P1A
repositories, which leave `authority_contract_version` at `legacy-p1a-root-v1` and write
neither `contact_identity_points` nor a `contact_company_affiliations` row. Conversion's
primary-contact check requires `customer-graph-v1` plus an active primary affiliation, so
every Lead whose Contact came from identity review was permanently unconvertible and
surfaced as a read-only "legacy record" with no adoption path. Same for "Create new
company".

The suite missed it because `lead-conversion-01-backend.integration.test.ts` pre-seeded a
canonical Company by raw SQL and dismissed the Contact — the create path real data uses
was never exercised. **A green suite proved the fixture, not the product.**

Fixed in `00c2395` by adding `customerGraphIdentityResolutionParticipant` to the
customer-graph module (which owns those tables, satisfying the SQL-ownership scanner) and
calling it from the identity-review orchestrator, plus an integration test that converts a
Lead whose Contact and Company were both created during review. Merged in `74936d5`,
deployed as `uat55`.

**The fix is forward-only.** Records created before it stay stranded; whether to backfill
them is still an open decision. `Mobasher UAT Lead 08`
(`f1f7ecc7-7ec1-4ec8-9004-969716215e2c`) is the confirmed stranded Lead on UAT — its
Contact (`f83d9220-b8d8-4432-8527-1be99dcdbbb7`) stays `legacy-p1a-root-v1`.

## Fifth blocker — the Deal pipeline could never render once it had real data

Converting Lead 01 worked — the fourth blocker's fix held — but `/crm/deals` and
`/crm/deals/board` then failed with **"Deals are temporarily unavailable" / "The request
could not be completed."** The server returned 200 with valid data every time; the app
logs showed nothing.

**Cause.** `deal.service.ts`'s `pipeline()` query selects `pipeline_id "pipelineId"` into
every stage row (the `Stage` TS type declares it), but the *published* zod contract for a
stage — mirrored identically, both `.strict()`, in the backend contract
(`deal.contract.ts`, the source of truth a transport-parity test compares the frontend
against) and the frontend mirror (`deal.contracts.ts`) — never declared that field.
`.strict()` rejects any object with an unrecognized key, so `salesPipelineViewV1Schema`
failed to parse on the very first stage of every response. The client's fetch hook treats
a schema-parse failure identically to a network failure: generic `unexpected_error` →
the message above. This also broke the Board view, which extends the same `stage` schema.

It went undetected because it can only fire once a workspace has both a real pipeline
*and* a live browser hitting the Deals screens — which had never happened before this
session, since conversion itself was blocked by the fourth blocker until `uat55`.

Fixed in `e87040c` by adding `pipelineId: uuid` to the shared `stage` schema in both
contracts, updating two stale test fixtures that predated the gap, and adding an
integration test (`deals-01-backend.integration.test.ts`) that calls `getSalesPipeline`
against a seeded pipeline and asserts the real output parses against the published
contract — confirmed to fail with `Unrecognized key: "pipelineId"` before the fix and pass
after. Merged in `1237a93`, deployed as `uat56`. Verified live: the Deals list rendered,
the Deal closed Won, and Lead 01 settled to `won`.

## What changed in this run (both sessions combined)

The lead lifecycle was **structurally present in the database but inert in the
application**. A Lead could be created and then never moved. That is why the CRM home
dashboard's Won/Lost tiles always read `0` — not a display bug, but the absence of any
code path that could produce a non-zero value. It now runs end to end, verified live on
UAT, not just by tests.

## Findings closed

| # | Finding | Resolution |
|---|---|---|
| 1 | Nothing wrote lifecycle past `new` | `transition-lead-lifecycle` orchestrator with an exhaustive transition map |
| 2 | Lead→Deal conversion unreachable | Reachable; the test fixture's raw-SQL `qualified` shortcut deleted because the real path works |
| 3 | `won`/`lost` unreachable | Derived from Deal outcomes, with a manual-override guardrail |
| 4 | No state machine | `ALLOWED_LEAD_LIFECYCLE_TRANSITIONS`, enforced server-side and rendered client-side |
| 6 | Legacy PATCH ignored the role model | A Member could change status, stage, owner and visibility on pre-P1A Leads; now gated |
| 9 | Migration journal drift | Per-migration suites scoped to their own entry; one canonical journal gate |
| 10 | No workspace could ever convert a Lead | Provisioning never created a Deal pipeline and no surface creates one; seeded + backfilled by `0027` |
| 11 | Defects shipped to UAT unnoticed | The suite being run excluded 72 of 122 files |
| 12 | Identity-review Contacts were permanently unconvertible | See "Fourth conversion blocker" above |
| 13 | Deal pipeline screens crashed once real data existed | See "Fifth blocker" above |

Finding **#5 was withdrawn**: `canDiscloseLead` is deliberately narrower than
`visibleLeadIds` because it guards identity-review PII. Acting on it caused 11 failures
and was reverted in `ff63bc7`. **Do not reconcile those two predicates.**

Findings **#7** (incomplete Lead timeline) and **#8** (no RLS) remain open.

## The most important lesson, twice over

Conversion was dead for three independent reasons stacked behind each other in the prior
run, and a fourth (identity-review Contacts) and fifth (the Deal pipeline contract gap)
surfaced only once the earlier ones were fixed and someone actually drove real data
through the browser. **Every one of these five was invisible to the test suite and to
code review; every one was found only by walking the product on UAT.** When a feature
appears dead, or a green suite says a feature works, expect another cause behind it.

## Known-red tests (12) — pre-existing, not new breakage

| File | Count | Note |
|---|---|---|
| `design-system-components.test.tsx` | 6 | Asserts `ds-*` class names with **zero** occurrences anywhere in the design system; tests a system replaced by the Tailwind migration. Rewrite or delete. |
| `phase4-identity-boundary.test.ts` | 4 | Pre-existing |
| `phase4-invitation-boundary.test.ts` | 1 | Pre-existing |
| `contact-spectrum-migration.test.tsx` | 1 | Pre-existing |

`db-00a-01-platform-audit` is skipped by design outside a dedicated `nexaflow_db00a01*`
database. It is an index/latency benchmark — run before a release, not per change.

## Traps that cost time in this run

- **The SQL-ownership boundary scanner reads comments** and allows zero whitespace after
  its keywords. Run its regex over a diff before the suite.
- **A new mutation must be enrolled in four platform registries**, two of which are
  invisible to `tsc` and fail only at execution.
- **Module ownership**: leads owns `leads`; sales owns `deals` **and**
  `lead_deal_conversion_lineage`. Cross-module work goes through participants.
- **`drizzle-kit generate` must run on macOS** — it needs a native esbuild binary.
- **A `.strict()` zod schema mirrored by hand on both sides of a contract can silently
  drift from the actual server response.** Nothing type-checks that a hand-written
  contract matches what a query actually returns; only a live parse of real output would
  have caught the fifth blocker. Consider asserting the published contract against real
  service output in every backend integration suite that has one, the way the new
  `deals-01-backend.integration.test.ts` test now does for `getSalesPipeline`.
- **Deploying to UAT needs a GitHub-authenticated `git clone` on the host**, and the host
  keeps no private key of its own — every prior release was cloned via SSH agent
  forwarding (`ssh -A`) from whoever ran the deploy. `connectssh.sh` does not set `-A`;
  add it by hand, or the clone fails with `Permission denied (publickey)` and every later
  step (build/migrate/switch) silently no-ops against an empty release directory.

## Recommended next sequence

1. Resolve the remaining pending identity reviews and walk more Leads through the arc.
   Seven remain `identity_review_status='pending'`: `Mobasher UAT Lead 02`, `03`, `04`,
   `05`, `06`, `07`, `09`. Do not use `Lead 08` — stranded, forward-only fix does not
   repair it.
2. Decide on backfill for `Lead 08` and any other pre-fix identity-review record (see
   "Fourth conversion blocker").
3. Phase 4: dashboard funnel, Leads-list lifecycle filter, timeline backfill (#7),
   `FactsGrid` phantom cells and the misnamed "Pipeline and responsibility" panel.
4. Phase 5: retire `leads.stage_id` from Lead views.
5. Decide the fate of the 12 red tests.

## Holds

- `main` now contains this work as of `1237a93`. Production deploy from `main` is a
  separate, not-yet-taken step — nothing beyond UAT has been deployed.
- The `Documentation/handover/` folder is a **separate, untracked** handover set from the
  earlier multi-chat program (2026-08-27/28). It is not in Git, predates this work, and is
  superseded by this file for current state. Commit or delete it deliberately.

## Working model

The owner runs all Git and deploy commands; sessions supply exact copy-pasteable commands
rather than driving the repo or the host. Keep explanations brief.
