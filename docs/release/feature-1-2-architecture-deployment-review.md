# Feature 1 + Feature 2 Architecture Post-Deployment Review

Review date: 2026-08-21

Verdict: **ACCEPT**

Scope: bounded post-deployment review of NexaFlow UAT; read-only Architecture review

Application changes: none

## Decision

The deployed Feature 1 + Feature 2 / Workspace Foundation candidate is **ACCEPTED for UAT**. No evidence-backed material deployment risk was found in target scope, secrets, public fixture exposure, authentication/Session or tenant enforcement, mandatory Owner state, migration usability, TLS, or the primary onboarding/administration journey.

This accepts the UAT deployment; it is not production/provider authorization and does not start Feature 3.

## Release identity verified

- Deployed application commit: `c1125ba7c7b5bc075b89003eb0ecc9840665b5e1`
- Annotated tag `v0.2.0-rc.2` resolves to that commit.
- Deployment-evidence commit: `d005d52772ad49268b87dce1c01004a8859825f1`
- Recorded image digest: `sha256:320715aa55983fa07e50ba71cfed9fe2dbb26080278f4caddc8f24792a96e279`
- Reviewed target: `https://app.nexaflowsystems.com`
- Recorded host scope: AWS Lightsail `99.79.158.110`, NexaFlow UAT only

## Bounded findings

- **Target/system scope — ACCEPT:** deployment evidence identifies the intended NexaFlow UAT release directory, current pointer, image, host, and public hostname. It reports no unrelated host, DNS-zone, or service changes.
- **Secrets — ACCEPT:** staged scans excluded environment/credential material; protected UAT files were consumed without values being printed. No secret is present in the deployment report or observed public responses.
- **Fixture/provider separation — ACCEPT:** production mode and HTTPS origin are recorded. Independent public checks returned **404** for OIDC fixture/start/callback and recent-OIDC start/callback routes. Real Google is not represented as enabled. Mailpit remains private and loopback-only.
- **Authentication/Session and tenant boundary — ACCEPT:** real-browser evidence passed registration, verification, safe login denials, login/logout, refresh, Back/direct-route protection, selected Workspace context, and a tenant-mismatched resource **404**. Independent unauthenticated `/crm` inspection resolved to `/login?next=/crm` and exposed no CRM data.
- **Owner/provisioning invariant — ACCEPT:** deployed browser and database evidence shows successful atomic Workspace provisioning with the initiating sole Owner, entitlement/context, and corresponding `workspace.created` plus `workspace.initial_owner_assigned` Audit events. No last-Owner loss is evidenced.
- **Migrations/data usability — ACCEPT:** all 11 migrations applied and an immediate rerun was ledger-safe. PostgreSQL, app, Caddy, Mailpit, and worker were healthy; the complete post-migration primary journey performed Workspace, CRM Lead, People/Role, invitation, Outbox, Audit, refresh, and re-login operations successfully.
- **TLS/public exposure — ACCEPT:** independent HTTPS checks returned HTTP/2 200 for liveness/readiness with `Cache-Control: no-store`, HSTS, Caddy ingress, and expected security headers. Apex HTTPS rendered successfully and `www` resolved to the HTTPS apex. Application/PostgreSQL are recorded as not directly host-published; Caddy is the sole public edge.
- **Production hydration hotfix — ACCEPT:** the rc.1 title mutation loop was corrected in rc.2. The final deployed commit passed lint, unit/routes **41/41**, TypeScript/build, and real-browser rendering. Independent `/register` returned HTTP 200 with a stable NexaFlow title.

The user explicitly waived backup, restore proof, and preservation of old UAT state. Their absence is not a blocker in this review. Removal of six disposable login-throttle rows during bounded smoke did not alter User, Session, Workspace, Membership, Role, Lead, Invitation, Audit, idempotency, entitlement, migration, or Outbox records and is not a material deployment defect.

## Independent public checks

Performed read-only on 2026-08-21:

| Check | Result |
| --- | --- |
| `/api/health/live` | **200**, `{"status":"live"}` |
| `/api/health/ready` | **200**, `{"status":"ready"}` |
| Fixture/general OIDC routes | **404** across all five checked paths |
| Unauthenticated `/crm` | protected; resolves to `/login?next=/crm` |
| `/register` | **200**, stable rendered title |
| App/apex/www HTTPS | reachable; `www` resolves to HTTPS apex |

## Residual UAT boundaries

- UAT uses password identity and private Mailpit delivery. Real Google and production transactional email remain unavailable.
- This is not production acceptance. Billing changes, production providers, Audit history/retention/export, production operations, and later verticals remain separately scoped.
- The recorded image digest/commit/tag must remain the authority for this accepted deployment. A different image, environment, migration state, hostname, or public fixture setting requires proportionate re-review.

## Blockers

**None.**
