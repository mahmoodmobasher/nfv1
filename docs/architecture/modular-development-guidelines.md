# NexaFlow modular development guidelines

Status: Product-authorized development contract

Audience: Product, Architecture, Development, Security, QA, and reviewers

Applies to: new capabilities and bounded refactoring in the current TypeScript/Next.js product and any future Python service

## Purpose

NexaFlow will grow by adding cohesive business capabilities behind stable, testable boundaries. These guidelines adopt the useful parts of domain-oriented modularization without forcing uniform file layouts, unnecessary interfaces, or premature microservices.

They supplement, and never override, accepted feature and Workspace Foundation contracts. Existing accepted code is not reopened merely to conform to this document. Apply the rules to new work and to bounded refactoring justified by an authorized feature, defect, security risk, or demonstrated maintenance problem.

## 1. Organize by business capability

Code ownership should be explainable in business terms. Current examples include:

- Identity and personal security;
- Workspace provisioning and selection;
- Memberships, Roles, Teams, and invitations;
- Entitlements;
- CRM Leads and Pipeline;
- Audit and Outbox;
- email/provider delivery.

Keep the UI/API, application use case, domain rules, persistence, and tests for one capability discoverable together or through clearly named companion modules. Do not create global dumping grounds such as oversized `utils`, `helpers`, `models`, `services`, or `repositories` modules.

A feature does not need a prescribed number of files. Split code when responsibilities, security authority, dependencies, ownership, or change patterns differ—not because a file crossed an arbitrary line count.

## 2. Keep dependency direction explicit

The intended direction is:

```text
UI / HTTP / worker entry points
              ↓
       application use cases
              ↓
       domain rules and ports
              ↑
 database / email / provider adapters
```

- Entry points validate transport input and invoke a use case; they do not own business truth.
- Application use cases coordinate authorization, transactions, idempotency, Audit, Outbox, and authoritative return state.
- Domain rules should avoid framework, network, filesystem, environment, and database dependencies where practical.
- Infrastructure adapters implement the capability's required boundary; business logic must not depend on a vendor-specific implementation unnecessarily.
- Lower-level shared modules must not import feature UI/routes or create circular feature dependencies.

Cross-capability calls use a documented public function/type or application boundary. Do not reach into another capability's private persistence details or import an internal module merely because it is convenient.

## 3. Use interfaces at real seams only

Introduce a TypeScript interface or Python `Protocol` when it protects a meaningful substitutable boundary, such as:

- PostgreSQL persistence or a transaction-scoped unit of work;
- email, payment, storage, or identity providers;
- time, randomness, or external clients requiring deterministic security tests;
- an independently owned capability contract.

Do not create one interface per class, one repository per table, or pass-through service layers without demonstrated value. Domain boundaries should exchange defined types, not unstructured dictionaries or `any`-shaped payloads.

Public exports should be deliberate and side-effect free. Avoid broad re-export barrels that hide ownership, create circular imports, or trigger environment/provider initialization at import time.

## 4. Preserve global and Workspace resource boundaries

Global resources include User identity, credentials, personal preferences, and personal security. Workspace-scoped resources include Memberships, Roles, Teams, invitations, Workspace settings, CRM records, and Workspace entitlement state.

For every Workspace-scoped operation, enforce in server-owned state:

1. resource Workspace ownership;
2. authenticated active User and Session;
3. trusted active Workspace context;
4. active Membership;
5. persisted RBAC permission;
6. Ownership, Team, and Visibility record access;
7. significant success/security-denial Audit behavior;
8. package Entitlement where applicable.

A client-provided Workspace ID, Role, owner, Team, visibility, plan, seat limit, entitlement, cached label, or route/query value is never authority. Database reads and writes retain Workspace predicates and same-Workspace relationship constraints as defense in depth.

The canonical tenancy policy remains: one self-service subscription entitles one Workspace; the verified registrant becomes its sole distinct Owner; included seats count the Owner; normal invitations grant Admin or Member only; a global User may hold Memberships in multiple Workspaces; extra Workspaces require separately authorized Enterprise provisioning.

## 5. Keep transaction ownership with the use case

A protected business operation owns its complete commit boundary. Do not allow table-oriented repositories or helper functions to commit independently when the accepted outcome is atomic.

Examples include:

- Workspace provisioning with initial Owner, Roles, entitlement, onboarding state, Audit, Outbox, and idempotency;
- password change/reset with credential state, token replacement/consumption, Session revocation, Audit, and rollback;
- invitation acceptance with intended identity, active seat, Membership state, Teams, Audit, and idempotency;
- ownership transfer with persisted authority, successor promotion, prior-Owner demotion, Session handoff, and Audit.

Define deterministic lock order, retry/loser behavior, expected versions, idempotency ownership, and late-failure rollback for material concurrent mutations. A success Audit or Outbox record must not commit independently of the state it claims succeeded.

