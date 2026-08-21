# Feature 2 Work Item 4 — Architecture Gate Review

Status: **ACCEPT**  
Review date: 2026-08-21  
Scope: server-controlled Workspace selection  
Review mode: read-only source, migrations, documentation, and local evidence; no application code or external system changed

## Final WI4-01 re-review verdict

**ACCEPT. WI4-01 is resolved and no material Work Item 4 blocker remains.**

The corrected `/workspace/ready` page first resolves the Workspace from `identity.activeWorkspaceId`. When selection is absent, it invokes the centralized selectable-Workspace transaction, which revalidates the active User and Session and bootstraps only an exactly-one active Membership. Multiple active Memberships redirect to `/workspace/switch` without implicit selection. No active Membership uses safe onboarding recovery: incomplete onboarding returns to creation, while completed onboarding whose Workspace is inaccessible goes to `/login?error=workspace_access` and cannot enter the former ready/create loop.

The resulting summary requires an explicit Workspace ID and an active Workspace/Membership/same-Workspace Role join. The displayed Workspace, plan, and Owner facts therefore derive from the selected Workspace. The subsequent CRM route independently enforces that same Session selection.

Independent re-run on 2026-08-21:

| Check | Result |
| --- | --- |
| Focused Workspace-ready browser suite | **3/3 passed** |
| Previously accepted Workspace-switch browser suite | **4/4 passed** |
| Combined independent browser run | **7/7 passed** |

Development's checkpoint additionally records onboarding plus selection PostgreSQL **15/15**, unit/direct-route **38/38**, lint success, and production build success. The focused browser cases prove successful provisioning renders the selected Workspace/plan/Owner and enters its CRM, multiple Memberships require explicit selection, and completed inaccessible onboarding recovers without a creation loop.

WI4-01 is closed. Feature 2 Work Item 4 is architecture-accepted, and Development/Product may proceed to the next product-approved Feature 2 work item. The accepted switching boundary and unrelated deferred work must not be reopened without new evidence of a material risk.

## Initial verdict (superseded by the final WI4-01 re-review above)

The server-controlled Workspace-selection boundary is materially sound: selection is Session-owned, tenant APIs compare route Workspace to the selected Workspace, switching validates persisted authority and rotates the Session, and focused tenant-isolation/replay/logout evidence passes.

Work Item 4 is nevertheless rejected for one direct regression in the primary onboarding journey. `/workspace/ready` still invokes `workspaceSummary(pool, identity.userId)` without the newly required selected Workspace ID. `workspaceSummary` now returns `null` when no Workspace ID is supplied, so a successfully provisioned User is redirected back to `/workspace/create` instead of seeing the Workspace-ready page.

The checkpoint classifies the old post-join heading failure as unrelated. Current source proves it is affected by WI4's removal of implicit/first-Membership resolution. This is a broken primary journey and therefore a material blocker under the requested gate.

No other material blocker was found.

## Evidence reviewed

- `docs/engineering/feature-2-workspace-selection-checkpoint.md`
- `docs/architecture/feature-2-user-role-membership-contract.md`
- migrations `0009_small_azazel.sql` and `0010_ambiguous_terrax.sql`
- Session schema and identity resolver
- `src/server/workspaces/selection.ts`
- Workspace provisioning and summary resolution
- CRM/admin page context and layout boundaries
- all Workspace-scoped API routes
- Workspace chooser route, page, and client
- logout/session revocation path
- WI4 PostgreSQL, route, and browser tests
- `/workspace/ready` and Workspace creation redirect flow

## Independent checks

| Check | Result |
| --- | --- |
| Focused WI4 PostgreSQL suite | **8/8 passed** |
| Complete PostgreSQL integration suite | **106/106 passed across 12 files** |
| Focused WI4 browser suite | **4/4 passed** |

Development additionally records **38/38** unit/direct-route tests, **9/9** combined relevant browser tests, lint success, and production build success. These results support the switch boundary but do not exercise the broken post-provision ready page with the new explicit selection argument.

## Material invariant assessment

### Session-owned selection and migrations

**ACCEPT.**

- Migration 0009 adds nullable `sessions.active_workspace_id` with a foreign key to Workspace and `on delete set null`.
- Application writes selection only through provisioning, one-Workspace bootstrap, invalidation, or the protected switch service.
- Migration 0010 version-safely extends the audit metadata allowlist with `selection_version`; it does not weaken the remaining allowlist.
- Identity resolution returns selection from the validated Session row. Query, path, body, client cache, and Role labels cannot set authority.

### Active identity, Workspace, Membership, and Role validation

