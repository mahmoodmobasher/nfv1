# Nexa Spectrum Phases 1–4 UAT attempt 7 deployment result

Date: 2026-08-24

Status: **REJECT — disposable rebuild completed and remains operationally healthy, but an unauthenticated Workspace-settings denial returns HTTP 500**

UAT URL: `https://app.nexaflowsystems.com`

## Authority and scope

- Product authorized the disposable-UAT rebuild under Architecture decision `576439d812b59394bd0c5017da3560e9b2c2fa89` and engineering inventory `7176986ee871dd558ea807fc3772b9b7a53f36d1`.
- Exact source authority: `origin/main` `386d10c5cc8eee9ff9f6d622d1a1e1a144c06ef2`.
- Immutable identifier: annotated tag `v0.5.0-uat.7`, tag object `6376fdc4100318bc1e0db84c78869b77dadad9fa`, resolving exactly to `386d10c`. It is published, rejected, and must never be moved, repaired, or reused.
- Published `.1` through `.6` remain immutable. The retained diagnostic application authority is `v0.4.0-uat.1` / `e58c22a`; no claim is made that it can operate against the intentionally rebuilt database.
- No production, DNS, provider, credential, topology, or Phase 5 change occurred. No controlled-recipient email was sent.

## Immutable artifact and protected authority

- Linux/amd64 image: `nexaflow:386d10c-uat7`; image ID `sha256:d1b241620dada7c7a5997d5f02387d2b008caaa763156432253e19dce2118124`; runtime UID/GID `10001:10001`; revision/version labels resolve to exact source and `.7`.
- Source archive SHA-256: `212535a1054bbc651100ae0ae5af612efa6791a72c2e8320ce11f5cc92f9ea8f`.
- Image archive SHA-256: `c724b2ed9e99ed762e1aad89cb4b73cb22cae43d35193cc82ce785243a480ec1`.
- Caddyfile SHA-256: `69321dae608b422575708c19c7acf03c7e018d35f50ee7a4e4b9da1841477f59`; Compose SHA-256: `33500a80918e968482119380dc744eefab3dfa8bbdce3e862a8750baaf5e15c4`.
- Live protected application/release fingerprints are respectively `e8251777572789001390eaf30a300313f4baa355ce2a4e88d780871ecc18a83b` and `295447c58780923f2edd80cbc97f45f94e0345673d9d13a1901e40ca3a71c3fa`. Both files are root-owned mode `0600`; Reply-To is absent.
- Option A schema, exact Docker environment representation, read-only verified/active provider-domain status, non-delivery authentication, app readiness, and worker startup passed before switch. The first staged sender display representation differed from the governing canonical contract; only the separately named `.7` candidate environment was corrected and revalidated before it became live. Rejected-release evidence and provider settings were not mutated.
- Pinned `caddy:2.10.2-alpine` adapt/validate, adapted default-if-absent behavior, admin-off proof, and secret-safe Compose rendering passed.

## Exact destructive rebuild

Read-only ownership proof established host, Compose project `nexaflow-uat`, resource prefix, exact labels, and no non-UAT consumer before destruction. At `2026-08-24T19:07:33Z`:

- removed and recreated only containers `nexaflow-uat-app-1`, `nexaflow-uat-email-worker-1`, `nexaflow-uat-caddy-1`, `nexaflow-uat-postgres-1`, and `nexaflow-uat-mailpit-1`;
- removed and recreated only networks `nexaflow-uat-database`, `nexaflow-uat-email-egress`, `nexaflow-uat-frontend`, and `nexaflow-uat-operator`;
- removed and recreated only `nexaflow-uat-postgres-data`; all former UAT Users, Workspaces, Memberships, Sessions, identity tokens, Outbox, Audit, CRM, and settings data are intentionally irrecoverable; and
- retained `nexaflow-uat-caddy-data` and `nexaflow-uat-caddy-config`, protected environment snapshots, historical evidence, immutable tags, and production resources.

No UAT application-data backup or restore was made or required. The release pointer and protected authority switched atomically to `/opt/nexaflow/uat/releases/386d10c-uat7` after the fresh base gates passed.

All 12 migrations applied from zero and the idempotent rerun passed; ledger head is `1787501845245`.

## Runtime evidence

At `2026-08-24T19:17:31Z`:

