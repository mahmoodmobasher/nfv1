# Nexa Spectrum Phases 1–4 UAT attempt 4 deployment result

Date: 2026-08-24

Status: **BLOCKED — public edge token-privacy gate failed; prior healthy release restored**

UAT URL: `https://app.nexaflowsystems.com`

## Release and immutable authority

- Integrated main revision: `58c5ae4c7075d3637bacb96fb70c343d671273a6`.
- Published UAT-only identifier: `v0.5.0-uat.4`, resolving exactly to `58c5ae4`. It is permanently rejected and must never be moved, repaired, overwritten, or reused.
- Rejected predecessors remain unmoved: `v0.5.0-uat.1` at `9162a90`, `.2` at `05c4c02`, and `.3` at `82b8104`.
- Retained and restored healthy authority: `v0.4.0-uat.1` / `e58c22a`.
- Candidate Linux/amd64 image ID: `sha256:bb488d074464fa41e2174875a526bee7286a41827b312240cdac453c31b4f775`; runtime UID/GID `10001:10001`.
- Image archive SHA-256: `491ab67aa373d065b517ee284cd15cac4c3083530d83a38941425afd81ebf861`.
- Source archive SHA-256: `f1dd83223bedfe1f0c8718d386d6415ee423da41fd17206cd4d465ec6533d288`.
- Candidate Caddyfile SHA-256: `69321dae608b422575708c19c7acf03c7e018d35f50ee7a4e4b9da1841477f59`.
- Protected release-authority fingerprint: `04a5daf0fdffa760b504a75f055510f87ae6f3d69c604e75ffe1e0a3f06ade67`.
- Protected Option A environment fingerprint: `a825b7947bbeda0fd747233457af40ef40cee71d5905686b2c397f531bd1f3d8`, root-owned mode `0600`, with Reply-To absent.

Accepted implementation `5fdec7b`, candidate `2629616`, Architecture authority/acceptance `0035fd1` and `539dd73`, and backend/security acceptance `f71a31b` are exact ancestors. Main was pushed normally from unchanged baseline `aa64658`; the integration gate passed diff/ancestry audit, lint, TypeScript, 41/41 focused token/header/security tests, and the Next.js 16.3.1 production build.

## Pre-switch gates and deployment

- Current provider-domain verification was read-only HTTP 200, with the canonical domain verified/active; no email was created by the probe.
- Exact protected Option A schema, safe Compose render, pinned `caddy:2.10.2-alpine` adapt/validate, and adapted-JSON default-if-absent uniqueness passed.
- Exact image/schema, disposable migration apply and rerun, isolated app readiness, continuous worker start on an empty disposable database, bounded logs, and cleanup passed at 12 migrations/head `1787501845245`.
- Encrypted backup `nexaflow-uat_58c5ae4-pre_20260824T164415Z.sql.gz.enc`, SHA-256 `2b94eabeab3a5b5cd82a24bed4cd9462240fd643721c16aafc6a6de8df72c549`, and manifest are mode `0600`. Disposable restore passed at 12/head `1787501845245` and was removed.
- Live migration apply and stdin-detached idempotent rerun passed at the same ledger/head.
- Protected release authority and `current` switched at `2026-08-24T16:47:36Z`. Only app, email worker, and Caddy were recreated. App/Caddy were healthy, worker running, and all three restart counts were zero before public probes. PostgreSQL and Mailpit were not recreated.

The transferred checksum sidecar again retained its build-machine temporary directory prefix. Host verification failed before extraction or image load, then separately recorded expected basename digests were compared successfully before staging. This is a non-blocking recurrence under `UAT-GAP-003`/`UAT-GAP-005`; it did not mutate authority or weaken artifact provenance.

## Material public-edge failure

The mandatory public-edge matrix started before email or broader UAT. The first 52 protected response assertions passed, covering:

- all eleven exact token lifecycle paths across public GET, PUT/framework, and RSC-shaped clean requests;
- all four completion/clear endpoints with missing/mismatched CSRF and absent/cross Origin denials;
- one application `no-referrer`, effective private/no-store, nonce `strict-dynamic` CSP, no production unsafe directive, and synthetic-token absence; and
- initial HTML/RSC clean-entry and HTML generated-link capture redirects.

This confirms the accepted `UAT-GAP-008` header remediation worked on the attempted live image, including verification/reset completion 403 denials. Workspace responses with repeated Cache-Control fields were accepted only when raw values were identical and combined to private/no-store without weakening, as authorized for `UAT-GAP-009`.

The next generated-link probe found a P1 token-privacy violation:

- an RSC-shaped request to `/verify-email/capture` with a synthetic token returned HTTP 307;
- `Location` retained the token-bearing query and added the framework `_rsc` query key, instead of returning the existing clean HTTP 303 destination;
- no credential, personal recipient, or production token was used or retained in this record.

After rollback, an isolated direct-container reproduction on the exact `nexaflow:58c5ae4` image produced the same 307 token-bearing Location for both `/verify-email/capture` and `/reset-password/capture`. This proves the behavior is in the application/Next response pipeline, not Caddy. The existing browser evidence covered proxy-captured clean paths and invitation capture, but did not exercise generated verification/reset capture Route Handlers under an RSC header.

The edge matrix stopped immediately. Public default/static/near-miss completion, controlled-recipient verification/resend/recovery/reset/invitation email, authenticated Phase 1–4 functional/security/Workspace/CRM/settings/theme/responsive/accessibility tests, and full worker/database/log acceptance are not represented as passed.

## Rollback and healthy-state proof

Rollback restored the root-owned mode-`0600` prior release and application authority plus `/opt/nexaflow/uat/releases/e58c22a`, then recreated only app, email worker, and Caddy. At `2026-08-24T16:50:21Z`:

- app and worker used `nexaflow:e58c22a`;
- app, Caddy, PostgreSQL, and Mailpit were healthy; worker was running;
- all five restart counts were zero;
- database ledger remained 12/head `1787501845245`;
- public liveness/readiness passed; and
- bounded app/worker/Caddy/PostgreSQL logs contained zero fatal/panic/exception and zero literal `token=` matches.

No database restore or data rewrite was required. No controlled-recipient email was sent and no candidate business mutation occurred. The `.4` release directory, image, tag, checksums, protected candidate authority, backup, and rollback inputs remain immutable evidence.

## Gap disposition and recommendation

- Closed during this attempt: immutable integration, artifact provenance, Option A/provider preflight, backup/restore, migrations, app/worker/Caddy readiness, and rollback proof.
- Open blocking: new `UAT-GAP-011` generated verification/reset capture RSC token-bearing redirect; live acceptance of `UAT-GAP-001`, `UAT-GAP-002`, `UAT-GAP-006`, and `UAT-GAP-008` remains incomplete after rollback.
- Open non-blocking: `UAT-GAP-009` duplicate identical effective private cache defense; `UAT-GAP-003`/`UAT-GAP-005` portable evidence automation.
- Deferred/out of scope: approved-recipient email, full Phase 1–4 Product UAT, production provider operations, production deployment, and Phase 5.

**NO-GO for Product UAT acceptance of `v0.5.0-uat.4`.** Fall forward requires a bounded application/Next capture correction that consumes or redirects generated verification/reset token links before framework RSC normalization can preserve the query, with HTML/RSC direct-production and public-edge tests proving exact token-free Location, cookies, history/storage/outbound/log privacy, Back/refresh/replay behavior, and unchanged identity/reset semantics. It requires distinct backend/security and Architecture acceptance, controlled integration, a new immutable revision, and an identifier no earlier than `v0.5.0-uat.5`.
