# Customer graph frontend

Companies and Contacts are rendered from strict `customer-graph` HTTP envelopes. Browser code never imports backend or database modules and never infers disclosure or mutation authority.

Public entry: `index.ts`

Server entry: `server.ts`

Legacy `legacy-p1a-root-v1` records are visible read-only. The UI exposes actions only when the corresponding server capability is true.

Creation authority is never inferred from a client-side role. Collection pages use the final-authority `capabilities.canCreate` value, while direct new routes first request the strict private `?bootstrap=true` collection envelope and do not mount a form until it grants creation authority.

Mutation authority loss clears protected details, options, actions, and draft state. Stale writes require an explicit latest-record reload and a new idempotency key; confirmed replay results are announced before navigation or refresh.

## Directory presentation provenance

The Companies and Contacts directory structure was reviewed from the pinned donor commit `57d38b0c2091f1376344614720890c9544916933` using exact Git-object reads of `frontend/src/app/(protected)/companies/page.tsx`, `frontend/src/app/(protected)/contacts/page.tsx`, `frontend/src/components/contacts/ContactTable.tsx`, and `frontend/src/components/contacts/ContactCard.tsx`.

- Adopted: compact entity header, labelled loaded-record search, bounded structured results, primary identity links, explicit lifecycle actions, and responsive toolbar/card organization.
- Adapted: all presentation uses Nexa Spectrum semantic tokens, strict Customer Graph list envelopes, capability-only create/lifecycle actions, independent active and archived keysets, native accessible confirmation, and fail-closed authority handling.
- Rejected: donor authentication and routes, dark palette, offset pagination and totals, deletion behavior, toast-only outcomes, inferred relationships, fabricated counts or missing values, and fields outside the minimized authorized list DTO.
