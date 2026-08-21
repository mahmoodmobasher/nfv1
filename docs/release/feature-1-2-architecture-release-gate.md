# Feature 1 + Feature 2 Architecture Release Gate

Review date: 2026-08-21  
Review type: bounded Git/UAT release-candidate Architecture gate  
Verdict: **ACCEPT — Architecture-ready for controlled Git publication and UAT review**  
Workspace milestone: **NexaFlow Workspace Foundation Complete — Architecture ACCEPT for this local candidate**  
Change boundary: documentation review only; no application code changed, no commit/push/tag, no deployment, and no external infrastructure accessed

## 1. Decision

The current Feature 1 + Feature 2 working-tree candidate is **ACCEPTED** for controlled Git publication and subsequent Operations-governed UAT review. No evidence-backed material blocker remains in tenant isolation, authentication/Session/Active Workspace enforcement, last-Owner protection, secret handling, transactional provisioning/administration/Audit, migration compatibility, local-fixture separation, or the supported primary journeys.

Architecture formally accepts the local candidate as satisfying the technical milestone **NexaFlow Workspace Foundation Complete**. Product must still approve the release candidate and end-to-end Product acceptance; Operations must clear the deployment stop conditions in section 7 before changing UAT. This verdict does not authorize a commit, push, tag, image publication, deployment, DNS/firewall change, provider configuration, or production release.

The Workspace Foundation must now be treated as inherited platform infrastructure. After Product acceptance, do not expand or refactor it speculatively. Reopen it only when a real downstream vertical demonstrates a concrete unmet requirement.

## 2. Review basis

Durable sources reviewed:

- [`feature-1-2-release-readiness.md`](./feature-1-2-release-readiness.md)
- [`feature-1-2-ux-release-gate.md`](./feature-1-2-ux-release-gate.md)
- [`architecture-handover.md`](../handover/architecture-handover.md)
- [`workspace-foundation-direction.md`](../architecture/workspace-foundation-direction.md)
- [`workspace-provisioning-validation.md`](../architecture/workspace-provisioning-validation.md)
- [`feature-2-work-item-2-review.md`](../architecture/feature-2-work-item-2-review.md)
- [`feature-2-work-item-3-review.md`](../architecture/feature-2-work-item-3-review.md)
- [`feature-2-work-item-4-review.md`](../architecture/feature-2-work-item-4-review.md)
- [`feature-2-work-item-5-audit-review.md`](../architecture/feature-2-work-item-5-audit-review.md)
- [`delivery-scope-reset.md`](../architecture/delivery-scope-reset.md)

Source/configuration inspected included the current Session/tenant resolver, Workspace selection, provisioning, Membership/Role/Owner/invitation services, canonical Audit boundary, environment validation, migrations `0009` and `0010`, Dockerfile, UAT Compose topology, health endpoints, backup/restore scripts, and UAT smoke checks.

Independent Architecture run on 2026-08-21:

| Check | Result |
| --- | --- |
| Onboarding boundary PostgreSQL | **7/7 passed** |
| Slice 3 provisioning/ownership PostgreSQL | **4/4 passed** |
| Slice 4 tenant-administration PostgreSQL | **24/24 passed** |
| Workspace-selection PostgreSQL | **8/8 passed** |
| Audit-completion PostgreSQL | **5/5 passed** |
| Combined independent high-risk run | **48/48 passed across 5 files** |
| Diff whitespace check | **passed** |

Development additionally records a clean isolated dependency install and Drizzle check; empty-database migration plus immediate/final rerun with 11 ledger rows; database health; unit/routes **41/41**; supported serial PostgreSQL **111/111**; full Playwright **25/25**; lint, TypeScript, Next 16.3.1 production build, UAT Compose rendering, non-root production image build, and secret scan. The evidence is internally consistent with the inspected implementation and the independent results.

## 3. Material release-risk disposition

### Tenant isolation and Active Workspace authority — ACCEPT

- Active Workspace is server-owned Session state, not path/body/query/browser authority.
- Every reviewed tenant route resolves an active User/Session, selected active Workspace, active Membership, and persisted Workspace-local Role.
- Multiple Memberships require explicit selection; exactly-one bootstrap is centralized; earliest/first Membership is not authority.
- Non-selected, stale, inactive, and cross-tenant targets are safely denied without implicit switching or foreign-resource disclosure.
- Browser evidence covers A→B switching, two-tab reconciliation, stale option removal, direct prior-tenant API denial, and logout protection.

No material cross-tenant blocker was found.

### Authentication, Session, and fixture separation — ACCEPT

- Opaque server Sessions retain idle/absolute expiry, security-version invalidation, rotation, revocation, CSRF/Origin enforcement, and logout semantics accepted in prior gates.
- Production environment parsing rejects local database addresses, local Session-secret placeholders, non-HTTPS origin, and `OIDC_MODE=fixture`.
- UAT smoke requires every fixture OIDC start/callback/issuer path to return 404. Real Google remains unavailable; the supported UAT identity journey is password authentication unless a separately reviewed real provider adapter is later supplied.
- Local fixture OIDC is accepted only as local test evidence. It must remain disabled in any `NODE_ENV=production` UAT container.
- Mailpit and the email worker are optional UAT-only profile services; Mailpit UI remains loopback-bound. They are not production transactional email.

