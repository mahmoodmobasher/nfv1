# NexaFlow project status

Status date: 2026-08-30. Supersedes the 2026-08-29 status (the one that stopped at
`1237a93`/`uat56`).

## Current authority

- `main` at `d864abf`. `origin/main` matches.
- UAT runs `d864abf-uat58`, healthy, migration ledger 28, head
  `0027_default_sales_pipeline_backfill`. No migration in any release since `0027`.
- Test baseline: **970 passed, 12 failed, 9 skipped** across 122 files (at `d864abf`). The
  12 are the same documented known-red set as before; the count grew from 967 with three
  more regression tests added across the two blockers below.
- Since `1237a93`/`uat56`, a further browser walk (`UAT-WALK-FINDINGS-2026-08-29.md`,
  third session) found two more real defects — both now fixed, merged, and verified live
  — plus two smaller Phase-4-scope items still open. One additional finding in that
  document was investigated and turned out to be **void, not a defect** (see below).

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

## Sixth blocker — the conversion panel showed stale eligibility after a lifecycle change

`LeadDetailWithConversion` renders `LeadLifecycleControl` and `LeadConversionPanel` as
unconnected siblings. `LeadLifecycleControl` calls `router.refresh()` on a successful
transition, re-fetching the server Lead — but `LeadConversionPanel`'s preview effect was
keyed only on `[workspaceId, leadId]`, both constant across a lifecycle change. Qualifying
a Lead in-page left the panel reading "not available: the canonical Lead lifecycle must be
Qualified" until a full page reload; the server was correct throughout.

Fixed by passing `lead.version` down as `leadVersion` and adding it to the effect's
dependency array, so a real transition (which always increments Lead version) drives a
fresh fetch. Covered by a behavioral test (`react-dom/client` + stubbed `fetch`, added
`jsdom` as a devDependency since none existed) rather than the source-text assertions the
original regression test used — a source-text assertion would have passed even with the
mechanism broken. Merged `4a5add3`, deployed `uat57`, verified live.

## Seventh blocker — a primary Contact was effectively required, not optional, on conversion

A Lead whose identity review created a Contact could not be converted with Primary Contact
left at "No primary Contact," even though the UI offers that choice and describes it as a
supported atomic effect. `convert-lead-to-deal.orchestrator.ts`'s pre-commit guard required
`command.primaryContact` to equal the reviewed Contact whenever the review had bound one;
omitting it made two comparisons fail and the whole command fell into a generic
`stale_preview` rejection that read as a race and invited endless retries.

Product decision (2026-08-29): a primary Contact is optional on a converted Deal — the
dismiss-candidates path already produces contactless Deals, so this was already a
supported shape everywhere except when the review happened to create a Contact. Fixed by
scoping the Contact check to only fire when `command.primaryContact` is actually supplied
(absence always allowed; a supplied value still validated against id and version exactly
as before), and giving a rejected supplied Contact its own `primary_contact_mismatch` code
instead of the generic `stale_preview`. Merged `d864abf`, deployed `uat58`, verified live
on `Mobasher UAT Lead 05` — converted contactless after refusing five times on `uat57`.

## A finding that turned out to be void

The same walk also produced a report that a Deal closed Lost didn't settle its Lead,
based on reading the CRM home dashboard tiles. It was wrong: the premise (what the tiles
read *before* the walk) was never verified against the `leads` table, and a wrong baseline
made a correctly-settling Lead look unsettled. Direct SQL against `leads` showed the
settlement, the lineage, and the dashboard aggregation were all correct throughout —
nothing was changed as a result. Full account in `UAT-WALK-FINDINGS-2026-08-29.md` #1.
**The lesson: a rendered aggregate is a claim about the data, not the data — query the
owning table before writing a hypothesis down, not after.**

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
| 14 | Conversion panel showed stale eligibility after a lifecycle change | See "Sixth blocker" above |
| 15 | A primary Contact was effectively required on conversion, not optional | See "Seventh blocker" above |

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

1. **Phase 4**, in order: Lead detail surface (settled outcome display, `FactsGrid`
   phantom cell, rename the misnamed "Pipeline and responsibility" panel) → dashboard
   lifecycle funnel (aggregation confirmed correct — additive; also ignore unrecognized
   query params instead of failing the dashboard closed) → Leads-list lifecycle filter
   (not small — keyset pagination cursor encodes active filters, eight existing tests
   assert cursor stability, read those first) → Lead timeline backfill (#7).
2. Resolve the remaining pending identity reviews and walk more Leads through the arc as
   Phase 4 lands. Six remain `identity_review_status='pending'`: `Mobasher UAT Lead 02`,
   `03`, `04`, `06`, `07`, `09`. Do not use `Lead 08` — stranded, forward-only fix does
   not repair it.
3. Phase 5: retire `leads.stage_id` from Lead views.

## Decisions settled 2026-08-30 — no longer open

- **Members and identity reviews: current behaviour ratified, no code change.** A Member
  may resolve a review by creating or dismissing, never by linking to an existing Contact
  or Company — the role gate already in
  `resolve-lead-identity-review.orchestrator.ts` and already covered by
  `tests/p1a-manual-intake.integration.test.ts` ("allows an assigned-visible Member to
  create identities but never link existing"). Deliberate: creating a new record is
  low-risk, while linking binds a Lead to an existing customer record the Member may not
  be authorized to view — a disclosure question, not just a permissions one. **Phase 4's
  Lead detail surface work must respect this gate, not widen it.**
- **Backfill for `Mobasher UAT Lead 08` and other pre-`74936d5` legacy-p1a-root-v1
  records: forward-only, no migration, no UI adoption action.** These records exist only
  as UAT dummy data; this code never shipped past UAT, so there is nothing real to
  rescue. A migration writing `authority_contract_version` plus synthesized identity
  points and affiliations would be risk against customer identity records for no benefit,
  and contradicts the existing design, which deliberately offers no adoption or backfill
  action. `Lead 08` stays stranded and must not be used to test conversion (see
  `CURRENT-UAT.md`). If a real customer hits this shape post-launch, write the migration
  then, against real data.
- **`design-system-components.test.tsx`: deleted, own commit.** It asserted `ds-*` class
  names that exist nowhere since the Tailwind migration — it tested a design system that
  no longer exists. Rewriting it to assert Tailwind classes would recreate the same
  anti-pattern (coupling tests to markup shape) that made it rot in the first place, and
  this project has been bitten repeatedly by tests that assert shape rather than
  behaviour. New baseline after deletion: **970 passed, 6 failed, 9 skipped across 121
  files** — the remaining 6 are `phase4-identity-boundary.test.ts` (4),
  `phase4-invitation-boundary.test.ts` (1), `contact-spectrum-migration.test.tsx` (1).
  If component-level coverage is wanted later, write it fresh as behaviour and
  accessibility assertions (roles, labels, keyboard) — not class names.

## Holds

- `main` now contains this work as of `d864abf`. Production deploy from `main` is a
  separate, not-yet-taken step — nothing beyond UAT has been deployed.
- The `Documentation/handover/` folder is a **separate, untracked** handover set from the
  earlier multi-chat program (2026-08-27/28). It is not in Git, predates this work, and is
  superseded by this file for current state. Commit or delete it deliberately.

## Working model

The owner runs all Git and deploy commands; sessions supply exact copy-pasteable commands
rather than driving the repo or the host. Keep explanations brief.
