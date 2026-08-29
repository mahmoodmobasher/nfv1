# Continuation prompt for a new session

Continue NexaFlow in `/Users/moemahmood/builder_code/Nexflow_v1`.

Before acting, read `AGENTS.md`, `docs/handover/PROJECT-STATUS.md`, and
`docs/release/CURRENT-UAT.md`. If the session is attached to the **NexaFlow claude.ai
project**, also read the project doc `claude/lead-lifecycle-spec.md` — it is the deep
specification for the lead lifecycle and carries the reasoning, the rejected options and
the traps, which this file only summarises. Verify Git status and local/origin SHAs
before trusting any of it.

## Authority snapshot (2026-08-29)

- Working branch: `design-system-consistency-local`, pushed to `design-system-consistency`.
  Head `d1610aa`. **This work is not merged to `main`.**
- UAT: `/opt/nexaflow/uat/releases/d1610aa-uat54`, image `nexaflow:d1610aa-uat54`, healthy.
- Migration ledger: 28 entries; head `0027_default_sales_pipeline_backfill`.
- UAT database is `nexaflow_uat`, not `nexaflow`.

## What was delivered in the last run

The lead lifecycle, which was previously **inert** — a Lead could be created and then
nothing could ever happen to it. Now: intake → identity review → `new` → `working` →
`qualified` → convert → Deal → Deal closes → the Lead's outcome settles itself. Or the
Lead is disqualified with a recorded reason and can be reopened by an owner or admin.

Nine audit findings closed. Details and evidence in `PROJECT-STATUS.md`.

## How to run the tests — read this first

`npm run test:integration` runs **only** `tests/*.integration.test.ts`, which is 50 of
the 122 test files. Treating that as the whole suite hid three real defects that shipped
to UAT twice in the last run.

```
RUN_DB_INTEGRATION=1 npx vitest run --no-file-parallelism --maxWorkers=1
```

The serialization flags are mandatory: the integration suites share one database and
truncate in their hooks, so parallel workers deadlock and emit misleading
`Hook timed out` failures.

**Baseline at `d1610aa`: 965 passed, 12 failed, 9 skipped.** The 12 are pre-existing and
listed in `PROJECT-STATUS.md`. Do not treat them as new breakage, and do not let them
train you to ignore red.

## Recommended next work

1. **Walk the arc on UAT** before building more. Resolve an identity review, convert the
   Lead, close the Deal as won, confirm the Lead settles to `won`. Three separate blockers
   were found only by driving real data through; expect a fourth.
2. **Phase 4** — dashboard lifecycle funnel, Leads-list lifecycle filter, timeline
   backfill, and the `FactsGrid` phantom-cell fix. Note the lifecycle filter is not small:
   the list uses keyset pagination whose cursor encodes active filters, with eight tests
   asserting cursor stability.
3. **Phase 5** — retire `leads.stage_id` from Lead views and plan its removal.
4. **Decide on the 12 red tests**, especially `design-system-components.test.tsx`, which
   asserts `ds-*` class names that no longer exist anywhere in the design system.

## Two decisions left open for the product owner

- Should Members be able to resolve identity reviews? That gate currently sits between a
  Member qualifying a Lead and anyone converting it.
- Rewrite or delete the permanently-red design-system test file.

## Working model that suited this owner

Give exact, copy-pasteable commands and let the owner run them; do not drive Git or the
deploy host directly. Keep explanations short. State plainly when something you did was
wrong rather than quietly correcting it.
