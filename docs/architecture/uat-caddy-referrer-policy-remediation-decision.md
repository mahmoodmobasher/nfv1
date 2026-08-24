# UAT Caddy Referrer-Policy remediation Architecture decision

Date: 2026-08-24

Deployment result reviewed: `313e4ab`

Rejected application artifact: `9162a90` / `v0.5.0-uat.1`

Scope: implementation-ready, configuration-only decision for the UAT edge header defect; no application, infrastructure, deployment, production, DNS, secret, database, or provider change is authorized by this record

## Decision

**ACCEPT the bounded remediation defined below — no Architecture blocker to Dev2 implementation and evidence collection.**

This is approval of the proposed change shape, not acceptance of an implementation that does not yet exist and not authorization to deploy it. `v0.5.0-uat.1` remains withdrawn and must never be reused. A new immutable application/infrastructure candidate and a new UAT release identifier are required after review.

P0: none.

P1: the current unconditional edge assignment remains a release blocker until remediated and proven at the public edge.

P2: none in the proposed bounded design.

P3: none material.

## Root cause and header semantics

`deploy/uat/Caddyfile:15-21` currently contains:

```caddyfile
header {
	-Server
	Strict-Transport-Security "max-age=31536000; includeSubDomains"
	X-Content-Type-Options "nosniff"
	Referrer-Policy "strict-origin-when-cross-origin"
	Permissions-Policy "camera=(), microphone=(), geolocation=()"
}
```

An unprefixed Caddy response-header operation sets/overwrites the field. The live result therefore replaces the upstream application's route-specific `Referrer-Policy: no-referrer` with the global edge value.

Caddy's `?` operation means “set only if the response does not already contain this field” and is automatically deferred until upstream response headers exist. The smallest safe correction is exactly one production configuration-line change:

```diff
-		Referrer-Policy "strict-origin-when-cross-origin"
+		?Referrer-Policy "strict-origin-when-cross-origin"
```

Do not add a second route matcher, delete/re-add sequence, `+Referrer-Policy`, upstream `header_down` rewrite, application exception, or path list. Those alternatives duplicate policy knowledge or risk multiple/conflicting field values. The edge should provide the existing default only when the application is silent; an application-authored stricter policy remains authoritative.

## Resulting response contract

The default-if-absent rule applies at the existing shared `nexaflow_app` site boundary for both configured UAT hostnames.

- Exact invitation capture `/workspace/invitations/accept?token=...`: preserve application `no-referrer` on the 303.
- Clean, missing, stale, invalid, expired, revoked, consumed, denied, and terminal invitation responses: preserve application `no-referrer`, including `/workspace/invitations/accept`, `/workspace/invitations/accept/terminal`, the retired/clear/complete website handlers, and the accepted direct invitation API where the application supplies it.
- Verification and reset token capture/clean/terminal outcomes: preserve application `no-referrer`.
- Public, authentication, health, and ordinary authenticated responses that do not supply a policy: receive exactly one edge default, `strict-origin-when-cross-origin`.
- Any future application route that intentionally supplies a valid stricter policy is preserved without a Caddy path change. Weakening the application policy requires a separate Architecture/security decision.

Every public response must contain exactly one effective `Referrer-Policy` field. Dev2 must reject duplicate comma-joined or repeated values even if browsers appear to choose the stricter member.

## Preserved boundaries

The implementation must modify only the one Caddy header operation plus bounded edge tests/evidence documentation. It must not change application source, proxy/middleware behavior, CSP, HSTS, Permissions-Policy, X-Content-Type-Options, Server removal, compression, request-size limits, trusted-proxy request headers, routing, upstream selection, TLS, ports, Compose topology, images, secrets, cookies, Sessions, token sealing, database, migrations, email/provider state, or release authority.

In particular:

- application CSP and per-response nonce/`strict-dynamic` must pass through unchanged and appear once;
- application `Cache-Control: private, no-store` must remain present for token documents, invitation outcomes, stale/invalid Session documents, and private APIs; Caddy's existing `/workspace/*` defense in depth remains unchanged;
- invitation capture must retain exact token-free 303 `Location`, purpose/path/expiry-bounded HttpOnly SameSite=Lax Secure cookies, and raw plus encoded token absence from body, RSC, `Location`, and `Set-Cookie`;
- Caddy must neither combine nor rewrite `Set-Cookie`, `Content-Security-Policy`, `Cache-Control`, `Location`, or `Vary` while applying the Referrer-Policy default.

## Dev2 implementation and validation criteria

### Static and rendered configuration

1. Change only `Referrer-Policy` to `?Referrer-Policy` in the shared `header` block. Add focused automated edge assertions and a handoff record; do not touch application code or other infrastructure behavior.
2. Validate the exact candidate using the repository-pinned `caddy:2.10.2-alpine` image, the candidate Caddyfile, and the bounded UAT Caddy environment. Run both `caddy adapt --validate` and `caddy validate`; capture exit status and warnings without printing environment values.
3. Inspect the adapted JSON to prove the default operation is deferred/conditional on field absence, is present once in each imported site route, and no unconditional Referrer-Policy setter remains.
4. Render the Compose configuration with protected env-file references and verify only the expected Caddyfile/test/evidence delta. Do not export rendered secrets.

