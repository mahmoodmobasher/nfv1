# SCREEN-FORMS-01 database handoff

## Identity and boundary

- Exact base: `096d42961b4c1820acdb18d576c6d226e9869a93`.
- Branch: `codex/screen-forms-01-db`.
- Migration: `0023_screen_forms_01_profiles`, ledger index 23 / 24 total entries, timestamp `1787779688388`.
- Database-only additive package. It does not activate writers, routes, UI, backfill, deployment, or UAT.

## Physical contract

Company gains nullable website, industry, size band, employee count, exact annual-revenue tuple, phone, postal address, and same-Workspace parent Company. The parent FK is composite and `NO ACTION`; DDL rejects self-parent. Serialized ancestor traversal, cycle/depth limits, and visibility/current fences remain required service invariants.

Contact gains nullable salutation, job title, department, LinkedIn URL, a Customer Graph-owned lifecycle catalog, and postal address. Existing typed Company affiliation and responsible Membership/Team authority remain canonical. `contact_identity_points.channel_usage` is nullable for legacy rows and bounded to `email_primary`, `email_secondary`, `phone_primary`, `phone_direct`, or `phone_mobile`; kind compatibility, primary agreement, and one active point per classified usage are enforced. Notes remain Notes-owned `crm.contact` records and are never copied to Contact.

Lead gains nullable salutation, job title, secondary email, mobile/fax channels, website, Twitter handle, rating, industry, employee count, postal address, exact annual revenue, and a consent-evidence tuple (`promotional_email_opt_out`, recorded timestamp, source). Rating is exactly nullable `hot|warm|cold`; donor `acquired|active|shutdown` values are rejected because they belong to engagement/lifecycle vocabulary. Existing `phone` is the office/primary channel. Lead Status remains the governed `stage_id`; canonical lifecycle and legacy `open|won|lost` compatibility remain separate. No donor engagement-status column exists. Existing Company snapshot/reference and conversion lineage remain authoritative; no Company is silently created or cross-written.

Revenue is nullable `numeric(20,0)` minor units plus required `USD|CAD` and exponent `2` when present. Unknown (all null) is distinct from zero. Company and Lead tuples are independently owned and never synchronized or copied into Deal value.

Postal data, channels, consent evidence, and notes are protected profile content. No new list/search index includes them, and future Audit/Outbox/idempotency payloads must contain identifiers and safe classifications only. New relations use retention-safe `NO ACTION` semantics.

## Donor-first disposition

Pinned donor evidence was read with `git show 57d38b0c2091f1376344614720890c9544916933` from `/Users/moemahmood/builder_code/crm-app`:

- `backend/src/validators/company.schema.ts`: adopted field bounds and size vocabulary; adapted revenue from floating number to exact money; rejected Organization/user authority.
- `backend/src/validators/contact.schema.ts`: adopted profile/catalog vocabulary; consolidated email/phone variants into retained identity points; rejected direct Organization/user persistence.
- `frontend/src/validators/lead.ts`: adopted screen field vocabulary; adapted money and consent; rejected donor engagement status.
- `Documentation/companies.md`, `contacts.md`, `leads.md` and the corresponding form components: adopted workflow evidence; deferred hierarchy cycle prevention to the serialized service fence.
- `backend/prisma/schema.prisma` and legacy expansion migrations: evidence only; Prisma persistence, cascades, mock data, and donor tenancy were rejected.

## Evidence and limitations

- TypeScript and scoped ESLint pass.
- Focused integration evidence passes fresh migration, exact 24-entry ledger/head, database health, no-op rerun, legacy nullable writer compatibility, money null-versus-zero, parent Workspace/self/retention constraints, channel-purpose compatibility/uniqueness, and absence of sensitive indexes.
- Required create-screen fields stay service-command requirements to preserve current writers and legacy rows; this migration intentionally adds no `NOT NULL` or backfill.
- URL syntax, phone normalization, Lead stage vocabulary mapping, Company ancestry locks, initial-note transaction participation, Audit emission, and disclosure authorization belong to future bounded service work.
