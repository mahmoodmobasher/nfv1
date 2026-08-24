# Nexa Spectrum homepage UAT attempt 10 deployment result

Date: 2026-08-24

Status: **PASS — `v0.5.0-uat.10` is live for Product UAT.**

UAT URL: `https://app.nexaflowsystems.com`

## Authority and provenance

- Exact source and `origin/main`: `eee6638201996dc05c6d4e5c53ca59fa04f96fa8`.
- New annotated immutable tag: `v0.5.0-uat.10`; tag object `827042f319e00374f3f0e10771a980d9ec1b5f27`; peeled source exact `eee6638`. The tag was absent locally and remotely before publication; prior tags were not moved or reused.
- Source archive SHA-256: `f89d64af2a410ca926f0ada10e8f61705ad6101b674ca2cdbcfabab597c6dbf4`. The checksum matched after transfer and tag provenance was reverified before build.
- Runtime image: `nexaflow:eee6638-uat10`; image ID `sha256:8e5716615b32c1f828cf9ed742fe57873e64ca71a0a44c755ae99f339c3f1625`; OCI revision/version exact; runtime UID/GID `10001:10001`.

## Validation and deployment

- Exact-head lint, TypeScript, focused seat-copy unit test, production build, and focused homepage Playwright passed. Browser evidence was 8/8 across desktop/tablet/320 Light and Dark, System theme, keyboard/focus, footer contrast, overflow, valid commercial truth, and malformed-catalog fail-closed behavior.
- Protected release configuration was copied root-owned mode `0600`; normalized parity proved only `NEXAFLOW_IMAGE` changed. Secrets, provider authority, DNS/TLS, and Caddy certificate/configuration state were preserved.
- Migration ran twice successfully against retained PostgreSQL. Both were no-ops; ledger remains 13 migrations at head `1787603528436`. No schema or backend/configuration delta was introduced.
- Authority switched atomically to `/opt/nexaflow/uat/releases/eee6638-uat10`. Only app and email worker were recreated. App is healthy, worker running, both exact image with zero restarts. Retained Caddy `96e49cda3997...`, PostgreSQL `362787a42cd3...`, and Mailpit `78442a1c11f6...` remained running/healthy with zero restarts.

## Live admission evidence

- Public liveness and readiness returned 200 with expected bodies; TLS remained valid.
- Homepage rendered exact monthly prices `$69.99`, `$89.99`, `$119.99`, singular `1 active seat, Owner included`, Enterprise contact guidance, and billing-disconnected truth, with no per-user claim.
- Live active catalog remained exactly Essentials `1/6999/2400`, Growth `5/8999/5700`, and Scale `15/11999/10700`, all USD `workspace_subscription`.
- A bounded disposable catalog-corruption probe changed only the Essentials seat value, proved the public homepage failed closed with no plan action, restored exact authority unconditionally, and then proved the singular valid state returned. No Workspace, Membership, entitlement, provider, or configuration mutation was involved.
- Verification, reset, and invitation lifecycle pages retained effective private/no-store caching, `no-referrer`, and nonce CSP. OIDC remained disabled publicly; unauthenticated CRM remained protected.
- Bounded app, worker, Caddy, and PostgreSQL logs contained no pool-after-end, unhandled rejection, fatal/panic, stack, protected environment name, or raw token marker. Services remained healthy with zero restarts.

## Warnings and deferred evidence

- Two operator harness attempts failed before affecting application authority: one local loop variable shadowed shell command lookup, and one remote read-only SQL command had malformed quoting. Corrected deterministic probes passed. This is additional P3 evidence under existing `UAT-GAP-005`; no runtime, schema, data-integrity, or security gate was weakened.
- `UAT-GAP-009` remains P3/non-blocking for repeated identical effective private/no-store fields.
- Controlled-recipient email, authenticated cohort/settings/account-menu, end-to-end invitation acceptance, full Product UAT, and generalized production validation were not run and are not represented as passed.

## Product disposition

**GO:** keep `v0.5.0-uat.10` live at exact `eee6638` for Product UAT. `UAT-GAP-014` is closed. Production and Phase 5 remain unauthorized.
