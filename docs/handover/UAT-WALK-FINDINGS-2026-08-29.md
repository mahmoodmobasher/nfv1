# UAT walk findings — 2026-08-29, third session (browser walk on `1237a93-uat56`)

These came from driving real data through the UI on UAT after `uat56`, in a session with
browser access. Five blockers had already been found this way; these are what a **sixth**
walk turned up. Ordered by severity. **Finding #1 is void — see below. #2 is fixed on
`fix/conversion-panel-stale-lifecycle`. #3 and #4 are real and open.**

Environment: UAT `1237a93-uat56`, `main` at `f5cdbe1`, actor = the `def` workspace owner.

---

## 1. VOID — there was never a bug here. Settlement and dashboard are both correct.

**This finding was wrong twice and is fully withdrawn. Skip to #2.** It is kept only
because the way it was reached is worth not repeating.

Two queries settled it on 2026-08-29 at ~21:25 UTC.

All three Leads settled correctly from their Deals:

| Lead | status | status_source | lifecycle | reopen_count | deal outcome_class |
|---|---|---|---|---|---|
| Mobasher UAT Lead 01 | `won` | `system` | converted | 0 | won |
| Mobasher UAT Lead 02 | `lost` | `system` | converted | **1** | lost |
| Mobasher UAT Lead 03 | `lost` | `system` | converted | 0 | lost |

And the dashboard tiles agree exactly with the table: tiles read Open 6 / Won 1 / Lost 3;
`select status, count(*) from leads group by status` returns `open 6 / won 1 / lost 3`.

So the Deal-derived outcome path, the `status_source='system'` guard, the reopen ->
`open` reset, the conversion lineage **and** the dashboard aggregation are all correct,
including through a disqualify -> reopen cycle. **Change none of them on the strength of
this document.**

### How the false finding was produced

The claim came from reading the CRM home tiles and doing arithmetic against an assumed
baseline, without ever querying `leads`. The assumption was that `Mobasher UAT Lead 01`
was `open` before the walk, so its move to `won` would decrement Open. Lead 01 was in fact
`lost` at baseline and went `lost -> won`, which decrements Lost, not Open. That single
wrong premise shifted every later count by one and made Lead 02 look unsettled:

| | Open | Won | Lost |
|---|---|---|---|
| baseline | 8 | 0 | 2 |
| Lead 01 `lost -> won` | 8 | 1 | 1 |
| Lead 02 `open -> lost` | 7 | 1 | 2 | <- misread as "Lead 02 did not settle" |
| Lead 03 `open -> lost` | 6 | 1 | 3 |

Every tile reading taken during the walk was correct and internally consistent.

A follow-up A/B (Lead 03, converted with no disqualify/reopen) appeared to "isolate" the
disqualify -> reopen cycle as the trigger. It did nothing of the kind: it compared two
correct outcomes against a miscounted baseline. **A controlled experiment on top of an
unverified premise reproduces the premise, not the truth.**

### The lesson, which is the opposite of the one this file previously drew

The other five blockers in this project were found by walking the product because the
tests were checking fixtures instead of behaviour. That is a real lesson, and it made a
derived view — the dashboard — feel like evidence. It is not. A rendered aggregate is a
claim about the data, not the data. When a walk suggests a backend defect, the next step
is a query against the owning table, before any hypothesis is written down, any experiment
is designed, or any other session is told to act. Reading the row here would have cost one
command and saved several hours of two sessions' work.

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
