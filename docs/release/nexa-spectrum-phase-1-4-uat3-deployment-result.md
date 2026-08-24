# Nexa Spectrum Phases 1–4 UAT attempt 3 deployment result

Date: 2026-08-24

Status: **BLOCKED — public edge gate failed; prior healthy release restored**

UAT URL: `https://app.nexaflowsystems.com`

## Release and artifact authority

- Integrated/attempted revision: `82b81044443a61d25926608d57c943b9ed89dfe1`.
- UAT identifier: `v0.5.0-uat.3`, resolving exactly to `82b8104`. It is permanently rejected and must never be moved, repaired, overwritten, or reused.
- Rejected predecessors remain unmoved: `v0.5.0-uat.2` at `05c4c02` and `v0.5.0-uat.1` at `9162a90`.
- Retained and restored healthy authority: `v0.4.0-uat.1` / `e58c22a`.
- Candidate Linux/amd64 image ID: `sha256:ee419255271269837f70be1e1480356dbacc9db6c62f835588b550fc24a0434d`, runtime UID/GID `10001:10001`.
- Image archive SHA-256: `38cbf8b2dde07b276ebea685c6c8855f31a885dcaf44a787985875cf7ed2cb37`.
- Source archive SHA-256: `4dd206dff4fd960bff55064c09745b00fb9d52fadec7b74a51cd6657a9d9bc2c`.
- Candidate Caddyfile SHA-256: `69321dae608b422575708c19c7acf03c7e018d35f50ee7a4e4b9da1841477f59`.
- Protected Option A application-environment fingerprint: `a825b7947bbeda0fd747233457af40ef40cee71d5905686b2c397f531bd1f3d8`, root-owned mode `0600`, Reply-To absent.

All review commits authorized by Product were exact ancestors before the normal non-force main push. The four unrelated untracked Product alignment documents were preserved.

## Backup, validation, migration, and switch

- Provider domain/status and non-delivery authentication preflight passed without creating email or exposing provider data.
- Exact image/schema, staged Caddy adapt/validate, portable source/image checksums, and protected Compose render passed.
- Encrypted pre-switch backup `nexaflow-uat_82b8104-pre_20260824T150118Z.sql.gz.enc`, SHA-256 `23ec3ecb065a930b9c2db25df7650d0c86feb5de3f727bb1c9d556683c9f27e9`, was mode `0600` with mode-`0600` manifest and restored successfully into a disposable database with all 12 migrations; the database was removed.
- Candidate migration applied and reran idempotently; ledger remained exactly 12/head `1787501845245`.
- Protected release/config authority switched atomically at `2026-08-24T15:03:51Z`. Only app, email worker, and Caddy were recreated. PostgreSQL and Mailpit remained in place.
- Candidate app/Caddy health, worker running state, and restart counts were green before public traffic probes. This also proved the Option A environment forms one valid migration/app/worker unit.

The first migration evidence wrapper attempts consumed remaining heredoc stdin because Compose run remained attached. Named/direct evidence proved exit 0; the final reviewed invocation detached stdin explicitly and recorded both successful runs. No migration or data failure occurred.

## Material public-edge failure

The public matrix ran before any approved-recipient email or broader UAT journey. Ten initial probes passed:

- invitation capture HTML/RSC, clean HTML/RSC, malformed, terminal, and CSRF-denied completion all returned exactly one `no-referrer`;
- verification capture HTML/RSC and clean document returned exactly one `no-referrer`;
- invitation capture retained exact token-free 303 Location, two bounded cookies, CSP, private/no-store, and raw-token absence.

The next probe found a P1 security contract violation:

- `POST /verify-email/complete` without valid CSRF returned HTTP 403 with exactly one `Referrer-Policy: strict-origin-when-cross-origin`;
- `POST /reset-password/complete` independently reproduced the same HTTP 403/default-policy result.

Architecture authority `f907e70` requires verification/reset terminal and denied outcomes to retain exactly one application `no-referrer`. The application proxy's token-document set covers capture/clean routes but omits these completion endpoints, so Caddy correctly applies its default when the upstream response is silent. The bounded Caddy default-if-absent remediation works; the remaining application terminal-policy boundary is incomplete.

The edge matrix stopped immediately. Reset capture/clean variants, public/default/authenticated/stale-session/disabled-OIDC/static probes, controlled-recipient email journeys, and full Phase 1–4 functional/visual/accessibility testing were not represented as passed.

One non-blocking warning was also observed: Workspace invitation capture emits two identical `Cache-Control: private, no-store` fields from the application and the existing Caddy Workspace defense. The effective policy remains private/no-store and this behavior predates the candidate, but header canonicalization requires Architecture review.

## Rollback and healthy-state proof

Rollback began immediately after confirming the terminal-route failure. The failed protected authority was retained as root-owned mode `0600`; the prior protected authority and current pointer were restored atomically. Only app, worker, and Caddy were recreated.

At `2026-08-24T15:07:17Z`:

- current pointer resolved to `/opt/nexaflow/uat/releases/e58c22a`;
- app and worker used `nexaflow:e58c22a`;
- app, Caddy, PostgreSQL, and Mailpit were healthy; worker was running;
- app, worker, and Caddy restart counts were zero;
- database ledger remained 12;
- public liveness and readiness passed;
- bounded app/Caddy/worker/PostgreSQL logs contained zero fatal/panic/exception and zero literal `token=` matches.

No database restore or data rewrite was needed. No controlled-recipient email was sent, and no candidate business-flow mutation occurred before rollback.

## Disposition

**NO-GO for Product UAT acceptance of `v0.5.0-uat.3`.** Fall forward requires a new application commit that applies `no-referrer` to every verification/reset completion and denial response required by `f907e70`, with direct positive/negative and public-edge regressions. After Backend/Security and Architecture acceptance, the next attempt must use a new integrated revision, image, checksums, release directory, backup, deployment record, and identifier no earlier than `v0.5.0-uat.4`.

The next attempt must rerun the complete edge matrix from the beginning before email or broader testing. No production, DNS/provider/credential, topology, billing, or Phase 5 change occurred.
