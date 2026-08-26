# SCREEN-FORMS-01 backend handoff

## Authority boundary

- Exact implementation parent: `9571a49478dad4a60a002591a7558da8f61d94bb` (DB migration `0024`, 25 ledger entries).
- Company and Contact profile fields remain Customer Graph-owned. Lead inquiry/profile fields and operational `stage_id` remain Leads-owned. Contact Internal notes remain Notes-owned and are composed only through the Notes public participant; no Customer Graph notes column or cross-owner SQL is permitted. Contact note add requires the positive Contact version composed against, binds it into the target-bound idempotency hash, and checks it at both the initial target lock and final authority fence. `stale_version` owns a refetch-Contact reconciliation and rolls back all Notes/evidence writes. The protected Contact note list intentionally returns bounded note bodies; bodies remain excluded from Audit, Outbox, receipts, errors, and Customer Graph roots.
- Revenue is the nullable exact tuple `{ amountMinor, currencyCode: USD|CAD, currencyExponent: 2 }`. Company/Lead revenue is not Deal value and is never transported as a JavaScript number.
- Canonical Lead lifecycle, legacy `open|won|lost`, Identity Review state, conversion lineage, customer roots, providers, imports, AI, and Delivery are outside this writer.
- Lead create results and protected Lead detail expose only `identityReview: { companyDimension: "resolved", contactDimension: "resolved" | "pending" }`. This server-owned summary discloses no candidates, matching evidence, Contact identifiers, or channels and implies no lifecycle, stage, or conversion effect.

## Donor provenance and disposition

The pinned private donor `mahmoodmobasher/NexaFlowSystem` at `57d38b0c2091f1376344614720890c9544916933` was read through exact Git objects from `/Users/moemahmood/builder_code/crm-app`:

- `backend/src/validators/company.schema.ts`, `backend/src/controllers/companyController.ts`, and Company docs/form evidence supplied field grouping, optionality, and hierarchy/cycle scenarios.
- `backend/src/validators/contact.schema.ts`, `backend/src/controllers/contactController.ts`, and Contact/People docs/form evidence supplied channel, affiliation, postal, and journey vocabulary.
- `frontend/src/validators/lead.ts`, the Lead controller/docs, and Lead form evidence supplied the form catalog and operational-status vocabulary.

Adopt: bounded field grouping, explicit optionality, hierarchy/cycle rejection scenarios, and user-facing form journeys. Adapt: every authority to trusted Workspace/current Membership/RBAC/Team predicates; relationships to typed versioned participants; revenue to exact minor-unit tuples; channels, address, consent, hierarchy, revenue, and Notes to explicit disclosure categories. Split: Lead Company inquiry snapshot from the authorized Company reference, promotional opt-out evidence from provider preferences, and operational stage from canonical lifecycle. Consolidate: server-issued assignment and relationship options under common current-authority/keyset contracts. Defer: imports, providers, AI, broad duplicate resolution, customer backfill/adoption, controlled disqualification reasons, and retained-environment stage migration. Reject: donor Organization/auth assumptions, Prisma/direct cross-owner writes, cascades, permissive coercion, mock agents, client authority, float money, and disclosure-bearing evidence/errors.

## Lead operational-stage mapping

Mapping evidence version: `donor-lead-operational-stage-map.v1`.

| Donor-adapted code | Approved presentation |
| --- | --- |
| `not_contacted` | Not contacted |
| `attempting_contact` | Attempting contact |
| `contacted` | Contacted |
| `nurture` | Nurture / follow-up |
| `qualification_ready` | Qualification-ready |

The current `pipeline_stages` authority stores Workspace-scoped IDs, names, positions, and lifecycle status; it has no stable code column. SCREEN-FORMS-01 therefore returns and accepts only current authorized registry IDs plus server presentation/version facts. It does not infer these codes from existing names, seed missing stages, rewrite retained stage identities, or backfill environments. `junk` and `lost` are not ordinary selectable stages. Selecting any stage—including a Workspace presentation corresponding to Qualification-ready—changes only `stage_id`; it never qualifies the Lead, changes legacy status, resolves Identity Review, enables conversion, or writes conversion lineage.

## Held work

No frontend implementation, deployment/UAT mutation, pipeline administration, retained stage migration, provider preference, AI behavior, Company/Contact inference, customer creation from Lead, or Notes redaction workflow is authorized by this slice.
