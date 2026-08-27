# NexaFlow project handover — start here

Handover date: 2026-08-27
Project: `/Users/moemahmood/builder_code/Nexflow_v1`

## Read order

1. `AGENTS.md`
2. `docs/handover/PROJECT-STATUS.md`
3. `docs/handover/CONTINUATION-PROMPT.md`
4. Relevant feature handoffs under `docs/engineering/`
5. `docs/handover/DONOR-FIRST-DATABASE-HANDOVER.md` for historical donor/database policy
6. `docs/handover/ROLE-RESTART-PROMPTS.md` when restarting a specialist role

## Current position

Local `main` and `origin/main` are aligned after the documentation cleanup. The deployed application revision is `600a9aa96ec598b38aed557c2c4cb9b62d4afc08`; UAT runs `600a9aa-uat28`, and the migration ledger has 26 entries through 0025. Production is untouched.

The application now includes Customer Graph, Deals/Pipeline, Lead conversion, expanded profile forms, Contact Notes, current-authority navigation, Lead Quick create Company, stable Lead option reconciliation, and redesigned Companies/Contacts directories.

## Governing rules

- Preserve Workspace/Membership/Team/RBAC/visibility and Platform Audit/Outbox/Idempotency as the shared authority spine.
- Donor `57d38b0c2091f1376344614720890c9544916933` is workflow and layout evidence only.
- Never copy donor tenancy/auth, direct cross-owner writes, cascades, mock data authority, offset pagination, or local evidence systems.
- Keep owner-module writes explicit and use current-authority final fences.
- Integrate only reviewed immutable SHAs; prefer fall-forward UAT corrections.
- UAT is disposable, but destructive reset/deletion still requires explicit scope and target verification.
- Production changes always require separate Product authorization.

## Next outcome

After Product validates the latest UAT UI, the recommended next slice is manual Lead activity create/list (`ACTIVITY-01A`) on the existing DB-01/DB-01A foundation. Lead routing follows as a separately frozen feature.

Older handovers remain useful historical evidence, but this dated index and `PROJECT-STATUS.md` control when they conflict.
