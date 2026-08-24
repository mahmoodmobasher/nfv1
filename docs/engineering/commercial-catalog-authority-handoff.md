# Commercial catalog authority data-layer handoff

Date: 2026-08-24

Status: immutable Dev3 candidate prepared for review; no integration or deployment performed

Base: `f1b2ce7ee20d4d9954b37d3db79a3f632cf9265d`

## Product authority encoded

The forward catalog version `2026-08-commercial-v1` defines one self-service Workspace subscription per plan:

| Plan | Active seats, Owner included | Monthly USD cents | Annual monthly-equivalent USD cents |
| --- | ---: | ---: | ---: |
| Essentials | 1 | 6999 | 2400 |
| Growth | 5 | 8999 | 5700 |
| Scale | 15 | 11999 | 10700 |

Every typed row uses `currency_code = USD` and `billing_unit = workspace_subscription`. Annual values are stored only as the explicitly authorized monthly-equivalent display amounts; no annual total or derived discount is introduced. Enterprise remains outside the self-service catalog.

## Migration and data behavior

Migration `0012_commercial_catalog_authority.sql` adds a nullable, all-or-none pricing tuple to preserve historical rows whose price meaning was not previously stored. The database rejects partial tuples, invalid currency shape, non-Workspace units, and non-positive prices.

Older active Essentials/Growth/Scale catalog rows are retained and retired with bounded effective dates. The migration inserts exactly one typed active row per self-service plan and aborts on a conflicting pre-existing copy of the new version.

The migration does not insert, update, or delete `workspace_entitlement_snapshots`. Existing Workspace limits were already authoritative at 1/5/15 and remain byte-stable. New provisioning deterministically selects the newest effective catalog row and copies its unchanged 1/5/15 seats plus `2026-08-commercial-v1` into the new Workspace snapshot. Owner creation remains the first active seat.

Migration rerun is ledger-idempotent. Rollback should normally retain this additive migration and revert consumers: old application code ignores the nullable columns and continues to provision the same seat limits. Deleting the new catalog version after new Workspaces reference it would break historical catalog joins and is not an approved rollback. A corrective forward catalog version is required if commercial values change.

## Dev1 integration contract

Dev1 must integrate from the exact base/candidate ancestry or preserve this data-layer diff byte-for-byte. Public/onboarding presentation should read the active typed catalog tuple, format integer cents as USD, label monthly prices as one Workspace subscription rather than per user, and describe N total active seats with the Owner included. The existing annual display figures remain 24/57/107 monthly-equivalent USD amounts. Billing remains disconnected, and no client-submitted price grants authority.

All active-catalog lookups should use the deterministic order `effective_from desc, created_at desc, id desc` and reject/unavailable-state any active self-service row lacking a complete typed price tuple. Do not update existing entitlement snapshots or infer an annual total.

## Verification

- Diff check, ESLint, and TypeScript: pass.
- Migration direct contract: 2/2 pass.
- Fresh migration apply and immediate ledger rerun: pass/pass.
- Focused PostgreSQL catalog/provisioning/capacity suite: 4/4 pass.
- Full serialized PostgreSQL suite: 143/143 pass across 17 files.
- Full direct suite: 248 pass; 143 PostgreSQL-gated skips.
- Production build: pass; 42/42 static generation tasks and all routes emitted.
- Forward rehearsal from migrations 0000–0011: pass; the pre-existing Workspace entitlement snapshot was unchanged byte-for-byte while the three typed active rows became authoritative.
- Database health: pass.

No shared database, dirty main checkout, UAT, provider, infrastructure, tag, deployment, or release was touched.
