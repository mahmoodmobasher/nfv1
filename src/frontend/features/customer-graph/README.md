# Customer graph frontend

Companies and Contacts are rendered from strict `customer-graph` HTTP envelopes. Browser code never imports backend or database modules and never infers disclosure or mutation authority.

Public entry: `index.ts`

Server entry: `server.ts`

Legacy `legacy-p1a-root-v1` records are visible read-only. The UI exposes actions only when the corresponding server capability is true.

Creation authority is never inferred from a client-side role. Collection pages use the final-authority `capabilities.canCreate` value, while direct new routes first request the strict private `?bootstrap=true` collection envelope and do not mount a form until it grants creation authority.

Mutation authority loss clears protected details, options, actions, and draft state. Stale writes require an explicit latest-record reload and a new idempotency key; confirmed replay results are announced before navigation or refresh.