- app, Caddy, PostgreSQL, and Mailpit were healthy; the continuous email worker was running;
- all five containers had zero restarts;
- the application and worker used the exact `.7` image, and the app/worker ran non-root;
- public TLS and the canonical hostname passed; application and database ports were not publicly listening;
- repository smoke passed 8/8 cells: liveness, readiness, five disabled-OIDC 404 routes, and unauthenticated CRM protection;
- trusted-proxy spoof/no-spoof status equivalence passed;
- 22/22 no-token exact-path header cells across the eleven protected token lifecycle paths and GET/PUT returned one `no-referrer`, effective `private,no-store`, nonce CSP, and no unsafe-inline; 4/4 near-miss/default cells retained one `strict-origin-when-cross-origin`;
- `/`, `/login`, and a real immutable Next static asset returned the intended private/default/static cache policies; a configured stale synthetic Session request returned `private,no-store`;
- the fresh database remained at zero Users, Workspaces, Memberships, Sessions, identity tokens, Audit events, Outbox messages, and leads; and
- bounded app/worker/Caddy logs contained no credential/token markers or email-delivery failures. Three application pool-shutdown errors are the safe diagnostic signal for the blocker below. One PostgreSQL `FATAL` line was caused by an operator read-only probe using a nonexistent database name; the corrected protected-environment query passed and service health was unaffected. This is an `UAT-GAP-005` evidence-tooling recurrence.

## Blocking admission defect

Three unauthenticated requests to `GET /api/workspaces/<synthetic-unknown-workspace>/settings` returned **HTTP 500 with an empty response body**. The contract requires bounded HTTP 401 `authentication_required`. Comparable unauthenticated account-profile, account-preference, password-security, and Workspace-leads probes returned bounded 401/403 results.

The three probes produced three application log occurrences of the exact error:

`Cannot use a pool after calling end on the pool`

No identifier, stack, token, email marker, or database detail appeared in the public body. Users, Workspaces, Memberships, Sessions, tokens, Audit, Outbox, leads, and settings remained unchanged at zero. No denial Audit committed.

Read-only source diagnosis identifies an asynchronous pool-lifecycle race: `src/app/api/workspaces/[workspaceId]/settings/route.ts` returns `auditedFailure(...)` without awaiting it, its `finally` closes the pool, and the pending safe-denial Audit then attempts `pool.connect()`. The same non-awaited lifecycle pattern exists in other tenant-admin routes and requires bounded Architecture/Product scoping rather than a live patch.

This is provisional **P1 `UAT-GAP-013`**. It fails bounded tenancy-safe/error/log admission evidence. Tester admission, email journeys, supported-workflow cohort creation, authenticated CRM/settings, Owner/seat/invitation truth, and full Product acceptance stopped and are not represented as passed.

## Admission disposition

| Gate | Result |
| --- | --- |
| Exact provenance, protected config, Option A parity, pinned images/Caddy | PASS |
| Exact UAT target ownership and bounded destruction | PASS |
| Fresh PostgreSQL and migration apply/idempotent rerun | PASS |
| Health, readiness, TLS, listeners, proxy, disabled OIDC | PASS |
| Public/default/static/stale-Session and protected-path header evidence | PASS for the stated credential-free cells |
| Bounded unauthenticated tenant/API denial | **FAIL: Workspace settings returned 500** |
| Approved-recipient verification/resend/recovery/reset/invitation | NOT RUN; approved mailbox gate remained unavailable |
| Supported-workflow Company A/Company B cohort, Owner/seats/roles/CRM/cross-tenant denial | NOT RUN after the blocking denial failure |
| Generated verification/reset/invitation token journey, Audit and Outbox delivery | NOT RUN after the blocking denial failure |

## Final authority and next decision

The public environment remains on `/opt/nexaflow/uat/releases/386d10c-uat7` with a fresh empty database and healthy services for bounded diagnosis only. It is **not admitted for Product UAT**. Operational rollback/rebuild inputs and the retained `.4` application files/image remain available, but restoring the older application is not claimed safe against this newly rebuilt database and would not address the diagnosed route pattern.

Product should authorize a bounded Backend remediation and fresh Backend/Security plus Architecture review. Acceptance must prove the route returns the intended tenant-safe denial, completes exactly one required denial Audit before pool shutdown, emits no unhandled pool error or data disclosure, and preserves zero mutation. Architecture must decide whether the correction covers only settings or every route with the same lifecycle pattern. After controlled integration, a new immutable clean attempt must use an identifier later than `.7`; email-dependent gates still require an approved signed-in controlled mailbox or another secure handoff outside task text.
