# UAT Caddy Referrer-Policy remediation peer review

Date: 2026-08-24

Reviewer: Dev3 backend/infrastructure peer review

Immutable candidate: `9e56096d45675798d10970ed7b72d19868ddb1d2`

Base: `313e4ab0be306d2222a5249ddafc71d8a207f588`

Architecture authority: `f907e7028a3ed637c6d077be15aa809a717d475a` (preserved in candidate ancestry as `3800bc3`)

## Decision

**ACCEPT for integration. NO-GO for deployment until Product separately authorizes a new UAT attempt under a new immutable release identifier.**

- P0: none.
- P1: none in this candidate. Public-edge acceptance remains an authorized-deployment gate, not a defect in the undeployed candidate.
- P2: none.
- P3: none.

`v0.5.0-uat.1` remains withdrawn and must not be reused or moved.

## Independent findings

### Scope and ancestry

- `313e4ab` is the merge base of the candidate and the declared base.
- Candidate ancestry is Architecture record `3800bc3`, implementation `15d8544`, then handoff `9e56096`.
- The only runtime change from the base is exactly one line in `deploy/uat/Caddyfile`:

  ```diff
  -Referrer-Policy "strict-origin-when-cross-origin"
  +?Referrer-Policy "strict-origin-when-cross-origin"
  ```

- The remaining changes are one focused two-case test and the Architecture/engineering records. Application code, Compose files, images, ports, TLS, routing, proxy headers, scripts, environment-key declarations, database, migrations, and package authority are byte-identical to the base.
- `git diff --check 313e4ab..9e56096` passed.

### Caddy semantics and adapted configuration

- Caddy's `?` response-header operation is the default-if-absent form. It preserves an upstream field and supplies the configured value only when that field is absent.
- Independent `caddy:2.10.2-alpine` `caddy adapt --validate` and `caddy validate` runs against the exact exported candidate Caddyfile passed using non-secret synthetic environment values.
- Adapted JSON contains two conditional Referrer-Policy response handlers, one for each site importing `nexaflow_app`. Each requires `Referrer-Policy` to be absent before setting exactly one `strict-origin-when-cross-origin` value. There is no unconditional or append operation.
- The shared response handler still removes `Server` and preserves the existing HSTS, X-Content-Type-Options, and Permissions-Policy values. `admin off`, compression, body limit, private-document cache rule, upstream selection, Host forwarding, and trusted-proxy-secret replacement are unchanged.
- The validation notices were limited to expected automatic-HTTPS behavior for synthetic hostnames and the intentional loopback HTTP health listener.

### Response policy and privacy boundary

- The candidate's focused tests passed 2/2. They prove one shared `?Referrer-Policy` declaration, prohibit overwrite/append/delete forms, preserve the other shared headers, preserve a single upstream `no-referrer`, and supply one default when absent without a comma-joined value.
- The adapted handler contract confirms the same upstream-present/upstream-absent behavior at the real Caddy configuration boundary.
- Because no application or proxy routing code changed and the operation targets only Referrer-Policy, upstream CSP, Cache-Control, Set-Cookie, Location, and Vary fields are neither rewritten nor combined. The existing private-document cache override is unchanged, so immutable static-cache behavior is not broadened or made private by this delta.
- Invitation, verification, and reset handlers that emit `no-referrer` retain that stricter value. Token capture redirects, bounded cookies, token-free Location/body/RSC behavior, generic invalid outcomes, and purpose/path/expiry controls are unchanged by the candidate.
- The handoff's isolated exact-candidate rehearsal additionally records one upstream-present `no-referrer`, one upstream-absent default, unchanged CSP/private cache/303 Location/two Set-Cookie fields/Vary, retained immutable static caching, and no synthetic token leakage. The peer review found those results consistent with the diff and adapted JSON.

### Compose, rollback, and live-UAT safety

- No Compose file or deployment script differs from the base. The handoff records a successful render using explicit non-secret placeholders and unchanged service/image topology; this peer review did not render or disclose protected environment values.
- Caddy administration remains disabled. The accepted deployment and rollback boundary is an atomic immutable config-authority switch followed by recreation of Caddy only; app, worker, PostgreSQL, Mailpit, Sessions, cookies, and data require no change or restore.
- The handoff records a disposable rollback rehearsal in which only Caddy was recreated, the upstream container identity remained stable, prior overwrite behavior returned, and all disposable resources were removed.
- This review exported the candidate to a disposable local directory and ran only local pinned-image validation plus read-only public HTTPS probes. It did not contact the UAT host control plane, change a pointer, container, volume, image, tag, secret, database, or provider.
- At review completion, public `/api/health/live` and `/api/health/ready` both returned 200. `/login` returned 200 with one current edge Referrer-Policy, CSP, private/no-store cache policy, HSTS, Permissions-Policy, X-Content-Type-Options, and Vary present. This confirms review non-impact; it is not candidate public-edge acceptance because the candidate has not been deployed.

## Integration and release disposition

Architecture/backend peer-review gate: **ACCEPT** the immutable candidate `9e56096d45675798d10970ed7b72d19868ddb1d2` for integration without modification.

Deployment gate: **NO-GO pending Product authorization** for a new UAT attempt. After authorization, use a new immutable release identifier, validate the staged exact Caddyfile, atomically switch protected config authority, recreate only Caddy, and run the complete public-edge matrix from `f907e70`. Any missing, repeated, combined, overwritten, or weakened policy requires immediate Caddy-only rollback to the retained prior authority and a blocked deployment record.

No deployment, main push, tag mutation, production change, secret access, or live-UAT mutation occurred during this review.
