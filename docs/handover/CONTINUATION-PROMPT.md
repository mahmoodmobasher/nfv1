# Continuation prompt for a new Product/root session

Continue NexaFlow in `/Users/moemahmood/builder_code/Nexflow_v1` as Product/root coordinator.

Before acting, read `AGENTS.md`, `docs/handover/README.md`, `docs/handover/PROJECT-STATUS.md`, and the relevant engineering handoffs. Inspect Git status, local/origin SHAs, worktrees, and the migration journal. Preserve all existing work and never expose credentials or protected customer data.

Current authority snapshot (2026-08-27):

- Local `main` and `origin/main`: `600a9aa96ec598b38aed557c2c4cb9b62d4afc08`.
- UAT release: `/opt/nexaflow/uat/releases/600a9aa-uat28`, image `nexaflow:600a9aa-uat28` (`sha256:ba38d93379c2bf82987b4ff9ed34a7cfab96beb836dc410b1e95a77b829bbca3`).
- Migration ledger: 26 entries; head `0025_db_01b_lead_source_platform`, timestamp `1787793528579`.
- UAT services were healthy with zero restarts at handoff; production was untouched.
- Donor evidence remains pinned to `57d38b0c2091f1376344614720890c9544916933`. It is workflow/layout evidence, not tenancy, schema, authorization, or runtime authority.

Delivered verticals include Customer Graph Companies/Contacts, Sales Deals and Deal board, Lead conversion, screenshot-driven Company/Contact/Lead profiles, Contact internal Notes, grouped current-authority navigation, Lead inline Company creation, current Lead social-platform attribution, stable option reconciliation, and the donor-adapted Companies/Contacts directories.

User validation still owns the authenticated visual confirmation for UAT release `600a9aa-uat28`. The recommended next bounded feature is `ACTIVITY-01A`: manual Lead activity create plus target-scoped newest-first list using the integrated DB-01/DB-01A foundation. Fixed-owner Lead routing follows after its remaining Product semantics are frozen.

Only Dev1, Dev2, and Dev3 implement under bounded delegation. Architecture and Graphics are read-only support/review roles. Continue the fast-track policy: parallel review, immutable exact-SHA integration, fall-forward UAT, no speculative rehearsal, and no production mutation without explicit Product authorization.
