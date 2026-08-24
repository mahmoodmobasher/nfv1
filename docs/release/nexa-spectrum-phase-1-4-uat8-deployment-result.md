# Nexa Spectrum Phases 1–4 UAT attempt 8 deployment result

Date: 2026-08-24

Status: **PASS — `v0.5.0-uat.8` is live and the bounded UAT-GAP-013 release admission gate passed.** Controlled-mailbox email journeys and supported-workflow cohort acceptance remain pending operational validation and are not represented as passed.

UAT URL: `https://app.nexaflowsystems.com`

## Authority and immutable provenance

- Product authorized exact checkpoint `cf30f9fe08f7536d9cc1debf3ad442ca1f35a8b7` after Backend/Security acceptance `4203a9c` and Architecture acceptance `d5d4483` of candidate `2840495` / implementation `4393974`.
- `origin/main` was verified at required baseline `e0ad785d3efe5ef16a995602aad1e24affe34acb`, then advanced by a normal non-force update to exact `cf30f9f`. Remote equality was reverified.
- Annotated immutable tag `v0.5.0-uat.8` has tag object `413e66bdc9e81ac1516d77f0e3a079b1d9121efd` and resolves exactly to `cf30f9f`. Published `.1` through `.7` remained unmoved and must never be reused.
- Source archive SHA-256: `7e1f3b10c75a4d6854d9e6d4e98390ef57c4759eaae8240d080370238f026392`.
- Linux/amd64 image `nexaflow:cf30f9f-uat8`: image ID `sha256:cd764e8bed26153637841d35d9a55fac9ad114979d3569ffe1afe1e9850a47fb`; archive SHA-256 `1a841df9cc7041da5ad309cb4f83e29f2c68c0c10e538062eb713d5337c0e317`; runtime UID/GID `10001:10001`; OCI revision/version match the exact source and release.
- Unchanged Caddyfile SHA-256: `69321dae608b422575708c19c7acf03c7e018d35f50ee7a4e4b9da1841477f59`. Unchanged Compose SHA-256: `33500a80918e968482119380dc744eefab3dfa8bbdce3e862a8750baaf5e15c4`.

## Pre-switch and deployment

- The existing fresh `.7` PostgreSQL/Caddy environment was healthy. Caddy, PostgreSQL, and Mailpit identities, networks, and volumes were retained; no database reset, schema, provider, DNS, TLS, Caddy, or topology change occurred.
- Protected application, PostgreSQL, Caddy, and release environment files remained root-owned mode `0600`. Normalized non-image release configuration was byte-equivalent to live authority; only `NEXAFLOW_IMAGE` changed to the exact `.8` image. Reply-To remained absent.
- Migrations ran twice with stdin detached and both runs exited successfully. The ledger remained exactly 12 migrations at head `1787501845245`; the second run was an idempotent no-op.
- Rollback authority was recorded before switch: prior pointer `/opt/nexaflow/uat/releases/386d10c-uat7` and a root-owned mode-`0600` copy of the prior release environment with SHA-256 `295447c58780923f2edd80cbc97f45f94e0345673d9d13a1901e40ca3a71c3fa`.
- The release environment and pointer switched atomically. Only `nexaflow-uat-app-1` and `nexaflow-uat-email-worker-1` were force-recreated. Caddy, PostgreSQL, and Mailpit container IDs remained unchanged.

## Live runtime and security evidence

Observed at `2026-08-24T19:56:54Z`:

- live pointer: `/opt/nexaflow/uat/releases/cf30f9f-uat8`;
- app image/container: exact `.8`, `02124f767ff6…`, healthy, zero restarts, non-root;
- worker image/container: exact `.8`, `a25fb9074415…`, running, zero restarts, non-root;
- retained Caddy `96e49cda3997…`, PostgreSQL `362787a42cd3…`, and Mailpit `78442a1c11f6…` were healthy with zero restarts; and
- disk use was 21%.

Repository smoke passed 8/8 cells: liveness, readiness, five disabled-OIDC 404 routes, and unauthenticated CRM protection. Canonical TLS passed with the expected hostname and a valid certificate. Trusted-proxy spoof/no-spoof readiness statuses were equivalent at 200/200.

The exact UAT-GAP-013 live proof passed 3/3:

1. unauthenticated Workspace settings GET returned bounded `401 authentication_required`;
2. unauthenticated invitation-list GET returned bounded `401 authentication_required`; and
3. a trusted-Origin/valid-CSRF invitation POST with no Session returned bounded `401 authentication_required`.

The three safe request identifiers selected exactly three committed Audits: one `workspace.settings_change_denied` and two `workspace.invitation_admin_denied`, all `denied/authentication_required`. Every Workspace, actor User, actor Membership, Session, and target field was null. Each Audit metadata object contained only `operation=tenant_admin_denial`. Immediately after these probes, Users, Workspaces, Memberships, invitations, Outbox, idempotency, rate-limit, and CRM rows all remained zero.

Protected token evidence passed 25/25 cells: GET/PUT over all eleven exact lifecycle paths plus three near misses. Exact paths returned one effective `no-referrer`, nonce CSP with `strict-dynamic`, and effective `private,no-store`; near misses retained one edge default `strict-origin-when-cross-origin`. Ten cells repeated only identical `Cache-Control: private, no-store` fields, the accepted non-blocking `UAT-GAP-009` condition, with no weakening.

Generated verification, reset, and invitation capture passed 3/3 through the repository `validate-edge-location.mjs` harness using deterministic HTTP/1.1 curl evidence: exact single clean same-origin 303 destinations, token-free query/fragment, one `no-referrer`, effective private/no-store, nonce CSP, and no raw probe marker in headers or bodies. The synthetic captures created no Users, Workspaces, Memberships, invitations, identity tokens, Outbox, idempotency, or CRM rows; three expected security rate-limit rows were created by the invalid-token capture attempts.

Since the application switch, app/worker/Caddy logs contained zero pool-after-end errors, unhandled rejections, SQL/stack disclosure, fatal/panic lines, generic error lines, or protected token/session/password markers. PostgreSQL and Mailpit contained zero fatal/panic or protected markers. Two PostgreSQL `ERROR` lines came solely from operator read-only evidence queries with invalid JSON-function syntax; corrected minimized queries passed and data, schema, readiness, and service health were unchanged. This is recorded under non-blocking `UAT-GAP-005`.

## Gap disposition and rollback

- **Closed during `.8`:** P1 `UAT-GAP-013` is operationally verified for the three authorized live denial probes. The former 500/empty-body and `Cannot use a pool after calling end on the pool` behavior did not recur; Audit cardinality and zero-business-mutation boundaries passed.
- **Open non-blocking:** P3 `UAT-GAP-009` identical duplicate private cache fields; P3 `UAT-GAP-005` ad hoc evidence-command friction.
- **Pending operational acceptance:** controlled-recipient verification/resend, recovery/reset/Session revocation, invitation delivery/acceptance, and deterministic Company A/Company B supported-workflow cohort acceptance. Product explicitly authorized these as non-blocking for deployment completion because controlled mailbox aliases were unavailable. No email was sent and no tester was admitted.

Rollback remains ready by restoring the protected `.7` release environment and prior pointer, then recreating only application and worker. No database rollback is required for this app-only release. The `.8` deployment did not change schema or business data.

## Product disposition

**GO for bounded UAT deployment completion:** keep `v0.5.0-uat.8` live at exact `cf30f9f`.

**Pending before full Product UAT acceptance:** provide the already approved controlled mailbox through the secure operational channel, then execute the deferred email and supported-workflow cohort matrix. No production or Phase 5 action is authorized by this result.
