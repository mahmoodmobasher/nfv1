# Current UAT release

Status date: 2026-08-27

| Item | Value |
| --- | --- |
| Source revision | `4bef3415f368492ed4673627f64daa78a8ca9e7d` |
| Release | `/opt/nexaflow/uat/releases/4bef341-uat30` |
| Image | `nexaflow:4bef341-uat30` |
| Image ID | `sha256:2ad41b17ec50be5043eb244fe6da15fc5dc8b583b276757f4f0809c70179511f` |
| Runtime user | `10001:10001` |
| Migration ledger | 26 |
| Migration head | `0025` / `1787793528579` |

At the last deployment check, app, worker, Caddy, and PostgreSQL were running with configured health checks healthy and zero restarts. The deployment did not reset or migrate the database.

Public and protected boundary checks passed for private/no-store caching, nonce-based strict-dynamic CSP, nosniff, referrer policy, protected environment permissions, and absence of fatal/unhandled application logs. Production was not changed.

Authenticated UAT evidence passed Company and Contact Create, View, v2 Edit, concurrent stale rejection, Archive disappearance, Include archived, and Restore. Both synthetic records ended active at version 5, and the Contact retained one active Company affiliation. Product may continue visual validation. The Mobasher `basi` Workspace contains the earlier synthetic Companies, Contacts, and Leads plus clearly labelled UAT action records. A separate isolated seed Workspace remains retained until Product explicitly authorizes deletion.
