# Nexa Spectrum Phases 1–4 UAT attempt 5 deployment result

Date: 2026-08-24

Status: **REJECT — first public-edge probe hit a test-harness Location-form mismatch; automatic rollback restored the retained healthy release**

UAT URL: `https://app.nexaflowsystems.com`

## Immutable release authority

- Promoted source: `bb5bd5d6e513cf61ecd17b6aaef668264df1b344`.
- Architecture release-readiness GO: `bb50cd7`.
- UAT identifier: annotated tag `v0.5.0-uat.5`, tag object `814e5a12e1bb2b16e192c874948ee5c4f0e12a44`, resolving exactly to `bb5bd5d`. It is permanently rejected and must never be moved, repaired, or reused.
- Rejected predecessors remain immutable: `.1` `9162a90`, `.2` `05c4c02`, `.3` `82b8104`, and `.4` `58c5ae4`.
- Retained and restored healthy authority: `v0.4.0-uat.1` / `e58c22a`.
- Linux/amd64 image ID: `sha256:09cfd2b4c7b90dbbea4fdac5c138de50ff4c0503656a4c21002f4584fc93b0de`; runtime UID/GID `10001:10001`.
- Image archive SHA-256: `79888fd68ca7dd5635c2d770ac715a4de91c48cf5decd3b5174b7c4cf73dc34a`.
- Source archive SHA-256: `a180b30bf2acabcda9ea4b4b7ddd3071b3d3bb728373243df856898e3a1f5b85`.
- Caddyfile SHA-256: `69321dae608b422575708c19c7acf03c7e018d35f50ee7a4e4b9da1841477f59`; Compose SHA-256: `33500a80918e968482119380dc744eefab3dfa8bbdce3e862a8750baaf5e15c4`.
- Protected Option A environment fingerprint: `a825b7947bbeda0fd747233457af40ef40cee71d5905686b2c397f531bd1f3d8`; candidate release-authority fingerprint: `4db176ac6f74072285665c9c4ca999629f9304c8d87106b4ed049790f56254bd`. Both were root-owned mode `0600`; Reply-To was absent.

## Pre-switch evidence

All mandatory pre-switch gates passed:

- exact fetched main, tag, source archive, transferred image archive, loaded image ID/platform, non-root runtime, release tree, Caddyfile, and Compose provenance;
- protected Option A parity and a read-only Resend domains request returning HTTP 200 with the canonical domain verified/active; the probe created no email;
- safe Compose render and pinned `caddy:2.10.2-alpine` adapt/validate; adapted JSON contained one require-absent plus one default setter for each of the two application site routes, and the admin API remained off;
- encrypted backup `nexaflow-uat_bb5bd5d-pre_20260824T175410Z.sql.gz.enc`, SHA-256 `82257d3ae22638a22b1c8a1b7027bc5cb5e1b5cd514edca137c55f112a330ed`, with matching root-owned mode-`0600` manifest;
- disposable backup restore at 12 migrations/head `1787501845245`, followed by removal;
- fresh disposable candidate migration apply and idempotent rerun, app readiness, continuous worker startup against an empty Outbox, zero bounded log findings, and complete cleanup;
- live migration apply and idempotent rerun at the same 12/head ledger; and
- healthy `e58c22a` rollback release/image, five services, zero restart counts, protected pre-switch environment/release snapshots, and a validated automatic rollback script.

Two contained rehearsal-harness corrections occurred before the switch: the disposable email-provider override was removed because production correctly requires Resend, and the physical Outbox table assertion was corrected from `outbox` to `outbox_messages`. Both attempts cleaned their explicitly named disposable database, containers, and temporary environment before the succeeding exact-environment validation. No live state was affected.

## Switch and public-edge stop

The protected application/release authority and `current` pointer switched at `2026-08-24T17:59:26Z`. Only app, email worker, and Caddy were recreated. Candidate app/Caddy health, worker running state, zero restart counts, bounded public smoke, and bounded logs passed.

The mandatory edge-first harness then stopped on probe one, an HTML GET to the generated verification capture entry with a synthetic token. The application returned HTTP 303 and a clean relative `Location: /verify-email`; the harness required the semantically equivalent absolute same-origin form `https://app.nexaflowsystems.com/verify-email`. Its exact-form assertion therefore returned nonzero before the remaining privacy assertions. The rollback wrapper immediately restored `e58c22a`.

Read-only diagnosis against the exact `nexaflow:bb5bd5d` image reproduced HTTP 303, clean relative `/verify-email`, application `no-referrer`, `private, no-store`, nonce `strict-dynamic` CSP, and an opaque purpose/path/expiry-isolated HttpOnly cookie, with the synthetic token absent. This identifies an evidence-harness mismatch, not a reproduced application token-bearing redirect. However, the public matrix did not complete and `.5` cannot be reused after rollback.

Public-edge evidence completed: **1 probe began; 0 complete acceptance cells**. Generated RSC/prefetch/combined/HEAD/unsupported-method cases, the eleven-path matrix, stale authority, default/static/stale-Session/disabled-OIDC cases, controlled-recipient email, and full Phase 1–4 UAT were not executed and are not represented as passed.

## Rollback and disposition

Rollback completed before any controlled-recipient email or broader UAT. At `2026-08-24T18:04:32Z`:

- `current` resolved to `/opt/nexaflow/uat/releases/e58c22a`;
- app and worker used `nexaflow:e58c22a`;
- app, Caddy, PostgreSQL, and Mailpit were healthy; worker was running;
- all five restart counts were zero;
- database ledger remained 12/head `1787501845245`;
- bounded public liveness/readiness/OIDC/protected-route smoke passed; and
- bounded app/worker/Caddy/PostgreSQL logs contained zero fatal/panic/uncaught/unhandled/exception and zero literal `token=` matches.

Closed during this attempt: artifact/tag provenance, Option A/provider preflight, backup/restore, migrations, Caddy/Compose, isolated app/worker parity, switch readiness, and rollback proof.

Open blocking: `UAT-GAP-012` release-harness Location normalization/reporting; operational live closure of `UAT-GAP-011`, the full edge matrix, approved email journeys, and complete Phase 1–4 UAT.

Open non-blocking: `UAT-GAP-009` duplicate identical effective private cache fields and existing release-evidence automation gaps.

**REJECT `v0.5.0-uat.5`.** Product must authorize a reviewed evidence-harness correction that accepts only relative exact-clean or absolute same-origin exact-clean destinations after normalization while still rejecting query, fragment, cross-origin, 307/308, and token-bearing values. After independent review, a new immutable fall-forward attempt must use an identifier no earlier than `v0.5.0-uat.6` and restart the public-edge matrix from probe one. No application change is indicated by this evidence.
