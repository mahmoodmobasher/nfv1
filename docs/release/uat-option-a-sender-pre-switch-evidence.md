# UAT Option A sender pre-switch evidence

Date: 2026-08-24

Environment: NexaFlow UAT, pre-switch validation only

Architecture authority: `f67b069c645b5bee32aaa9f2f0bae8c45c438dc2`

Product authority: Owner explicitly selected Option A and reaffirmed the documented NexaFlow Accounts identity on verified `mail.nexaflowsystems.com`, with Reply-To absent

Exact validation image/rejected release source: `nexaflow:05c4c02`, image ID `sha256:3077ed2cd323e2b08b03dee5ba3a9445511fd04bf8345bd00a33efff123af48c`, revision `05c4c02d5e96ce56aee28d80d199d67369fb57ea`

Disposition: **PASS for Architecture and backend/security evidence review. NO-GO for live switch or new release publication until those reviews and subsequent Product deployment authorization.**

## Authorization and privacy boundary

- Product Owner authorized the canonical sender decision, protected UAT configuration correction, provider/domain-owner verification, non-delivery probe, and exact-candidate pre-switch validation.
- The authorized Resend account/domain-owner role performed the minimized provider verification through the existing restricted credential.
- Release Engineering used existing host-root authority to back up and stage the Product-approved configuration.
- No sender value, credential, recipient, provider response body, DNS token/value, email body, message ID, link, cookie, or unrelated environment value was printed or persisted in evidence.
- No provider/DNS/credential setting was created, modified, or rotated. No email was created or sent.

## Provider and domain evidence

At `2026-08-24T07:44:55Z`, an authenticated read-only Resend domains request using the installed restricted credential returned HTTP 200. Minimized parsing established:

- the canonical `mail.nexaflowsystems.com` provider domain is present;
- provider status is verified/active;
- the provider record carries a region;
- required DKIM/SPF hostnames resolve, without exporting record contents;
- the restricted credential can authenticate to the account/domain boundary used for the approved identity.

At `2026-08-24T07:47:16Z`, the same credential and staged candidate environment repeated the authenticated domain/status request with HTTP 200. It was a GET-only non-delivery probe and created no email. This proves current provider authentication, domain visibility/status, and environment reachability; real delivery remains separately gated to already authorized recipients after review and deployment authorization.

## Protected configuration evidence

- Live protected file remained unchanged throughout; non-reversible complete-file fingerprint: `143eadb6333cd0279884d49a4af27f6e7c030cd58ac49ff89aacf2ec83e0ac36`.
- Root-owned mode-`0600` backup: `app.env.pre-option-a-20260824T074515Z`, fingerprint `143eadb6333cd0279884d49a4af27f6e7c030cd58ac49ff89aacf2ec83e0ac36`.
- Root-owned mode-`0600` staged candidate: `app.env.candidate-option-a`, fingerprint `a825b7947bbeda0fd747233457af40ef40cee71d5905686b2c397f531bd1f3d8`.
- Non-reversible staged sender fingerprint: `588dafe12e8bf43635c3bc604789c8d0864df600a3439f917f0d4b1902bb4172`.
- Exactly one sender key is present in the staged file; Reply-To is absent.
- The current protected live authority was not replaced, and `/opt/nexaflow/uat/current` remained `/opt/nexaflow/uat/releases/e58c22a`.

The first staged representation retained shell-style outer quotes from the tracked example. Docker preserves those characters in `--env-file`, so exact schema validation failed closed. Release Engineering replaced only the isolated staged file with the same approved identity encoded in Docker env-file form. A later validation harness attempt also demonstrated that this display-name form must not be shell-sourced; the successful harness read only the two required protected keys into process memory and continued to pass the complete candidate file directly to Docker. Neither event touched live authority.

## Exact-candidate validation

Using the same immutable `nexaflow:05c4c02` image and the corrected staged protected file:

- production environment-schema validation: **PASS**;
- Reply-To absence: **PASS**;
- disposable database creation on the private UAT database network: **PASS**;
- migration initial apply: **PASS**;
- migration idempotent rerun: **PASS**;
- disposable ledger: exactly **12** migrations, head `1787501845245`: **PASS**;
- isolated app liveness and readiness using the same staged environment/database: **PASS**;
- isolated continuous email-worker startup using the same staged environment/database: **PASS**;
- bounded worker logs: no fatal/panic/exception or literal `token=` evidence: **PASS**;
- authenticated non-delivery provider/domain probe: HTTP **200**, no email created: **PASS**;
- isolated app, worker, and disposable database cleanup: **PASS**.

Post-validation read-only proof confirmed live app, Caddy, PostgreSQL, and Mailpit healthy with zero restarts; live email worker running with zero restarts; public liveness/readiness passing; live pointer and live protected application environment unchanged.

## Residual gaps and next authority

`UAT-GAP-002` is technically remediated at the protected pre-switch compatibility boundary but remains open pending Architecture and backend/security acceptance of this evidence. No live correction has been made.

Still open:

- `UAT-GAP-001`: public Caddy edge closure requires a future authorized live attempt;
- `UAT-GAP-006`: public edge and full Product UAT smoke remain unexecuted;
- bounded real-email journeys to the already approved recipients remain unexecuted under this pre-switch-only authorization;
- asynchronous bounce/complaint reconciliation remains an explicit production-readiness limitation;
- `UAT-GAP-005`: evidence-command automation remains a non-blocking Operations follow-up.

Required next action: Architecture and backend/security review this immutable evidence record and the protected-file fingerprints. If accepted, Product may separately authorize creation/integration of the documentation-only fall-forward release commit and a new UAT attempt no earlier than `v0.5.0-uat.3`. That later workflow must rebuild/package a new immutable revision and repeat all release, public-edge, email, and full UAT gates. Neither rejected tag may be changed or reused.

No live UAT switch, release tag, image publication, service recreation, DNS/provider/credential mutation, application-code change, production action, or Phase 5 work occurred.
