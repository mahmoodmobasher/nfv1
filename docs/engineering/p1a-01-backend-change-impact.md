# P1A-01 backend change-impact record

- Changed capabilities/modules: Leads, Contacts, Companies, Identity Review; Platform authorization, database, idempotency, Audit, and Outbox ports.
- Changed public contracts: adds `LeadInquiryIntakeCommandV1`, `LeadInquiryIntakeResultV1`, protected candidate view V1, and identity-review decision V1.
- Changed routes/pages: Lead POST now translates legacy input into the canonical command and accepts V1; Lead GET/detail remain legacy-compatible; adds Lead identity-review GET/POST. No pages changed.
- Changed commands/queries: `submitLeadInquiryV1`, `resolveLeadIdentityReviewV1`, and `getIdentityReviewCandidatesV1`.
- Changed tables/migrations: none in this Dev2 candidate; consumes accepted schema base `b4a2fff` incorporated as `71ee512` and `ac3bf67`.
- Changed Audit/events: one governing `crm.inquiry_created`, `crm.inquiry_held_for_review`, or `crm.inquiry_review_resolved`; exact required versioned event sets.
- Changed authorization/tenant behavior: active trusted Workspace/Membership revalidation; Owner/Admin all-review authority; assigned-visible Member candidate/resolve authority; Member create-new/no-link enforcement.
- Changed UI/accessibility: none; legacy create response retains `id`/`version` compatibility.
- Changed dependencies: none. Adds fast static module-boundary checks.
- Tests/evidence: contract, boundary, route, PostgreSQL replay/concurrency/rollback/privacy/permission tests; existing CRM regression gates.
- Known limitations: manual only; compatibility POST accepts legacy payload; phone default is the current North American `CA` policy when no explicit CA/US override is supplied; CSV/XLSX, web/public adapters, frontend review UI, conversion, routing, merge, and deployment are deferred.
- Rollback: revert the scoped Dev2 commit. Accepted additive schema remains in place; no destructive data rollback is required. Once P1A writes exist, preserve Lead/intake/review/Audit/outbox lineage and use forward correction rather than deleting records.
