# Current UAT release

Status date: 2026-08-29

| Item | Value |
| --- | --- |
| Source revision | `1237a93` on branch `design-system-consistency` (also merged to `main`) |
| Release | `/opt/nexaflow/uat/releases/1237a93-uat56` |
| Image | `nexaflow:1237a93-uat56` |
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
| `74936d5-uat55` | `74936d5` | Identity-review "Create new contact/company" now writes conversion-eligible customer-graph-v1 Contacts/Companies |
| `1237a93-uat56` | `1237a93` | Deal-stage published contract now declares `pipelineId`; Deals list/board render again |

## Verified on UAT

- Lifecycle movement through the product: `new → working → qualified`, disqualification
  with a recorded reason, and reopen.
- Disqualification derives `status='lost'` with `status_source='system'`.
- Migration `0027` seeded one `Sales pipeline` with five stages — Discovery, Proposal,
  Negotiation (open), Won, Lost.
- **The full arc, end to end, in the real UI, on `Mobasher UAT Lead 01`:** identity review
  resolved with Create new contact + Create new company → `new → working → qualified` →
  Convert to Deal → Deal opened in `/crm/deals` list → Deal closed **Won** → Lead
  `lifecycle_state='converted'`, `status='won'`, `status_source='system'`.

## Known stranded record

`Mobasher UAT Lead 08` (`f1f7ecc7-7ec1-4ec8-9004-969716215e2c`) had its identity review
resolved before `uat55`. Its Contact (`f83d9220-b8d8-4432-8527-1be99dcdbbb7`) stays
`authority_contract_version='legacy-p1a-root-v1'` and cannot become conversion-eligible;
the fix is forward-only. Do not use it to test conversion. Backfill is an open decision —
see `PROJECT-STATUS.md`.

## Remaining pending identity reviews

Seven Leads still carry `identity_review_status='pending'`: `Mobasher UAT Lead 02`, `03`,
`04`, `05`, `06`, `07`, `09`. Any of these is safe to use for further arc walks.

## Deploy procedure

SSH via `connectssh.sh` **with agent forwarding added** (`ssh -A -i
~/.ssh/lightsail-ca-central-new.pem ubuntu@99.79.158.110` — the script itself does not set
`-A`). The host keeps no GitHub key of its own; every release is cloned using whoever's
key is forwarded from the machine that runs the deploy. Verify forwarding worked before
staging anything: `ssh-add -l` and `ssh -T git@github.com` on the host must succeed, or
the clone fails with `Permission denied (publickey)` and every later step silently no-ops
against an empty release directory (`docker build` fails with `open Dockerfile: no such
file or directory`; `docker compose ... up` recreates against the *old* image with no
error, because it was still pointed at the previous release's compose file).

Clone as `ubuntu`, **not** under `sudo`. Drop `.git`, copy into
`/opt/nexaflow/uat/releases/<shortsha>-uat<N>/` (root ownership is not required — uat54
through uat56 were all `ubuntu:ubuntu`), copy the previous release's `release.env`
byte-for-byte and only rewrite `NEXAFLOW_IMAGE`, build, run migrate, move the `current`
symlink, then `up -d --force-recreate app email-worker`. All `docker` commands require
`sudo`; `ubuntu` is not in the docker group. Disk fills quickly from build cache — check
`df -h /` and run `sudo docker builder prune -af` before a build if usage is above ~75%.
