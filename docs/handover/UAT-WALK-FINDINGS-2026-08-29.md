# UAT walk findings — 2026-08-29, third session (browser walk on `1237a93-uat56`)

These came from driving real data through the UI on UAT after `uat56`, in a session with
browser access. Five blockers had already been found this way; these are what a **sixth**
walk turned up. Ordered by severity. **Finding #1 is void — see below. #2 is fixed and
verified live on `uat57`. #5 is fixed and verified live on `uat58`. #3 and #4 are real
and open — Phase 4 work.**

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

## 5. FIXED AND VERIFIED LIVE ON uat58 — "No primary Contact" was offered but the server always rejected it

Fixed in `53b2331`, merged `d864abf`, deployed `uat58`. Verified live: `Mobasher UAT
Lead 05` (`e5439837-6333-4fbf-ab6e-f23369edcb69`), left deliberately in the failing state
on `uat57` as a live reproduction, converted with Primary Contact left at "No primary
Contact." Deal `21250c38-ccd6-441f-ad1a-29692f165854` shows the Company linked and "No
buying Contacts are available" — a genuinely contactless Deal, so the relaxed guard did
not silently link the reviewed Contact instead of honoring the omission.

**Not verified live: the mismatched-Contact half.** The fix's other half — a *supplied*
primary Contact that doesn't match the one the review resolved now fails with its own
`primary_contact_mismatch` code instead of the generic `stale_preview` — is covered only
by the integration test added alongside the fix, not by driving the UI. The conversion
form only ever offers the one server-authorized Contact as a choice, so a mismatched one
cannot actually be submitted through it; reproducing this live would need a modified
request, not a normal UI walk.

Found on `uat57` by walking the one conversion branch nothing had exercised. **This is a
live blocker, not cosmetic: a Lead cannot be converted without a primary Contact, even
though the UI presents that as a supported choice.**

### Reproduce

`Mobasher UAT Lead 05` (`e5439837-6333-4fbf-ab6e-f23369edcb69`) has been **left in the
failing state on UAT as a live reproduction** — it is resolved, qualified, and refuses to
convert. Leads 06, 07 and 09 remain untouched for further testing.

1. Resolve a Lead's identity review with *Create new contact* + *Create new company*.
2. Drive it to `qualified`. Reload the page fully (so no client staleness is involved).
3. Leave **Primary Contact** on its default, `No primary Contact`. Convert.
4. The panel returns: *"The conversion preview has changed. Conversion was not completed
   and no partial Deal, Lead, customer, lineage, or related effects were saved."*
   "Reload conversion preview" and retrying does not help. A full page reload does not
   help. It never succeeds.

### Isolation

Same Lead, same session, one variable changed:

| Lead | Primary Contact | Page state | Result |
|---|---|---|---|
| Lead 04 | **No primary Contact** | after in-page qualify | FAIL |
| Lead 04 | **No primary Contact** | after "Reload conversion preview" | FAIL |
| Lead 04 | **No primary Contact** | after full page reload | FAIL |
| Lead 04 | **Contact selected** | same page, immediately after | **SUCCESS** |
| Lead 05 | **No primary Contact** | clean, full page reload | FAIL |

So it is not staleness and not the fix in #2 — it is the null primary Contact.

### Cause

`convert-lead-to-deal.orchestrator.ts`, the pre-commit guard that ends in
`fail("stale_preview")`. Two of its conditions fire whenever the identity review bound a
Contact and the command omits one:

```ts
(state.customer.contact?.id ?? null) !== (command.primaryContact?.contactId ?? null) ||
...
review.contactId !== (command.primaryContact?.contactId ?? null)
```

When the review resolved with *Create new contact*, `review.contactId` is that Contact's
id and `state.customer.contact` is the primary-eligible Contact. Submitting
`primaryContact: null` makes both comparisons unequal, so the guard rejects the command.
The guard effectively requires the primary Contact to **equal** the reviewed Contact,
while the UI offers omitting it.

Two things are wrong and they should be fixed together:

1. **The behaviour. PRODUCT DECISION TAKEN 2026-08-29: a primary Contact is OPTIONAL on a
   converted Deal. Fix the server; leave the UI's choice in place.** The guard must permit
   `primaryContact: null` even when the identity review created a Contact. It should still
   verify that a Contact *supplied* by the command is the reviewed one at the expected
   version — that check is the point of the guard — but absence must be allowed.

   The rationale, which is worth keeping: a review resolved with *Dismiss contact
   candidates* already produces a contactless Deal today and always has, so contactless
   Deals are a supported shape. Requiring a Contact only when the review happened to
   create one is arbitrary, and it would have meant blocking the dismiss path too — a far
   wider change. Choosing "required" would also have stranded every Lead whose review
   dismissed its candidates.
2. **The error.** A rejected *input* is reported as `stale_preview` — "the conversion
   preview has changed" — which tells the user a race occurred and invites them to retry
   forever. It cost three retries and a full reload here before the pattern was visible.
   A refused selection needs its own reason code and a message naming the field.

### Test gap

`lead-conversion-01-backend.integration.test.ts` converts with `primaryContact: null` in
its main fixture and passes — but in that fixture the identity review is resolved with
`contact: { action: "dismiss" }`, so `review.contactId` is null and both comparisons hold.
The failing combination is *review created a Contact* **and** *command omits it*, which no
test constructs. Add that case.

## 2. Conversion panel stale authority after a lifecycle change — FIXED AND VERIFIED LIVE ON uat57

Verified on `uat57` with `Mobasher UAT Lead 04`: resolving the review, then Start working,
then Mark qualified, with **no reload at any point**, now leaves the full "Convert Lead to
Deal" form on screen. Before uat57 this read "not available - the canonical Lead lifecycle
must be Qualified before conversion" until a manual refresh.


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

- **Walk C: conversion with no primary Contact.** Done — see #5 above, verified live on
  `uat58` via `Mobasher UAT Lead 05` (identity review resolved with *Create new contact*,
  not *Dismiss*, which is the harder of the two "no primary Contact" paths since it's the
  one the server used to reject).
- **A Member-role actor.** Everything so far has been walked as workspace owner. The open
  product question — may Members resolve identity reviews? — is still unanswered, and the
  Member path through qualify → convert is unproven. Needs a second UAT account rather
  than a role change by SQL.

Five pending Leads remain for this: `Mobasher UAT Lead 03`, `04`, `06`, `07`, `09`
(`Lead 02` and `Lead 05` are now converted; `Lead 08` is the stranded pre-uat55
record — do not use it).
