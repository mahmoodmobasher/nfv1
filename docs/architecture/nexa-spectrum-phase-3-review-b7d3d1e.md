# Nexa Spectrum Phase 1–3 Architecture review

Date: 2026-08-23

Candidate: `b7d3d1e742a90b8ac0475042cb2848e46002608d` on `codex/nexa-spectrum-phase12`

Phase 1–2 remediation: `7ae077b6076a08fa586d08d8908ad5b078df6d6b`

Prior Architecture finding: `33564974470ac8e4080b82d0d7f0ee92ef9395b6`

## Verdict

**REJECT — one material P2 release-evidence blocker remains.**

P0: none.

P1: none.

P2: the immutable combined candidate has not produced a clean full Playwright gate. The Phase 3 handoff records two aggregate runs at 36/37: one transient focus-outline failure and one ownership-transfer timeout with the confirmation control disabled (`b7d3d1e:docs/engineering/nexa-spectrum-phase-3-handoff.md:37`). Each test passing alone proves that the paths can pass, but it neither identifies a test-only cause nor proves deterministic full-suite isolation. Architecture's independent serialized rerun also reached 36/37; because that separate branch worktree acquired concurrent uncommitted test edits during execution, it is corroborating diagnostic evidence only and is not immutable-candidate acceptance evidence. The failing area includes recent authentication, Owner transfer, Session rotation, and authorization refresh, so the release gate cannot be waived as visual-only instability.

Required remediation: Dev1/QA must identify and correct the deterministic fixture, ordering, focus, or application cause in a new bounded commit. Acceptance requires (1) a causal explanation demonstrating why production authorization/session behavior is unaffected, if the defect is test-only; (2) the exact failing tests passing in isolation; (3) at least one clean serialized 37/37 full Playwright run from a clean immutable candidate at the declared timeout; and (4) retention of the static, PostgreSQL, build, CSP/cache, theme, Workspace, and visual gates. If diagnosis reveals application behavior, the owning development role must remediate it and add a regression at the appropriate boundary.

P3: none material to this gate.

## Phase 1–2 closing finding

The prior skip-link/modal blocker is closed by `7ae077b`.

- The skip link has its own ref and is included in the open-drawer isolation target set (`7ae077b:src/app/product-shell.tsx:125-156`).
- The fallback now applies `tabindex=-1` to a focusable isolation root as well as its descendants and restores the exact prior state (`7ae077b:src/app/product-shell.tsx:80-105`).
- Browser coverage enumerates the skip link and every non-modal shell region, proves native `inert`, `aria-hidden`, fallback tabindex, failed programmatic focus escape, scroll lock, and exact restoration after direct close, scrim, Escape, route link, history transition, and unmount (`7ae077b:tests/e2e/local-identity.spec.ts:800-1055`).
- The remediation handoff records a clean 37/37 full browser run for the Phase 1–2 checkpoint (`7ae077b:docs/engineering/nexa-spectrum-phase-1-2-second-remediation.md:16-27`).

No Phase 1–2 material Architecture blocker remains.

## Phase 3 accepted architecture findings

- **Centralized configuration:** the authenticated shell retains the thin `experience-product` configuration over the single canonical Spectrum foundation. Phase 3 defines no raw or semantic token values and adds no route-specific theme selector. Static coverage rejects raw colours, theme branches, token declarations, heavy font weights, raw radii, and raw elevation in the migrated Phase 3 boundary (`b7d3d1e:tests/design-system-boundary.test.ts:180-225`).
- **Server-filtered navigation:** the protected server CRM adapter continues to construct the supported navigation from the persisted Role and passes an already-filtered serializable model to the client shell (`b7d3d1e:src/app/crm/crm-shell.tsx:1-23`; `b7d3d1e:src/app/product-navigation.ts:95-107`). Unsupported product destinations remain absent. Hidden navigation remains presentation only; protected routes and APIs remain authoritative.
- **Semantic CRM presentation:** the Phase 3 changes are limited to shared page-header composition on five supported CRM server pages, CRM-scoped semantic CSS, static boundary coverage, baselines, and the handoff. No `src/server`, API, schema, migration, identity, Session, Membership, Role, Audit, entitlement, or Workspace-selection implementation changed between `7ae077b` and `b7d3d1e`.
- **Tenant and record truth:** the pages continue to acquire trusted context through `crmPageContext`; lead, owner, Team, visibility, activity, dashboard, and pipeline data continue through the existing tenant-authorized server read models. Browser labels or navigation do not become authority.
- **CSP, cache, and theme:** Phase 3 adds no script, font, storage, cookie, caching, middleware, or response-header behavior. The accepted nonce bootstrap, configured-cookie privacy, private/no-store authenticated response behavior, server-authoritative Light/Dark/System resolution, preview reconciliation, and System listener lifecycle are unchanged.
- **Responsive and overlays:** Phase 3 styles remain under `.product-shell.crm-preview`, retain semantic overlay blanket/surface/border/shadow tokens, add narrow-layout action reflow, and preserve forced-colours boundaries. Recorded focused evidence covers CRM behavior, semantic contrast, focus, responsive desktop/tablet/320px/200%-proxy states, paired themes, pipeline populated/empty states, and the unchanged shared component sheet.
- **Legacy boundary:** deferred public/auth/onboarding/administration/settings legacy selectors remain outside the migrated Phase 3 marker. The new static test prevents Phase 3 from defining a parallel palette or typography/geometry system. Phase 4–6 remain separately gated; Phase 3 does not authorize deletion of compatibility styles.
- **Rollback:** `b7d3d1e` is a presentation-only Phase 3 checkpoint on top of the accepted `7ae077b` remediation. It can be reverted as one Phase 3 unit—page composition, scoped CSS, static test, baselines, and handoff—without rolling back the accepted Phase 1–2 foundation, CSP/theme behavior, Workspace privacy prerequisite, or application data contracts. Baselines must never be accepted independently of the corresponding code and assertions.

## Verification reviewed

- Candidate diff and changed-file boundary: inspected; no server/API/schema/security file changes.
- `git diff --check 7ae077b..b7d3d1e`: only the handoff's Markdown hard-break whitespace is reported; no application patch whitespace defect.
- Focused local static boundary run: 11/11 passed.
- Handoff evidence: lint, TypeScript, 74 default tests, 123 serialized PostgreSQL tests, production build, 25 focused Spectrum/theme/CRM/routes, CSP/theme/Workspace assertions, and isolated failing-test retries reported passing.
- Full browser release evidence: unresolved at 36/37 and therefore blocking integration/deployment.

Do not integrate, deploy, or broaden to Phase 4 until the P2 is closed on a new immutable candidate. After closure, retain `7ae077b` as the accepted Phase 1–2 checkpoint and `b7d3d1e` (or its bounded successor) as the independently rollbackable Phase 3 unit.
