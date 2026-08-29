# NexaFlow project status

Status date: 2026-08-29. Supersedes the 2026-08-27 status.

## Current authority

- Working branch `design-system-consistency-local`, pushed to `design-system-consistency`,
  head `a3aacc0`. **Not merged to `main`.** Merging it is an open decision.
- **Unmerged fix branch `fix/identity-review-canonical-contacts`, head `00c2395`, off
  `a3aacc0`. Not pushed, not on UAT.** See "Fourth conversion blocker" below.
- UAT runs `d1610aa-uat54` and is healthy, but does **not** contain that fix.
- Migration ledger 28; head `0027_default_sales_pipeline_backfill`.
- Test baseline: 966 passed, 12 failed, 9 skipped across 122 files (at `00c2395`).

## Fourth conversion blocker — found by walking UAT, fixed, not yet deployed

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
Lead whose Contact and Company were both created during review.

**The fix is forward-only.** Records created before it stay stranded; whether to backfill
them is an open decision. `Mobasher UAT Lead 08`
(`f1f7ecc7-7ec1-4ec8-9004-969716215e2c`) is one such stranded Lead on UAT.

## What changed in this run

The lead lifecycle was **structurally present in the database but inert in the
application**. A Lead could be created and then never moved. That is why the CRM home
dashboard's Won/Lost tiles always read `0` — not a display bug, but the absence of any
code path that could produce a non-zero value.

It now runs end to end:

```
intake → identity review RESOLVED → new → working → qualified → convert → Deal
       → Deal closes → Lead outcome settles
```

with disqualification (reason required) available from any live state, and reopen
restricted to owner and admin.

## Findings closed

| # | Finding | Resolution |
|---|---|---|
| 1 | Nothing wrote lifecycle past `new` | `transition-lead-lifecycle` orchestrator with an exhaustive transition map |
| 2 | Lead→Deal conversion unreachable | Reachable; the test fixture's raw-SQL `qualified` shortcut deleted because the real path works |
| 3 | `won`/`lost` unreachable | Derived from Deal outcomes, with a manual-override guardrail |
| 4 | No state machine | `ALLOWED_LEAD_LIFECYCLE_TRANSITIONS`, enforced server-side and rendered client-side |
| 6 | Legacy PATCH ignored the role model | A Member could change status, stage, owner and visibility on pre-P1A Leads; now gated |
| 9 | Migration journal drift | Per-migration suites scoped to their own entry; one canonical journal gate |
| 10 | **No workspace could ever convert a Lead** | Provisioning never created a Deal pipeline and no surface creates one; seeded + backfilled by `0027` |
| 11 | Defects shipped to UAT unnoticed | The suite being run excluded 72 of 122 files |

Finding **#5 was withdrawn**: `canDiscloseLead` is deliberately narrower than
`visibleLeadIds` because it guards identity-review PII. Acting on it caused 11 failures
and was reverted in `ff63bc7`. **Do not reconcile those two predicates.**

Findings **#7** (incomplete Lead timeline) and **#8** (no RLS) remain open.

## The most important lesson

Conversion was dead for **three independent reasons stacked behind each other**, each
invisible until the one in front was fixed: nothing set `qualified`; conversion required
`qualified`; and no workspace had a Deal pipeline at all. The third had been true of every
workspace NexaFlow ever created and was only found by driving real data through the UI.

When a feature appears dead, expect more than one cause.

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
  its keywords. A comment saying "cannot join one retroactively" registers a table called
  `one`; the word "joins" registers `s`; a user-facing string "not allowed from the
  current state" registers `the`; a local variable named `from` registers whatever follows
  it. Four defects came from this. Run the scanner's regex over a diff before the suite.
- **A new mutation must be enrolled in four platform registries**, two of which are
  invisible to `tsc` and fail only at execution. See the project doc, "Platform registries".
- **Module ownership**: leads owns `leads`; sales owns `deals` **and**
  `lead_deal_conversion_lineage`. Cross-module work goes through participants.
- **`drizzle-kit generate` must run on macOS** — it needs a native esbuild binary.

## Recommended next sequence

1. Merge and deploy `fix/identity-review-canonical-contacts`, then walk the full arc on
   UAT on a *fresh* pending Lead (identity review → convert → close won → confirm
   outcome). Seven Leads remain pending; do not use the stranded one named above.
2. Phase 4: dashboard funnel, Leads-list lifecycle filter, timeline backfill (#7),
   `FactsGrid` phantom cells and the misnamed "Pipeline and responsibility" panel.
3. Phase 5: retire `leads.stage_id` from Lead views.
4. Decide the fate of the 12 red tests.
5. Decide whether to merge `design-system-consistency` to `main`.

## Holds

- Nothing in this run is merged to `main`.
- Production untouched.
- The `Documentation/handover/` folder is a **separate, untracked** handover set from the
  earlier multi-chat program (2026-08-27/28). It is not in Git, predates this work, and is
  superseded by this file for current state. Commit or delete it deliberately.

## Working model

The owner runs all Git and deploy commands; sessions supply exact copy-pasteable commands
rather than driving the repo or the host. Keep explanations brief.
