import { ActivityError, type ActivityErrorCode } from "../contracts/activity.contract";

const headers = { "cache-control": "private, no-store, max-age=0", pragma: "no-cache", vary: "cookie" };
const presentation: Record<ActivityErrorCode, readonly [string, boolean, string, number]> = {
  authentication_required: ["Authentication is required.", false, "clear_protected_state", 401],
  permission_required: ["This action is not available.", false, "clear_protected_state", 403],
  resource_not_found: ["The requested resource is unavailable.", false, "clear_protected_state", 404],
  validation_failed: ["The request is invalid.", false, "none", 400],
  unsupported_contract_version: ["The contract version is not supported.", false, "none", 400],
  idempotency_conflict: ["The idempotency key conflicts with a prior request.", false, "new_request", 409],
  stale_version: ["The Lead has changed.", false, "refetch_lead", 409],
  rate_limited: ["Too many requests. Try again later.", true, "retry_same_request", 429],
  activity_unavailable: ["Activities are temporarily unavailable.", true, "retry_same_request", 503],
  unexpected_error: ["The request could not be completed.", true, "retry_same_request", 500],
};
const allowedFields = new Set(["contractVersion", "expectedLeadVersion", "kind", "direction", "outcome", "occurredAt",
  "durationMinutes", "subject", "details", "idempotencyKey", "queryVersion", "limit", "cursor"]);

export function activityJson(data: unknown, status = 200) { return Response.json({ data }, { status, headers }); }
export function activityFailure(error: unknown, requestId: string) {
  const known = error instanceof ActivityError ? error : error && typeof error === "object" && "code" in error && "status" in error
    ? new ActivityError((error as { code: ActivityErrorCode }).code, Number((error as { status: number }).status))
    : new ActivityError("unexpected_error", 500);
  const entry = presentation[known.code], normalized = entry && entry[3] === known.status ? known :
    new ActivityError("unexpected_error", 500), stable = presentation[normalized.code], action = stable[2];
  const safeFields = normalized.status === 400 ? [...new Set(normalized.safe?.fields ?? [])]
    .filter(field => allowedFields.has(field)).slice(0, 16) : [];
  return Response.json({ error: { code: normalized.code, message: stable[0], retryable: stable[1],
    reconciliation: { required: action !== "none", action }, zeroPartialEffects: true,
    ...(safeFields.length ? { fields: safeFields } : {}) }, requestId }, { status: normalized.status, headers });
}
