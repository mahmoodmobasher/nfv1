# Local password login validation

**Validated:** 2026-08-21 01:42–01:45 EDT  
**Boundary:** Local workstation only. No Lightsail, UAT, DNS, GitHub, Google, Resend, production domain, or external identity/email provider was accessed.

## Runtime and test-data policy

- Application URL: `http://127.0.0.1:3000`
- Mailpit UI: `http://127.0.0.1:8025`
- Mailpit SMTP: `127.0.0.1:1025`
- PostgreSQL: `127.0.0.1:54329`
- Dummy identity: `codex.login.validation.20260821.001@example.test`
- Dummy display name: `Codex Local Validation`
- Dummy workspace: `Codex Login Validation Workspace`
- Selected plan/cadence: Growth / monthly
- A generated local-only password satisfying the 12-character, number, and symbol policy was used. Its value is intentionally not recorded. No real email address, reused password, personal information, or production credential was entered.

Before browser testing, `AGENTS.md` and the relevant bundled Next.js 16.3.1 authentication, Route Handler, cookie, environment, local-development, form, and Playwright guides under `node_modules/next/dist/docs/` were read. No application behavior was changed.

## Service and migration evidence

The supported local services were already running before this validation, so they were not recreated or reset:

```text
docker compose -f docker-compose.local.yml ps
postgres  postgres:16-alpine    Up 4 hours (healthy)  127.0.0.1:54329->5432
mailpit   axllent/mailpit:v1.26 Up 4 hours (healthy)  127.0.0.1:1025->1025, 127.0.0.1:8025->8025
```

The existing supported checks passed:

```text
npm run db:migrate
exit 0

npm run db:health
{ ok: true, latencyMs: 18 }
```

The restricted command sandbox initially prevented `tsx` from opening its local IPC pipe (`listen EPERM .../tsx-501/...pipe`). Re-running the same supported commands with permission to access the local runtime succeeded; this was an execution-sandbox limitation, not an application failure.

The transient processes used for the browser journey were started with:

```text
npm run dev -- --hostname 127.0.0.1
npm run email:worker:continuous
```

Next.js reported version `16.3.1`, local URL `http://127.0.0.1:3000`, and ready status in 283 ms.

## Real-browser journey

The journey was executed in a real Chromium-based in-app browser against the running local app and Mailpit UI.

| Step | Result | Evidence |
| --- | --- | --- |
| Select plan | PASS | `/select-plan` rendered the plan catalog; Growth/monthly was selected and carried to `/register?plan=growth&cadence=monthly`. |
| Register unique dummy account | PASS | Registration returned `POST /api/auth/register 202` and navigated to `/verify-email?plan=growth&cadence=monthly`. The page named the dummy recipient and said the message was queued. |
| Reject login before verification | PASS | Correct email/password before verification returned `POST /api/auth/login 401`; the UI exposed only the safe generic message `The email or password is incorrect.` |
| Deliver verification through worker/Mailpit | PASS | Mailpit displayed a new `Verify your NexaFlow account` message to the exact dummy address. The message contained a loopback-only verification link. |
| Consume verification link once | PASS | Following the Mailpit link produced `POST /api/auth/verify 200`. A subsequent navigation to the same link produced `POST /api/auth/verify 400` and the safe invalid/expired/replaced/used state, proving single-use behavior. The Mailpit UI opened the link in another browser context without moving the inbox tab, so the server log is the authoritative first-consumption evidence. |
| Reject wrong password after verification | PASS | Wrong password returned `POST /api/auth/login 401` with the same safe generic message, without distinguishing account state. |
| Login with verified password | PASS | Correct credentials returned `POST /api/auth/login 200` and navigated to authenticated `/workspace/create`. |
| Create workspace and initial Owner | PASS | The saved Growth/monthly choice was server-derived. `POST /api/onboarding/plan 200` and `POST /api/workspaces 200` navigated to `/workspace/ready`, which named the workspace and reported `Workspace Owner`. |
| Enter protected CRM | PASS | Direct `/crm` rendered the server-backed Leads workspace with the dummy workspace and `owner` role. |
| Refresh retains session | PASS | Reloading `/crm` remained on `/crm` and rendered the Leads heading and dummy workspace again. |
| Logout | PASS | CRM `Sign out` invoked `POST /api/auth/logout 200` and navigated to `/login?signedOut=1`. |
| Browser Back after logout | **LIMITATION / FAIL** | Browser Back briefly restored `/workspace/ready` and its previously rendered workspace content from history. This did not prove session reuse and no mutation was attempted, but it does not meet the expected post-logout Back-navigation UX. A fresh protected request was tested separately below. |
| Direct `/crm` after logout | PASS | A fresh navigation to `/crm` redirected to `/login?next=/crm`; the revoked session could not authorize protected CRM access. |
| Login again | PASS | Correct credentials returned `POST /api/auth/login 200`; the completed onboarding state resumed at `/workspace/ready`. |

## Persisted database evidence

A read-only PostgreSQL query after the journey confirmed:

```text
email:               codex.login.validation.20260821.001@example.test
user status:         active
workspace:           Codex Login Validation Workspace
membership status:  active
role:                owner
selected plan:       growth
billing cadence:     monthly
onboarding step:     complete
```

Session evidence for the dummy user showed one revoked session (the logout) and one active session (the successful final re-login). No password hash, session token, verification token, or other secret is included in this report.

## Cleanup and retained evidence

- The transient Next.js development process started for this validation was stopped with an interrupt and exited cleanly (`exit 0`). Port `3000` had no listener afterward.
- The transient continuous email worker started for this validation was stopped with an interrupt (`exit 130`, expected for an interrupted foreground worker).
- PostgreSQL and Mailpit were already-running local Compose services. They remain healthy and were deliberately left running.
- The PostgreSQL volume, dummy account/workspace, audit/outbox records, session rows, and Mailpit message were preserved as requested.
- No application source/configuration was modified. This report is the only task-created file.

## Remaining limitation

The only failed acceptance detail is browser Back after logout: history restored the previously rendered `/workspace/ready` screen until a fresh request occurred. Fresh `/crm` access correctly denied the revoked session, so server authorization held, but the stale protected-page history presentation should be addressed in a separately approved behavior/security correction with a focused browser regression test.
