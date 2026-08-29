# Continuation prompt for a new session

Continue NexaFlow in `/Users/moemahmood/builder_code/Nexflow_v1`.

Before acting, read `AGENTS.md`, `docs/handover/PROJECT-STATUS.md`, and
`docs/release/CURRENT-UAT.md`. If the session is attached to the **NexaFlow claude.ai
project**, also read the project doc `claude/lead-lifecycle-spec.md` — it is the deep
specification for the lead lifecycle and carries the reasoning, the rejected options and
the traps, which this file only summarises. Verify Git status and local/origin SHAs
before trusting any of it.

## Authority snapshot (2026-08-29, second run)

- Working branch: `design-system-consistency-local`, pushed to `design-system-consistency`,
  head `a3aacc0`. **Not merged to `main`.** `main` is `1843381`.
- **Unmerged fix branch: `fix/identity-review-canonical-contacts`, head `00c2395`,
  branched from `a3aacc0`.** Not pushed. See "The blocker found by walking UAT" below.
- UAT still runs `d1610aa-uat54` — it does **not** contain the fix.
- Migration ledger: 28 entries; head `0027_default_sales_pipeline_backfill`. The fix adds
  no migration.
- UAT database is `nexaflow_uat`, not `nexaflow`.
- Suite at `00c2395`: **966 passed, 12 failed, 9 skipped.** The 12 are the documented
  pre-existing set, unchanged.

## The blocker found by walking UAT

The previous run's top recommendation was "walk the arc on UAT before building more, and
expect a fourth blocker". That was done, and there was a fourth blocker.

**Symptom.** Resolving an identity review with "Create new contact" produced a Contact the
Lead detail screen showed as a permanently read-only *legacy record* — no edit, no
lifecycle, no affiliation management, "no adoption or backfill action is offered". The
Lead's Conversion tab then read *"The linked Contact is not currently eligible as the
primary Contact"*, forever.

**Cause.** `resolve-lead-identity-review.orchestrator.ts` created new Contacts and
Companies through the legacy P1A repositories (`contactTransactionParticipant.create`,
`companyTransactionParticipant.create`). Those repositories never set
`authority_contract_version` (so rows default to `legacy-p1a-root-v1`), never write
`contact_identity_points`, and never write a `contact_company_affiliations` row.
Conversion's primary-contact check in
`customer-graph/application/deal-party-reference.participant.ts` requires
`authority_contract_version='customer-graph-v1'` **and** an active `is_primary`
affiliation row to the selected Company. The two halves of the product disagreed about
what a Contact is.

Because identity review is the *only* way a Lead with no pre-existing match gets a
Contact, every such Lead was unconvertible. This is the same shape as the previous run's
lesson: a feature that looks dead has more than one cause stacked behind it.

**Why 965 green tests missed it.** `tests/lead-conversion-01-backend.integration.test.ts`
pre-seeded a canonical Company by raw SQL and dismissed the Contact entirely. The
create path that real data uses was never exercised. A green suite proved the fixture,
not the product.

**Fix (`00c2395`).** Added `customerGraphIdentityResolutionParticipant` in
`src/backend/modules/customer-graph/application/identity-resolution.participant.ts` —
`createCanonicalContact` / `createCanonicalCompany`, composable inside an already-open
transaction. customer-graph is the module that owns `contacts`, `companies`,
`contact_identity_points`, `contact_company_affiliations` and `company_domain_points`, so
this satisfies the SQL-ownership boundary scanner. The identity-review orchestrator now
calls these instead of the legacy repositories. New identity-review Contacts get
`customer-graph-v1`, their identity points, and a primary affiliation to the Company
resolved in the same decision. Added an integration test that drives
`contact:"create"` + `company:"create"` and asserts the Lead converts.

## Do this next

1. **Merge and deploy the fix.** It is verified by tests but has never run on UAT.

   ```
   git checkout design-system-consistency-local
   git merge --no-ff fix/identity-review-canonical-contacts
   git push origin design-system-consistency-local:design-system-consistency
   ```

   Then build `<shortsha>-uat55` per `docs/release/CURRENT-UAT.md`.

2. **Walk the arc on UAT, on a fresh Lead.** Resolve an identity review with "Create new
   contact", convert, close the Deal as won, confirm the Lead settles to `won`. Seven
   Leads remain `identity_review_status='pending'`.

   Do **not** use `Mobasher UAT Lead 08` (`f1f7ecc7-7ec1-4ec8-9004-969716215e2c`). Its
   review was resolved under the old code, so its Contact
   (`f83d9220-b8d8-4432-8527-1be99dcdbbb7`) is a stranded legacy record. The fix is
   forward-only and does not repair it.

   Read UAT data with:
   ```
   sudo docker exec -it nexaflow-uat-postgres-1 psql -U nexaflow -d nexaflow_uat -c "<sql>"
   ```

3. **Decide on backfill.** Any workspace that used "Create new contact" before the fix has
   Leads that can never convert, and no UI can adopt those records. Blast radius today is
   UAT only, because none of this reached `main`. Options: a migration adopting
   identity-review-created `legacy-p1a-root-v1` rows into `customer-graph-v1` with
   affiliations; a UI adoption action; or accept forward-only and document it. **Open
   product decision.**

4. **Phase 4** — dashboard lifecycle funnel, Leads-list lifecycle filter, timeline
   backfill (#7), and the `FactsGrid` phantom-cell fix. The lifecycle filter is not small:
   the list uses keyset pagination whose cursor encodes active filters, with eight tests
   asserting cursor stability.

5. **Phase 5** — retire `leads.stage_id` from Lead views and plan its removal.

6. **Decide the fate of the 12 red tests**, especially `design-system-components.test.tsx`,
   which asserts `ds-*` class names that no longer exist anywhere in the design system.

## How to run the tests — read this first

`npm run test:integration` runs **only** `tests/*.integration.test.ts`, which is 50 of the
122 test files. Treating that as the whole suite hid three real defects that shipped to
UAT twice.

```
RUN_DB_INTEGRATION=1 npx vitest run --no-file-parallelism --maxWorkers=1
```

The serialization flags are mandatory: the integration suites share one database and
truncate in their hooks, so parallel workers deadlock and emit misleading
`Hook timed out` failures. Without `RUN_DB_INTEGRATION=1` they silently *skip* and the run
looks clean — always check the skipped count.

**Baseline at `00c2395`: 966 passed, 12 failed, 9 skipped.** The 12 are pre-existing and
listed in `PROJECT-STATUS.md`. Do not treat them as new breakage, and do not let them
train you to ignore red.

## Standing decisions left open for the product owner

- Should Members be able to resolve identity reviews? That gate currently sits between a
  Member qualifying a Lead and anyone converting it.
- Rewrite or delete the permanently-red design-system test file.
- Backfill or forward-only for pre-fix identity-review records (item 3 above).
- Whether to merge `design-system-consistency` to `main` at all.

## Housekeeping in the working tree

- `Documentation/handover/nexaflow-phase1-4-uat-fall-forward-handover.md` is deleted but
  unstaged. It **is** tracked (committed at `4383e1e`), contrary to what an earlier
  PROJECT-STATUS claimed. Commit the deletion or restore it deliberately.
- `.gitignore` has an uncommitted `+.aider*` line.
- Untracked: `connectssh.sh`, `vitest.txt`, `work/`. None belong in a commit as-is.

## Working model that suited this owner

Give exact, copy-pasteable commands and let the owner run Git and deploy steps; do not
drive the repository or the deploy host directly. Keep explanations short. State plainly
when something you did was wrong rather than quietly correcting it. Verify claims against
the running system rather than trusting a document — including this one.
