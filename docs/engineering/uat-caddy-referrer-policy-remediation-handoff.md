# UAT Caddy Referrer-Policy remediation handoff

Date: 2026-08-24

Branch: `codex/uat-caddy-referrer-remediation`

Base: `origin/main` at `313e4ab0be306d2222a5249ddafc71d8a207f588`

Architecture authority: source `f907e7028a3ed637c6d077be15aa809a717d475a`, preserved in this branch as `3800bc3`

Implementation: `15d8544ee7e15ba937bce573eef247bdf2b9b199`

Immutable remediation candidate: the commit containing this handoff.

## Result and disposition

**GO for focused Architecture/backend peer review. NO-GO for deployment until those reviews accept the same immutable candidate and Product separately authorizes a new UAT attempt.**

The bounded remediation changes one production configuration line in `deploy/uat/Caddyfile`:

```diff
-		Referrer-Policy "strict-origin-when-cross-origin"
+		?Referrer-Policy "strict-origin-when-cross-origin"
```

This makes the existing global policy a default only when the upstream response is silent. No application, Compose, image, port, TLS, routing, proxy-secret, CSP, cache, cookie, Session, database, migration, provider, DNS, release-authority, or other infrastructure behavior changed. One focused two-test boundary file and the Architecture/evidence records are the only other additions.

## Static and rendered validation

- Repository `git diff --check`: **PASS**.
- Focused automated precedence/duplicate test: **2/2 PASS**. It requires exactly one `?Referrer-Policy` operation, rejects unconditional/appending/removal forms, preserves the other shared security headers and `admin off`, preserves one upstream `no-referrer`, supplies one default only when absent, and rejects comma-joined/duplicate modeled values.
- Pinned `caddy:2.10.2-alpine` `caddy adapt --validate`: **PASS**.
- Pinned `caddy:2.10.2-alpine` `caddy validate`: **PASS**.
- Adapted JSON inspection: exactly two `strict-origin-when-cross-origin` default values and two deferred markers, corresponding to the shared block imported by the two configured sites; no unconditional Referrer-Policy setter remains.
- Expected validation-only notices were limited to automatic HTTPS enablement/redirect behavior for the synthetic hostnames and the intentional loopback HTTP listener. There was no configuration error.
- Compose rendering with explicit non-secret placeholder references: **PASS**. Services and pinned images were unchanged; no environment value or protected file was printed.

## Isolated edge and rollback rehearsal

The exact candidate Caddyfile ran in the pinned Caddy image on a disposable Docker network against one fixed upstream container. No live UAT container, volume, network, pointer, image authority, or secret was used or changed.

- Upstream-present response: exactly one `Referrer-Policy: no-referrer` — **PASS**.
- Upstream-absent response: exactly one `Referrer-Policy: strict-origin-when-cross-origin` — **PASS**.
- Duplicate/repeated/comma-joined Referrer-Policy rejection — **PASS**.
- Upstream CSP remained exactly once; private/no-store, exact 303 `Location`, two independent bounded `Set-Cookie` fields, and `Vary` passed through unchanged — **PASS**.
- Upstream-absent static response retained `public, max-age=31536000, immutable` and was not made private — **PASS**.
- Raw synthetic token absence from headers/body and zero literal `token=` log lines — **PASS**.
- Candidate Caddy container running/healthy at probe time; bounded logs contained zero error/fatal/panic/exception lines — **PASS**.
- Rollback rehearsal stopped and recreated only Caddy with the immutable prior Caddyfile. The upstream container ID remained unchanged, and the prior overwriting behavior was deterministically observed — **PASS**.
- All disposable containers and the dedicated network were removed after evidence collection.

Live UAT was checked read-only after rehearsal and remains on `/opt/nexaflow/uat/releases/e58c22a`, image `nexaflow:e58c22a`; app and Caddy are healthy with restart count zero. `v0.5.0-uat.1` was not reused or moved.

## Repository and browser regression

- ESLint: **PASS**.
- TypeScript: **PASS**.
- Direct/unit/security/boundary suite: **100/100 PASS across 19 files**; 124 PostgreSQL tests skipped by design because this configuration-only remediation changes no database or application service code.
- Next.js 16.3.1 production build: **PASS**; compilation, TypeScript, and 42-page collection completed.
- Invitation browser-security Playwright, one worker and zero retries: **1/1 PASS** for HTML/RSC, history, storage, outbound request, Back/forward, and raw-token absence.

Public-edge validation of the candidate remains intentionally deferred because this task did not authorize live UAT deployment. A future authorized attempt must use a new immutable UAT release identifier, recreate only Caddy after the protected pointer/config switch, rerun the Architecture public-edge matrix, and immediately restore the prior Caddy authority if any header is missing, repeated, combined, or weakened.

## Rollback plan

Retain the prior immutable release directory/Caddyfile and protected release authority. Rollback is the inverse atomic pointer/config-authority switch followed by recreation of **only Caddy** from the pinned image. It requires no application image change, migration, database restore, data rewrite, Session/cookie revocation, provider change, or secret rotation. Verify Caddy health, zero unexpected restarts, bounded logs, and repository HTTPS smoke after rollback.

No deployment, main push, release tag, production change, secret/DNS/provider change, Caddy admin API enablement, or Phase 5 work occurred.
