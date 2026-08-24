# Commercial catalog and settings UAT attempt 9 deployment result

Date: 2026-08-24

Status: **PASS — `v0.5.0-uat.9` is live for Product UAT.**

UAT URL: `https://app.nexaflowsystems.com`

## Authority and integration

- Accepted runtime candidate: `fa8af681e563a528e418c09afe1e5f961c3fc0d9`.
- Accepted test-isolation candidate: `2c1c78cf76bca5efaeae4dc96a2333e7ef210c27`; it was cherry-picked as `9da17f91181742c793ce6dd4fec0950016a6b14d` with no semantic change.
- `origin/main` advanced by a normal non-force update from `f1b2ce7ee20d4d9954b37d3db79a3f632cf9265d` to exact `9da17f9`; local and remote equality and ancestry passed.
- Annotated tag `v0.5.0-uat.9` has tag object `b2d4378587ad3ebd341b74637f652a9db52c9f67` and resolves exactly to `9da17f9`. Tags `.1` through `.8` were not moved or reused.
- Runtime scope is exact accepted `fa8af68`; the only later delta is the accepted four-file test-isolation correction.

## Local release gate

- Fresh migration apply, immediate rerun, and database health passed.
- Exact prior contamination sequence passed on one database: database `16/16`, onboarding `8/8`, Slice 3 `4/4`; trigger/function residue was zero.
- Full serialized PostgreSQL passed `152/152` across 18 files.
- Direct tests passed `250/250`; lint, TypeScript, production build, `git diff --check`, scope, and ancestry passed.
- Commercial browser journeys passed `12/12`; plan policy passed `2/2`; planless invitation passed `1/1`. The invitation history-security cell had one transient browser `ERR_ABORTED` on `goForward` in the combined run and passed immediately when rerun alone, yielding the required `2/2` invitation disposition without a product failure.
- Accepted settings evidence `4/4` was reused because the settings/shared-shell runtime bytes are identical. No snapshot was updated.

## Artifact and deployment

- Linux/amd64 image: `nexaflow:9da17f9-uat9`; image ID `sha256:d49c5903920856fdc1374c7aea0d16fad0317ee1caa818f5109edd693a5a7a66`; runtime UID/GID `10001:10001`; OCI revision/version match the source and tag.
- Source archive SHA-256: `f410c60bed6f72252e20bda9257359e76d1f7ac86402f22ebfeebdcfc532f609`.
- Image archive SHA-256: `24699698f123d9ade68752f0a08a3559171f735b2f42b3ee3534e97c2f33d16b`.
- Unchanged Caddyfile SHA-256: `69321dae608b422575708c19c7acf03c7e018d35f50ee7a4e4b9da1841477f59`; unchanged Compose SHA-256: `33500a80918e968482119380dc744eefab3dfa8bbdce3e862a8750baaf5e15c4`.
- Protected environment parity passed with only immutable image authority changed. Live and rollback release files remain `root:root` mode `0600`; protected values were not printed.
- Product explicitly declared UAT application data disposable during execution. No application-data backup or restore was required. The existing PostgreSQL and Caddy volumes were not destroyed because migration succeeded in place; Caddy certificate/config state, DNS/TLS, provider authority, and protected environment remained unchanged.
- Migration `0012` applied and the immediate rerun passed. The ledger is `13` at head `1787603528436`.
- Only app and email worker were recreated. At `2026-08-24T22:06:18Z`, app `05589f6f1af6…`, worker `2807942a6545…`, retained Caddy `96e49cda3997…`, PostgreSQL `362787a42cd3…`, and Mailpit `78442a1c11f6…` were running; health-checked services were healthy and all restart counts were zero.

## Live verification

- Repository public smoke passed `8/8`: liveness, readiness, five disabled-OIDC routes, and unauthenticated CRM protection. TLS hostname/certificate smoke passed.
- Protected token/header smoke passed 11 exact lifecycle paths, three synthetic clean capture redirects, and one near miss. Results preserved one effective `no-referrer` on exact/capture routes, edge default on the near miss, private/no-store, nonce CSP without `unsafe-inline`, clean same-origin 303 destinations, and marker absence.
- Public browser smoke passed homepage monthly prices, one-Workspace/Owner-inclusive copy, Enterprise/billing-disconnected truth, annual `$24`/`$57`/`$107` monthly-equivalent selection, hydrated registration requirements and singular one-seat summary, and unauthenticated settings protection.
- Active catalog rows are exactly the typed `2026-08-commercial-v1` authority: Essentials `1 / 6999 / 2400`, Growth `5 / 8999 / 5700`, and Scale `15 / 11999 / 10700`; predecessor rows remain retired.
- Bounded app/worker/Caddy/PostgreSQL logs contain no pool-after-end, unhandled rejection, fatal/panic, stack, database URL, or protected-marker match after switch.

## Warnings, deferred evidence, and rollback

- P3 `UAT-GAP-009` remains open: repeated cache fields are accepted only when identical/effectively private,no-store with no weakening.
- P3 `UAT-GAP-005` recurred in read-only evidence commands: one interrupted artifact transfer was resumed by checksum and one malformed SQL quoting probe failed before a corrected read-only query. Neither changed application authority or data.
- P3 `UAT-GAP-014` records homepage grammar `1 active seats`; authenticated onboarding summaries correctly render `1 active seat`. This is copy-only and does not change the server seat ceiling.
- Product removed prior-data/persona retention as an acceptance requirement. Existing credentialed persona logins/topology, authenticated settings/account-menu smoke, end-to-end planless invitation acceptance, and external transactional delivery were not rerun live and are not represented as passed. Their accepted direct/PostgreSQL/browser evidence remains green. Mailpit presence is not claimed as external delivery.
- Rollback remains app/worker-only: restore `/opt/nexaflow/uat/secrets/release.env.pre-9da17f9-uat9`, repoint to `/opt/nexaflow/uat/releases/cf30f9f-uat8`, and recreate app/worker. Migration `0012` is additive; routine rollback does not remove it or require a database restore.

## Product disposition

**GO:** keep `v0.5.0-uat.9` live at exact `9da17f9` for Product UAT. No production or Phase 5 action is authorized.
