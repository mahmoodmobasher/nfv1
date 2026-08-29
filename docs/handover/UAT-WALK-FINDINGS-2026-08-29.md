# UAT walk findings — 2026-08-29, third session (browser walk on `1237a93-uat56`)

These came from driving real data through the UI on UAT after `uat56`, in a session with
browser access. Five blockers had already been found this way; these are what a **sixth**
walk turned up. Nothing here is fixed. Ordered by severity.

Environment: UAT `1237a93-uat56`, `main` at `f5cdbe1`, actor = the `def` workspace owner.

---

## 1. A Deal closed **Lost** appears not to settle its Lead — UNCONFIRMED, confirm first

**What was done.** `Mobasher UAT Lead 02` (`f22502a4-e4a5-482f-b747-cd4b359c7ee0`) was
walked: identity review resolved with *Create new contact* + *Create new company* →
`working` → **disqualified** (reason "No response") → **reopened** → `qualified` →
converted (Company **and** primary Contact both linked) → Deal
`a11d6c71-ff12-446e-9e9a-a396ecf9e96f` → stage changed to **Lost** (reason "Competitor").

The stage change succeeded and the UI reported *"The server confirmed lost outcome at
version 2. No duplicate transition was created."*

**Symptom.** The CRM home tiles did not move. Before this walk: Open 8 / Won 0 / Lost 2.
After it (freshly generated 8:45 p.m. UTC, not cached): **Open 7 / Won 1 / Lost 2**. The
Won 0→1 is `Lead 01` from the previous session. `Lead 02` is still counted **Open**, so
`leads.status` was seemingly never set to `lost`.

**What has already been ruled out, from source:**

- *The manual-override guardrail.* `applyDerivedOutcome`
  (`leads/persistence/repositories/lead-outcome.repository.ts`) only writes while
  `status_source='system'`. But **no code anywhere writes `status_source`** — grep across
  `src/` and `src/server/db/migrations/` finds only the schema default `'system'`, the
  check constraint, and reads. So the column cannot have been `'manual'`.
- *Two different transition paths.* There is only one `transitionDeal`
  (`sales/application/deal.service.ts:883`); Won and Lost share it. The settlement block
  at `deal.service.ts:974` fires for any `target.outcomeClass !== "open"`.
- *A Won sibling suppressing it.* `hasWon` can only be true if a sibling Deal is `won`;
  Lead 02 has exactly one Deal.
- *Staleness.* The dashboard reports its own generation timestamp, which was after the
  transition.

**Leading remaining hypothesis.** The settlement reads
`lead_deal_conversion_lineage` filtered on `deal_id` **and**
`lead_record_type='crm.lead'`. If no row matches, `derived` is `undefined` and the whole
settlement is skipped **silently** — no error, no evidence, and the caller still returns
success. Worth checking whether the lineage row written by conversion actually carries
`lead_record_type='crm.lead'`, and whether the disqualify→reopen round trip changed
anything the lineage or the settlement depends on. Note `Lead 01`, which *did* settle, was
converted **without** a disqualify/reopen cycle — that is the main difference between the
two walks.

**Confirm before fixing** (the point of this section — do not start from the hypothesis):

```
sudo docker exec -it nexaflow-uat-postgres-1 psql -U nexaflow -d nexaflow_uat -c "
select l.display_name, l.status, l.status_source, def.code as lifecycle,
       lin.deal_id, lin.lead_record_type, d.outcome_class, d.closed_at, d.version as deal_version
from leads l
join lead_lifecycle_definitions def on def.id = l.lifecycle_definition_id
left join lead_deal_conversion_lineage lin
       on lin.workspace_id = l.workspace_id and lin.lead_record_id = l.id
      and lin.lead_record_type = 'crm.lead'
left join deals d on d.workspace_id = lin.workspace_id and d.id = lin.deal_id
where l.display_name in ('Mobasher UAT Lead 01','Mobasher UAT Lead 02')
order by l.display_name;"
```