### Reload/restart method and rollback

The Caddy global options specify `admin off`; therefore `caddy reload` through the admin API is unavailable and must not be used or enabled for this remediation. Do not broaden the admin surface.

After separate deployment authorization, stage an immutable release directory, validate before switching, atomically switch the protected release pointer/config authority, and recreate only the Caddy service from the pinned image using the existing Compose project. Do not recreate the app, worker, PostgreSQL, or Mailpit for an edge-only rehearsal. Confirm the new Caddy container is healthy, uses the intended mounted candidate Caddyfile, retains its existing data/config volumes, and has zero unexpected restarts. A signal reload is not the acceptance method because deterministic use of the newly mounted immutable file must be proven.

Rollback is the inverse immutable pointer/config switch followed by recreation of only Caddy. Keep the prior Caddyfile and protected release authority available. Rollback must require no database restore, migration, application image change, cookie/session revocation, or data rewrite. Prove the prior edge health and bounded smoke after rollback rehearsal.

## Required public-edge probes

Run probes against the public HTTPS UAT hostname through Caddy, with redirects disabled where redirect headers are under test. Use unique synthetic tokens; redact values from reports and logs.

### Positive preservation probes

- Valid-shape invitation capture: 303 to the exact clean path; exactly one `Referrer-Policy: no-referrer`; `private, no-store`; correct CSP; two bounded secure cookies; no raw/encoded token in body/RSC/Location/Set-Cookie.
- Empty and malformed invitation capture while presenting stale intent/return cookies: exact clean 303; exactly one `no-referrer`; both stale authorities cleared; no token reflection.
- Clean invitation page with no intent, valid intent, malformed intent, and stale/expired intent: exactly one `no-referrer`, private/no-store, generic invalid state where applicable, and correct clearing behavior.
- Invitation terminal and retired/clear/complete/denied outcomes: exactly one `no-referrer`, private/no-store, correct status, correct terminal cookie clearing, CSRF/origin denial before mutation, and no bearer or foreign-Workspace disclosure.
- Verification and reset capture plus clean/invalid/terminal states: exactly one `no-referrer`, private/no-store, token-free redirect and response, correct purpose-bound cookie behavior.

### Default and negative probes

- Anonymous `/`, `/login`, `/register`, `/select-plan`, and health responses that do not set an application policy receive exactly one `strict-origin-when-cross-origin` default.
- An ordinary authenticated CRM/settings document with a valid configured Session receives the existing edge default unless the application intentionally supplies a policy; it remains private/no-store and retains CSP/theme/Workspace truth.
- Stale/invalid configured Session-cookie documents remain private/no-store without disclosing Session validity; their Referrer-Policy is exactly the expected single default unless the application supplies a stricter value.
- Disabled OIDC direct endpoints retain their expected 404/generic behavior and exactly one default policy.
- Static immutable `_next` assets retain their accepted cache headers and exactly one default policy; the remediation must not make them private/no-store.
- No tested response may omit Referrer-Policy, contain the former edge value on an application `no-referrer` route, or contain repeated/comma-joined policy values.

Probe both ordinary HTML and RSC/request variants for the token pages. Compare direct-container application headers to public-edge headers for representative routes to prove that Caddy preserves an existing value and supplies only a missing default.

## Complete regression and release gate

Dev2 acceptance evidence must include:

- exact diff and ancestry from the accepted Phase 4 baseline;
- Caddy adapt/validate and Compose render pass with the pinned image;
- automated header-precedence tests covering upstream-present and upstream-absent cases, including duplicate-header rejection;
- repository lint, TypeScript, direct/security boundary tests, production build, and invitation browser-security test;
- bounded public HTTPS smoke for live/ready, disabled OIDC, unauthenticated CRM protection, CSP nonce, configured-cookie cache privacy, verification/reset, invitation capture/clean/terminal/denied behavior, public defaults, and static caching;
- Caddy health, restart count, bounded logs with no error/fatal/panic/exception and no literal token leakage;
- immutable rollback rehearsal evidence.

No application image should be accepted merely because direct-container probes pass; the release gate is the externally observed header after Caddy. Any failure must restore the prior healthy UAT release immediately and record a new blocked deployment result.

## Release disposition

This decision authorizes Dev2 to implement and test only the bounded configuration/test/evidence remediation. It does not authorize UAT deployment, Product UAT acceptance, production changes, Phase 5 deployment, DNS/provider/billing work, or reuse/movement of `v0.5.0-uat.1`. After Architecture and required peer reviews accept a new immutable remediation candidate, Product must separately authorize a new UAT attempt under a new release identifier.
