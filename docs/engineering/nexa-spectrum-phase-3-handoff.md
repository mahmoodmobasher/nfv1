# Nexa Spectrum Phase 3 engineering handoff

Date: 2026-08-23  
Branch: `codex/nexa-spectrum-phase12`  
Scope: Phase 3 supported Operational CRM surfaces only; no integration or deployment

## Outcome

The supported CRM routes now use the accepted Nexa Spectrum foundation and shared page-header composition:

- CRM Home, including live, empty, filtered, error, and explicitly labelled demo-preview regions;
- Leads list, search, filter context, empty state, and lead cards;
- Pipeline populated/empty stages, counts, cards, metadata, and Change stage controls;
- lead creation and lead detail/editor forms;
- activity, table, status, dialog, feedback, disabled, hover, focus, and forced-colours presentation;
- desktop, tablet, 320px, and 200% proxy layouts already exercised by the supported browser suite.

Phase 3 styles are scoped to the CRM `ProductShell` adapter and consume only canonical semantic tokens. No route-level Light/Dark branch, raw palette, typography family, radius literal, elevation literal, API, identity, Session, Workspace, Membership, Role, entitlement, Audit, schema, or migration changed.

## Product and Architecture truth retained

- The shell still receives server-filtered navigation from trusted persisted Role context. Hidden links remain presentation only; protected pages and APIs remain authoritative.
- Unsupported global search, global Create, Companies, Contacts, Deals, Delivery, Automation, and other future destinations remain absent.
- CRM search remains the existing tenant-authorized Leads/Pipeline query, not a new global search contract.
- Existing local/UAT limitations and demo-preview labels remain visible and truthful.
- Workspace selection, Session rotation, server-authoritative Light/Dark/System, nonce CSP, configured-cookie privacy, password/recovery, Owner/Admin/Member, Team, ownership, and visibility behavior are unchanged.

## Verification

- `git diff --check`: pass.
- `npm run lint`: pass.
- `npx tsc --noEmit`: pass.
- focused Spectrum/theme/CRM/routes: 25 passed.
- default unit/direct suite: 74 passed; 123 PostgreSQL tests skipped by the default command.
- serialized PostgreSQL suite: 123 passed.
- Next.js 16.3.1 production build: pass; all document routes remain dynamic.
- final supported serial Playwright run: 37/37 passed in one uninterrupted run after bounded stabilization. The tablet journey now waits for the drawer’s promised trigger-focus restoration before sending Tab. Ownership transfer disables its controlled successor selection until client hydration is ready, and the browser journey asserts the exact selected Membership plus the enabled confirmation state before clicking.
- focused stability evidence: tablet focus journey 5/5 and ownership re-auth/transfer journey 5/5.
- the shared S09 component-state sheet passed unchanged after Phase 3 CRM styles were narrowed away from the test sheet.

## Visual evidence

Reviewed and regenerated paired settled baselines are under `tests/e2e/local-identity.spec.ts-snapshots/`:

- `design-system-crm-{light|dark}-darwin.png`;
- `spectrum-crm-home-{light|dark}-{desktop|tablet|mobile|zoom200}-darwin.png`;
- `spectrum-crm-shell-{light|dark}-mobile-darwin.png`;
- `design-system-pipeline-{light|dark}-darwin.png`;
- `spectrum-pipeline-{light|dark}-mobile-darwin.png`.

The Pipeline baseline contains stable populated and empty stages and a keyboard-focused Change stage action. Existing browser assertions cover actual semantic foreground/background contrast, hover/focus boundaries, 320px containment, and 200% proxy behavior in both themes.

## Gate and next increment

Phase 3 requires Product, Graphics, and Architecture acceptance before Phase 4 broadening. Phase 4 will migrate plan selection, registration, verification, login, fixture OIDC states, recovery/reset, Workspace creation/selection/ready, and invitation acceptance without altering their security or tenancy contracts. `/invite` must retain unmistakable preview/non-persistence disclosure; billing/upgrades and production Google remain out of scope.

Do not integrate or deploy this branch directly. After acceptance, retain this immutable Phase 3 checkpoint, then continue Phase 4 on top and repeat the complete gate.

## Stabilization checkpoint

The stabilization changes are intentionally bounded to `TransferClient` hydration readiness and browser orchestration. They do not change recent-auth authority, eligible-successor derivation, transfer payloads, confirmation copy, ownership mutation behavior, or focus styling. Lint, TypeScript, the 74-test direct suite, and the Next.js production build passed after the change.
