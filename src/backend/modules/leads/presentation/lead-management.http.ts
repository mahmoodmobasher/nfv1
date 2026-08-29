import { LeadManagementError, type LeadManagementErrorCode } from "../contracts/lead-management.contract";

const privateHeaders = { "cache-control": "private, no-store, max-age=0", pragma: "no-cache", vary: "cookie" };

export function leadManagementJson(data: unknown, status = 200) {
  return Response.json({ data }, { status, headers: privateHeaders });
}

const presentation: Record<LeadManagementErrorCode, readonly [string, boolean, string, number]> = {
  authentication_required: ["Authentication is required.", false, "none", 401],
  permission_required: ["This action is not available.", false, "none", 403],
  resource_not_found: ["The requested resource is unavailable.", false, "none", 404],
  validation_failed: ["The request is invalid.", false, "none", 400],
  unsupported_contract_version: ["The contract version is not supported.", false, "none", 400],
  idempotency_conflict: ["The idempotency key conflicts with a prior request.", false, "none", 409],
  stale_version: ["The Lead has changed.", false, "refetch_lead", 409],
  stage_unavailable: ["The selected stage is no longer available.", false, "refetch_lead_and_stages", 409],
  assignment_unavailable: ["The selected responsibility is no longer available.", false, "refetch_lead_operational_edit", 409],
  lifecycle_transition_not_allowed: ["That lifecycle change is not available in this state.", false, "refetch_lead", 409],
  lifecycle_unavailable: ["This Lead is not managed by the lifecycle.", false, "refetch_lead", 409],
  rate_limited: ["Too many requests. Try again later.", true, "retry_same_request", 429],
  lead_mutation_unavailable: ["Lead changes are temporarily unavailable.", true, "retry_same_request", 503],
  unexpected_error: ["The request could not be completed.", true, "retry_same_request", 500],
};

function safeValidationDetails(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => key !== "fields")) return undefined;
  const fields = (value as { fields?: unknown }).fields;
  const allowed = new Set(["contractVersion", "expectedVersion", "responsibleMembershipId", "responsibleTeamId",
    "visibility", "visibleTeamIds", "targetStageId", "targetLifecycle", "disqualificationReason",
    "disqualificationNote", "idempotencyKey"]);
  if (!Array.isArray(fields) || fields.length > 16 || fields.some(field => typeof field !== "string" || !allowed.has(field))) return undefined;
  return { fields: [...new Set(fields)] };
}

export function leadManagementFailure(error: unknown, requestId: string) {
  const known = error instanceof LeadManagementError ? error :
    error && typeof error === "object" && "code" in error && "status" in error
      ? new LeadManagementError((error as { code: never }).code, Number((error as { status: number }).status))
      : new LeadManagementError("unexpected_error", 500);
  const entry = presentation[known.code] ?? presentation.unexpected_error;
  const normalized = entry[3] === known.status ? known : new LeadManagementError("unexpected_error", 500);
  const stable = presentation[normalized.code], action = stable[2];
  const body: Record<string, unknown> = { code: normalized.code, message: stable[0], retryable: stable[1],
    reconciliation: { required: action !== "none", action } };
  const details = normalized.status === 400 ? safeValidationDetails(normalized.safe) : undefined;
  if (details) body.details = details;
  return Response.json({ error: body, requestId }, { status: normalized.status, headers: privateHeaders });
}