## 6. Separate pure rules from side effects

Keep calculations, validation, permission policy, state transitions, and response mapping pure where this makes them easier to reason about and test. Keep database access, network calls, cookies, environment access, clocks, randomness, email, files, and vendor SDKs at explicit edges.

Purity is not a substitute for integration evidence. NexaFlow's material risks frequently occur in PostgreSQL locks/rollback, Sessions and cookies, HTTP cache/privacy/CSP behavior, CSRF/Origin enforcement, Outbox delivery, and tenant-filtered queries.

For future Python code specifically:

- use typed domain objects or validated schemas instead of generic dictionaries;
- use `Decimal` for money and timezone-aware datetimes;
- keep environment reads in configuration/bootstrap modules;
- choose one authoritative type checker initially (`pyright` or `mypy`), plus Ruff and pytest through `pyproject.toml`.

These Python choices do not require introducing a Python service.

## 7. Test the boundary at proportionate levels

Every change must have evidence appropriate to its risk:

- focused unit tests for pure rules and exact classifiers;
- route/API tests for validation, generic denials, headers, and response contracts;
- PostgreSQL integration tests for tenant filters, constraints, transactions, lock order, rollback, replay, and concurrency;
- browser tests for critical supported journeys, authority reconciliation, accessibility, responsive states, and client privacy;
- production-build and public-edge probes when Next.js routing, CSP, cache, cookies, redirects, email links, or proxy behavior is involved.

Tests should be organized by capability and observable behavior. Mirroring source folders is useful when it improves discovery, but it is not mandatory. Do not assert private implementation details when a stable public outcome can be tested.

The standard TypeScript/Next.js gate remains lint, TypeScript, unit/direct routes, relevant serialized PostgreSQL tests, production build, and focused browser evidence. A framework upgrade must rerun boundary-specific production behavior, not only compile-time checks.

## 8. Refactor incrementally and safely

Refactoring is authorized only as part of a bounded Product increment, defect remediation, security correction, or evidence-backed maintenance need.

For each extraction:

1. identify the cohesive responsibility and current callers;
2. define the intended public boundary and dependency direction;
3. characterize current security, transaction, API, and user-visible behavior with tests;
4. extract one responsibility without changing unrelated behavior;
5. update callers and verify the complete affected boundary;
6. remove duplication only after parity is proven;
7. retain an explicit rollback boundary.

Do not combine a product feature with an unrelated foundation rewrite. Do not create a new tenant, permission, Audit, entitlement, Session, token, or provider model as a refactoring shortcut.

## 9. Prefer a modular monolith

The default remains one well-structured deployable product. A separate package or service requires a real boundary such as independent deployment ownership, scaling, runtime dependencies, failure isolation, or security isolation.

Before extraction, document:

- authority and data ownership;
- authentication and authorization between components;
- API/schema versioning;
- retries, idempotency, timeouts, and partial failure;
- transaction consistency and reconciliation;
- observability and rollback;
- operational owner and deployment lifecycle.

Team size, file count, or a desire for tidier folders alone does not justify a network boundary.

## 10. Development handoff and review checklist

Every implementation handoff must answer:

- [ ] Which business capability owns the change?
- [ ] What is its public interface, and which internals remain private?
- [ ] Does dependency flow remain UI/entry → use case → domain/ports, with adapters at the edge?
- [ ] Were unnecessary interfaces, pass-through layers, generic utilities, and cross-feature imports avoided?
- [ ] Is the resource global or Workspace-scoped, and is that distinction enforced in types, authorization, and queries?
- [ ] For Workspace scope, are active Session, active Workspace, active Membership, RBAC, Ownership/Team/Visibility, Audit, and Entitlement preserved?
- [ ] Who owns the transaction, lock order, idempotency, Audit, Outbox, and rollback outcome?
- [ ] Are secrets, tokens, personal data, foreign-tenant facts, and authority values absent from unsafe logs/errors/Audit?
- [ ] Do unit, route, PostgreSQL, browser, production-build, and edge tests cover the risks proportionately?
- [ ] Is the change bounded, reversible, and free of speculative platform or microservice work?

Architecture review treats a checklist omission as a request for evidence, not automatically as a blocker. It becomes blocking when it creates or conceals a material security, tenant, authority, transaction, privacy, data-integrity, deployment, or primary-journey risk.

## 11. Exception process

A feature may use a different internal structure when the owner can explain why it is clearer or safer. The handoff must record the deviation, affected dependency/security/transaction boundary, alternatives considered, tests, and rollback.

Architecture approval is required before deviating from an accepted Workspace, identity, Session, ownership, Audit, entitlement, token, privacy, or transaction contract. Product authorization is required when the deviation changes product scope, tenancy/commercial policy, or creates a new deployable service.
