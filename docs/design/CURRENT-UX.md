# Current NexaFlow UX direction

Status date: 2026-08-27

Nexa Spectrum is the visual and interaction authority. Donor screens may provide layout and workflow evidence, but donor palette, client authority, mock data, toast-only errors, and inaccessible controls are not authoritative.

## Current patterns

- Grouped, current-authority left navigation with one active destination.
- Semantic page header with one H1, helper text, and capability-derived primary action.
- Light/Dark/System semantic tokens, visible forced-colour boundaries, and reduced-motion-safe transitions.
- 44px interactive targets, linked validation summaries, focused recovery, live pending/result states, and no color-only meaning.
- Desktop two-column form rhythm with a one-column 320px/200% fallback and no page-level horizontal scrolling.
- Native bounded dialogs centered in the viewport, Cancel-first focus, Escape, containment, and invoker focus restoration.
- Authority loss clears protected data, drafts, options, results, and request identity into a focused generic safe state.

## Current CRM surfaces

- Lead create/edit uses five cards: Primary Information, Contact Channels, Lead & Profiling, Address Information, and Responsibility & Visibility.
- Social media conditionally requires one governed platform.
- Company creation may be completed inline from Lead create when the server grants capability; Company and Lead remain separate commits.
- Companies and Contacts directories use header, search, Include archived, responsive identity-first results, independent active/archive keysets, and capability-controlled Archive/Restore actions.
- Deal list and board are equivalent authorized views; stage movement is explicit and keyboard-accessible.

## Truthful-state rules

- Labels are presentation; selected-option identity is stable ID plus authority token.
- Time alone never creates a conflict.
- Changed or unavailable selections reconcile only the affected field and preserve safe drafts.
- Retry actions receive focus when a blocking check fails.
- Archived-feed errors precede combined-empty claims.
- Unavailable Company/Contact relationships remain generic and disclose no hidden identifiers or labels.
