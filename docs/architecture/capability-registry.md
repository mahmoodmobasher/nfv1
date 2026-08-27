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

## Table ownership inventory

This inventory records logical write ownership. Shared physical schema definitions do not create shared write authority.

| Table | Single write owner | Current access posture |
| --- | --- | --- |
| `leads` | Leads | Current Lead root and profile |
| `lead_lifecycle_definitions` | Leads | Canonical lifecycle definitions |
| `lead_intakes` | Leads | Immutable intake provenance |
| `lead_activities` | Leads | Legacy read-only compatibility |
| `lead_visible_teams` | Leads | Lead Team visibility |
| `pipeline_stages` | Leads | Operational Lead stages |
| `contacts` | Customer Graph | Contact root |
| `companies` | Customer Graph | Company root |
| `lead_identity_reviews` | Identity Review | Review root |
| `lead_identity_candidates` | Identity Review | Append-only candidates |
| `lead_identity_decisions` | Identity Review | Append-only decisions |
| `lead_identity_decision_heads` | Identity Review | Effective decision head |
| `audit_events` | Platform Audit | Minimized governing evidence |
| `outbox_messages` | Platform Outbox | Minimized domain events |
| `idempotency_records` | Platform Idempotency | Target-bound mutation receipts |
| `sales_pipelines` | Sales | Sales Pipeline authority |
| `deal_stage_definitions` | Sales | Ordered Deal stages |
| `deals` | Sales | Deal aggregate |
| `deal_party_refs` | Sales | Typed Customer Graph references |
| `deal_visible_teams` | Sales | Deal Team visibility |
| `deal_stage_transitions` | Sales | Immutable transition history |
| `lead_deal_conversion_lineage` | Sales | One-Deal conversion lineage |
| `note_records` | Notes | Note root |
| `note_revisions` | Notes | Append-only Note content |
| `note_record_references` | Notes | Typed Contact references |
| `activity_records` | Activities | Dormant runtime; DB-ready manual activity root |
| `activity_record_references` | Activities | Dormant runtime; typed Lead target timeline |

Workspace Administration owns `workspaces`, `users`, `sessions`, `roles`, `workspace_memberships`, `teams`, and `team_memberships`. Domain modules consume those facts through Platform authorization participants and do not become write owners.

## Stable identity inventory

| Kind | Identity | Owner |
| --- | --- | --- |
| operation | `lead-inquiry-intake.v1` | Leads |
| operation | `lead-identity-review-decision.v1` | Leads orchestrator / Identity Review |
| operation | `lead-operational-edit.v1` | Leads |
| operation | `lead-stage-transition.v1` | Leads |
| operation | `sales-deal-create.v1` | Sales |
| operation | `sales-deal-update.v1` | Sales |
| operation | `sales-deal-stage-transition.v1` | Sales |
| operation | `sales-deal-archive.v1` | Sales |
| operation | `sales-deal-restore.v1` | Sales |
| operation | `contact-internal-note-add.v1` | Notes |
| query | `lead-identity-review-detail.v1` | Leads presentation |
| query | `lead-identity-review-queue.v1` | Leads presentation |
| query | `listLeadSummaries.v1` | Leads presentation |
| query | `getLeadDetail.v1` | Leads presentation |
| query | `listLeadPipelineStagesV1` | Leads presentation |
| query | `getLeadOperationalEdit.v1` | Leads presentation |
| Audit | `crm.inquiry_created` | Leads governing writer |
| Audit | `crm.inquiry_held_for_review` | Leads governing writer |
| Audit | `crm.inquiry_review_resolved` | Leads governing writer |
| Audit | `crm.lead_operational_updated` | Leads governing writer |
| Audit | `crm.lead_stage_transitioned` | Leads governing writer |
| Audit | `sales.deal_created` | Sales governing writer |
| Audit | `sales.deal_updated` | Sales governing writer |
| Audit | `sales.deal_stage_transitioned` | Sales governing writer |
| Audit | `sales.deal_archived` | Sales governing writer |
| Audit | `sales.deal_restored` | Sales governing writer |
| event | `crm.inquiry.created.v1` | Leads |
| event | `crm.inquiry.review_required.v1` | Identity Review |
| event | `crm.inquiry.review_resolved.v1` | Identity Review |
| event | `crm.inquiry.linked.v1` | Leads |
| event | `crm.contact.created.v1` | Customer Graph |
| event | `crm.company.created.v1` | Customer Graph |
| event | `crm.lead.operational_updated.v1` | Leads |
| event | `crm.lead.stage_transitioned.v1` | Leads |
| event | `sales.deal.created.v1` | Sales |
| event | `sales.deal.updated.v1` | Sales |
| event | `sales.deal.stage_transitioned.v1` | Sales |
| event | `sales.deal.archived.v1` | Sales |
| event | `sales.deal.restored.v1` | Sales |
| event | `crm.contact.internal_note_added.v1` | Notes |
