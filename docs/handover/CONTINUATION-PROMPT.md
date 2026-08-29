# Continuation prompt for a new session

Continue NexaFlow in `/Users/moemahmood/builder_code/Nexflow_v1`.

Before acting, read `AGENTS.md`, `docs/handover/PROJECT-STATUS.md`, and
`docs/release/CURRENT-UAT.md`. If the session is attached to the **NexaFlow claude.ai
project**, also read the project doc `claude/lead-lifecycle-spec.md` — it is the deep
specification for the lead lifecycle and carries the reasoning, the rejected options and
the traps, which this file only summarises. Verify Git status and local/origin SHAs
before trusting any of it.

## Authority snapshot (2026-08-29, third run)

- `design-system-consistency-local`, pushed to `design-system-consistency`, head
  `1237a93`. **Merged to `main`** (`main` was `1843381`; merge brought 26 commits / 75
  files, not a lifecycle-only subset — see `PROJECT-STATUS.md` for what's in it).
- UAT runs `1237a93-uat56`, healthy, migration ledger 28.
- Suite at `1237a93`: **967 passed, 12 failed, 9 skipped.** The 12 are the documented
  pre-existing set, unchanged.
- The lead lifecycle arc has now been walked **end to end in the real UI**, not just by
  tests: `Mobasher UAT Lead 01` went intake → identity review resolved → `new → working →
  qualified` → convert → Deal → Deal closed won → Lead settled to `won`.

## Two blockers found and fixed since the last handover

Both were found only by driving real data through the browser on UAT — neither was caught
by the test suite or by code review. Full detail in `PROJECT-STATUS.md`; summary:

1. **Identity-review Contacts were legacy records** (`00c2395`, merged `74936d5`,
   deployed `uat55`). "Create new contact"/"Create new company" during identity review
   wrote through legacy P1A repositories instead of the customer-graph module, so the
   resulting Contact could never pass conversion's primary-contact eligibility check.
   **Forward-only** — `Mobasher UAT Lead 08` is a confirmed stranded pre-fix record.
   Backfill is still an open product decision.
2. **The Deal pipeline screens crashed once real data existed** (`e87040c`, merged
   `1237a93`, deployed `uat56`). The published Deal-stage contract — mirrored `.strict()`
   on both frontend and backend — never declared the `pipelineId` field the server
   actually puts on every stage row, so every response with a stage failed client-side
   schema validation and surfaced as "Deals are temporarily unavailable," with zero server
   logs because the server never threw.

## Do this next

1. **Walk the remaining Leads through the arc**, or move on to Phase 4/5 work below —
   product's call. Seven Leads still carry `identity_review_status='pending'`:
   `Mobasher UAT Lead 02`, `03`, `04`, `05`, `06`, `07`, `09`. Do **not** use `Lead 08`
   (`f1f7ecc7-7ec1-4ec8-9004-969716215e2c`) — its Contact
   (`f83d9220-b8d8-4432-8527-1be99dcdbbb7`) is stranded pre-fix and the fix does not
   repair it.

   Read UAT data with:
   ```
   sudo docker exec nexaflow-uat-postgres-1 psql -U nexaflow -d nexaflow_uat -c "<sql>"
   ```
   (Don't use `-it`/interactive attach over a non-interactive SSH command — it fails with
   `cannot attach stdin to a TTY-enabled container because stdin is not a terminal`.)

2. **Decide on backfill** for `Lead 08` and any other pre-fix identity-review record.
   Options: a migration adopting identity-review-created `legacy-p1a-root-v1` rows into
   `customer-graph-v1` with affiliations; a UI adoption action; or accept forward-only and
   document it. **Open product decision.**

3. **Phase 4** — dashboard lifecycle funnel, Leads-list lifecycle filter, timeline
   backfill (#7), and the `FactsGrid` phantom-cell fix. The lifecycle filter is not small:
   the list uses keyset pagination whose cursor encodes active filters, with eight tests
   asserting cursor stability.

4. **Phase 5** — retire `leads.stage_id` from Lead views and plan its removal.

5. **Decide the fate of the 12 red tests**, especially `design-system-components.test.tsx`,
   which asserts `ds-*` class names that no longer exist anywhere in the design system.

6. **Consider a production deploy.** `main` now contains this work, but nothing beyond
   UAT has been deployed. That is a distinct, not-yet-taken step.

## How to run the tests — read this first

`npm run test:integration` runs **only** `tests/*.integration.test.ts`, which is 50 of the
122 test files. Treating that as the whole suite hid three real defects that shipped to
UAT twice, in an earlier run.

```
RUN_DB_INTEGRATION=1 npx vitest run --no-file-parallelism --maxWorkers=1
```

The serialization flags are mandatory: the integration suites share one database and
truncate in their hooks, so parallel workers deadlock and emit misleading
`Hook timed out` failures. Without `RUN_DB_INTEGRATION=1` they silently *skip* and the run
looks clean — always check the skipped count.

**Baseline at `1237a93`: 967 passed, 12 failed, 9 skipped.** The 12 are pre-existing and
listed in `PROJECT-STATUS.md`. Do not treat them as new breakage, and do not let them
train you to ignore red. A green suite has now twice failed to catch a real defect that
only showed up driving the product for real — see "The most important lesson, twice over"
in `PROJECT-STATUS.md`.

## Deploying to UAT — the part that will trip you up

SSH via `connectssh.sh`, but **add agent forwarding**: the script itself is just
`ssh -i ~/.ssh/lightsail-ca-central-new.pem ubuntu@99.79.158.110`, no `-A`. The UAT host
has no GitHub key of its own — `~/.ssh/` on the host has no private key file, only
`authorized_keys`. Every release, including the ones in this run, was cloned via whoever's
key was forwarded from the machine running the deploy. Connect with:
```
ssh -A -i ~/.ssh/lightsail-ca-central-new.pem ubuntu@99.79.158.110
```
and verify before staging anything:
```
ssh-add -l
ssh -T git@github.com
```
If either fails, `git clone` on the host will fail with `Permission denied (publickey)`,
and — this is the trap — every subsequent step (`docker build`, migrate, symlink switch)
will appear to run without an obvious hard failure, because they execute against an empty
or stale release directory. Check `git rev-parse HEAD` right after the clone and confirm
it matches the SHA you intend to deploy before doing anything else.

Full procedure in `docs/release/CURRENT-UAT.md`.

## Standing decisions left open for the product owner

- Should Members be able to resolve identity reviews? That gate currently sits between a
  Member qualifying a Lead and anyone converting it.
- Rewrite or delete the permanently-red design-system test file.
- Backfill or forward-only for pre-fix identity-review records (item 2 above).
- Whether/when to deploy `main` to production, now that it contains this work.

## Working model that suited this owner

Give exact, copy-pasteable commands and let the owner run Git and deploy steps; do not
drive the repository or the deploy host directly. Keep explanations short. State plainly
when something you did was wrong rather than quietly correcting it. Verify claims against
the running system rather than trusting a document — including this one.
