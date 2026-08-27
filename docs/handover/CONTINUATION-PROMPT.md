# Continuation prompt for a new Product/root session

Continue NexaFlow in `/Users/moemahmood/builder_code/Nexflow_v1` as Product/root coordinator.

Before acting, read `AGENTS.md`, `docs/handover/README.md`, `docs/handover/PROJECT-STATUS.md`, and the relevant engineering handoffs. Inspect Git status, local/origin SHAs, worktrees, and the migration journal. Preserve all existing work and never expose credentials or protected customer data.

Current authority snapshot (2026-08-27):

- Application `main` and admitted UAT source are exact `4bef3415f368492ed4673627f64daa78a8ca9e7d`; reverify local/origin/documentation HEAD before acting.
- UAT release: `/opt/nexaflow/uat/releases/4bef341-uat30`, image `nexaflow:4bef341-uat30` (`sha256:2ad41b17ec50be5043eb244fe6da15fc5dc8b583b276757f4f0809c70179511f`).
- Migration ledger: 26 entries; head `0025_db_01b_lead_source_platform`, timestamp `1787793528579`.
- UAT services were healthy with zero restarts at handoff; production was untouched.
- Donor evidence remains pinned to `57d38b0c2091f1376344614720890c9544916933`. It is workflow/layout evidence, not tenancy, schema, authorization, or runtime authority.

Delivered verticals include Customer Graph Companies/Contacts, Sales Deals and Deal board, Lead conversion, screenshot-driven Company/Contact/Lead profiles, Contact internal Notes, grouped current-authority navigation, Lead inline Company creation, current Lead social-platform attribution, stable option reconciliation, and the donor-adapted Companies/Contacts directories.

UAT30 passed authenticated Company and Contact Create, View, Edit, genuine stale rejection, Archive, archived-feed, and Restore journeys. The recommended next bounded feature is `ACTIVITY-01A`: manual Lead activity create plus target-scoped newest-first list using the integrated DB-01/DB-01A foundation. Fixed-owner Lead routing follows after its remaining Product semantics are frozen.

For `ACTIVITY-01A`, create fresh branches from exact current `main`. Do not reuse or cherry-pick obsolete prototype `codex/crm-activity-01-backend` / `271ca0a` or its old schema line `78002a4`. Use only `activity_records` and `activity_record_references` with one typed `crm.lead` target and the DB-01A descending `(occurred_at,id)` projection. New writes to legacy `lead_activities`, multi-target activities, Tasks, system projections, and a global timeline are outside the slice. Dev3 confirmed no new DDL or migration 0026 is currently required.

No specialist reported portable/unmerged authoritative source. Historical worktrees and branches are not continuation authority. See `PROJECT-STATUS.md` for the explicit stale/rejected SHA list and the reconciled Dev1/Dev2/Dev3/Architecture/Graphics handover.

Only Dev1, Dev2, and Dev3 implement under bounded delegation. Architecture and Graphics are read-only support/review roles. Continue the fast-track policy: parallel review, immutable exact-SHA integration, fall-forward UAT, no speculative rehearsal, and no production mutation without explicit Product authorization.
