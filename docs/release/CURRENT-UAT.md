# Current UAT release

Status date: 2026-08-29

| Item | Value |
| --- | --- |
| Source revision | `d1610aa` on branch `design-system-consistency` |
| Release | `/opt/nexaflow/uat/releases/d1610aa-uat54` |
| Image | `nexaflow:d1610aa-uat54` |
| Runtime user | `10001:10001` |
| Migration ledger | 28 |
| Migration head | `0027_default_sales_pipeline_backfill` |
| UAT database | `nexaflow_uat` (not `nexaflow`) |

App container reported `(healthy)` after deployment. The database was migrated, not reset.

## Releases in this run

| Release | Source | Contents |
| --- | --- | --- |
| `2cba2e7-uat49` | `2cba2e7` | Legacy PATCH role enforcement; Direction A visual pass |
| `00dfa41-uat50` | `00dfa41` | Migration `0026`; lifecycle state machine, orchestrator, route |
| `df8e473-uat51` | `df8e473` | Lead detail lifecycle control; server-computed transition set |
| `0510611-uat52` | `0510611` | Transition-aware labels; Pipeline stage retired from Lead views |
| `9a297d8-uat53` | `9a297d8` | Deal close settles Lead outcome; outcome reconciliation report |
| `d1610aa-uat54` | `d1610aa` | Migration `0027`; default Deal pipeline seeded and backfilled |

## Verified on UAT

- Lifecycle movement through the product: `new → working → qualified`, disqualification with a recorded reason, and reopen.
- Disqualification derives `status='lost'` with `status_source='system'`.
- Migration `0027` seeded one `Sales pipeline` with five stages — Discovery, Proposal, Negotiation (open), Won, Lost.

## Not yet walked end to end on UAT

Conversion was still blocked at the last check because every Lead except one carries
`identity_review_status='pending'`. Resolving a review, converting, closing the Deal as
won, and confirming the Lead settles to `won` is the outstanding verification.

## Deploy procedure

SSH via `connectssh.sh`. Clone as `ubuntu`, **not** under `sudo` — sudo uses root's SSH
keys. Drop `.git`, `sudo mv` into `/opt/nexaflow/uat/releases/<shortsha>-uat<N>/`, copy
the previous release's `release.env` **with sudo** (root-owned, mode 600), point
`NEXAFLOW_IMAGE` at the new tag, build, run migrate, move the `current` symlink, then
`up -d app email-worker`. All docker commands require `sudo`; `ubuntu` is not in the
docker group.
