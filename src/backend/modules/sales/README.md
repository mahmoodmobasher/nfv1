# DEALS-01 transport contract

All endpoints are Workspace-scoped under `/api/workspaces/:workspaceId`, return `{ data }` on success, and return the strict `salesErrorEnvelopeV1Schema` on failure. Every response is `private, no-store` and varies on `Cookie`.

- `GET /deal-pipeline` is the PII-free create bootstrap and the authority source for `capabilities.canCreate` and assignment options.
- `GET /deals` returns the active or archived list. Its optional `stageId` is list-only.
- `GET /deals/board` returns the active selected pipeline with every ordered active stage, including empty stages.
- `GET|PATCH /deals/:dealId`, `POST /deals`, `POST /deals/:dealId/stage-transitions`, `POST /deals/:dealId/archive`, and `POST /deals/:dealId/restore` use the exported strict schemas.

Board cursors use one repeated query parameter per stage: `stageCursor=<stageUuid>.<opaqueBase64urlCursor>`. A client should emit entries in stage UUID order for deterministic URLs. Duplicate, malformed, unknown-stage, or more than 100 entries are rejected. The opaque cursor must not be decoded by clients.

List/Board parity in v1 means the same authorized active result set for the selected `pipelineId`. Board always spans every active stage. A list `stageId` filter is suppressed when switching to Board, and archived list state has no Board equivalent. There is no v1 search filter. Add Deal controls consume `GET /deal-pipeline` `capabilities.canCreate`; list and Board item capabilities remain record-specific.