Read it as: `Lead 02` with `status='open'` and `outcome_class='lost'` confirms the
blocker. A null `lin.deal_id` for Lead 02 points at the lineage row instead. If
`status='lost'` after all, then the **dashboard tile query** is what is wrong, not the
settlement — a different and equally real bug, since the dashboard is what Phase 4's
funnel builds on.

**Test gap either way.** `lead-conversion-01-backend.integration.test.ts` covers "settles
the Lead as lost when its only Deal is lost", and it passes. So whatever is happening
live is outside what that test constructs — the same shape as the fourth and fifth
blockers, where a green test proved the fixture rather than the product. Any fix should
add coverage that reproduces the *live* sequence, disqualify→reopen included.

---

## 2. The conversion panel shows stale authority after a lifecycle change — CONFIRMED

**Reproduce.** Open a `qualified`-eligible Lead in `working`, click **Mark qualified**.
The lifecycle header updates to `Qualified`. The Lead conversion panel below it continues
to display *"Convert Lead to Deal is not available. The canonical Lead lifecycle must be
Qualified before conversion."* It only clears on a full page reload.

**Cause.** `src/frontend/features/leads/components/lead-conversion.tsx` loads its preview
in a `useEffect` keyed on `[workspaceId, leadId]` only. The lifecycle control is a sibling
component inside `LeadDetailWithConversion`; it updates its own state and never signals
the conversion panel to refetch. The server is correct throughout — after a reload,
conversion is offered and succeeds.

**Why it matters more than it looks.** This sits on the single most important click in
the product. A user qualifies a Lead, is told they cannot convert it, and concludes the
CRM is broken. It also mimics blocker #4's symptom closely enough to send the next
investigator down the wrong path.

**Fix direction.** Have the lifecycle transition drive a refetch — lift the lead version
into `LeadDetailWithConversion` and key the conversion panel's effect on it, or expose a
callback the lifecycle control invokes on success. Prefer whichever keeps the server as
the sole authority; do not infer eligibility client-side from the new lifecycle value.

---

## 3. A Lead never displays its own settled outcome — CONFIRMED

Lead detail shows **Lifecycle** and **Identity Review** but never `leads.status`. After a
Deal settles a Lead to `won` or `lost`, that result is visible only in the dashboard
aggregate — never on the Lead itself. `Lead 02` reads `Converted` with no indication of
outcome. Belongs with the Phase 4 surface work.

---

## 4. Smaller confirmed items

- **`FactsGrid` phantom cell** — the already-known empty third cell in "Pipeline and
  responsibility" is present on every Lead detail screen. Confirmed live.
- **Unknown query params fail the dashboard closed.** `/crm/home?r=2` renders "Review the
  dashboard filters and try again. No workspace metrics or sample previews are shown while
  live data is unavailable." Any `utm_*` parameter on a shared link would do the same.
- **The manual-override guardrail is dormant.** Because nothing writes
  `status_source='manual'`, `getLeadOutcomeReconciliationV1` can never return a row in
  production, and the "never overwrites a manual outcome" guarantee is exercised only by
  raw-SQL updates inside tests. Either give owners/admins a real manual-outcome control or
  record that the report is inert until one exists.

---

## Still not walked

- **Walk C: conversion with no primary Contact** — resolve a review with *Dismiss contact
  candidates* + *Create new company*, then convert. The code supports `primaryContact:
  null` and the preview offers "No primary Contact", but nothing has exercised it live.
- **A Member-role actor.** Everything so far has been walked as workspace owner. The open
  product question — may Members resolve identity reviews? — is still unanswered, and the
  Member path through qualify → convert is unproven. Needs a second UAT account rather
  than a role change by SQL.

Five pending Leads remain for this: `Mobasher UAT Lead 03`, `04`, `05`, `06`, `07`, `09`
(`Lead 02` is now converted; `Lead 08` is the stranded pre-uat55 record — do not use it).