No authentication/Session bypass or fixture-to-production confusion was found in the candidate.

### Provisioning, Membership, RBAC, Teams, ownership, and entitlement — ACCEPT

- Workspace, sole initial Owner Membership, Workspace-local Role definitions, entitlement snapshot, trial, onboarding completion, Audit, Outbox, and idempotency commit atomically.
- Invitation acceptance preserves an existing active Membership and Owner state; reactivation uses the unique row and enforces seat capacity under lock.
- Owner/Admin/Member ceilings and Team scope are re-resolved from persisted authority. Generic APIs cannot grant or mutate Owner.
- Owner transfer requires recent authentication and expected versions, promotes before demoting, rotates/recoverably hands off the Session, records correct actor/target attribution, and preserves one active Owner under rollback and concurrency.
- Package and seat authority comes from the server catalog/Workspace entitlement snapshot, not browser prices or limits.

No last-Owner or non-atomic administration blocker was found.

### Audit, idempotency, concurrency, and sensitive data — ACCEPT

- Canonical Feature 2 success events are transactional with business state and applicable Outbox/idempotency outcomes.
- Route and service denial ownership avoids duplicate Audit events; authenticated request-boundary and business denials use bounded reason codes.
- Same-key replay does not duplicate mutation, Audit, Outbox, seat use, or Session rotation. Changed-key input conflicts safely.
- Concurrent invitation, seat, ownership, Membership, and Workspace-selection cases retain committed-winner semantics and no false success evidence.
- Runtime Audit allowlists reject unsafe metadata/state. Correlations do not store plaintext idempotency keys, and unresolved/cross-tenant denials omit foreign target details.
- The release scan found no candidate secret patterns. Local environment files and generated outputs remain excluded from Git.

No secret-disclosure or Audit/data-atomicity blocker was found.

### Migration safety and rollback — ACCEPT WITH OPERATIONS CONDITIONS

- The current migration chain has 11 ledger entries and applies successfully to an empty isolated PostgreSQL database; immediate and final reruns are ledger-safe.
- `0009` is an additive nullable Session Active Workspace column plus Workspace foreign key.
- `0010` broadens the existing Audit metadata allowlist only by the accepted `selection_version` key. Existing rows valid under the prior allowlist remain valid.
- These two migrations are backward-compatible with the previous application image at the schema level. There are no destructive table/column drops or data rewrites in this release increment.
- Raw SQL files are not manually idempotent and must never be rerun directly; the one-shot migration service and Drizzle ledger are the only accepted application path.
- There are no down migrations. Rollback authority therefore comes from immutable prior-image selection plus a verified pre-release encrypted logical backup/restore when incompatible post-release writes cannot be retained.

Migration readiness does not waive the mandatory pre-deployment backup, restore proof, migration-ledger check, and prior-image digest capture.

### Primary onboarding and administration journeys — ACCEPT

Fresh full Playwright evidence is **25/25** and covers password registration/verification/login/recovery, Session expiry/revocation/logout, local fixture protocol failure, sole-Owner provisioning, Workspace-ready recovery, invitations and acceptance, Membership lifecycle, authority-aware Roles, Teams, stale conflict/reload, recent-auth Owner transfer with rotated Session, explicit Workspace switching, tenant denial, and responsive/accessibility paths.

Graphics separately issued **ACCEPT**. The four historical legacy browser failures are no longer present.

No broken primary Feature 1 or Feature 2 journey remains in the supported local candidate.

## 4. Historical pre-UAT controls — final disposition

The four items deferred by `delivery-scope-reset.md` are dispositioned as follows for this candidate:

1. **Owner-transfer response-loss replay — CLOSED.** Recovery is bound to operation/key/canonical request hash and the old or rotated Session hash; recovery material is encrypted and expires after a tight bounded interval. Identical recovery returns the same rotated Session without repeating Role writes or Audit. Changed input conflicts; expired recovery denies. PostgreSQL response-loss/concurrency tests and the browser recent-auth transfer journey pass.
2. **Route-level denial Audit and normalized-destination rate limiting — CLOSED FOR FEATURE 2.** Feature 2 mutation routes use authenticated mutation guards and explicit route/service Audit ownership. Invitation rate dimensions include persisted actor, Workspace, network, and normalized destination; invalid/foreign targets remain bounded. Work Item 5 focused evidence proves one route/service denial owner, canonical taxonomy, and no foreign target leakage. This closure applies to Feature 2 routes; future vertical routes must inherit the same contract rather than assuming blanket coverage.
3. **Fixture-OIDC recent-auth browser stability — CLOSED FOR LOCAL TESTING.** The current full Playwright run passes the recent fixture re-authentication and Owner-transfer/rotated-Session journey. Fixture OIDC remains prohibited in production and is not evidence of real Google readiness.
4. **Clean full Playwright rerun and invitation-administration polish — CLOSED FOR THIS CANDIDATE.** The full supported suite is **25/25**. Current invitation, Team confirmation/focus, stale conflict, role ceiling, resend/seat, and acceptance journeys pass; Graphics issued ACCEPT.

