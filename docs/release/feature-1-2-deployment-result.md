# Feature 1 + Feature 2 UAT deployment result

Date: 2026-08-21

Status: **deployed and post-deployment smoke passed**

Scope: Feature 1 + Feature 2 / NexaFlow Workspace Foundation only

## Release identity

- Published branch: `origin/main`
- Initial release commit: `8f82320f6706bc95393d2a12f46403bd9846df82`
- Initial tag: `v0.2.0-rc.1`
- Final deployed commit: `c1125ba7c7b5bc075b89003eb0ecc9840665b5e1`
- Final immutable tag: `v0.2.0-rc.2`
- Deployed image: `nexaflow:c1125ba`
- Image digest: `sha256:320715aa55983fa07e50ba71cfed9fe2dbb26080278f4caddc8f24792a96e279`
- UAT release directory: `/opt/nexaflow/uat/releases/c1125ba`
- UAT current pointer: `/opt/nexaflow/uat/current` → `/opt/nexaflow/uat/releases/c1125ba`
- Public application: `https://app.nexaflowsystems.com`
- Apex site: `https://nexaflowsystems.com`
- `www`: redirects permanently to `https://nexaflowsystems.com/`
- Target: AWS Lightsail host `99.79.158.110`, NexaFlow UAT scope only

Both commits and both annotated tags were pushed normally. No force-push was used and the remote did not diverge.

## Staged publication controls

The authoritative local release set contained 112 staged paths: 71 additions and 41 modifications. Legitimate application code, all 11 migrations, tests, diagrams/assets, contracts, engineering evidence, and handover material were included.

Generated/runtime and sensitive material remained excluded: `.next`, `node_modules`, Playwright output, local environment files, logs, coverage, private keys, and credential material. A staged inventory review and high-confidence staged secret scan found no credential or private-key material. The protected UAT environment files were consumed in place without printing their values.

## UAT configuration boundary

- `NODE_ENV=production` was confirmed without exposing values beyond the policy setting.
- Public fixture OIDC remains disabled.
- The application origin is HTTPS.
- Mail delivery uses the intended private UAT Mailpit path; Mailpit UI remains loopback-only on `127.0.0.1:8025`.
- PostgreSQL and the application are not exposed directly on host ports.
- Caddy is the only public application edge on ports 80/443.
- No real Google, Resend, or other external provider credential was installed.

The user explicitly waived backup, restore proof, and preservation of old UAT state for this release. No new backup was created. The existing PostgreSQL volume was migrated in place; no unrelated service, host, DNS zone, or environment was changed.

## Migration and runtime result

- The checked-in migration service ran successfully.
- An immediate second run also completed successfully, proving ledger-safe rerun behavior.
- `drizzle.__drizzle_migrations` contains exactly **11** rows.
- The final application and worker use the same immutable `nexaflow:c1125ba` image.
- PostgreSQL: healthy.
- Application: healthy.
- Caddy: healthy.
- Mailpit: healthy and loopback-only.
- Email worker: running as the non-root application user.
- `https://app.nexaflowsystems.com/api/health/ready`: HTTP 200 with `Cache-Control: no-store`.
- The repository's bounded HTTPS smoke script passed against `https://app.nexaflowsystems.com`.

## Production-rendering blocker and hotfix

The first `v0.2.0-rc.1` deployment passed process/readiness checks but a real browser exposed a production hydration loop on client-rendered onboarding routes. `TitleUpdater` observed the document head and rewrote `document.title` from its own observer callback, continuously retriggering itself and leaving the registration UI behind the loading boundary.

The bounded repair in `src/app/onboarding/title-updater.tsx` now derives the title once per pathname change and writes only when necessary; it no longer observes its own mutation. Before publication of the hotfix:

- ESLint passed with zero errors/warnings.
- Unit/direct-route suite passed: **41/41** tests; database-gated tests remained intentionally skipped in this proportional hotfix run.
- Next.js 16.3.1 production build and TypeScript passed; all 32 static pages and dynamic routes compiled.
- A staged inventory and secret scan passed.

The repair was committed as `c1125ba7c7b5bc075b89003eb0ecc9840665b5e1`, pushed to `origin/main`, tagged `v0.2.0-rc.2`, rebuilt on the AMD64 UAT host, migrated twice, and deployed as the final image above. Real-browser rendering then succeeded.

## Browser and service smoke evidence

Only generated `example.test` identities and CRM records were used. No personal or production customer data was entered.

The combined fresh-registration and continuation smoke passed:

- public HTTPS login route rendered;
- password registration accepted;
- unverified account login denied with the enumeration-safe credential message;
- private Mailpit received the verification message;
- verification link activated the account;
- wrong password was denied with the same safe message;
- verified password login succeeded;
- authenticated plan/cadence resumed and Workspace creation succeeded;
- server-selected Workspace and sole initiating Owner were shown;
- protected CRM entry succeeded and refresh retained the session;
- persistent Lead create/detail read succeeded;
- People and Roles rendered under the selected Workspace;
- invitation creation succeeded and the invitation message reached private Mailpit;
- a direct mismatched Workspace resource request returned tenant-safe HTTP 404;
- server logout succeeded;
- browser Back could not reuse the session and returned to login;
- direct `/crm` access could not reuse the logged-out session and returned to login;
- password login after logout succeeded and reopened CRM home.

Repeated diagnostic attempts correctly reached the configured UAT login throttle. To complete one clean final smoke, exactly six disposable rows with `action = 'login'` were removed from `rate_limit_windows`. No User, Session, Workspace, Membership, Role, Lead, Invitation, Audit, idempotency, entitlement, migration, or outbox data was deleted.

## Database evidence

Recent successful audit evidence after deployment included:

- `identity.registered`: 5 success
- `identity.email_verified`: 1 success
- `identity.login`: 7 success and 5 safe denials
- `identity.logout`: 5 success
- `workspace.created`: 1 success
- `workspace.initial_owner_assigned`: 1 success
- `workspace.selection_bootstrapped`: 6 success
- `workspace.invitation_created`: 5 success
- `crm.lead_created`: 5 success

Outbox state at final evidence collection:

- `identity.email_verification`: 5 delivered
- `workspace.invitation_email_requested`: 5 delivered
- `workspace.provisioned`: 1 pending for its non-email consumer
- `crm.lead_changed`: 5 pending for its non-email consumer

The email worker's explicit routing did not claim non-email topics. The pending non-email events are expected because this release does not deploy downstream consumers for those topics.

## Limitations and disposition

- This is UAT, not a production authorization. The UI intentionally retains non-production/local-server boundary language.
- Fixture OIDC is disabled publicly; real Google OIDC remains out of scope.
- UAT email is private Mailpit, not a production email provider.
- Unsupported downstream CRM modules remain labelled sample/demo as documented by the release gate.
- No Feature 3 work was started.

Feature 1 + Feature 2 and the Workspace Foundation are deployed to UAT and ready for bounded Architecture and Graphics post-deployment review.
