# UAT Caddy Referrer-Policy remediation final Architecture review

Date: 2026-08-24

Candidate: `9e56096d45675798d10970ed7b72d19868ddb1d2` on `codex/uat-caddy-referrer-remediation`

Base: `313e4ab0be306d2222a5249ddafc71d8a207f588`

Implementation: `15d8544ee7e15ba937bce573eef247bdf2b9b199`

Authority: `f907e7028a3ed637c6d077be15aa809a717d475a`

## Verdict

**ACCEPT — no material Architecture blockers.**

P0: none.

P1: none. The unconditional edge replacement defect is closed in the immutable candidate.

P2: none.

P3: none material to controlled integration or a separately authorized new UAT attempt.

Candidate `9e56096` is approved for controlled integration. This verdict does not deploy it, does not authorize production, and does not authorize reuse of `v0.5.0-uat.1`; that identifier remains permanently retired.

## Bounded implementation confirmation

The sole production behavior change from `313e4ab` is exactly the authorized line in `deploy/uat/Caddyfile`:

```diff
-		Referrer-Policy "strict-origin-when-cross-origin"
+		?Referrer-Policy "strict-origin-when-cross-origin"
```

The remaining candidate changes are the incorporated Architecture decision, one focused test file, and the Engineering handoff. No application, Compose, image, port, TLS, route, proxy-secret, CSP, cache, cookie, Session, identity, Workspace, Membership, Role, invitation, entitlement, Audit, database, migration, provider, DNS, release-authority, or other infrastructure file changed.

Caddy's `?` operation is the correct deferred default-if-absent semantic. It preserves one upstream application `Referrer-Policy: no-referrer` and supplies one `strict-origin-when-cross-origin` value only when the upstream is silent. It neither appends nor replaces, avoiding repeated or comma-joined values. The shared snippet continues to cover both configured UAT sites without duplicating application route knowledge.

## Header and token-boundary evidence

The candidate's pinned-Caddy adaptation and validation passed. The adapted configuration contains one deferred default for each of the two shared-site imports and no unconditional Referrer-Policy setter. Compose rendering retained the pinned services and topology.

The isolated edge rehearsal proves:

- upstream `no-referrer` remains exactly once;
- upstream absence receives exactly one `strict-origin-when-cross-origin` default;
- duplicate, repeated, and comma-joined policy outcomes are rejected;
- CSP remains once and unchanged;
- `Cache-Control: private, no-store`, exact 303 `Location`, two independent `Set-Cookie` fields, and `Vary` pass through unchanged;
- an upstream-absent static response retains `public, max-age=31536000, immutable` and is not made private;
- the synthetic raw token is absent from headers, body, and bounded logs;
- the candidate Caddy instance remained healthy with no bounded error/fatal/panic/exception evidence.

The repository test requires one `?Referrer-Policy` declaration, rejects overwrite/add/remove alternatives, retains `admin off` and the other security headers, and models both header-presence branches with uniqueness. Architecture independently reran the focused Caddy, invitation, and identity boundary set: 16/16 passed.

The complete immutable checkpoint records clean diff validation, lint, TypeScript, 100/100 direct/security/boundary tests, production build with 42 pages, and the invitation browser-security Playwright test 1/1 with one worker and zero retries. PostgreSQL was correctly omitted because neither application nor persistence behavior changed.

## Rollback and live-UAT preservation

The isolated rollback rehearsal restored the immutable prior Caddyfile by recreating only Caddy; the upstream container identity remained unchanged and the prior behavior was observed. The accepted operational rollback remains an inverse protected pointer/config switch followed by recreation of only the pinned Caddy service. It requires no application switch, database restore, migration, data rewrite, Session/cookie revocation, provider change, or secret rotation. The admin API remains disabled.

No live UAT container, network, volume, pointer, image authority, tag, secret, provider, DNS, or production resource was changed during implementation or rehearsal. The handoff's read-only check records UAT still on the restored healthy `e58c22a` / `v0.4.0-uat.1`, with application and Caddy healthy and restart counts zero.

## Integration and new-UAT-attempt disposition

Architecture authorizes controlled integration of `9e56096` through the repository's normal immutable workflow. After integration, verify ancestry/conflicts and rerun the focused static/config test; integration alone is not deployment authority.

Product may separately authorize a new UAT attempt only with:

1. a new immutable integrated revision and new release identifier;
2. pinned-image `caddy adapt --validate` and `caddy validate`, protected Compose render, backup/release prerequisites, and pre-switch health checks;
3. atomic protected pointer/config switch and recreation of only Caddy for this edge delta;
4. immediate public HTTPS positive/negative probes for invitation capture/clean/invalid/denied/terminal, verification/reset, authenticated/stale-session, public/auth/health, disabled OIDC, and static routes;
5. exact one-value assertions for Referrer-Policy, CSP/cache/cookie/Location/Vary preservation, and raw plus encoded token absence from HTML/RSC/body/headers/history/storage/outbound/logs;
6. immediate immutable Caddy-only rollback if any policy is missing, duplicated, combined, replaced, or weakened.

`v0.5.0-uat.1` must not be moved, overwritten, or reused. No production or Phase 5 deployment is authorized by this review.
