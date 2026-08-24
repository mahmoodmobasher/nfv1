# UAT Caddy remediation main integration result

Date: 2026-08-24

Status: **GO for a separately authorized new UAT attempt; no deployment authorized or performed**

Integrated baseline: `313e4ab0be306d2222a5249ddafc71d8a207f588`

Integrated revision: the commit containing this result

Recommended new UAT identifier: `v0.5.0-uat.2`

Retired identifier: `v0.5.0-uat.1` must never be moved or reused

## Accepted authorities preserved

The integrated history preserves the exact accepted commits as ancestors:

- implementation and handoff `9e56096d45675798d10970ed7b72d19868ddb1d2`;
- backend/security acceptance `30bee6b0958c8606dcb98c9eeaf32ee2f7cf6e52`;
- Architecture acceptance `d2c4f92d24ea0054eec39b97c784e0f2c3f1b4f5`;
- Dev3 peer acceptance `3e640121b64325cc9d8996c0ec49f18d6a12ef83`;
- Architecture authority `f907e7028a3ed637c6d077be15aa809a717d475a`.

The Architecture acceptance came from a historical documentation branch. It was integrated with a tree-controlled merge that preserves the exact commit ancestry and copies only its accepted final-review record; no stale application or infrastructure tree from that branch was imported.

## Integrated delta and gate

Relative to the current main baseline, the only infrastructure behavior change remains:

```diff
-		Referrer-Policy "strict-origin-when-cross-origin"
+		?Referrer-Policy "strict-origin-when-cross-origin"
```

All other additions are the focused two-test boundary file and accepted Architecture, peer-review, handoff, and integration records. No application source, Compose topology, image pin, routing, CSP, cache, cookie, Session, database, migration, secret, provider, DNS, TLS, port, release authority, or other infrastructure behavior changed.

- fetch and remote-movement check: **passed**; `origin/main` remained exactly `313e4ab` before integration;
- ancestry, conflict, name-status, one-line infrastructure diff, and `git diff --check` audit: **passed**;
- focused Caddy and invitation/verification/reset/security tests: **27/27 passed across five files**;
- pinned `caddy:2.10.2-alpine` `caddy adapt --validate` and `caddy validate`: **passed**;
- adapted JSON: exactly two default values and two deferred operations for the two sites importing the shared block, with no unconditional setter: **passed**;
- safe Compose render using non-secret `/dev/null` environment-file references: **passed**; service topology and pinned image references unchanged;
- Next.js 16.3.1 production build: **passed**, including TypeScript and 42-page collection.

Expected Caddy validation notices were limited to automatic HTTPS behavior for synthetic hostnames and the intentional loopback HTTP listener.

## Candidate inputs for the next UAT attempt

The next attempt must be separately authorized and must use the exact integrated main revision represented by this record, recommended identifier `v0.5.0-uat.2`, and the repository-pinned Caddy digest `caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d`.

Before changing live authority, the release owner must:

1. refetch and verify `origin/main`, the authorized full revision, proposed tag target, immutable image revision/version labels and digest, candidate Caddyfile checksum, protected environment presence, current healthy pointer, disk capacity, and rollback artifacts without printing secret values;
2. build/package the exact integrated tree through the established immutable workflow, use a new protected release directory and authority file, and create a new encrypted pre-attempt backup with restore proof even though this remediation adds no migration;
3. render Compose safely and run pinned Caddy adapt/validate against the staged exact file before any pointer switch;
4. retain `/opt/nexaflow/uat/releases/e58c22a`, `nexaflow:e58c22a`, the prior protected authority, and the known-good prior Caddyfile as rollback inputs;
5. atomically switch protected release/config authority and recreate only Caddy for the edge remediation unless the accepted runbook independently requires use of the newly packaged identical application artifact. Do not recreate PostgreSQL or change data for this configuration-only correction.

Post-switch acceptance must run the complete public HTTPS matrix from `f907e70`, including HTML and RSC invitation/verification/reset capture, clean and terminal outcomes; public/authenticated/default routes; disabled OIDC; stale/configured Session privacy; CSP nonce; Cache-Control; separate cookies; exact Location; Vary; static immutable caching; token absence; container health/restarts; and bounded logs. Every response must have exactly one effective Referrer-Policy. Any missing, repeated, comma-joined, overwritten, weakened, or leaked result requires immediate Caddy-only rollback and a blocked deployment record.

No live UAT change, release tag creation or movement, image build, Caddy recreation, infrastructure action, production change, secret/provider/DNS change, or Phase 5 work occurred during integration.
