# Feature 2 Work Item 4 — server-controlled workspace selection

Date: 2026-08-21

Status: **Complete; ready for Architecture and Graphics re-review.**

## Delivered authorization boundary

- `sessions.active_workspace_id` is nullable, server-owned, and foreign-keyed to Workspace. Workspace provisioning sets it transactionally for the newly provisioned Workspace.
- Identity resolution returns the database Session selection. Tenant-scoped API access now requires the route Workspace ID to equal that selected Workspace before resolving Membership and persisted Role. A path or body Workspace ID cannot select or override authority.
- CRM and workspace-administration pages resolve only the selected Workspace. The former earliest/first-Membership query is removed. With exactly one active Membership, the server may bootstrap that one selection once; with multiple active Memberships and no valid selection, the user must use `/workspace/switch`.
- The selectable list returns all and only active Workspaces reached through active Memberships, including current marker and effective persisted Role. Suspended, removed, inactive, and unrelated Workspaces are excluded.
- Switching is CSRF/Origin protected by the shared mutation guard and requires an idempotency key. One transaction validates the active User, owned non-revoked/non-expired Session and matching security version, locks the active target Workspace/Membership/Role, rotates the opaque Session token, persists the selection, writes one safe success audit, and records encrypted response-recovery material. Identical response-loss retries return the same rotated cookie without another mutation or audit; conflicting reuse is rejected.
- Safe target denials retain the current valid selection, write bounded denial evidence, and trigger an immediate authoritative option reload in the UI.

## UI and behavior

- A single active Workspace is displayed as context without switcher friction.
- Multiple Workspaces expose **Switch workspace** and an accessible chooser with Workspace name, current marker, effective Role, busy/status/alert semantics, and 44px mobile actions.
- A successful switch replaces the cookie, navigates to the selected CRM home, and exposes no prior-tenant records. Because browser tabs share the cookie, a second tab reconciles to the selected Workspace on its next request/reload.
- A membership removed while the chooser is open is denied and removed from the list immediately. Logout still revokes access and direct CRM navigation returns to login.

## Exact evidence

- Checked-in migrations: `0009_small_azazel.sql` adds the Session selection FK; `0010_ambiguous_terrax.sql` version-safely extends the persisted audit metadata allowlist for selection events.
- Migration application and rerun: passed. PostgreSQL health: `{ ok: true, latencyMs: 20 }`.
- Focused Work Item 4 PostgreSQL matrix: **8/8 passed**. It covers single-membership bootstrap, A→B rotation/scope, suspended target, removed stale option, cross-tenant direct API path, concurrent identical retry/recovery, multiple-without-selection, and success/denial audit attribution.
- Complete PostgreSQL integration regression: **106/106 passed across 12 files**, including Work Items 1–3 and existing identity, onboarding, CRM, tenant-admin, and ownership suites.
- Unit/direct-route suite: **38/38 passed across 10 files**; **106** database-gated cases skipped there were executed by the integration command above. The two switch-specific route tests prove missing CSRF and cross-origin requests are rejected before database work.
- Combined focused browser regression: **9/9 passed**. Four Work Item 4 journeys cover A→B, two tabs, direct cross-tenant API denial, stale removed option, single-workspace behavior, logout/direct-route protection, and 320px usability. Five WI2–3 journeys retain authority, stale-data, keyboard, 320px, and browser-200% coverage.
- `npm run lint`: passed.
- `npm run build`: passed on Next.js 16.3.1; TypeScript passed and all 32 pages generated.

## Security proof

The session database row—not a query, path, body, browser cache, or earliest Membership—defines the selected Workspace. Every existing tenant-scoped API uses the centralized selected-workspace comparison. The adversarial test sends a valid authenticated request to another active Membership’s Workspace path and receives tenant-safe `resource_not_found`; the selected Workspace remains unchanged. After switching, the inverse prior-Workspace API request is denied, and both browser tabs render only the newly selected tenant after reconciliation.

## Known carry-forward

The four previously documented unrelated legacy Playwright expectations remain non-blocking carry-forward: old CRM mobile trigger wording, old post-join heading, obsolete native Team confirmation expectation, and invitation resend timing. Work Item 4 did not modify those behavior paths; all Work Item 4 and directly relevant Work Item 2–3 journeys pass.

No Work Item 5, broader audit feature, workspace switch beyond this contract, or Feature 3 work was performed.

## WI4-01 Architecture correction

Architecture's bounded `/workspace/ready` blocker is corrected without changing the accepted switch service or API boundary.

- The ready page first resolves `workspaceSummary` with `identity.activeWorkspaceId`.
- If selection is absent, it invokes the centralized selectable-Workspace transaction. Exactly one active Membership may bootstrap the Session selection; multiple active Memberships redirect to `/workspace/switch` without choosing one.
- If no active Membership exists, incomplete onboarding returns to `/workspace/create`; completed onboarding that references an inaccessible Workspace returns to `/login?error=workspace_access`. This breaks the former ready/create loop safely.
- The rendered Workspace, plan, Owner facts, and subsequent CRM tenant are all derived from the selected Workspace.

Fresh WI4-01 evidence:

- Focused browser: **3/3 passed** — real authenticated provisioning reaches **Your workspace is ready**, displays the provisioned Workspace/plan/Owner facts and enters that selected Workspace's CRM; multiple Memberships require the switch page; completed onboarding without Membership uses safe recovery.
- Relevant accepted switch browser regression: **4/4 passed** in the combined correction run.
- Focused onboarding plus Workspace-selection PostgreSQL regression: **15/15 passed across 2 files**.
- Unit/direct-route regression: **38/38 passed**.
- `npm run lint`: passed.
- `npm run build`: passed; TypeScript passed and all 32 pages generated.

Disposition: **ready for WI4-01-only Architecture re-review.**
