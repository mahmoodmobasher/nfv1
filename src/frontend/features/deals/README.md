# Deals frontend

Public entry: `index.ts`

DEALS-01 renders only strict Sales transport envelopes. It uses `/deal-pipeline` as the PII-free source of current create and assignment authority, and it does not mount the create form or load customer choices until that authority succeeds.

The active selected-pipeline stream is equivalent across List and Board. `pipelineId` is preserved when switching; List-only `stageId` is cleared on Board, and Archived is explicitly List-only. Board cursors use repeated, stage-UUID-sorted `stageCursor=<stageId>.<opaque>` query parameters.

Money is formatted with string operations from nullable decimal-string minor units, `USD|CAD`, and exponent `2`. Unknown and zero are distinct. No FX, cross-currency aggregation, revenue, or weighted forecast is inferred.

All actions come from server capabilities and eligible targets. Authority loss clears protected Deal, party, money, option, action, and draft state. Stale writes require explicit reload with a fresh idempotency key, while changed/no-effect and replayed outcomes are announced before navigation.