**ACCEPT.**

Selectable-list and switch transactions validate active User, Session ownership, revocation, idle/absolute expiry, matching security version, active Workspace, active Membership, and same-Workspace persisted Role. Target rows are locked before selection mutation.

Suspended, removed, inactive, unknown, and unrelated targets are omitted or denied. Failed switches leave the prior selection unchanged.

### Bootstrap and explicit selection

**ACCEPT.**

- Exactly one active Membership may be bootstrapped once into the Session.
- With multiple active Memberships and no valid selection, no Workspace is chosen; the User must visit `/workspace/switch`.
- An invalid prior selection is cleared and safely audited without choosing among multiple Memberships.
- `workspaceSummary` no longer orders or limits Memberships to choose authority; it requires an explicit Workspace ID.

### Tenant-scoped CRM/admin pages and APIs

**ACCEPT, except the ready-page blocker below.**

- CRM and Workspace-administration page contexts resolve only the Session-selected Workspace.
- Central `tenant()` requires path Workspace ID to equal the validated Session selection before persisted tenant context is resolved.
- Existing Workspace-scoped Lead, activity, settings, people, invitation, Membership, ownership, Role-policy, Team, and TeamMembership routes use this boundary.
- Body resource IDs remain subordinate to selected tenant context and same-Workspace service predicates.
- After A→B, API access to A is tenant-safe denied; browser evidence shows both tabs reconcile to B and prior-tenant CRM data is not displayed.

### Session rotation, replay, and idempotency

**ACCEPT.**

- Switch requires CSRF/origin protection and an idempotency key.
- One transaction validates and locks authority, changes selection, rotates the opaque Session hash, writes one success audit, and stores one idempotency outcome.
- Recovery material is encrypted; plaintext Session token is not stored.
- Concurrent identical response-loss retries return the same rotated token and Workspace result with one mutation, audit, and idempotency record.
- Changed request under the same key conflicts. Invalid target paths do not alter selection.

### Two-tab behavior and logout

**ACCEPT.**

Selection is Session-wide. Tabs share the rotated cookie and resolve the new Workspace on their next request/reload. Focused browser evidence proves A→B across two tabs and denial of prior A APIs.

Logout revokes the Session; direct CRM navigation subsequently redirects to login.

### Audit boundary

**ACCEPT.**

- Success uses `workspace.selection_changed` with target Workspace and target Membership attribution.
- One-Workspace bootstrap uses `workspace.selection_bootstrapped`.
- Invalid stored selection uses `workspace.selection_invalidated` with bounded denial reason.
- Failed switches use `workspace.selection_change_denied` and retain prior selection.
- Audit metadata is bounded by the database allowlist and contains no Session token/hash or foreign Workspace detail.

## Original blocking finding (closed)

### WI4-01 — Restore selected Workspace resolution on `/workspace/ready`

Current failure:

1. Workspace provisioning sets `sessions.active_workspace_id` and redirects the browser to `/workspace/ready`.
2. The ready page resolves the valid identity, including `identity.activeWorkspaceId`.
3. It calls `workspaceSummary(pool, identity.userId)` without that ID.
4. The revised summary helper immediately returns `null` without an explicit ID.
5. The page redirects to `/workspace/create`; that page sees completed onboarding and redirects back to `/workspace/ready`, creating a broken redirect journey rather than rendering success.

Required bounded correction:

- Resolve the ready-page Workspace strictly from `identity.activeWorkspaceId` and the active User/Membership/Workspace join, using the same selected-Workspace rule as CRM/admin pages.
- Do not restore first/earliest-Membership fallback.
- If the selection is absent with one active Membership, use the centralized one-Workspace bootstrap; if multiple exist, redirect to `/workspace/switch`; if none exist, use the safe onboarding recovery path.
- Add a focused browser or server-page journey proving successful provisioning reaches **Your workspace is ready**, displays the selected Workspace/plan/Owner facts, and then enters only that Workspace's CRM.
- Add a multiple-Membership regression proving `/workspace/ready` never picks the earliest Membership.

Re-review should inspect only WI4-01 and its evidence.

## Non-blocking boundaries

- The old CRM mobile trigger wording, Team confirmation expectation, and invitation resend timing remain unrelated legacy browser failures.
- The post-join heading failure is **not** unrelated and is the bounded blocker above.
- Missing `(user_id, active_workspace_id)` index from the aspirational contract is not material at current scale and does not weaken authorization; it may be added as routine migration hygiene.
- Feature 3, real Google, billing changes, deployment, and unrelated pre-UAT hardening remain out of scope.
