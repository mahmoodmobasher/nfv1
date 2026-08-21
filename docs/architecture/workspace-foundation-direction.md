# NexaFlow Workspace Foundation — Shared Architecture Direction

Status: **Product-directed architecture baseline**  
Effective: 2026-08-21

## Foundation boundary

The CRM Workspace is NexaFlow's platform foundation, not an isolated feature. The shared foundation consists of:

- Workspace;
- Users;
- Memberships;
- Roles and RBAC;
- Teams;
- Ownership;
- Visibility;
- server-controlled Active Workspace Context;
- Audit; and
- Entitlements.

All business capabilities inherit this foundation. CRM, Leads, Companies, Contacts, Deals, Projects, Tasks, Communications, Automation, AI, Reporting, Finance, and Client Portal must not introduce a separate tenant, ownership, access, audit, or entitlement model.

## Mandatory resource evaluation order

For every Workspace-scoped resource, the server must establish and enforce:

1. The resource belongs to a Workspace.
2. The authenticated User has an active Membership.
3. Active Workspace is validated and stored in trusted server/Session context.
4. RBAC determines whether the action is permitted.
5. Ownership, Team, and Visibility determine record access.
6. Significant mutations and security-relevant denials produce bounded Audit evidence.
7. Package Entitlement determines whether the capability is available.

Client input, route parameters, cached UI state, labels, or resource ownership claims cannot override this sequence or establish authority.

## Inheritance examples

- **Deal:** Workspace-scoped, owner assigned, optional Team, visibility constrained, RBAC enforced, audited, and package-entitled.
- **Project:** Workspace-scoped, owner assigned, optional Team, visibility constrained, RBAC enforced, and audited.
- **Shared Inbox:** Workspace-owned, Team-access controlled, RBAC enforced, and audited.
- **AI Agent:** Workspace-owned, package-entitled, Role/Team constrained, unable to exceed the invoking User's effective permissions, and audited.

These are applications of the same foundation contract, not new authorization models.

## Foundation completion milestone

The milestone following Feature 2 is **NexaFlow Workspace Foundation Complete**.

Acceptance requires evidence that the following are proven together:

- tenant isolation;
- atomic Workspace provisioning and initial ownership;
- active Membership enforcement;
- Owner/Admin/Member authority and last-Owner protection;
- multi-Workspace Membership;
- explicit Workspace switching;
- server-owned Active Workspace Context;
- Role enforcement;
- Team collaboration;
- ownership and visibility boundaries;
- stale-state and expected-version handling;
- transactional Audit evidence and bounded security denials; and
- package Entitlement attachment.

Individual Feature 2 work-item acceptance contributes to this milestone but does not rename or duplicate the foundation.

## Delivery rule after acceptance

Once the Workspace Foundation milestone is accepted, Architecture and Development must not expand or refactor it speculatively. Reopen the foundation only when a real downstream vertical demonstrates a concrete, evidence-backed gap.

Subsequent work should be delivered vertically while inheriting this contract, in the Product-directed sequence:

1. Profile and Personal Settings;
2. Companies and Contacts;
3. Leads;
4. Deals and Pipeline;
5. Projects and Delivery;
6. Communications; and
7. later capabilities such as Automation, AI, Reporting, Finance, and Client Portal.

Feature 3 Profile/Personal Settings remains a separate vertical: personal profile, preferences, and personal security do not redefine Workspace Membership or tenant authority.

## Review and communication rule

Architecture contracts, Development checkpoints, review findings, and Product acceptance decisions must use the terminology and boundaries in this document consistently.

Future architecture reviews will:

- verify inheritance of the shared Workspace contract rather than redesigning it per module;
- block material cross-tenant, authentication/Session, authority, last-Owner, secret-disclosure, entitlement-bypass, or non-atomic corruption risks;
- require significant mutation and security-denial audit evidence appropriate to the vertical;
- avoid reopening accepted foundation work for unrelated hardening or speculative generalization; and
- identify a foundation change only when a downstream vertical supplies a concrete unmet requirement.

This direction supplements the detailed security/data contracts and accepted gate reviews. Where terminology differs, new work should use this document's shared foundation terminology while preserving stricter accepted security invariants.
