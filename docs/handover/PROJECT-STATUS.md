# NexaFlow project status

Status date: 2026-08-27

## Current authority

| Area | Exact identity | State |
| --- | --- | --- |
| Repository | `4bef3415f368492ed4673627f64daa78a8ca9e7d` | Application source on local/origin `main` at UAT30 admission; reverify documentation HEAD before work. |
| Deployed application source | `4bef3415f368492ed4673627f64daa78a8ca9e7d` | Exact admitted UAT30 application revision. |
| UAT | `4bef341-uat30` | Published, healthy, and Architecture-admitted. |
| UAT image | `sha256:2ad41b17ec50be5043eb244fe6da15fc5dc8b583b276757f4f0809c70179511f` | Exact OCI revision; non-root `10001:10001`. |
| Database | 26 ledger entries; head `0025` / `1787793528579` | No reset for the latest frontend deployment. |
| Production | Not changed | UAT-only program. |

## Delivered product scope

- Workspace, Membership, Team, RBAC, visibility, Session Workspace, Audit, Outbox, and Idempotency platform foundation.
- Companies and Contacts list/detail/create/edit/archive/restore plus Contact-to-Company affiliation.
- Donor-adapted responsive Companies and Contacts directories with Search, Include archived, and capability-controlled lifecycle actions.
- Sales Deals list/board/detail/create/edit/stage transition/archive/restore.
- Lead-to-Deal conversion with retained lineage and canonical Lead lifecycle transition.
- Screenshot-driven Company, Contact, and Lead profile forms.
- Contact internal Note add/list through Notes ownership.
- Grouped current-authority navigation.
- Lead inline Quick create Company without implicit Lead submission.
- Current Lead social-media platform tuple, separate from immutable original intake provenance.
- Lead edit option reconciliation by stable ID/version rather than display label.
- Centered, bounded, Cancel-first Move Stage modal.

## UAT data and validation

- The Mobasher `basi` Workspace contains 10 synthetic Companies, 10 Contacts, and 10 Leads linked by index, labelled `UAT Test Mobasher`.
- A separate isolated seed Workspace `UAT Test Seed bb872c7a` remains intentionally retained until Product authorizes deletion.
- Deployment/config/security checks passed for release `4bef341-uat30`.
- Authenticated Company and Contact Create/View/Edit/stale/Archive/Restore journeys passed. Product visual validation remains welcome but is no longer a release blocker for these actions.

## Repository work after the deployed UAT source

- `f016caa`: canonical handover refresh.
- `f207da3`: documentation consolidation and removal of superseded dated records.
- `f31ea81`: frontend Screen Forms modularization; reusable fields/error/address rendering and strict command construction were separated from the React controller.
- `b12495d`: Customer Graph application helper split; normalization/command adapters and kind/status-bound keyset cursor handling were separated from the service.
- The later Customer Directory action commit `3a12d80` and runtime correction `4bef341` are deployed in UAT30. The documentation and modularization commits are ancestors of that release.

## Recommended next sequence

1. Product completes authenticated UAT validation of Companies/Contacts and the latest Lead UI fixes.
2. Implement `ACTIVITY-01A`: manual Lead activity create and target-scoped keyset list using existing DB-01/DB-01A; do not use legacy `lead_activities` for new writes.
3. Implement fixed-owner `LEAD-ROUTING-01` after Product freezes no-match fallback, overlap/tie behavior, Team eligibility, and intake coverage.
4. Add round-robin routing as a later versioned increment.
5. Extend Notes/Activities to additional aggregates only through their owner modules.
6. Perform bounded maintainability decomposition of the large Customer Graph, Leads screen-form, and frontend profile modules without contract drift.

## Specialist handover reconciliation

- Dev1: no portable or unmerged frontend source. Its current worktree branch is a historical ancestor with four untracked screenshot artifacts only. Start new work from exact `main`.
- Dev2: `codex/crm-activity-01-backend` at `271ca0a` is an obsolete prototype, 44 commits behind at audit. Mine it only as historical evidence; never merge or cherry-pick it.
- Dev3: no DDL is required for `ACTIVITY-01A`; DB-01/DB-01A is integrated and its activity tables are empty in UAT. Do not create migration 0026 without a new database requirement.
- Architecture: next exact-SHA review is the future Activities-owned backend candidate based on `b12495d`.
- Graphics: next review is the future `ACTIVITY-01A` frontend candidate. Authenticated user validation of current Companies/Contacts and Lead interactions remains outstanding.

## Stale or rejected integration heads

Do not integrate by branch name or reuse these candidates: `271ca0a` / `78002a4` Activities prototype line; DB-08A `5534f4d`; DB-01A `5b421a9`; Screen Forms DB `b207812`; directory frontend `4b2520a`; Lead frontends `8aa2041`, `01ec128`, and `02f1a89`. Their accepted replacements are already in `main` ancestry where applicable.

## Holds

- No production/customer migration, DNS/provider change, or production deployment.
- No speculative DB-07 shared projection.
- No automatic customer creation, inferred identity link, or donor authentication/schema import.
- No broad Activities/Notes/global timeline, AI, provider, import, or Delivery expansion without a bounded Product slice.
- Do not delete the isolated seed Workspace without explicit authorization.

## Working model

Product/root owns sequencing, exact-SHA integration, publication, and release. Dev1 owns frontend, Dev2 backend, and Dev3 database packages. Architecture and Graphics remain read-only reviewers. Prefer parallel support and fall-forward corrections; do not add rehearsals or serial gates unless a concrete risk requires them.
