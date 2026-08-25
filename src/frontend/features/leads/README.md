# Leads frontend feature

Manual P1A Lead inquiry intake only. Public entry: `index.ts`. The feature calls the versioned manual intake HTTP contract and renders committed, held, replay, validation, denial and retry states. It may depend on frontend presentation code and the accepted API envelope, never backend persistence or browser-derived Workspace/Role/lifecycle authority. CSV/XLSX, public adapters, conversion and legacy Lead editing are deferred. Tests: `tests/p1a-frontend-boundary.test.ts` plus the accepted P1A contract, route and security suites.
