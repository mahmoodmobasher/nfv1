<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# NexaFlow project rules

Read `docs/handover/CONTINUATION-PROMPT.md` before acting. Verify Git status and
local/origin SHAs rather than trusting any document's snapshot.

## Running tests

`npm run test:integration` runs only `tests/*.integration.test.ts` — 50 of 122 files.
It is not the suite. Use:

```
RUN_DB_INTEGRATION=1 npx vitest run --no-file-parallelism --maxWorkers=1
```

The serialization flags are mandatory: integration suites share one database and truncate
in their hooks, so parallel workers deadlock and emit misleading `Hook timed out` errors.
Without `RUN_DB_INTEGRATION=1` they silently *skip* and the run looks clean — always check
the skipped count.

Known-red baseline: **6 failures** in `phase4-identity-boundary.test.ts` (4),
`phase4-invitation-boundary.test.ts` (1), `contact-spectrum-migration.test.tsx` (1).
Pre-existing; not your breakage. (`design-system-components.test.tsx` asserted `ds-*`
class names that no longer exist since the Tailwind migration; deleted 2026-08-30 rather
than rewritten, to avoid recreating the same shape-coupling anti-pattern.)

## Architectural guards that fail in surprising ways

- **SQL ownership** (`tests/p1a-modular-boundaries.test.ts`) scans whole files, *comments
  included*, and allows zero whitespace after its keywords. A comment reading "cannot join
  one retroactively" registers a table called `one`; the word "joins" registers `s`; a
  string "not allowed from the current state" registers `the`; a local named `from`
  registers whatever follows it. Run its regex over your diff before running the suite.
- **Module ownership**: leads owns `leads`; sales owns `deals` **and**
  `lead_deal_conversion_lineage`. Cross-module reads and writes go through participants.
- **A new mutation must be enrolled in four platform registries** — the type unions,
  operation→audit-action map, topic→payload contract *and* `allowedSets`, plus the runtime
  metadata allowlists. Two are invisible to `tsc` and throw only at execution.
- Mirror any new error code or command field into
  `src/frontend/shared/contracts/p1a-transport.ts`, which re-declares them `.strict()`.

## Migrations

Edit `schema.ts` → `npm run db:generate` (macOS only; drizzle-kit needs a native esbuild)
→ update three constants and the column inventory in
`tests/migration-journal-gate.integration.test.ts`. That gate is the only test file a new
migration should touch. For a data-only migration, hand-write the SQL, append the journal
entry, and copy the previous snapshot.

## UAT

The UAT database is `nexaflow_uat`, not `nexaflow`. Clone as `ubuntu`, never under `sudo`
(sudo uses root's SSH keys). All docker commands need `sudo`. Full procedure in
`docs/release/CURRENT-UAT.md`.

## Working model

Supply exact copy-pasteable commands and let the owner run Git and deploy steps; do not
drive the repository or the host. Keep explanations short. Say plainly when something you
did was wrong instead of quietly correcting it.