No historical pre-UAT item remains an Architecture blocker for controlled Git publication or UAT review of this candidate.

## 5. Accepted residual risks

- Four moderate findings remain in a development-only `drizzle-kit`/esbuild dependency chain. The vulnerable path is absent from the production image's `npm ci --omit=dev` stage, and the proposed forced audit repair would introduce a breaking historical Drizzle version. This is accepted for the candidate; track a separately tested normal dependency upgrade when available. Any new high/critical production dependency finding reopens the gate.
- Real Google OIDC, production transactional email, billing/post-provision plan changes, Audit history/retention/export, and generalized production operations are not part of the Workspace Foundation milestone.
- The supported integration command is deliberately serial because suites share a database. An ad hoc concurrent all-test command can deadlock shared fixtures; this is test-harness behavior, not accepted production concurrency behavior. CI/release instructions must continue to use `npm run test:integration`.
- The current candidate is a materially dirty working tree. Publication must stage the exact reviewed inventory and repeat index-based diff/secret checks; this Architecture verdict does not attest to a later differently staged tree.

## 6. UAT configuration assumptions

The candidate may proceed to UAT review only under these explicit assumptions:

- `NODE_ENV=production`, HTTPS `APP_ORIGIN`, externally generated Session/proxy secrets, non-local PostgreSQL service URL, and `OIDC_MODE=disabled` pass server environment validation.
- The image is referenced by immutable registry digest, runs as UID/GID `10001:10001`, uses a read-only root filesystem, drops capabilities, and exposes only internal app port 3000.
- PostgreSQL remains internal-only with a persistent named volume. App/PostgreSQL are not published directly to the host network.
- Caddy is the only ingress. Bind address, DNS, canonical domain, TLS/ACME contact, firewall, and public exposure are explicit Operations/Product decisions; Compose's loopback defaults must not be mistaken for public UAT readiness.
- Trusted proxy mode is enabled only when Caddy and app receive the same protected proxy secret.
- Password authentication is the supported UAT path. Fixture OIDC remains disabled; real Google remains unavailable.
- If local/UAT email demonstration is required, explicitly enable the `uat-mail` profile and keep Mailpit UI loopback-only. Do not represent this as production email delivery.
- Operations renews read-only host discovery and verifies current nine-to-eleven migration assumptions against actual host state before any write.

## 7. Mandatory stop conditions before UAT deployment

Architecture acceptance does not clear these Operations/Product stop conditions:

1. explicit user/Product authorization to publish and deploy;
2. renewed read-only discovery of the target host, running Compose projects, ports, firewall, storage, current image, and current migration ledger;
3. reviewed exact Git index, staged secret scan, commit series/tag, immutable image digest, and registry access;
4. protected app/PostgreSQL/Caddy environment files with correct ownership/mode and independently generated secrets;
5. confirmed DNS/domain/TLS/public-UAT decision and SSH source restrictions;
6. encrypted pre-release backup plus manifest and successful restore into a new disposable database, with backup key owner/destination confirmed;
7. recorded prior immutable image digest/release pointer and migration head;
8. UAT Compose render from the real protected environment files;
9. migration service run twice, exactly 11 ledger rows verified, and readiness healthy before traffic;
10. post-deployment HTTPS smoke proving fixture OIDC 404, unauthenticated CRM protection, password login/logout, Active Workspace context, invitation/Membership administration, tenant denial, CRM read/write, Outbox/email mode, and Audit evidence;
11. rollback rehearsal/decision using the prior image, preserved database or restored backup as appropriate; and
12. no destructive volume deletion, mutable image authority, plaintext reusable credentials, or unreviewed host cleanup.

Failure of any stop condition means **do not deploy**. It does not change the local candidate verdict unless it reveals a candidate defect.

## 8. Publication and milestone disposition

- **Git publication readiness:** ACCEPT, subject to exact staged-inventory and staged-secret verification plus explicit authorization.
- **UAT review readiness:** ACCEPT, subject to section 7 Operations/Product stop conditions.
- **UAT deployment authorization:** NOT GRANTED by this review.
- **Production/provider readiness:** NOT CLAIMED.
- **NexaFlow Workspace Foundation Complete:** **Architecture ACCEPT for the reviewed local candidate.** Product may now issue the formal Feature 2/milestone acceptance decision.
- **Next product work:** after Product acceptance, begin only the next approved vertical and inherit the Workspace Foundation contract. Do not reopen accepted foundation work without a concrete downstream gap.

## 9. Blockers

**None in the reviewed local release candidate.**

Any later difference in staged files, image contents, migrations, environment configuration, or target-host state requires proportionate revalidation before publication or deployment.
