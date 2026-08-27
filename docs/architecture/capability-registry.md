# NexaFlow capability registry

Status date: 2026-08-27

| Capability | State | Primary owner | Public/browser surface | Persistence authority |
| --- | --- | --- | --- | --- |
| Workspace foundation | Active | Platform / Workspace Administration | Registration, Session Workspace, people, invitations, Teams, settings | Workspace, User, Session, Membership, Role, Team, Team Membership |
| Leads | Active | Leads | Lead list/detail/create/edit, pipeline, stage movement, identity review | Lead root, intake provenance, visibility, stage, identity-review orchestration |
| Customer Graph | Active | Customer Graph | Company/Contact directories, detail, create/edit, archive/restore, affiliation | Company/Contact roots, identity/domain/channel facts, affiliation, visibility |
| Deals | Active | Sales | Deal list, board, detail, create/edit, transitions, archive/restore | Sales pipelines/stages, Deals, parties, visibility, transition history |
| Lead conversion | Active | Leads orchestrator with owner participants | Conversion preview and commit from Lead detail | Lead lifecycle, Sales Deal/lineage, Customer Graph references |
| Contact internal Notes | Active, bounded | Notes | Contact Note add/list | Note root, revisions, typed references |
| Navigation capabilities | Active | Platform authorization | Grouped authenticated shell and capability actions | No navigation persistence; current authority only |
| Activities | Database ready; runtime next | Activities | Planned manual Lead activity create/list | `activity_records`, `activity_record_references`; legacy `lead_activities` read-only |
| Lead routing | Planned | Leads / Assignment owner | No active route | No active routing rules yet |

## Shared operation rules

- Trusted current Session Workspace; active Membership and capability.
- Workspace-qualified record visibility and tenant-safe not-found.
- Strict commands and results, expected versions, target-bound idempotency, deterministic lock order, and final current-authority fence.
- One atomic business transaction with minimized Audit, Outbox, and receipt evidence.
- Private/no-store responses and capability-only browser actions.
- Owner participants for cross-module facts; no direct cross-owner writes.

## Stable operation families

- Leads: inquiry intake, profile/operational edit, stage transition, identity review, and Lead-to-Deal conversion.
- Customer Graph: Company/Contact create, edit, lifecycle, affiliation, and protected profile/options reads.
- Sales: Deal create, update, stage transition, archive, and restore.
- Notes: Contact internal Note add/list.

Physical schema definitions remain centralized in `src/server/db/schema.ts`. Module public entries define logical ownership and participant boundaries.
