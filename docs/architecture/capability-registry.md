# NexaFlow capability registry

| Capability | Frontend | Backend/public entry | Routes | Operations | Owned tables | Consumes | Events | Primary tests | Authority | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1A Lead Intake | Deferred | `src/backend/modules/leads/index.ts` | `POST /api/workspaces/:workspaceId/leads`; `GET /api/workspaces/:workspaceId/identity-reviews`; `GET/POST /api/workspaces/:workspaceId/leads/:leadId/identity-review` | `submitLeadInquiryV1`; `getIdentityReviewDetailV1`; `listIdentityReviewQueueV1`; `decideLeadIdentityReviewV1` | See ownership inventory | Contacts and Identity Review public participants; Companies public participant and reviewed Company-hosted Contact/Company candidate read model; Platform authorization/idempotency/Audit/Outbox/database | See stable identity inventory | `tests/p1a-manual-intake.*`; `tests/p1a-presentation-route.integration.test.ts`; `tests/p1a-modular-boundaries.test.ts` | Frozen P1A Product/data authority and modular-monolith contract | Dev2 backend; Dev3 schema |
| P1A Contact Identity | Deferred | `src/backend/modules/contacts/index.ts` | None directly | exact candidate query; create/lock participant | `contacts` | Platform database | `crm.contact.created.v1` selected by Leads orchestrator | P1A manual-intake integration suite | Frozen P1A Product/data authority | Dev2 backend; Dev3 schema |
| P1A Company Identity | Deferred | `src/backend/modules/companies/index.ts` | None directly | exact candidate query; create/lock participant; reviewed `companyContactCandidateReadModel` | `companies`; read-only Company-hosted join to `contacts` for the exact name+Company predicate | Contacts schema as a declared read model only; Platform database | `crm.company.created.v1` selected by Leads orchestrator | P1A manual-intake integration suite and SQL-ownership gate | Frozen P1A Product/data authority | Dev2 backend; Dev3 schema |
| P1A Identity Review | Deferred | `src/backend/modules/identity-review/index.ts` | No direct application route authority; consumed by Leads route operations | evidence and Hold/Resolve lineage participants | `lead_identity_reviews`; `lead_identity_candidates`; `lead_identity_decisions`; `lead_identity_decision_heads` | Contact/Company public types only; Platform database | Review events selected by Leads orchestrator | P1A manual-intake integration and route suites | Frozen P1A Product/data authority | Dev2 backend; Dev3 schema |

Physical schema definitions remain centralized in `src/server/db/schema.ts`; this registry defines logical write ownership. Legacy `src/server/crm` remains a compatibility/read boundary and is not a second P1A write owner.

### P1A frontend activation

The P1A Lead Intake frontend is active at `src/frontend/features/leads` and `/crm/leads/new`. The P1A Identity Review frontend is active at `src/frontend/features/identity-review`, `/crm/identity-reviews`, and `/crm/identity-reviews/:leadId`. The `Deferred` cells above describe the original backend-only registry snapshot and are superseded for these two frontend surfaces by this accepted activation record.

## Table ownership inventory

| Table | Single write owner | P1A access |
| --- | --- | --- |
| `leads` | Leads | read/write |
| `lead_lifecycle_definitions` | Leads | read |
| `lead_intakes` | Leads | read/write receipt |
| `lead_activities` | Leads | write compatibility activity |
| `lead_visible_teams` | Leads | write; Platform Workspace Authority reviewed lock/read model |
| `pipeline_stages` | Leads | read compatibility stage |
| `contacts` | Contacts | read/lock/write through public participant; read-only exact name+Company join is explicitly hosted/reviewed by Companies |
| `companies` | Companies | read/lock/write through public participant and Company-hosted exact read model |
| `lead_identity_reviews` | Identity Review | read/write |
| `lead_identity_candidates` | Identity Review | read/write append-only evidence |
| `lead_identity_decisions` | Identity Review | read/write append-only decisions |
| `lead_identity_decision_heads` | Identity Review | read/write effective head |
| `audit_events` | Platform Audit | one governing write |
| `outbox_messages` | Platform Outbox | exact event-set writes |

Workspace Administration remains the write owner for `workspaces`, `users`, `sessions`, `roles`, `workspace_memberships`, `teams`, and `team_memberships`. P1A consumes these only through the Platform Workspace Authority participant. Its reviewed read/lock model globally sorts bounded Membership/Team/Lead visibility references and fences the current Workspace, User, Session, Role, and Membership before protected disclosure; it also covers Lead-owned visibility references. Platform Database owns transaction mechanics; Platform Idempotency owns advisory authorities but no table; Platform Authorization owns trusted-current authority facts but no administration table.

## Stable identity inventory

| Kind | Identity | Owner |
| --- | --- | --- |
| operation | `lead-inquiry-intake.v1` | Leads |
| operation | `lead-identity-review-decision.v1` | Leads orchestrator / Identity Review lineage |
| query | `lead-identity-review-detail.v1` | Leads protected presentation query |
| query | `lead-identity-review-queue.v1` | Leads protected presentation query |
| Audit | `crm.inquiry_created` | P1A governing Audit writer |
| Audit | `crm.inquiry_held_for_review` | P1A governing Audit writer |
| Audit | `crm.inquiry_review_resolved` | P1A governing Audit writer |
| event | `crm.inquiry.created.v1` | Leads |
| event | `crm.inquiry.review_required.v1` | Identity Review |
| event | `crm.inquiry.review_resolved.v1` | Identity Review |
| event | `crm.inquiry.linked.v1` | Leads |
| event | `crm.contact.created.v1` | Contacts |
| event | `crm.company.created.v1` | Companies |
