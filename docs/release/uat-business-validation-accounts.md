# UAT business-validation accounts

Date: 2026-08-21

Status: **complete**

Target: `https://app.nexaflowsystems.com`

Scope: synthetic Feature 1 + Feature 2 business-validation cohort only. No application code, deployment, infrastructure, existing UAT data, or external provider configuration was changed.

## Data policy

- Five clearly synthetic `example.test` identities were created through the public password-registration flow.
- Unique temporary passwords were generated outside the repository with owner-only temporary-file permissions.
- Passwords, verification and invitation tokens/links, Mailpit bodies, cookies, and credentials are not recorded in this document or Git.
- Two clearly synthetic Workspace-visible Leads were added solely to make role and tenant-visibility validation meaningful.
- No suspended persona was required.

## Cohort and topology

| Persona | Workspace A | Workspace B |
| --- | --- | --- |
| Workspace A Owner | Owner | — |
| Workspace A Admin | Admin | — |
| Workspace A Member | Member | — |
| Multi-workspace user | Member | Admin |
| Workspace B Owner | — | Owner |

Workspace evidence:

- Workspace A: Scale, monthly, one entitlement snapshot, four active Memberships (`owner`, `admin`, `member`, `member`), exactly one active Owner, one synthetic Lead.
- Workspace B: Growth, monthly, one entitlement snapshot, two active Memberships (`owner`, `admin`), exactly one active Owner, one synthetic Lead.

This five-identity cohort is the smallest topology that gives the requested multi-workspace user non-Owner authority in both workspaces while retaining exactly one active Owner in each workspace.

## Public journey evidence

The deployed browser and private UAT Mailpit flows passed:

1. Five password registrations persisted their selected UAT plan/cadence.
2. Five private verification messages were delivered and all five identities verified.
3. Workspace A and Workspace B were provisioned through authenticated onboarding with normal plan/entitlement attachment.
4. Four server-backed invitations were created and delivered through loopback-only Mailpit.
5. All four invitations were accepted by their invited, verified-email identities.
6. Workspace A Owner saw server-authorized role controls.
7. Workspace A Admin could invite only Members; the Admin invitation role list did not expose Admin or Owner.
8. Workspace A Member had no role-change controls.
9. Owner, Admin, and Member could see the synthetic Workspace A Lead as permitted by Workspace visibility.
10. The Workspace A Member could not find Workspace B's Lead.
11. The multi-workspace user saw exactly two selectable active Workspaces, with Member in A and Admin in B.
12. Switching A → B → A changed visible tenant data; prior-tenant Leads were absent after each switch.
13. A direct cross-tenant Lead request returned tenant-safe HTTP 404.
14. Password login succeeded for every persona.
15. Current-device logout succeeded for every persona; Back/direct protected CRM navigation returned to login and could not reuse the logged-out browser session.

An initial acceptance assertion clicked before the client handler had hydrated. It created no Membership and produced no success audit. The bounded continuation reused the same accounts and invitations, waited for client readiness, and completed all four acceptances without duplicates.

## Database and delivery evidence

Safe aggregate evidence after the completed journey:

- `identity.registered`: 5 success
- `identity.email_verified`: 5 success
- `identity.login`: 8 success (includes bounded continuation logins)
- `identity.logout`: 5 success
- `workspace.created`: 2 success
- `workspace.initial_owner_assigned`: 2 success
- `workspace.invitation_created`: 4 success
- `workspace.invitation_accepted`: 4 success
- `workspace.selection_bootstrapped`: 4 success
- `workspace.selection_changed`: 2 success
- `crm.lead_created`: 2 success

Outbox routing evidence:

- `identity.email_verification`: 5 delivered by the private email worker
- `workspace.invitation_email_requested`: 4 delivered by the private email worker
- non-email `workspace.provisioned`, `workspace.membership_activated`, and `crm.lead_changed` messages remain pending for their intentionally undeployed consumers

## Limitations and use

- UAT does not enforce a password change on first login. Changing each temporary password before broader sharing is recommended.
- Public fixture OIDC remains disabled; these are password identities only.
- Email remains private UAT Mailpit, not a production provider.
- The cohort validates current Workspace, Membership, Role, active Workspace selection, CRM visibility, audit, entitlement, and logout behavior. It is not production customer data and must not be treated as production authorization.
- Credentials were returned only in the private project-task response and are intentionally absent from repository evidence.
