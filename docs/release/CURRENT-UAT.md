# Current UAT release

Status date: 2026-08-27

| Item | Value |
| --- | --- |
| Source revision | `600a9aa96ec598b38aed557c2c4cb9b62d4afc08` |
| Release | `/opt/nexaflow/uat/releases/600a9aa-uat28` |
| Image | `nexaflow:600a9aa-uat28` |
| Image ID | `sha256:ba38d93379c2bf82987b4ff9ed34a7cfab96beb836dc410b1e95a77b829bbca3` |
| Runtime user | `10001:10001` |
| Migration ledger | 26 |
| Migration head | `0025` / `1787793528579` |

At the last deployment check, app, worker, Caddy, and PostgreSQL were running with configured health checks healthy and zero restarts. The latest deployment did not reset or migrate the database.

Public and protected boundary checks passed for private/no-store caching, nonce-based strict-dynamic CSP, nosniff, referrer policy, protected environment permissions, and absence of fatal/unhandled application logs. Production was not changed.

Authenticated Product validation remains the authority for the latest Companies/Contacts visual journey. The Mobasher `basi` Workspace contains ten synthetic Companies, Contacts, and Leads for validation. A separate isolated seed Workspace remains retained until Product explicitly authorizes deletion.
